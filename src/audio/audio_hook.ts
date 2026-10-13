import {
  onMediaPlay,
  onMediaPause,
  onMediaSeek,
  onMediaVolume,
  isRustAudioActive,
  isNativeDrmFallbackActive,
  onSecondaryStart,
  onSecondaryStop,
} from "./player";
import {
  isSecondaryMedia,
  markSecondary,
  registerMainAudioElement,
} from "./soundcloud_bridge";

const allMediaElements = new Set<HTMLMediaElement>();
const virtualVolume = new WeakMap<HTMLMediaElement, number>();
const virtualMuted = new WeakMap<HTMLMediaElement, boolean>();
const watchedSecondary = new WeakSet<HTMLMediaElement>();
let activeMain: HTMLMediaElement | null = null;

const proto = HTMLMediaElement.prototype;
const volumeDesc = Object.getOwnPropertyDescriptor(proto, "volume")!;
const mutedDesc = Object.getOwnPropertyDescriptor(proto, "muted")!;
const timeDesc = Object.getOwnPropertyDescriptor(proto, "currentTime")!;
const rawPlay = proto.play;
const rawPause = proto.pause;

export function getTrackedMediaElements(): Set<HTMLMediaElement> {
  return allMediaElements;
}

export function silenceElement(el: HTMLMediaElement): void {
  try {
    if (!mutedDesc.get!.call(el)) mutedDesc.set!.call(el, true);
    if (volumeDesc.get!.call(el) !== 0) volumeDesc.set!.call(el, 0);
  } catch {}
}

export function restoreElement(el: HTMLMediaElement): void {
  try {
    const muted = virtualMuted.get(el) ?? false;
    if (mutedDesc.get!.call(el) !== muted) mutedDesc.set!.call(el, muted);
    const vol = virtualVolume.get(el) ?? 1;
    if (volumeDesc.get!.call(el) !== vol) volumeDesc.set!.call(el, vol);
  } catch {}
}

function controlled(el: HTMLMediaElement): boolean {
  return (
    isRustAudioActive() && !isSecondaryMedia(el) && !isNativeDrmFallbackActive()
  );
}

function debugLog(el: HTMLMediaElement, secondary: boolean): void {
  try {
    if (localStorage.getItem("rustcloud_debug") !== "1") return;
    console.log(
      "[rustcloud-media]",
      el.tagName,
      "connected=" + el.isConnected,
      "secondary=" + secondary,
      el.className,
      el.parentElement?.className,
      (el.currentSrc || el.src || "").slice(0, 100),
    );
  } catch {}
}

function watchSecondary(el: HTMLMediaElement): void {
  if (watchedSecondary.has(el)) return;
  watchedSecondary.add(el);
  const stop = () => onSecondaryStop(el);
  for (const ev of ["pause", "ended", "emptied", "abort", "error"]) {
    el.addEventListener(ev, stop);
  }
}

export function initAudioHooks(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __RUSTCLOUD_HOOKED__?: boolean };
  if (w.__RUSTCLOUD_HOOKED__) return;
  w.__RUSTCLOUD_HOOKED__ = true;

  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: ElementCreationOptions,
  ): HTMLElementTagNameMap[K] {
    const el = originalCreateElement(tagName, options);
    if (el instanceof HTMLMediaElement) {
      allMediaElements.add(el);
      if (controlled(el)) silenceElement(el);
    }
    return el;
  };

  proto.play = function (this: HTMLMediaElement) {
    allMediaElements.add(this);
    const secondary = isSecondaryMedia(this);
    debugLog(this, secondary);

    if (secondary) {
      markSecondary(this);
      restoreElement(this);
      watchSecondary(this);
      onSecondaryStart(this);
      return rawPlay.call(this);
    }

    registerMainAudioElement(this);
    activeMain = this;
    if (isRustAudioActive()) {
      if (isNativeDrmFallbackActive()) {
        restoreElement(this);
      } else {
        silenceElement(this);
        onMediaPlay();
      }
    }
    return rawPlay.call(this);
  };

  proto.pause = function (this: HTMLMediaElement) {
    allMediaElements.add(this);
    if (this === activeMain && controlled(this)) {
      onMediaPause();
    }
    return rawPause.call(this);
  };

  Object.defineProperty(proto, "volume", {
    configurable: true,
    enumerable: volumeDesc.enumerable,
    get(this: HTMLMediaElement) {
      const v = virtualVolume.get(this);
      return v !== undefined && controlled(this)
        ? v
        : volumeDesc.get!.call(this);
    },
    set(this: HTMLMediaElement, val: number) {
      allMediaElements.add(this);
      if (!controlled(this)) {
        volumeDesc.set!.call(this, val);
        virtualVolume.set(this, val);
        return;
      }
      const prev = virtualVolume.get(this);
      virtualVolume.set(this, val);
      if (prev === undefined || Math.abs(prev - val) >= 0.005) {
        onMediaVolume(val);
      }
      if (volumeDesc.get!.call(this) !== 0) {
        volumeDesc.set!.call(this, 0);
      }
    },
  });

  Object.defineProperty(proto, "muted", {
    configurable: true,
    enumerable: mutedDesc.enumerable,
    get(this: HTMLMediaElement) {
      const m = virtualMuted.get(this);
      return m !== undefined && controlled(this)
        ? m
        : mutedDesc.get!.call(this);
    },
    set(this: HTMLMediaElement, val: boolean) {
      allMediaElements.add(this);
      virtualMuted.set(this, val);
      mutedDesc.set!.call(this, controlled(this) ? true : val);
      if (controlled(this)) {
        if (val) {
          onMediaVolume(0);
        } else {
          const v = virtualVolume.get(this) ?? 1;
          onMediaVolume(v);
        }
      }
    },
  });

  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    enumerable: timeDesc.enumerable,
    get(this: HTMLMediaElement) {
      return timeDesc.get!.call(this);
    },
    set(this: HTMLMediaElement, val: number) {
      allMediaElements.add(this);
      if (this === activeMain && controlled(this)) onMediaSeek(val);
      timeDesc.set!.call(this, val);
    },
  });
}
