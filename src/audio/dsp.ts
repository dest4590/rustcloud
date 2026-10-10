import { invoke } from "@tauri-apps/api/core";
import { SETTING_KEYS, getBooleanSetting } from "../control-center/settings";

export interface EqualizerBands {
  b32: number;
  b64: number;
  b125: number;
  b250: number;
  b500: number;
  b1k: number;
  b2k: number;
  b4k: number;
  b8k: number;
  b16k: number;
}

export interface DspConfig {
  enabled: boolean;
  bassBoost: number;
  bands: EqualizerBands;
  stereoWidth: number;
  crossfeed: boolean;
  tubeWarmth: number;
  clarity: number;
  reverbWet: number;
  reverbSize: number;
  reverbDamp: number;
  limiter: boolean;
  playbackSpeed: number;
  pitchShift: number;
}

export interface DspPreset {
  label: string;
  description: string;
  bass: number;
  bands: EqualizerBands;
  stereoWidth?: number;
  crossfeed?: boolean;
  tubeWarmth?: number;
  clarity?: number;
  reverbWet?: number;
  reverbSize?: number;
  reverbDamp?: number;
  limiter?: boolean;
  playbackSpeed?: number;
  pitchShift?: number;
}

export const DSP_PRESETS: Record<string, DspPreset> = {
  flat: {
    label: "flat",
    description: "linear response without coloration",
    bass: 0,
    bands: {
      b32: 0,
      b64: 0,
      b125: 0,
      b250: 0,
      b500: 0,
      b1k: 0,
      b2k: 0,
      b4k: 0,
      b8k: 0,
      b16k: 0,
    },
    stereoWidth: 100,
    crossfeed: false,
    tubeWarmth: 0,
    clarity: 0,
    reverbWet: 0,
    limiter: true,
    playbackSpeed: 1.0,
    pitchShift: 0,
  },

  spatial_hall: {
    label: "spatial hall",
    description: "expansive stereo soundstage and lush ambience",
    bass: 15,
    bands: {
      b32: 2,
      b64: 1.5,
      b125: 1,
      b250: 0,
      b500: 0,
      b1k: 0.5,
      b2k: 1,
      b4k: 2,
      b8k: 3,
      b16k: 3.5,
    },
    stereoWidth: 165,
    crossfeed: false,
    tubeWarmth: 0,
    clarity: 30,
    reverbWet: 26,
    reverbSize: 65,
    reverbDamp: 45,
    limiter: true,
    playbackSpeed: 1.0,
    pitchShift: 0,
  },
  headphone_binaural: {
    label: "headphone spatial",
    description: "binaural crossfeed to reduce ear fatigue",
    bass: 15,
    bands: {
      b32: 1.5,
      b64: 1,
      b125: 0.5,
      b250: 0,
      b500: 0,
      b1k: 0,
      b2k: 0.5,
      b4k: 1,
      b8k: 1.5,
      b16k: 2,
    },
    stereoWidth: 120,
    crossfeed: true,
    tubeWarmth: 10,
    clarity: 20,
    reverbWet: 6,
    reverbSize: 35,
    reverbDamp: 50,
    limiter: true,
    playbackSpeed: 1.0,
    pitchShift: 0,
  },
  some_bass_and_treble: {
    label: "some bass & treble",
    description: "classic v-curve with punch and brightness",
    bass: 25,
    bands: {
      b32: 5,
      b64: 4,
      b125: 2,
      b250: 0.5,
      b500: -0.5,
      b1k: 0.5,
      b2k: 1.5,
      b4k: 3,
      b8k: 4,
      b16k: 4.5,
    },
    stereoWidth: 110,
    crossfeed: false,
    tubeWarmth: 5,
    clarity: 25,
    reverbWet: 0,
    limiter: true,
    playbackSpeed: 1.0,
    pitchShift: 0,
  },

  slowed_reverb: {
    label: "slowed + reverb",
    description: "dreamy slowed tempo, dropped pitch and deep atmospheric room",
    bass: 20,
    bands: {
      b32: 4,
      b64: 3,
      b125: 2,
      b250: 0,
      b500: -1,
      b1k: -1,
      b2k: -2,
      b4k: -3,
      b8k: -3,
      b16k: -4,
    },
    stereoWidth: 125,
    crossfeed: true,
    tubeWarmth: 20,
    clarity: 0,
    reverbWet: 45,
    reverbSize: 75,
    reverbDamp: 35,
    limiter: true,
    playbackSpeed: 0.85,
    pitchShift: -2,
  },
};

const STORAGE_KEY = "rustcloud_dsp_config_v1";

const DEFAULT_CONFIG: DspConfig = {
  enabled: false,
  bassBoost: 0,
  bands: {
    b32: 0,
    b64: 0,
    b125: 0,
    b250: 0,
    b500: 0,
    b1k: 0,
    b2k: 0,
    b4k: 0,
    b8k: 0,
    b16k: 0,
  },
  stereoWidth: 100,
  crossfeed: false,
  tubeWarmth: 0,
  clarity: 0,
  reverbWet: 0,
  reverbSize: 50,
  reverbDamp: 40,
  limiter: true,
  playbackSpeed: 1.0,
  pitchShift: 0.0,
};

let currentConfig: DspConfig = loadDspConfig();

export function loadDspConfig(): DspConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const isRustAudioEnabled = getBooleanSetting(
        SETTING_KEYS.RUST_AUDIO,
        false,
      );
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        enabled: isRustAudioEnabled
          ? (parsed.enabled ?? DEFAULT_CONFIG.enabled)
          : false,
        bands: { ...DEFAULT_CONFIG.bands, ...(parsed.bands || {}) },
      };
    }
  } catch (e) {
    console.error("[rustcloud] failed to load dsp config", e);
  }
  return { ...DEFAULT_CONFIG };
}

let dspTimer: number | null = null;

function scheduleDspSync(): void {
  if (dspTimer !== null) window.clearTimeout(dspTimer);
  dspTimer = window.setTimeout(() => {
    dspTimer = null;
    syncDspToRust();
  }, 40);
}

export function saveDspConfig(config: DspConfig): void {
  currentConfig = config;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("[rustcloud] failed to save dsp config", e);
  }
  if (config.playbackSpeed !== undefined) {
    setPlaybackSpeed(config.playbackSpeed);
  }
  scheduleDspSync();
}

export function setPlaybackSpeed(speed: number): void {
  const clamped = Math.max(0.25, Math.min(3.0, speed));
  invoke("rust_set_playback_speed", { speed: clamped }).catch(() => {});
  try {
    document.querySelectorAll("audio, video").forEach((el) => {
      (el as HTMLMediaElement).playbackRate = clamped;
    });
  } catch {}
}

export async function syncDspToRust(): Promise<void> {
  try {
    await invoke("rust_set_dsp_config", { config: currentConfig });
  } catch (e) {
    console.error("[rustcloud] failed to sync dsp config to rust:", e);
  }
}

export function initAudioDsp(): void {
  window.addEventListener("rustcloud:setting-changed", ((
    e: CustomEvent<{ key: string; value: boolean }>,
  ) => {
    if (e.detail?.key === SETTING_KEYS.RUST_AUDIO && !e.detail.value) {
      if (currentConfig.enabled) {
        saveDspConfig({ ...currentConfig, enabled: false });
      }
    }
  }) as EventListener);

  console.log("[rustcloud] rust dsp initialized");
  syncDspToRust();
}
