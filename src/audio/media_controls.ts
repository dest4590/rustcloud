import { listen } from "@tauri-apps/api/event";
import {
  togglePlayPause,
  playNext,
  playPrev,
  seekTo,
  onMediaVolume,
  extractTrackInfo,
} from "./player";
import { getGlobalPlayManager } from "./soundcloud_bridge";
import {
  openControlCenter,
  closeControlCenter,
  isControlCenterOpen,
} from "../control-center";
import { toast } from "../control-center/toast";

let lastActionTimestamp = 0;
const ACTION_DEBOUNCE_MS = 180;

function shouldDebounce(): boolean {
  const now = Date.now();
  if (now - lastActionTimestamp < ACTION_DEBOUNCE_MS) {
    return true;
  }
  lastActionTimestamp = now;
  return false;
}

let cachedVolume = 1.0;
let isMuted = false;
let preMuteVolume = 1.0;

export function getVolume(): number {
  const audios = document.querySelectorAll<HTMLMediaElement>("audio");
  for (const el of audios) {
    if (el.duration && !isNaN(el.duration)) {
      const v = el.volume;
      return v > 0 && v <= 1 ? Math.cbrt(v) : v;
    }
  }
  return cachedVolume;
}

export function setVolume(vol: number): void {
  const clamped = Math.max(0, Math.min(1.0, vol));
  cachedVolume = clamped;
  const cubed = Math.pow(clamped, 3);
  const audios = document.querySelectorAll<HTMLMediaElement>("audio");
  for (const el of audios) {
    try {
      el.volume = cubed;
    } catch {}
  }
  onMediaVolume(clamped);
}

export function adjustVolume(delta: number): number {
  const cur = getVolume();
  const next = Math.max(0, Math.min(1.0, cur + delta));
  setVolume(next);
  toast.info(`volume: ${Math.round(next * 100)}%`, 1200);
  return next;
}

export function toggleMute(): void {
  if (isMuted) {
    isMuted = false;
    setVolume(preMuteVolume || 1.0);
    toast.info(`volume: ${Math.round((preMuteVolume || 1.0) * 100)}%`, 1200);
  } else {
    preMuteVolume = getVolume();
    isMuted = true;
    setVolume(0);
    toast.info("volume: muted", 1200);
  }
}

export function seekRelative(deltaSeconds: number): void {
  const track = extractTrackInfo();
  const currentPos = track?.position ?? 0;
  const targetPos = Math.max(0, currentPos + deltaSeconds);
  seekTo(targetPos);
}

export function initMediaControls(): void {
  const w = window as unknown as {
    __RUSTCLOUD_MEDIA_UNLISTEN__?: Array<() => void>;
  };
  if (w.__RUSTCLOUD_MEDIA_UNLISTEN__) {
    for (const unlisten of w.__RUSTCLOUD_MEDIA_UNLISTEN__) {
      try {
        unlisten();
      } catch {}
    }
  }
  const unlistenList: Array<() => void> = [];
  w.__RUSTCLOUD_MEDIA_UNLISTEN__ = unlistenList;

  function trackUnlisten<T>(event: string, handler: (e: any) => void) {
    listen<T>(event, handler).then((unlisten) => {
      unlistenList.push(unlisten);
    });
  }

  trackUnlisten("media-play-pause", () => {
    if (shouldDebounce()) return;
    togglePlayPause();
  });

  trackUnlisten("tray-play-pause", () => {
    if (shouldDebounce()) return;
    togglePlayPause();
  });

  trackUnlisten("media-play", () => {
    if (shouldDebounce()) return;
    const pm = getGlobalPlayManager();
    if (pm && typeof pm.isPlaying === "function" && !pm.isPlaying()) {
      togglePlayPause();
    }
  });

  trackUnlisten("media-pause", () => {
    if (shouldDebounce()) return;
    const pm = getGlobalPlayManager();
    if (pm && typeof pm.isPlaying === "function" && pm.isPlaying()) {
      togglePlayPause();
    }
  });

  trackUnlisten("media-next", () => {
    if (shouldDebounce()) return;
    playNext();
  });

  trackUnlisten("tray-next", () => {
    if (shouldDebounce()) return;
    playNext();
  });

  trackUnlisten("media-prev", () => {
    if (shouldDebounce()) return;
    playPrev();
  });

  trackUnlisten("tray-prev", () => {
    if (shouldDebounce()) return;
    playPrev();
  });

  trackUnlisten<number>("media-seek", (event) => {
    if (typeof event.payload === "number") {
      seekTo(event.payload);
    }
  });

  trackUnlisten<number>("media-seek-relative", (event) => {
    if (typeof event.payload === "number") {
      seekRelative(event.payload);
    }
  });

  trackUnlisten("media-volume-up", () => {
    adjustVolume(0.05);
  });

  trackUnlisten("media-volume-down", () => {
    adjustVolume(-0.05);
  });

  trackUnlisten("media-volume-mute", () => {
    toggleMute();
  });

  trackUnlisten("rustcloud:control-center-toggle", () => {
    if (isControlCenterOpen()) {
      closeControlCenter();
    } else {
      openControlCenter();
    }
  });
}
