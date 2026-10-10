import { invoke } from "@tauri-apps/api/core";
import { toast } from "../control-center/toast";
import { pausePlayback, extractTrackInfo } from "./player";

export type SleepTimerMode = 0 | 15 | 30 | 45 | 60 | "track";

export interface SleepTimerState {
  isActive: boolean;
  mode: SleepTimerMode;
  remainingSeconds: number;
  totalSeconds: number;
  formattedRemaining: string;
}

let activeMode: SleepTimerMode = 0;
let remainingSeconds = 0;
let totalSeconds = 0;
let intervalId: number | null = null;
let originalVolume = 1.0;
let isFading = false;
let initialTrackUrl = "";
let listenersInitialized = false;

const listeners: Array<(state: SleepTimerState) => void> = [];

export function getSleepTimerState(): SleepTimerState {
  return {
    isActive: activeMode !== 0,
    mode: activeMode,
    remainingSeconds,
    totalSeconds,
    formattedRemaining: formatTime(remainingSeconds),
  };
}

function notifyListeners(): void {
  const state = getSleepTimerState();
  listeners.forEach((fn) => fn(state));
  window.dispatchEvent(
    new CustomEvent("rustcloud:sleep-timer-changed", { detail: state }),
  );
}

export function onSleepTimerChange(
  fn: (state: SleepTimerState) => void,
): () => void {
  ensureGlobalListeners();
  listeners.push(fn);
  fn(getSleepTimerState());
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function formatTime(secs: number): string {
  if (secs <= 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function setVolumeAll(vol: number): void {
  const clamped = Math.max(0, Math.min(1.0, vol));
  invoke("rust_set_volume", { volume: clamped }).catch(() => {});
  try {
    document.querySelectorAll("audio, video").forEach((el) => {
      (el as HTMLMediaElement).volume = clamped;
    });
  } catch {}
}

export function startSleepTimer(mode: SleepTimerMode): void {
  ensureGlobalListeners();
  cancelSleepTimer();

  if (mode === 0) {
    return;
  }

  activeMode = mode;
  isFading = false;

  try {
    const audioEl = document.querySelector("audio") as HTMLMediaElement | null;
    originalVolume = audioEl && audioEl.volume > 0 ? audioEl.volume : 1.0;
  } catch {
    originalVolume = 1.0;
  }

  const currentTrack = extractTrackInfo();
  initialTrackUrl = currentTrack?.trackUrl || "";

  if (typeof mode === "number") {
    totalSeconds = mode * 60;
    remainingSeconds = totalSeconds;
    toast.info(`sleep timer set for ${mode} minutes`);
  } else {
    if (currentTrack && currentTrack.duration > 0) {
      totalSeconds = Math.ceil(currentTrack.duration);
      remainingSeconds = Math.max(
        0,
        Math.ceil(currentTrack.duration - currentTrack.position),
      );
    } else {
      totalSeconds = 180;
      remainingSeconds = 180;
    }
    toast.info("sleep timer set for end of track");
  }

  notifyListeners();
  intervalId = window.setInterval(tick, 1000);
}

export function cancelSleepTimer(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (isFading) {
    setVolumeAll(originalVolume);
    isFading = false;
  }
  activeMode = 0;
  remainingSeconds = 0;
  totalSeconds = 0;
  initialTrackUrl = "";
  notifyListeners();
}

function handleUserSeek(): void {
  if (activeMode !== "track") return;
  tick();
}

function ensureGlobalListeners(): void {
  if (listenersInitialized || typeof window === "undefined") return;
  listenersInitialized = true;
  window.addEventListener("rustcloud:seek", handleUserSeek);
  window.addEventListener("rustcloud:track-changed", handleUserSeek);
}

function tick(): void {
  if (activeMode === 0) return;

  if (activeMode === "track") {
    const track = extractTrackInfo();

    if (!track || !track.title) {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
    } else {
      if (
        initialTrackUrl &&
        track.trackUrl &&
        track.trackUrl !== initialTrackUrl
      ) {
        finishSleepTimer();
        return;
      }

      const duration = track.duration;
      const position = track.position;

      if (duration > 0) {
        totalSeconds = Math.ceil(duration);
        const left = Math.max(0, duration - position);
        remainingSeconds = Math.ceil(left);
      } else {
        remainingSeconds = Math.max(0, remainingSeconds - 1);
      }
    }
  } else {
    remainingSeconds -= 1;
  }

  const fadeThreshold = Math.min(
    30,
    totalSeconds > 0 ? totalSeconds * 0.5 : 30,
  );

  if (remainingSeconds <= fadeThreshold && remainingSeconds > 0) {
    isFading = true;
    const progress = Math.max(0, remainingSeconds / fadeThreshold);
    setVolumeAll(originalVolume * progress);
  } else if (isFading) {
    isFading = false;
    setVolumeAll(originalVolume);
  }

  if (remainingSeconds <= 0) {
    finishSleepTimer();
    return;
  }

  notifyListeners();
}

function finishSleepTimer(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  setVolumeAll(0);
  pausePlayback();

  window.setTimeout(() => {
    setVolumeAll(originalVolume);
    isFading = false;
    activeMode = 0;
    remainingSeconds = 0;
    initialTrackUrl = "";
    notifyListeners();
    toast.info("sleep timer: playback paused");
  }, 350);
}
