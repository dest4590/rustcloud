import { TrackInfo } from "./player";

export interface SoundAttributes {
  id?: number;
  urn?: string;
  title?: string;
  permalink_url?: string;
  artwork_url?: string;
  duration?: number;
  track_authorization?: string;
  user?: {
    username?: string;
    permalink?: string;
    avatar_url?: string;
  };
  media?: {
    transcodings?: Array<{
      url: string;
      preset: string;
      duration: number;
      format: {
        protocol: string;
        mime_type: string;
      };
      quality: string;
    }>;
  };
}

export interface SoundModel {
  id?: number;
  attributes?: SoundAttributes;
  get?: (key: string) => unknown;
  isPlaying?: () => boolean;
  currentTime?: () => number;
  getDuration?: () => number;
  play?: (opts?: unknown) => void;
  pause?: (opts?: unknown) => void;
  seek?: (ms: number) => void;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  off?: (event: string, callback: (...args: unknown[]) => void) => void;
}

export interface PlayManager {
  getCurrentSound?: () => SoundModel | null;
  getCurrentQueueItem?: () => { sound?: SoundModel } | null;
  isPlaying?: () => boolean;
  playCurrent?: (opts?: unknown) => void;
  pauseCurrent?: (opts?: unknown) => void;
  toggleCurrent?: (opts?: unknown) => void;
  seekCurrentTo?: (ms: number) => void;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  off?: (event: string, callback: (...args: unknown[]) => void) => void;
}

type WebpackRequire = {
  (id: number | string): unknown;
  c?: Record<string | number, { exports: unknown }>;
};

let webpackRequire: WebpackRequire | null = null;
let playManagerInstance: PlayManager | null = null;
let currentHookedSound: SoundModel | null = null;
let isBridgeInitialized = false;

const mainAudioElements = new WeakSet<HTMLMediaElement>();
const secondaryElements = new WeakSet<HTMLMediaElement>();

const STORY_SELECTOR =
  ".storyView, .stories, .story, .sc-modal, .visuals, .videoPlayer, [class*='story'], [class*='Story']";

export function markSecondary(el: HTMLMediaElement): void {
  secondaryElements.add(el);
}

export function isSecondaryMedia(el: HTMLMediaElement): boolean {
  if (el instanceof HTMLVideoElement) return true;
  if (mainAudioElements.has(el)) return false;
  if (secondaryElements.has(el)) return true;
  if (el.closest(STORY_SELECTOR)) {
    secondaryElements.add(el);
    return true;
  }
  return false;
}

export function registerMainAudioElement(el: HTMLMediaElement): void {
  mainAudioElements.add(el);
}

function probeWebpack(): Promise<WebpackRequire | null> {
  return new Promise((resolve) => {
    if (webpackRequire) {
      return resolve(webpackRequire);
    }

    if (typeof window === "undefined") {
      return resolve(null);
    }

    const maxAttempts = 50;
    let attempts = 0;

    const interval = setInterval(() => {
      attempts++;
      const wp = (window as unknown as { webpackJsonp?: Array<unknown> })
        .webpackJsonp;
      if (Array.isArray(wp)) {
        try {
          const probeId = `__rustcloud_bridge_${Date.now()}__`;
          wp.push([
            [probeId],
            {
              [probeId]: (
                _module: unknown,
                _exports: unknown,
                req: WebpackRequire,
              ) => {
                webpackRequire = req;
              },
            },
            [[probeId]],
          ]);
        } catch {}
      }

      if (webpackRequire) {
        clearInterval(interval);
        resolve(webpackRequire);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

function resolvePlayManager(req: WebpackRequire): PlayManager | null {
  if (!req) return null;

  try {
    const mod20 = req(20) as PlayManager;
    if (
      mod20 &&
      typeof mod20.getCurrentSound === "function" &&
      typeof mod20.isPlaying === "function"
    ) {
      return mod20;
    }
  } catch {}

  if (req.c) {
    for (const id in req.c) {
      try {
        const exp = req.c[id]?.exports as PlayManager & {
          default?: PlayManager;
        };
        if (
          exp &&
          typeof exp.getCurrentSound === "function" &&
          typeof exp.playCurrent === "function"
        ) {
          return exp;
        }
        if (
          exp?.default &&
          typeof exp.default.getCurrentSound === "function" &&
          typeof exp.default.playCurrent === "function"
        ) {
          return exp.default;
        }
      } catch {}
    }
  }

  return null;
}

export function getGlobalPlayManager(): PlayManager | null {
  if (playManagerInstance) return playManagerInstance;
  if (webpackRequire) {
    playManagerInstance = resolvePlayManager(webpackRequire);
  }
  return playManagerInstance;
}

export function soundModelToTrackInfo(
  sound: SoundModel | null,
  isPlaying = false,
): TrackInfo | null {
  if (!sound) return null;
  const attrs = sound.attributes || {};

  const title = (attrs.title || (sound.get?.("title") as string) || "").trim();
  if (!title) return null;

  const user =
    attrs.user || (sound.get?.("user") as SoundAttributes["user"]) || {};
  const artist = (user.username || user.permalink || "SoundCloud").trim();

  let artworkUrl =
    attrs.artwork_url ||
    (sound.get?.("artwork_url") as string) ||
    user.avatar_url ||
    "";
  if (artworkUrl) {
    artworkUrl = artworkUrl
      .replace("-t50x50.", "-t500x500.")
      .replace("-t120x120.", "-t500x500.");
  }

  let trackUrl =
    attrs.permalink_url || (sound.get?.("permalink_url") as string) || "";
  if (trackUrl) {
    try {
      const u = new URL(trackUrl, "https://soundcloud.com");
      trackUrl = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      trackUrl = trackUrl.split("?")[0].replace(/\/+$/, "");
    }
  }

  const durationMs = attrs.duration || (sound.get?.("duration") as number) || 0;
  const duration =
    durationMs > 0 ? Math.round(durationMs / 1000) : sound.getDuration?.() || 0;
  const positionMs = sound.currentTime?.() || 0;
  const position = positionMs > 0 ? positionMs / 1000 : 0;

  return {
    title,
    artist,
    artworkUrl,
    trackUrl,
    isPlaying:
      typeof sound.isPlaying === "function" ? sound.isPlaying() : isPlaying,
    position,
    duration,
  };
}

export async function initSoundCloudBridge(
  onTrackChanged: (track: TrackInfo) => void,
  onPlayStateChanged: (isPlaying: boolean) => void,
  onTimeUpdate: (position: number) => void,
): Promise<void> {
  if (isBridgeInitialized) return;
  isBridgeInitialized = true;

  const req = await probeWebpack();
  if (!req) return;

  const pm = resolvePlayManager(req);
  if (!pm) return;
  playManagerInstance = pm;

  function bindSound(sound: SoundModel | null) {
    if (currentHookedSound && currentHookedSound.off) {
      try {
        currentHookedSound.off("play", handlePlay);
        currentHookedSound.off("pause", handlePause);
        currentHookedSound.off("time", handleTime);
      } catch {}
    }

    currentHookedSound = sound;
    if (sound && sound.on) {
      try {
        sound.on("play", handlePlay);
        sound.on("pause", handlePause);
        sound.on("time", handleTime);
      } catch {}

      const track = soundModelToTrackInfo(sound, pm?.isPlaying?.() || false);
      if (track) {
        onTrackChanged(track);
      }
    }
  }

  function handlePlay() {
    onPlayStateChanged(true);
  }

  function handlePause() {
    onPlayStateChanged(false);
  }

  function handleTime() {
    if (currentHookedSound?.currentTime) {
      const pos = (currentHookedSound.currentTime() || 0) / 1000;
      onTimeUpdate(pos);
    }
  }

  if (pm.on) {
    pm.on("change:currentSound", () => {
      const sound =
        pm.getCurrentSound?.() || pm.getCurrentQueueItem?.()?.sound || null;
      bindSound(sound);
    });
    pm.on("queueReset", () => {
      const sound =
        pm.getCurrentSound?.() || pm.getCurrentQueueItem?.()?.sound || null;
      bindSound(sound);
    });
  }

  const initialSound =
    pm.getCurrentSound?.() || pm.getCurrentQueueItem?.()?.sound || null;
  if (initialSound) {
    bindSound(initialSound);
  }
}
