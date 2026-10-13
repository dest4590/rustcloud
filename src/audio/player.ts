import { invoke } from "@tauri-apps/api/core";
import {
  resolvePlayableStream,
  getLatestAuthHeader,
  invalidateStreamCache,
} from "../downloader/downloader";
import { getBooleanSetting, SETTING_KEYS } from "../control-center/settings";
import {
  initSoundCloudBridge,
  getGlobalPlayManager,
  soundModelToTrackInfo,
  isSecondaryMedia,
} from "./soundcloud_bridge";
import {
  getTrackedMediaElements,
  silenceElement,
  restoreElement,
} from "./audio_hook";

export interface TrackInfo {
  title: string;
  artist: string;
  artworkUrl: string;
  trackUrl: string;
  isPlaying: boolean;
  position: number;
  duration: number;
}

function parseSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr
    .trim()
    .split(":")
    .map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

function cleanTitle(raw: string): string {
  return raw.replace(/^current track:\s*/i, "").trim();
}

function extractTitle(titleElem: HTMLElement): string {
  const ariaSpan = titleElem.querySelector('span[aria-hidden="true"]');
  if (ariaSpan && ariaSpan.textContent) {
    const text = cleanTitle(ariaSpan.textContent);
    if (text) return text;
  }

  const attrTitle = titleElem.getAttribute("title");
  if (attrTitle) {
    const text = cleanTitle(attrTitle);
    if (text) return text;
  }

  const clone = titleElem.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sc-visuallyhidden").forEach((el) => el.remove());
  return cleanTitle(clone.textContent || "");
}

function extractArtist(artistElem: HTMLElement | null): string {
  if (!artistElem) return "SoundCloud";

  const ariaSpan = artistElem.querySelector('span[aria-hidden="true"]');
  if (ariaSpan && ariaSpan.textContent) {
    const text = ariaSpan.textContent.trim();
    if (text) return text;
  }

  const attrTitle = artistElem.getAttribute("title");
  if (attrTitle) {
    const text = attrTitle.trim();
    if (text) return text;
  }

  const clone = artistElem.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sc-visuallyhidden").forEach((el) => el.remove());
  return (clone.textContent || "").trim() || "SoundCloud";
}

let lastTrack: TrackInfo | null = null;
let lastSyncTime = 0;
let isApplyingDomSync = false;

export function applyPlaybackUIState(playing: boolean): void {
  if (
    !isRustAudioActive() ||
    isNativeDrmFallbackActive() ||
    rustPlaybackFailed
  ) {
    return;
  }

  const playBtn = document.querySelector<HTMLElement>(
    ".playControl, button.playControl, .playControls__play",
  );
  if (!playBtn) return;

  const hasPlayingClass = playBtn.classList.contains("playing");
  if (hasPlayingClass === playing) return;

  isApplyingDomSync = true;
  try {
    if (playing) {
      playBtn.classList.add("playing");
      playBtn.classList.remove(
        "buffering",
        "sc-button-buffering",
        "playControl--buffering",
      );
      playBtn.setAttribute("title", "Pause current");
      playBtn.setAttribute("aria-label", "Pause current");
    } else {
      playBtn.classList.remove("playing");
      playBtn.setAttribute("title", "Play current");
      playBtn.setAttribute("aria-label", "Play current");
    }

    const soundBadge = document.querySelector<HTMLElement>(
      ".playbackSoundBadge",
    );
    if (soundBadge) {
      if (playing) {
        soundBadge.classList.remove("paused");
      } else {
        soundBadge.classList.add("paused");
      }
    }
  } finally {
    window.setTimeout(() => {
      isApplyingDomSync = false;
    }, 60);
  }
}

export function extractTrackInfo(): TrackInfo | null {
  const playControls = document.querySelector(".playControls");
  if (!playControls) return null;

  const titleElem = playControls.querySelector<HTMLAnchorElement>(
    ".playbackSoundBadge__titleLink, .playbackSoundBadge__title, a.playbackSoundBadge__title, .playbackSoundBadge__titleWrapper a[href]",
  );
  if (!titleElem) return null;

  const artistElem = playControls.querySelector<HTMLAnchorElement>(
    ".playbackSoundBadge__lightLink, .playbackSoundBadge__context, a.playbackSoundBadge__lightLink, .playbackSoundBadge__titleContextContainer a",
  );

  const title = extractTitle(titleElem);
  if (!title) return null;

  const artist = extractArtist(artistElem);
  const titleHref = titleElem.getAttribute("href") || titleElem.href || "";
  const artistHref = artistElem?.getAttribute("href") || artistElem?.href || "";

  let trackUrl = "";

  function isTrackPermalink(href: string): boolean {
    if (!href || href.startsWith("#") || href.includes("javascript:"))
      return false;
    try {
      const u = new URL(href, "https://soundcloud.com");
      const parts = u.pathname.split("/").filter(Boolean);
      return (
        parts.length >= 2 &&
        ![
          "discover",
          "stream",
          "feed",
          "you",
          "upload",
          "search",
          "charts",
          "undefined",
        ].includes(parts[0]) &&
        !parts.some((p) => p === "undefined")
      );
    } catch {
      return false;
    }
  }

  function getArtistPermalink(): string {
    if (!artistHref) return "";
    try {
      const u = new URL(artistHref, "https://soundcloud.com");
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 1 &&
        ![
          "discover",
          "stream",
          "feed",
          "you",
          "upload",
          "search",
          "charts",
        ].includes(parts[0])
      ) {
        return parts[0];
      }
    } catch {}
    return "";
  }

  if (isTrackPermalink(titleHref)) {
    try {
      trackUrl = new URL(titleHref, "https://soundcloud.com").href;
    } catch {
      trackUrl = titleHref;
    }
  }

  if (!trackUrl && titleHref) {
    const artistSlug = getArtistPermalink();
    try {
      const u = new URL(titleHref, "https://soundcloud.com");
      const parts = u.pathname.split("/").filter(Boolean);
      const trackSlug = parts[parts.length - 1];
      if (artistSlug && trackSlug && trackSlug !== artistSlug) {
        trackUrl = `https://soundcloud.com/${artistSlug}/${trackSlug}`;
      }
    } catch {}
  }

  if (!trackUrl) {
    const badgeLinks = Array.from(
      playControls.querySelectorAll<HTMLAnchorElement>(
        ".playbackSoundBadge a[href]",
      ),
    );
    for (const link of badgeLinks) {
      const href = link.getAttribute("href") || link.href || "";
      if (isTrackPermalink(href)) {
        try {
          trackUrl = new URL(href, "https://soundcloud.com").href;
          break;
        } catch {
          trackUrl = href;
          break;
        }
      }
    }
  }

  if (!trackUrl) {
    const currentLoc = window.location.href;
    if (isTrackPermalink(currentLoc)) {
      trackUrl = currentLoc;
    }
  }

  if (trackUrl) {
    try {
      const u = new URL(trackUrl, "https://soundcloud.com");
      trackUrl = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      trackUrl = trackUrl.split("?")[0].replace(/\/+$/, "");
    }
  }

  const avatarElem = playControls.querySelector<HTMLElement>(
    '.playbackSoundBadge__avatar .image__lightOutline span[style*="background-image"], .playbackSoundBadge__avatar .image span[style*="background-image"], .playbackSoundBadge__avatar span[style*="background-image"], .playbackSoundBadge .image span[style*="background-image"]',
  );
  let artworkUrl = "";
  if (avatarElem && avatarElem.style.backgroundImage) {
    const match = avatarElem.style.backgroundImage.match(
      /url\(["']?([^"']+)["']?\)/,
    );
    if (match && match[1]) {
      artworkUrl = match[1]
        .replace("-t50x50.", "-t500x500.")
        .replace("-t120x120.", "-t500x500.");
    }
  }

  if (!artworkUrl) {
    const imgElem = playControls.querySelector<HTMLImageElement>(
      ".playbackSoundBadge__avatar img, .playbackSoundBadge img",
    );
    if (imgElem && imgElem.src) {
      artworkUrl = imgElem.src
        .replace("-t50x50.", "-t500x500.")
        .replace("-t120x120.", "-t500x500.");
    }
  }

  let isPlaying = false;
  if (isRustAudioActive() && isRustPlaying && userWantsPlayback) {
    isPlaying = true;
  } else {
    const pm = getGlobalPlayManager();
    const pmPlaying = pm?.isPlaying?.();
    if (typeof pmPlaying === "boolean") {
      isPlaying = pmPlaying;
    } else {
      const playBtn = playControls.querySelector<HTMLElement>(
        ".playControl, button.playControl, .playControls__play",
      );
      const isBuffering =
        playBtn?.classList.contains("buffering") ||
        playBtn?.classList.contains("sc-button-buffering") ||
        playBtn?.classList.contains("playControl--buffering");

      if (isBuffering && lastTrack) {
        isPlaying = lastTrack.isPlaying;
      } else {
        isPlaying =
          playBtn?.classList.contains("playing") ||
          playBtn
            ?.getAttribute("aria-label")
            ?.toLowerCase()
            .includes("pause") ||
          playBtn?.getAttribute("title")?.toLowerCase().includes("pause") ||
          false;
      }
    }
  }

  const progressWrapper = playControls.querySelector(
    ".playbackTimeline__progressWrapper",
  );
  let position = 0;
  let duration = 0;

  if (progressWrapper) {
    const nowAttr = progressWrapper.getAttribute("aria-valuenow");
    const maxAttr = progressWrapper.getAttribute("aria-valuemax");
    if (nowAttr) {
      const val = parseInt(nowAttr, 10);
      if (!isNaN(val)) position = val;
    }
    if (maxAttr) {
      const val = parseInt(maxAttr, 10);
      if (!isNaN(val)) duration = val;
    }
  }

  if (position === 0) {
    const passedSpan = playControls.querySelector<HTMLElement>(
      '.playbackTimeline__timePassed span[aria-hidden="true"]',
    );
    if (passedSpan?.textContent) {
      position = parseSeconds(passedSpan.textContent);
    }
  }

  if (duration === 0) {
    const durationSpan = playControls.querySelector<HTMLElement>(
      '.playbackTimeline__duration span[aria-hidden="true"]',
    );
    if (durationSpan?.textContent) {
      duration = parseSeconds(durationSpan.textContent);
    }
  }

  return {
    title,
    artist,
    artworkUrl,
    trackUrl,
    isPlaying,
    position,
    duration,
  };
}

export function getCurrentTrack(): TrackInfo | null {
  const pm = getGlobalPlayManager();
  if (pm) {
    const sound =
      pm.getCurrentSound?.() || pm.getCurrentQueueItem?.()?.sound || null;
    const info = soundModelToTrackInfo(
      sound,
      isRustAudioActive() && isRustPlaying ? true : pm.isPlaying?.() || false,
    );
    if (info) return info;
  }
  return extractTrackInfo() || lastTrack;
}

let activeStreamUrl = "";
let currentTrackUrl = "";
let resolvingTrackUrl = "";
let isRustPlaying = false;
let userWantsPlayback = false;
let trackSwitchEpoch = 0;
let lastTrackSwitchTime = 0;

let playPauseDebounceTimer: number | null = null;
let pendingDesiredPlaying: boolean | null = null;

let seekDebounceTimer: number | null = null;
let pendingSeekSeconds: number | null = null;

let volumeThrottleTimer: number | null = null;
let pendingVolume: number | null = null;
let lastSentVolume = -1;

export function isRustAudioActive(): boolean {
  return (
    getBooleanSetting(SETTING_KEYS.RUST_AUDIO, false) ||
    getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false)
  );
}

const activeSecondary = new Set<HTMLMediaElement>();
let pausedByStory = false;
let lastRetryAt = 0;
let rustPlaybackFailed = false;

function cancelDebounceTimers(): void {
  if (playPauseDebounceTimer !== null) {
    window.clearTimeout(playPauseDebounceTimer);
    playPauseDebounceTimer = null;
  }
  if (seekDebounceTimer !== null) {
    window.clearTimeout(seekDebounceTimer);
    seekDebounceTimer = null;
  }
  pendingDesiredPlaying = null;
  pendingSeekSeconds = null;
}

function resetRustState(): void {
  cancelDebounceTimers();
  if (currentTrackUrl) {
    invalidateStreamCache(currentTrackUrl);
  }
  setDrmFallbackActive(false);
  activeStreamUrl = "";
  currentTrackUrl = "";
  resolvingTrackUrl = "";
  isRustPlaying = false;
  userWantsPlayback = false;
  applyPlaybackUIState(false);
}

export function onSecondaryStart(el: HTMLMediaElement): void {
  activeSecondary.add(el);
  if (!isRustAudioActive()) return;
  if (isRustPlaying || userWantsPlayback) {
    pausedByStory = true;
  }
  queuePlaybackState(false);
}

export function onSecondaryStop(el: HTMLMediaElement): void {
  if (!activeSecondary.delete(el) || activeSecondary.size > 0) return;
  if (!pausedByStory) return;
  pausedByStory = false;
  window.setTimeout(() => {
    if (activeSecondary.size > 0) return;
    const pm = getGlobalPlayManager();
    const playing = pm?.isPlaying?.() ?? extractTrackInfo()?.isPlaying ?? false;
    if (playing && userWantsPlayback) {
      queuePlaybackState(true);
    }
  }, 200);
}

export function pauseRustAudio(): void {
  userWantsPlayback = false;
  queuePlaybackState(false);
}

let isDrmFallbackActive = false;

export function isNativeDrmFallbackActive(): boolean {
  return isDrmFallbackActive;
}

export function setDrmFallbackActive(active: boolean): void {
  if (isDrmFallbackActive !== active) {
    isDrmFallbackActive = active;
    window.dispatchEvent(
      new CustomEvent("rustcloud:drm-fallback", {
        detail: { active },
      }),
    );
  }
}

export function silenceWebviewAudio(): void {
  const rust = isRustAudioActive();
  const tracked = getTrackedMediaElements();
  const all = new Set<HTMLMediaElement>([
    ...Array.from(document.querySelectorAll<HTMLMediaElement>("audio, video")),
    ...Array.from(tracked),
  ]);

  all.forEach((el) => {
    if (!el.isConnected && el.paused) tracked.delete(el);
    if (isSecondaryMedia(el) || !rust || rustPlaybackFailed) {
      restoreElement(el);
    } else {
      silenceElement(el);
    }
  });
}

function activateWebviewFallback(): void {
  rustPlaybackFailed = true;
  silenceWebviewAudio();
  if (userWantsPlayback) {
    const pm = getGlobalPlayManager();
    if (pm && typeof pm.playCurrent === "function") {
      try {
        pm.playCurrent();
      } catch {}
    } else {
      document.querySelectorAll<HTMLMediaElement>("audio").forEach((el) => {
        if (!isSecondaryMedia(el)) {
          try {
            el.play();
          } catch {}
        }
      });
    }
  }
}

function queuePlaybackState(shouldPlay: boolean): void {
  if (isNativeDrmFallbackActive() || rustPlaybackFailed) return;
  userWantsPlayback = shouldPlay;
  pendingDesiredPlaying = shouldPlay;
  applyPlaybackUIState(shouldPlay);

  if (playPauseDebounceTimer !== null) {
    window.clearTimeout(playPauseDebounceTimer);
  }

  if (!activeStreamUrl) {
    if (!shouldPlay) {
      invoke("rust_pause_stream").catch(() => {});
    }
    return;
  }

  playPauseDebounceTimer = window.setTimeout(() => {
    playPauseDebounceTimer = null;
    const target = pendingDesiredPlaying;
    pendingDesiredPlaying = null;
    if (target === null) return;

    if (target && activeSecondary.size > 0) {
      return;
    }

    isRustPlaying = target;
    applyPlaybackUIState(target);
    invoke(target ? "rust_resume_stream" : "rust_pause_stream").catch((err) => {
      console.debug(
        `[rustcloud-player] ${target ? "rust_resume_stream" : "rust_pause_stream"} error:`,
        err,
      );
    });
  }, 75);
}

async function startTrackPlayback(track: TrackInfo): Promise<void> {
  if (!isRustAudioActive() || !track.trackUrl) return;
  if (activeSecondary.size > 0) return;

  const isNewTrack = track.trackUrl !== currentTrackUrl;

  if (!isNewTrack) {
    if (resolvingTrackUrl === track.trackUrl) return;
    if (rustPlaybackFailed || isNativeDrmFallbackActive()) return;
    if (activeStreamUrl) {
      if (!isRustPlaying && track.isPlaying) {
        queuePlaybackState(true);
      }
      return;
    }
  }

  if (isNewTrack) {
    cancelDebounceTimers();
    rustPlaybackFailed = false;
    setDrmFallbackActive(false);
    invoke("rust_stop_stream").catch(() => {});
    activeStreamUrl = "";
    isRustPlaying = false;
  }

  silenceWebviewAudio();

  userWantsPlayback = track.isPlaying;
  const epoch = ++trackSwitchEpoch;
  lastTrackSwitchTime = Date.now();
  currentTrackUrl = track.trackUrl;
  resolvingTrackUrl = track.trackUrl;
  lastTrack = track;

  applyPlaybackUIState(track.isPlaying);

  try {
    const resolved = await resolvePlayableStream(track.trackUrl);
    if (epoch !== trackSwitchEpoch) return;

    if (!resolved || !resolved.streamUrl) {
      console.log(
        "[rustcloud-player] No unencrypted stream available for Rust. Using native WebView2 fallback.",
      );
      setDrmFallbackActive(true);
      activateWebviewFallback();
      return;
    }

    activeStreamUrl = resolved.streamUrl;
    const authHeader = resolved.authHeader || getLatestAuthHeader() || null;

    await invoke("rust_play_stream", {
      url: resolved.streamUrl,
      authHeader,
      startSecs: track.position > 1 ? track.position : null,
    });

    const startWait = Date.now();
    while (epoch === trackSwitchEpoch && Date.now() - startWait < 15000) {
      const st = await invoke<number>("rust_audio_status").catch(() => 2);
      if (st === 2 || st === 3) break;
      await new Promise((r) => window.setTimeout(r, 60));
    }

    if (epoch === trackSwitchEpoch) {
      const st = await invoke<number>("rust_audio_status").catch(() => 2);
      if (st === 3) {
        setDrmFallbackActive(true);
        activateWebviewFallback();
        return;
      }

      setDrmFallbackActive(false);

      if (track.position <= 1) {
        document.querySelectorAll<HTMLMediaElement>("audio").forEach((el) => {
          if (!isSecondaryMedia(el) && el.currentTime > 1) {
            try {
              el.currentTime = 0;
            } catch {}
          }
        });
      }

      const shouldPlay = userWantsPlayback && activeSecondary.size === 0;

      isRustPlaying = shouldPlay;
      applyPlaybackUIState(shouldPlay);

      if (shouldPlay) {
        invoke("rust_resume_stream").catch(() => {});
      } else {
        invoke("rust_pause_stream").catch(() => {});
      }
    }
  } catch (err) {
    if (epoch === trackSwitchEpoch) {
      setDrmFallbackActive(true);
      activateWebviewFallback();
    }
    console.debug(
      "[rustcloud-player] rust_play_stream fallback to webview:",
      err,
    );
  } finally {
    if (epoch === trackSwitchEpoch) {
      resolvingTrackUrl = "";
    }
  }
}

export function onMediaPlay(): void {
  if (
    !isRustAudioActive() ||
    isNativeDrmFallbackActive() ||
    rustPlaybackFailed
  ) {
    return;
  }
  userWantsPlayback = true;
  applyPlaybackUIState(true);
  silenceWebviewAudio();

  const current = extractTrackInfo() || lastTrack;
  if (current) {
    current.isPlaying = true;
    if (current.trackUrl === currentTrackUrl && activeStreamUrl) {
      queuePlaybackState(true);
    } else if (resolvingTrackUrl !== current.trackUrl) {
      startTrackPlayback(current);
    }
  }
}

export function onMediaPause(): void {
  if (
    !isRustAudioActive() ||
    isNativeDrmFallbackActive() ||
    rustPlaybackFailed
  ) {
    return;
  }

  if (resolvingTrackUrl || Date.now() - lastTrackSwitchTime < 1000) {
    return;
  }

  userWantsPlayback = false;
  applyPlaybackUIState(false);
  queuePlaybackState(false);
}

export function onMediaSeek(seconds: number): void {
  window.dispatchEvent(
    new CustomEvent("rustcloud:seek", { detail: { position: seconds } }),
  );

  if (
    !isRustAudioActive() ||
    !activeStreamUrl ||
    isNativeDrmFallbackActive() ||
    rustPlaybackFailed
  ) {
    return;
  }

  if (Date.now() - lastTrackSwitchTime < 800 && seconds < 1.0) {
    return;
  }

  pendingSeekSeconds = seconds;
  if (seekDebounceTimer !== null) {
    window.clearTimeout(seekDebounceTimer);
  }

  seekDebounceTimer = window.setTimeout(() => {
    seekDebounceTimer = null;
    if (pendingSeekSeconds === null) return;
    const target = pendingSeekSeconds;
    pendingSeekSeconds = null;

    invoke("rust_seek_stream", { seconds: target }).catch(() => {});
  }, 100);
}

export function onMediaVolume(volume: number): void {
  if (
    !isRustAudioActive() ||
    isNativeDrmFallbackActive() ||
    rustPlaybackFailed
  ) {
    return;
  }

  const clamped = Math.max(0, Math.min(2, volume));
  if (lastSentVolume >= 0 && Math.abs(clamped - lastSentVolume) < 0.005) {
    return;
  }

  pendingVolume = clamped;
  if (volumeThrottleTimer !== null) return;

  volumeThrottleTimer = window.setTimeout(() => {
    volumeThrottleTimer = null;
    if (pendingVolume === null) return;
    const target = pendingVolume;
    pendingVolume = null;

    lastSentVolume = target;
    invoke("rust_set_volume", { volume: target }).catch(() => {});
  }, 35);
}

export function seekTo(seconds: number): boolean {
  try {
    onMediaSeek(seconds);

    const pm = getGlobalPlayManager();
    if (pm?.seekCurrentTo) {
      try {
        pm.seekCurrentTo(seconds * 1000);
      } catch {}
    }

    const audioElements = Array.from(
      document.querySelectorAll<HTMLMediaElement>("audio"),
    );
    for (const el of audioElements) {
      if (!isSecondaryMedia(el) && el.duration && !isNaN(el.duration)) {
        el.currentTime = seconds;
        return true;
      }
    }

    const progressWrapper = document.querySelector<HTMLElement>(
      ".playbackTimeline__progressWrapper",
    );
    if (progressWrapper) {
      const rect = progressWrapper.getBoundingClientRect();
      const maxAttr = progressWrapper.getAttribute("aria-valuemax");
      const duration = maxAttr ? parseInt(maxAttr, 10) : 0;
      if (duration > 0 && rect.width > 0) {
        const ratio = Math.max(0, Math.min(1, seconds / duration));
        const clickX = rect.left + rect.width * ratio;
        const clickY = rect.top + rect.height / 2;

        progressWrapper.dispatchEvent(
          new MouseEvent("mousedown", {
            clientX: clickX,
            clientY: clickY,
            bubbles: true,
          }),
        );
        progressWrapper.dispatchEvent(
          new MouseEvent("mouseup", {
            clientX: clickX,
            clientY: clickY,
            bubbles: true,
          }),
        );
        return true;
      }
    }
  } catch (err) {
    console.warn("[rustcloud-player] seekTo error:", err);
  }
  return false;
}

export function initPlayerSync(): void {
  silenceWebviewAudio();

  initSoundCloudBridge(
    (track) => {
      lastTrack = track;
      lastSyncTime = Date.now();
      invoke("track_changed", {
        track: { ...track, position: Math.floor(track.position) },
      }).catch(() => {});
      if (track.isPlaying) {
        userWantsPlayback = true;
        const isNew = Boolean(
          track.trackUrl && track.trackUrl !== currentTrackUrl,
        );
        if (
          isNew ||
          (!activeStreamUrl &&
            !rustPlaybackFailed &&
            !isNativeDrmFallbackActive() &&
            resolvingTrackUrl !== track.trackUrl)
        ) {
          startTrackPlayback(track);
        }
      } else {
        userWantsPlayback = false;
        queuePlaybackState(false);
      }
    },
    (isPlaying) => {
      userWantsPlayback = isPlaying;
      applyPlaybackUIState(isPlaying);
      if (lastTrack) {
        lastTrack.isPlaying = isPlaying;
        invoke("track_changed", {
          track: { ...lastTrack, position: Math.floor(lastTrack.position) },
        }).catch(() => {});
      }
      queuePlaybackState(isPlaying);
    },
    (posSecs) => {
      if (lastTrack) {
        lastTrack.position = posSecs;
      }
    },
  ).catch(() => {});

  window.addEventListener("rustcloud:setting-changed", ((
    e: CustomEvent<{ key: string; value: boolean }>,
  ) => {
    if (e.detail.key === SETTING_KEYS.RUST_AUDIO) {
      silenceWebviewAudio();
      if (!e.detail.value) {
        activeStreamUrl = "";
        isRustPlaying = false;
        applyPlaybackUIState(false);
        invoke("rust_stop_stream").catch(() => {});
      } else {
        if (lastTrack && lastTrack.isPlaying) {
          startTrackPlayback(lastTrack);
        }
      }
    }
  }) as EventListener);

  const sync = async () => {
    unlockGeoBlockedElements();
    try {
      const track = extractTrackInfo();
      if (!track) return;

      if (isRustAudioActive()) {
        applyPlaybackUIState(isRustPlaying && userWantsPlayback);
      }

      const trackChanged =
        !lastTrack ||
        track.title !== lastTrack.title ||
        track.artist !== lastTrack.artist ||
        (track.trackUrl &&
          lastTrack.trackUrl &&
          track.trackUrl !== lastTrack.trackUrl);

      const playStateChanged =
        lastTrack && track.isPlaying !== lastTrack.isPlaying;

      const now = Date.now();
      const elapsedWall = (now - lastSyncTime) / 1000;
      const expectedPos = lastTrack?.isPlaying
        ? lastTrack.position + elapsedWall
        : (lastTrack?.position ?? 0);
      const positionJumped =
        lastTrack && Math.abs(track.position - expectedPos) > 3;

      if (trackChanged || playStateChanged || positionJumped) {
        lastTrack = track;
        lastSyncTime = now;

        await invoke("track_changed", {
          track: { ...track, position: Math.floor(track.position) },
        }).catch(() => {});

        const isNewTrackUrl = Boolean(
          track.trackUrl &&
          (!currentTrackUrl || track.trackUrl !== currentTrackUrl),
        );

        if (trackChanged) {
          if (track.isPlaying) {
            userWantsPlayback = true;
            if (
              isNewTrackUrl ||
              (!activeStreamUrl &&
                !rustPlaybackFailed &&
                !isNativeDrmFallbackActive() &&
                resolvingTrackUrl !== track.trackUrl)
            ) {
              startTrackPlayback(track);
            }
          } else if (isNewTrackUrl) {
            userWantsPlayback = false;
            cancelDebounceTimers();
            rustPlaybackFailed = false;
            setDrmFallbackActive(false);
            invoke("rust_stop_stream").catch(() => {});
            activeStreamUrl = "";
            isRustPlaying = false;
            applyPlaybackUIState(false);
          }
        } else if (playStateChanged) {
          userWantsPlayback = track.isPlaying;
          if (track.isPlaying) {
            if (activeStreamUrl && track.trackUrl === currentTrackUrl) {
              queuePlaybackState(true);
            } else if (
              !rustPlaybackFailed &&
              !isNativeDrmFallbackActive() &&
              resolvingTrackUrl !== track.trackUrl
            ) {
              startTrackPlayback(track);
            }
          } else {
            queuePlaybackState(false);
          }
        }
      }

      if (
        isRustAudioActive() &&
        track.isPlaying &&
        userWantsPlayback &&
        track.trackUrl &&
        !resolvingTrackUrl &&
        activeSecondary.size === 0
      ) {
        if (activeStreamUrl) {
          const status = await invoke<number>("rust_audio_status").catch(
            () => 2,
          );
          if (status === 3) {
            setDrmFallbackActive(true);
            activateWebviewFallback();
            resetRustState();
          } else if (status === 2 && rustPlaybackFailed) {
            rustPlaybackFailed = false;
            setDrmFallbackActive(false);
            silenceWebviewAudio();
          }
        } else if (
          !rustPlaybackFailed &&
          !isNativeDrmFallbackActive() &&
          Date.now() - lastRetryAt > 4000
        ) {
          lastRetryAt = Date.now();
          startTrackPlayback(track);
        }
      }
    } catch (err) {
      console.warn("[rustcloud-player] Sync error:", err);
    }
  };

  setInterval(sync, 1000);
  setInterval(silenceWebviewAudio, 1000);

  window.addEventListener("pagehide", () => {
    invoke("rust_pause_stream").catch(() => {});
  });
  window.addEventListener("beforeunload", () => {
    invoke("rust_pause_stream").catch(() => {});
  });

  const playControls = document.querySelector(".playControls");
  if (playControls) {
    let syncDebounceTimer: number | null = null;
    const observer = new MutationObserver((mutations) => {
      if (isApplyingDomSync) return;
      const onlyVolumeOrTooltip = mutations.every((m) => {
        const el = m.target as HTMLElement | null;
        return (
          el?.closest?.(".volume") !== null ||
          el?.classList?.contains("volume") ||
          el?.classList?.contains("tooltip") ||
          el?.closest?.(".tooltip") !== null
        );
      });
      if (onlyVolumeOrTooltip) return;

      if (syncDebounceTimer !== null) {
        window.clearTimeout(syncDebounceTimer);
      }
      syncDebounceTimer = window.setTimeout(() => {
        syncDebounceTimer = null;
        sync();
      }, 150);
    });
    observer.observe(playControls, {
      childList: true,
      subtree: true,
      attributeFilter: ["class", "title", "aria-label", "href"],
    });
  }
}

let lastUnlockTime = 0;
function unlockGeoBlockedElements(): void {
  const now = Date.now();
  if (now - lastUnlockTime < 1500) return;
  lastUnlockTime = now;

  const isProxy = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
  const isRust = isRustAudioActive();
  if (!isProxy && !isRust) return;

  const disabledButtons = document.querySelectorAll<HTMLElement>(
    'button[disabled][aria-label="Unavailable"], .sc-button-disabled[title="Unavailable"], button.Mui-disabled[aria-label="Unavailable"], .playButton.sc-button-disabled, span[aria-label="Unavailable"] button, .waveform.m-disabled, button.Mui-disabled, a.playButton.sc-button-disabled, a.sc-button-play.sc-button-disabled, a[title="Unavailable"]',
  );

  disabledButtons.forEach((btn) => {
    const tag = btn.tagName.toLowerCase();
    if (
      tag !== "button" &&
      tag !== "a" &&
      !btn.classList.contains("playButton")
    ) {
      return;
    }
    if (btn.dataset.rcUnlocked) return;
    btn.dataset.rcUnlocked = "true";

    btn.removeAttribute("disabled");
    btn.classList.remove("Mui-disabled", "sc-button-disabled");
    btn.setAttribute("title", "Play with RustCloud (Proxy)");
    btn.setAttribute("aria-label", "Play with RustCloud");
    btn.style.pointerEvents = "auto";
    btn.style.cursor = "pointer";
    btn.style.opacity = "1";

    const parentSpan = btn.closest('span[aria-label="Unavailable"]');
    if (parentSpan instanceof HTMLElement) {
      parentSpan.removeAttribute("aria-label");
      parentSpan.style.pointerEvents = "auto";
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      let trackUrl = "";
      const soundContainer = btn.closest(
        ".sound, .sound__body, .searchList__item, .soundList__item, [role='group'], section",
      );

      try {
        const curPath = window.location.pathname.split("/").filter(Boolean);
        if (
          curPath.length >= 2 &&
          ![
            "discover",
            "stream",
            "feed",
            "you",
            "upload",
            "search",
            "charts",
            "settings",
            "tags",
          ].includes(curPath[0])
        ) {
          const u = new URL(window.location.href);
          trackUrl = `${u.origin}/${curPath[0]}/${curPath[1]}`;
        }
      } catch {}

      if (!trackUrl && soundContainer) {
        const candidateLinks =
          soundContainer.querySelectorAll<HTMLAnchorElement>(
            "a.soundTitle__title, a.sound__coverArt, a.sc-link-primary, a[href*='/']",
          );
        for (const link of candidateLinks) {
          const href = link.getAttribute("href") || link.href || "";
          try {
            const u = new URL(href, window.location.href);
            const parts = u.pathname.split("/").filter(Boolean);
            if (
              parts.length >= 2 &&
              ![
                "discover",
                "stream",
                "feed",
                "you",
                "upload",
                "search",
                "charts",
                "settings",
                "tags",
              ].includes(parts[0])
            ) {
              trackUrl = `${u.origin}/${parts[0]}/${parts[1]}`;
              break;
            }
          } catch {}
        }
      }

      if (!trackUrl) {
        trackUrl = window.location.href;
      }

      const titleElem =
        soundContainer?.querySelector(
          ".soundTitle__title, h1, .soundTitle__title span",
        ) || document.querySelector("h1, .soundTitle__title");
      const artistElem =
        soundContainer?.querySelector(
          ".soundTitle__username, .soundTitle__secondary a, .soundTitle__usernameText, a[href*='soundcloud.com/'] span",
        ) ||
        document.querySelector(
          ".soundTitle__username, a.soundTitle__usernameText",
        );

      const title = titleElem?.textContent?.trim() || "Track";
      const artist = artistElem?.textContent?.trim() || "SoundCloud";

      let artworkUrl = "";
      const imgElem =
        soundContainer?.querySelector<HTMLImageElement>("img") ||
        document.querySelector<HTMLImageElement>(
          "section[aria-label='Track header'] img, .playbackSoundBadge img",
        );
      if (imgElem && imgElem.src) {
        artworkUrl = imgElem.src;
      }

      const trackInfo: TrackInfo = {
        title,
        artist,
        artworkUrl,
        trackUrl,
        isPlaying: true,
        position: 0,
        duration: 0,
      };

      userWantsPlayback = true;
      startTrackPlayback(trackInfo);
    });
  });

  const disabledMessages = document.querySelectorAll<HTMLElement>(
    ".waveform__disabledMessageContainer, .soundTitle__disabledMessage",
  );
  disabledMessages.forEach((el) => {
    if (el.style.display !== "none") {
      el.style.display = "none";
    }
  });

  const disabledWaveforms = document.querySelectorAll<HTMLElement>(
    "[role='slider'][aria-label='Waveform'][aria-disabled='true'], .waveform.m-disabled",
  );
  disabledWaveforms.forEach((wf) => {
    wf.removeAttribute("aria-disabled");
    wf.classList.remove("m-disabled");
    wf.style.pointerEvents = "auto";
  });
}

export function pausePlayback(): void {
  invoke("rust_pause_stream").catch(() => {});
  try {
    const playControl = document.querySelector(
      ".playControl.playing",
    ) as HTMLElement | null;
    if (playControl) {
      playControl.click();
    } else {
      document.querySelectorAll("audio, video").forEach((el) => {
        (el as HTMLMediaElement).pause();
      });
    }
  } catch {}
}

export function togglePlayPause(): void {
  const pm = getGlobalPlayManager();
  if (pm && typeof pm.toggleCurrent === "function") {
    pm.toggleCurrent();
    return;
  }
  const btn = document.querySelector<HTMLButtonElement>(
    ".playControls__play, .playControl, [title*='play' i], [aria-label*='play' i], [title*='pause' i], [aria-label*='pause' i]",
  );
  btn?.click();
}

export function playNext(): void {
  const btn = document.querySelector<HTMLButtonElement>(
    ".skipControl__next, .playControls__next, [title*='next' i], [aria-label*='next' i]",
  );
  btn?.click();
}

export function playPrev(): void {
  const btn = document.querySelector<HTMLButtonElement>(
    ".skipControl__previous, .playControls__prev, [title*='previous' i], [aria-label*='previous' i]",
  );
  btn?.click();
}
