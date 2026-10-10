import { triggerBlobDownload } from "../core/utils";
import { buildId3v23Tag, TrackMetadata } from "./id3";
import { invoke } from "@tauri-apps/api/core";
import { SETTING_KEYS, getBooleanSetting } from "../control-center/settings";
import { isAdblockEnabled, shouldBlockRequest } from "../features/adblock";

export interface DownloadResult {
  success: boolean;
  message: string;
}

export type ProgressCallback = (status: string) => void;
export type { TrackMetadata };

let interceptedClientId = "";
let latestAuthHeader = "";
let latestMp3StreamUrl = "";
let latestHlsStreamUrl = "";
let isSnifferInitialized = false;

export function getLatestAudioUrls(): { mp3: string; hls: string } {
  return {
    mp3: latestMp3StreamUrl,
    hls: latestHlsStreamUrl,
  };
}

export function getLatestAuthHeader(): string {
  return latestAuthHeader;
}

export function invalidateStreamCache(trackUrl?: string): void {
  if (trackUrl) {
    streamUrlCache.delete(trackUrl);
  } else {
    streamUrlCache.clear();
  }
}

interface CachedStream {
  streamUrl: string;
  authHeader?: string;
  expiresAt: number;
}

const streamUrlCache = new Map<string, CachedStream>();
const inflightResolutions = new Map<
  string,
  Promise<{ streamUrl: string; authHeader?: string } | null>
>();

export function isPlayableUnencryptedStream(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  if (
    lower.includes("api-v2.soundcloud.com") ||
    lower.includes("api.soundcloud.com")
  ) {
    return false;
  }

  if (
    lower.includes("/cenc/") ||
    lower.includes("/cbcs/") ||
    lower.includes("encrypted") ||
    lower.includes(".mpd")
  ) {
    return false;
  }

  if (
    lower.includes(".m4s") ||
    (lower.includes(".ts") && !lower.includes(".m3u8"))
  ) {
    return false;
  }

  return true;
}

export async function resolvePlayableStream(
  trackUrl?: string,
): Promise<{ streamUrl: string; authHeader?: string } | null> {
  const targetUrl =
    trackUrl &&
    !trackUrl.endsWith("/discover") &&
    !trackUrl.endsWith("/stream") &&
    !trackUrl.endsWith("/feed") &&
    !trackUrl.includes("/undefined/")
      ? trackUrl
      : window.location.href;

  if (!targetUrl) return null;

  const isProxy = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
  const now = Date.now();
  const cached = streamUrlCache.get(targetUrl);
  if (cached && cached.expiresAt > now) {
    if (!isPlayableUnencryptedStream(cached.streamUrl)) {
      streamUrlCache.delete(targetUrl);
    } else {
      const isSnippet =
        cached.streamUrl.includes("/0/30/") ||
        cached.streamUrl.includes("/preview/");
      if (!isProxy || !isSnippet) {
        return {
          streamUrl: cached.streamUrl,
          authHeader: cached.authHeader || latestAuthHeader || undefined,
        };
      } else {
        streamUrlCache.delete(targetUrl);
      }
    }
  }

  const inFlight = inflightResolutions.get(targetUrl);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const clientId = await getClientId();
      if (clientId && targetUrl) {
        const { streamUrl } = await resolveStreamFromApi(targetUrl, clientId);
        if (streamUrl && isPlayableUnencryptedStream(streamUrl)) {
          const isSnippet =
            streamUrl.includes("/0/30/") || streamUrl.includes("/preview/");
          const result = {
            streamUrl,
            authHeader: latestAuthHeader || undefined,
          };
          if (!isSnippet) {
            streamUrlCache.set(targetUrl, {
              streamUrl,
              authHeader: latestAuthHeader || undefined,
              expiresAt: Date.now() + 10 * 60 * 1000,
            });
          }
          return result;
        }
      }
    } catch (e) {
      console.warn("[rustcloud-downloader] API resolve error:", e);
    } finally {
      inflightResolutions.delete(targetUrl);
    }

    if (latestHlsStreamUrl && isPlayableUnencryptedStream(latestHlsStreamUrl)) {
      const isSnippet =
        latestHlsStreamUrl.includes("/0/30/") ||
        latestHlsStreamUrl.includes("/preview/");
      if (!isProxy || !isSnippet) {
        return {
          streamUrl: latestHlsStreamUrl,
          authHeader: latestAuthHeader || undefined,
        };
      }
    }
    if (latestMp3StreamUrl && isPlayableUnencryptedStream(latestMp3StreamUrl)) {
      const isSnippet =
        latestMp3StreamUrl.includes("/0/30/") ||
        latestMp3StreamUrl.includes("/preview/");
      if (!isProxy || !isSnippet) {
        return {
          streamUrl: latestMp3StreamUrl,
          authHeader: latestAuthHeader || undefined,
        };
      }
    }
    console.warn(
      "[downloader] Resolved stream is DRM-protected or a fragment. Returning null for native WebView2 fallback.",
    );
    return null;
  })();

  inflightResolutions.set(targetUrl, promise);
  return promise;
}

function shouldProxyApiUrl(url: string): boolean {
  if (!url) return false;
  if (isAdblockEnabled() && shouldBlockRequest(url)) {
    return false;
  }
  if (
    url.includes("/events") ||
    url.includes("/analytics") ||
    url.includes("/event-logger") ||
    url.includes("/tracking") ||
    url.includes("/stats") ||
    url.includes("/insights") ||
    url.includes("/realtime") ||
    url.includes("/sign-in") ||
    url.includes("/auth")
  ) {
    return false;
  }
  return (
    url.includes("api-v2.soundcloud.com") ||
    url.includes("api.soundcloud.com") ||
    url.includes("graph.soundcloud.com")
  );
}

export function initDownloader(): void {
  if (isSnifferInitialized || typeof window === "undefined") return;
  isSnifferInitialized = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      inspectUrl(urlStr, init);

      if (
        getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false) &&
        shouldProxyApiUrl(urlStr)
      ) {
        const method =
          init?.method ||
          (typeof input === "object" && "method" in input
            ? (input as Request).method
            : "GET");
        const headers: Record<string, string> = {};
        if (init?.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => {
              headers[k] = v;
            });
          } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([k, v]) => {
              headers[k] = v;
            });
          } else {
            Object.assign(headers, init.headers);
          }
        }
        let body: string | undefined = undefined;
        if (typeof init?.body === "string") {
          body = init.body;
        }

        try {
          const proxyRes = await invoke<{
            status: number;
            headers: Record<string, string>;
            body: string;
          }>("rust_proxy_http", {
            url: urlStr,
            method,
            headers,
            body,
          });

          if (proxyRes && proxyRes.status) {
            const respHeaders = new Headers();
            for (const [k, v] of Object.entries(proxyRes.headers || {})) {
              try {
                respHeaders.set(k, v);
              } catch {}
            }
            return new Response(proxyRes.body, {
              status: proxyRes.status,
              headers: respHeaders,
            });
          }
        } catch (err) {
          console.debug("[rustcloud] fetch proxy fallback:", err);
        }
      }
    } catch {}
    return originalFetch.apply(
      this,
      arguments as unknown as [RequestInfo | URL, RequestInit?],
    );
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  const xhrMetaMap = new WeakMap<
    XMLHttpRequest,
    {
      method: string;
      url: string;
      headers: Record<string, string>;
    }
  >();

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    try {
      const urlStr = url.toString();
      inspectUrl(urlStr);
      xhrMetaMap.set(this, {
        method,
        url: urlStr,
        headers: {},
      });
    } catch {}
    return originalOpen.apply(this, [method, url, ...rest] as unknown as [
      string,
      string | URL,
      boolean,
      string?,
      string?,
    ]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (
    name: string,
    value: string,
  ) {
    try {
      const meta = xhrMetaMap.get(this);
      if (meta) {
        meta.headers[name] = value;
      }
    } catch {}
    return originalSetRequestHeader.apply(this, [name, value]);
  };

  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const meta = xhrMetaMap.get(this);
    const isProxy = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);

    if (isProxy && meta && shouldProxyApiUrl(meta.url)) {
      const bodyStr = typeof body === "string" ? body : undefined;
      const xhr = this;

      invoke<{
        status: number;
        headers: Record<string, string>;
        body: string;
      }>("rust_proxy_http", {
        url: meta.url,
        method: meta.method,
        headers: meta.headers,
        body: bodyStr,
      })
        .then((res) => {
          if (!res || !res.status) {
            originalSend.apply(xhr, [body]);
            return;
          }

          Object.defineProperty(xhr, "readyState", {
            get: () => 4,
            configurable: true,
          });
          Object.defineProperty(xhr, "status", {
            get: () => res.status,
            configurable: true,
          });
          Object.defineProperty(xhr, "statusText", {
            get: () => (res.status === 200 ? "OK" : ""),
            configurable: true,
          });
          Object.defineProperty(xhr, "responseText", {
            get: () => res.body,
            configurable: true,
          });
          Object.defineProperty(xhr, "response", {
            get: () => {
              if (xhr.responseType === "json") {
                try {
                  return JSON.parse(res.body);
                } catch {
                  return null;
                }
              }
              return res.body;
            },
            configurable: true,
          });

          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.dispatchEvent(new ProgressEvent("load"));
          xhr.dispatchEvent(new ProgressEvent("loadend"));

          if (typeof xhr.onreadystatechange === "function") {
            xhr.onreadystatechange(new Event("readystatechange"));
          }
          if (typeof xhr.onload === "function") {
            xhr.onload(new ProgressEvent("load"));
          }
          if (typeof xhr.onloadend === "function") {
            xhr.onloadend(new ProgressEvent("loadend"));
          }
        })
        .catch((err) => {
          console.debug("[rustcloud] XHR proxy fallback:", err);
          originalSend.apply(xhr, [body]);
        });

      return;
    }

    return originalSend.apply(this, [body]);
  };
}

function inspectUrl(url: string, init?: RequestInit): void {
  if (!url) return;

  try {
    const parsed = new URL(url, window.location.href);
    const cId = parsed.searchParams.get("client_id");
    if (cId && cId.length >= 16) {
      interceptedClientId = cId;
    }
  } catch {}

  if (init?.headers) {
    try {
      let authHeader = "";
      if (init.headers instanceof Headers) {
        authHeader =
          init.headers.get("authorization") ||
          init.headers.get("Authorization") ||
          "";
      } else if (Array.isArray(init.headers)) {
        const found = init.headers.find(
          ([k]) => k.toLowerCase() === "authorization",
        );
        if (found) authHeader = found[1];
      } else if (typeof init.headers === "object") {
        const rec = init.headers as Record<string, string>;
        authHeader = rec["authorization"] || rec["Authorization"] || "";
      }
      if (authHeader) {
        latestAuthHeader = authHeader;
      }
    } catch {}
  }

  if (
    url.includes("cf-hls-media.sndcdn.com") ||
    url.includes("cf-media.sndcdn.com") ||
    url.includes(".sndcdn.com/media/") ||
    url.includes("playlist.m3u8") ||
    url.includes(".m3u8") ||
    url.includes(".mp3")
  ) {
    if (!isPlayableUnencryptedStream(url)) {
      return;
    }
    if (
      !url.includes(".m3u8") &&
      (url.includes(".mp3") ||
        url.includes("cf-media.sndcdn.com") ||
        url.includes("mime=audio%2Fmpeg"))
    ) {
      latestMp3StreamUrl = url;
    }
    if (
      url.includes("playlist.m3u8") ||
      url.includes(".m3u8") ||
      url.includes("cf-hls-media.sndcdn.com")
    ) {
      latestHlsStreamUrl = url;
    }
  }
}

export async function getClientId(): Promise<string> {
  if (interceptedClientId && interceptedClientId.length >= 16) {
    return interceptedClientId;
  }

  const scripts = Array.from(
    document.querySelectorAll("script[src]"),
  ) as HTMLScriptElement[];
  for (const script of scripts) {
    if (
      script.src &&
      (script.src.includes("sndcdn.com/assets/") ||
        script.src.includes("soundcloud.com"))
    ) {
      try {
        const res = await fetch(script.src);
        const text = await res.text();
        const match = text.match(/client_id[:=]\s*["']([a-zA-Z0-9]{32})["']/);
        if (match && match[1]) {
          interceptedClientId = match[1];
          return interceptedClientId;
        }
      } catch {}
    }
  }

  return interceptedClientId || "";
}

async function assembleTaggedMp3(
  audioBytes: Uint8Array,
  metadata?: TrackMetadata,
): Promise<Uint8Array> {
  if (
    !metadata ||
    (!metadata.title && !metadata.artist && !metadata.artworkUrl)
  ) {
    return audioBytes;
  }
  try {
    const id3Tag = await buildId3v23Tag(metadata);
    const tagged = new Uint8Array(id3Tag.length + audioBytes.length);
    tagged.set(id3Tag, 0);
    tagged.set(audioBytes, id3Tag.length);
    return tagged;
  } catch (err) {
    console.warn("[rustcloud] ID3 tagging failed, using raw audio:", err);
    return audioBytes;
  }
}

async function saveAudio(
  bytes: Uint8Array,
  filename: string,
  metadata?: TrackMetadata,
): Promise<string> {
  const finalTaggedBytes = await assembleTaggedMp3(bytes, metadata);

  try {
    let artworkBytes: number[] | null = null;
    if (metadata?.artworkUrl) {
      try {
        const artRes = await fetch(metadata.artworkUrl);
        if (artRes.ok) {
          artworkBytes = Array.from(new Uint8Array(await artRes.arrayBuffer()));
        }
      } catch {}
    }

    const savedPath = await invoke<string>("save_audio_file", {
      filename,
      data: Array.from(finalTaggedBytes),
      title: metadata?.title || null,
      artist: metadata?.artist || null,
      album: metadata?.album || metadata?.title || null,
      artwork: artworkBytes,
    });
    if (savedPath) {
      return `Saved to ${savedPath}`;
    }
  } catch (err) {}

  const blob = new Blob([finalTaggedBytes as BlobPart], { type: "audio/mpeg" });
  triggerBlobDownload(blob, filename);
  return `Saved ${filename}`;
}

async function downloadHls(
  playlistUrl: string,
  baseFilename: string,
  metadata?: TrackMetadata,
  onProgress?: ProgressCallback,
): Promise<DownloadResult> {
  onProgress?.("Fetching stream manifest...");
  const manifestRes = await fetch(playlistUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to load playlist: HTTP ${manifestRes.status}`);
  }

  const manifestText = await manifestRes.text();
  const lines = manifestText.split(/\r?\n/);

  let initUrl: string | null = null;
  const segmentUrls: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXT-X-MAP:")) {
      const match = trimmed.match(/URI=["']([^"']+)["']/i);
      if (match && match[1]) {
        initUrl = new URL(match[1], playlistUrl).href;
      }
    } else if (!trimmed.startsWith("#")) {
      segmentUrls.push(new URL(trimmed, playlistUrl).href);
    }
  }

  if (segmentUrls.length === 0) {
    throw new Error("No audio segments found in playlist");
  }

  const finalFilename = baseFilename.replace(/\.(mp3|m4a)$/i, "") + ".mp3";

  let initBuffer: ArrayBuffer | null = null;
  if (initUrl) {
    onProgress?.("Downloading stream header...");
    const initRes = await fetch(initUrl);
    if (!initRes.ok) throw new Error("Failed to fetch stream header");
    initBuffer = await initRes.arrayBuffer();
  }

  const total = segmentUrls.length;
  let completed = 0;
  const buffers: ArrayBuffer[] = new Array(total);
  const concurrency = 6;
  let nextIndex = 0;

  onProgress?.(`Downloading audio chunks: 0/${total} (0%)`);

  async function worker(): Promise<void> {
    while (nextIndex < total) {
      const idx = nextIndex++;
      const segUrl = segmentUrls[idx];
      const res = await fetch(segUrl);
      if (!res.ok) {
        throw new Error(
          `Failed to download segment ${idx + 1}/${total}: HTTP ${res.status}`,
        );
      }
      buffers[idx] = await res.arrayBuffer();
      completed++;
      const percent = Math.round((completed / total) * 100);
      onProgress?.(`Downloading audio: ${completed}/${total} (${percent}%)`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );

  onProgress?.("Tagging & assembling MP3 file...");
  const combinedBuffers: ArrayBuffer[] = [];
  if (initBuffer) {
    combinedBuffers.push(initBuffer);
  }
  for (const b of buffers) {
    if (b) combinedBuffers.push(b);
  }

  let totalLength = 0;
  for (const buf of combinedBuffers) totalLength += buf.byteLength;
  const mergedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of combinedBuffers) {
    mergedBytes.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  const message = await saveAudio(mergedBytes, finalFilename, metadata);

  return {
    success: true,
    message,
  };
}

async function downloadProgressive(
  url: string,
  baseFilename: string,
  metadata?: TrackMetadata,
  onProgress?: ProgressCallback,
): Promise<DownloadResult> {
  onProgress?.("Downloading direct MP3 audio stream...");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Direct audio fetch failed: HTTP ${res.status}`);
  }

  const finalFilename = baseFilename.replace(/\.(mp3|m4a)$/i, "") + ".mp3";
  const rawBuf = await res.arrayBuffer();
  const rawBytes = new Uint8Array(rawBuf);

  const message = await saveAudio(rawBytes, finalFilename, metadata);

  return {
    success: true,
    message,
  };
}

async function resolveStreamFromApi(
  trackUrl: string,
  clientId: string,
): Promise<{ streamUrl: string; isHls: boolean }> {
  const isProxy = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
  if (isProxy) {
    try {
      const authHeader = latestAuthHeader || undefined;
      const res = await invoke<{ stream_url: string; is_hls: boolean }>(
        "rust_resolve_stream",
        {
          trackUrl,
          clientId,
          authHeader,
        },
      );
      if (res && res.stream_url) {
        return {
          streamUrl: res.stream_url,
          isHls: res.is_hls,
        };
      }
    } catch (err) {
      console.warn(
        "[rustcloud] rust_resolve_stream failed, falling back to browser fetch:",
        err,
      );
    }
  }

  const cleanUrl = trackUrl.split("?")[0];
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
    cleanUrl,
  )}&client_id=${clientId}`;

  const headers: Record<string, string> = {
    Accept: "application/json, text/javascript, */*; q=0.01",
  };
  if (latestAuthHeader) {
    headers["Authorization"] = latestAuthHeader;
  }

  const res = await fetch(resolveUrl, { headers });
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`);
  }

  let data = await res.json();
  if (
    data.kind === "playlist" &&
    Array.isArray(data.tracks) &&
    data.tracks.length > 0
  ) {
    data = data.tracks[0];
  }

  const media = data.media;
  if (!media || !media.transcodings || !media.transcodings.length) {
    throw new Error("No playable transcodings found for this track");
  }

  const transcodings = media.transcodings;

  const candidates = transcodings.filter((t: any) => {
    const proto = t.format?.protocol || "";
    return !proto.includes("encrypted");
  });

  const sortedCandidates = [
    candidates.find(
      (t: any) =>
        t.format?.protocol === "progressive" &&
        t.format?.mime_type?.includes("audio/mpeg"),
    ),
    candidates.find(
      (t: any) => t.preset?.includes("opus") && t.format?.protocol === "hls",
    ),
    candidates.find(
      (t: any) => t.preset?.includes("mp3") && t.format?.protocol === "hls",
    ),
    candidates.find((t: any) => t.format?.protocol === "progressive"),
    candidates.find((t: any) => t.format?.protocol === "hls"),
    ...candidates,
  ].filter(
    (t, idx, arr): t is NonNullable<typeof t> =>
      Boolean(t) && arr.indexOf(t) === idx,
  );

  for (const target of sortedCandidates) {
    try {
      const streamAuthUrl = `${target.url}?client_id=${clientId}${
        data.track_authorization
          ? `&track_authorization=${data.track_authorization}`
          : ""
      }`;

      const authRes = await fetch(streamAuthUrl, { headers });
      if (!authRes.ok) continue;

      const authData = await authRes.json();
      if (authData?.url) {
        if (
          authData.url.includes("/cbcs/") ||
          authData.url.includes("/cenc/") ||
          authData.url.includes("encrypted")
        ) {
          console.debug(
            "[rustcloud-downloader] stream url is encrypted (cbcs/cenc/DRM), trying next candidate...",
          );
          continue;
        }
        return {
          streamUrl: authData.url,
          isHls: target.format && target.format.protocol === "hls",
        };
      }
    } catch {}
  }

  throw new Error("Failed to resolve any playable stream link");
}

export async function downloadTrack(
  title: string,
  artist: string,
  url: string,
  artworkUrl?: string,
  onProgress?: ProgressCallback,
): Promise<DownloadResult> {
  const cleanArtist = (artist || "SoundCloud").trim();
  const cleanTitle = (title || "Track").trim();
  const baseFilename = `${cleanArtist} - ${cleanTitle}`;
  const metadata: TrackMetadata = {
    title: cleanTitle,
    artist: cleanArtist,
    album: cleanTitle,
    artworkUrl: artworkUrl?.replace(/-t\d+x\d+\./, "-t500x500.") || artworkUrl,
  };

  try {
    const targetUrl =
      url &&
      !url.endsWith("/discover") &&
      !url.endsWith("/stream") &&
      !url.endsWith("/feed") &&
      !url.includes("/undefined/")
        ? url
        : window.location.href;
    const clientId = await getClientId();

    if (clientId && targetUrl) {
      try {
        onProgress?.("Resolving track stream from SoundCloud...");
        const { streamUrl, isHls } = await resolveStreamFromApi(
          targetUrl,
          clientId,
        );
        if (isHls) {
          return await downloadHls(
            streamUrl,
            baseFilename,
            metadata,
            onProgress,
          );
        } else {
          return await downloadProgressive(
            streamUrl,
            baseFilename,
            metadata,
            onProgress,
          );
        }
      } catch (apiErr) {
        console.warn("[rustcloud] API stream resolution failed:", apiErr);
      }
    }

    if (latestMp3StreamUrl) {
      try {
        return await downloadProgressive(
          latestMp3StreamUrl,
          baseFilename,
          metadata,
          onProgress,
        );
      } catch (mp3Err) {
        console.warn("[rustcloud] Direct MP3 download failed:", mp3Err);
      }
    }

    if (latestHlsStreamUrl) {
      try {
        return await downloadHls(
          latestHlsStreamUrl,
          baseFilename,
          metadata,
          onProgress,
        );
      } catch (streamErr) {
        console.warn("[rustcloud] HLS download failed:", streamErr);
      }
    }

    const audioElements = Array.from(document.querySelectorAll("audio"));
    for (const audio of audioElements) {
      if (
        audio.src &&
        (audio.src.startsWith("http:") || audio.src.startsWith("https:"))
      ) {
        return await downloadProgressive(
          audio.src,
          baseFilename,
          metadata,
          onProgress,
        );
      }
    }

    return {
      success: false,
      message: "Could not locate audio stream. Please play the track first.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[rustcloud] Download error:", err);
    return {
      success: false,
      message: `Download failed: ${msg}`,
    };
  }
}

export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  trackUrl: string;
  artworkUrl?: string;
}

export interface PlaylistInfo {
  title: string;
  artist: string;
  trackCount: number;
  tracks: PlaylistTrack[];
}

export interface BatchQueueItem extends PlaylistTrack {
  status: "pending" | "downloading" | "completed" | "error";
  progressMessage: string;
}

export interface BatchQueueState {
  isActive: boolean;
  total: number;
  completed: number;
  failed: number;
  currentIndex: number;
  items: BatchQueueItem[];
}

export function extractPlaylistFromPage(): PlaylistInfo | null {
  if (typeof document === "undefined") return null;

  const trackElements = Array.from(
    document.querySelectorAll(
      ".listenDetails__trackList .trackItem, .trackList__item .trackItem",
    ),
  );

  if (trackElements.length === 0) {
    return null;
  }

  const titleEl =
    document.querySelector(".soundTitle__titleHeroContainer h1 span") ||
    document.querySelector(".soundTitle__title span") ||
    document.querySelector(".soundTitle");
  const playlistTitle = titleEl?.textContent?.trim() || "SoundCloud Playlist";

  const artistEl =
    document.querySelector(".soundTitle__usernameHero a") ||
    document.querySelector(".soundTitle__username a") ||
    document.querySelector(".userBadge__username a");
  const playlistArtist = artistEl?.textContent?.trim() || "";

  const heroArt = document.querySelector(
    ".listenArtworkWrapper span[style*='background-image']",
  ) as HTMLElement | null;
  let defaultArtUrl = "";
  if (heroArt?.style?.backgroundImage) {
    const m = heroArt.style.backgroundImage.match(/url\(["']?([^"']+)["']?\)/);
    if (m && m[1]) defaultArtUrl = m[1];
  }

  const tracks: PlaylistTrack[] = [];
  trackElements.forEach((el, idx) => {
    const titleLink = el.querySelector(
      ".trackItem__trackTitle",
    ) as HTMLAnchorElement | null;
    const rawTitle = titleLink?.textContent?.trim() || `Track ${idx + 1}`;
    const href = titleLink?.getAttribute("href") || "";
    if (!href) return;

    const trackUrl = new URL(href.split("?")[0], window.location.origin).href;

    const artSpan = el.querySelector(
      ".trackItem__image span[style*='background-image']",
    ) as HTMLElement | null;
    let artworkUrl = defaultArtUrl;
    if (artSpan?.style?.backgroundImage) {
      const m = artSpan.style.backgroundImage.match(
        /url\(["']?([^"']+)["']?\)/,
      );
      if (m && m[1]) artworkUrl = m[1];
    }

    let trackArtist = playlistArtist;
    let trackTitle = rawTitle;
    if (rawTitle.includes(" - ")) {
      const parts = rawTitle.split(" - ");
      trackArtist = parts[0].trim();
      trackTitle = parts.slice(1).join(" - ").trim();
    }

    tracks.push({
      id: `${trackUrl}-${idx}`,
      title: trackTitle,
      artist: trackArtist,
      trackUrl,
      artworkUrl,
    });
  });

  if (tracks.length === 0) return null;

  return {
    title: playlistTitle,
    artist: playlistArtist,
    trackCount: tracks.length,
    tracks,
  };
}

let batchState: BatchQueueState = {
  isActive: false,
  total: 0,
  completed: 0,
  failed: 0,
  currentIndex: -1,
  items: [],
};

let isBatchCancelled = false;
const batchListeners: Array<(state: BatchQueueState) => void> = [];

export function getBatchQueueState(): BatchQueueState {
  return { ...batchState, items: [...batchState.items] };
}

function notifyBatchListeners(): void {
  const state = getBatchQueueState();
  batchListeners.forEach((fn) => fn(state));
  window.dispatchEvent(
    new CustomEvent("rustcloud:batch-queue-changed", { detail: state }),
  );
}

export function onBatchQueueUpdate(
  fn: (state: BatchQueueState) => void,
): () => void {
  batchListeners.push(fn);
  fn(getBatchQueueState());
  return () => {
    const idx = batchListeners.indexOf(fn);
    if (idx !== -1) batchListeners.splice(idx, 1);
  };
}

export async function startBatchDownload(
  tracks: PlaylistTrack[],
): Promise<void> {
  if (tracks.length === 0 || batchState.isActive) return;

  isBatchCancelled = false;
  batchState = {
    isActive: true,
    total: tracks.length,
    completed: 0,
    failed: 0,
    currentIndex: 0,
    items: tracks.map((t) => ({
      ...t,
      status: "pending",
      progressMessage: "Queued",
    })),
  };
  notifyBatchListeners();

  for (let i = 0; i < batchState.items.length; i++) {
    if (isBatchCancelled) {
      break;
    }

    batchState.currentIndex = i;
    const item = batchState.items[i];
    item.status = "downloading";
    item.progressMessage = "Starting...";
    notifyBatchListeners();

    try {
      const res = await downloadTrack(
        item.title,
        item.artist,
        item.trackUrl,
        item.artworkUrl,
        (msg: string) => {
          item.progressMessage = msg;
          notifyBatchListeners();
        },
      );

      if (res.success) {
        item.status = "completed";
        item.progressMessage = "Saved";
        batchState.completed++;
      } else {
        item.status = "error";
        item.progressMessage = res.message || "Failed";
        batchState.failed++;
      }
    } catch (err: unknown) {
      item.status = "error";
      item.progressMessage = err instanceof Error ? err.message : "Error";
      batchState.failed++;
    }

    notifyBatchListeners();

    if (i < batchState.items.length - 1 && !isBatchCancelled) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  batchState.isActive = false;
  notifyBatchListeners();
}

export function cancelBatchDownload(): void {
  isBatchCancelled = true;
  batchState.isActive = false;
  batchState.items.forEach((item) => {
    if (item.status === "pending" || item.status === "downloading") {
      item.status = "error";
      item.progressMessage = "Cancelled";
    }
  });
  notifyBatchListeners();
}
