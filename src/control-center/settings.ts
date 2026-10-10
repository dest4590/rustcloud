import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { invalidateStreamCache } from "../downloader/downloader";

export interface SettingsState {
  discordRpc: boolean;
  adblock: boolean;
  showDownloadBtn: boolean;
  showCopyLinkBtn: boolean;
  rustAudio: boolean;
  trackbarLyrics: boolean;
}

export const SETTING_KEYS = {
  DISCORD_RPC: "rustcloud-discord-enabled",
  ADBLOCK: "rustcloud-adblock-enabled",
  SHOW_DOWNLOAD_BTN: "rustcloud-show-download-btn",
  SHOW_COPY_LINK_BTN: "rustcloud-show-copy-link-btn",
  RUST_AUDIO: "rustcloud-rust-audio-enabled",
  TRACKBAR_LYRICS: "rustcloud-trackbar-lyrics-enabled",
  OUTPUT_DEVICE: "rustcloud-output-device",
  SMTC: "rustcloud-smtc-enabled",
  PROXY_ENABLED: "rustcloud-proxy-enabled",
  PROXY_URL: "rustcloud-proxy-url",
  PROXY_COUNTRY: "rustcloud-proxy-country",
} as const;

export function getStringSetting(key: string, defaultValue = ""): string {
  if (typeof window === "undefined" || !window.localStorage)
    return defaultValue;
  const val = localStorage.getItem(key);
  if (val === null) return defaultValue;
  return val;
}

export function setStringSetting(key: string, value: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  localStorage.setItem(key, value);
  window.dispatchEvent(
    new CustomEvent("rustcloud:setting-changed", {
      detail: { key, value },
    }),
  );

  if (key === SETTING_KEYS.PROXY_URL) {
    invalidateStreamCache();
    const enabled = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
    invoke("set_proxy_config", {
      enabled,
      url: value.trim() ? value.trim() : null,
    }).catch(() => {});
  }
}

export function getBooleanSetting(key: string, defaultValue = true): boolean {
  if (typeof window === "undefined" || !window.localStorage)
    return defaultValue;
  const val = localStorage.getItem(key);
  if (val === null) return defaultValue;
  return val !== "false";
}

export function setBooleanSetting(key: string, value: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  localStorage.setItem(key, String(value));
  window.dispatchEvent(
    new CustomEvent("rustcloud:setting-changed", {
      detail: { key, value },
    }),
  );

  if (key === SETTING_KEYS.DISCORD_RPC) {
    invoke("set_discord_rpc_enabled", { enabled: value }).catch(() => {});
  } else if (key === SETTING_KEYS.PROXY_ENABLED) {
    invalidateStreamCache();
    const url = getStringSetting(SETTING_KEYS.PROXY_URL, "");
    invoke("set_proxy_config", {
      enabled: value,
      url: url.trim() ? url.trim() : null,
    }).catch(() => {});
  }
}

let settingsSyncInitialized = false;

export function initSettingsSync(): void {
  if (settingsSyncInitialized) return;
  settingsSyncInitialized = true;

  const discordRpc = getBooleanSetting(SETTING_KEYS.DISCORD_RPC, true);
  invoke("set_discord_rpc_enabled", { enabled: discordRpc }).catch(() => {});

  const proxyEnabled = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
  const proxyUrl = getStringSetting(SETTING_KEYS.PROXY_URL, "");
  invoke("set_proxy_config", {
    enabled: proxyEnabled,
    url: proxyUrl.trim() ? proxyUrl.trim() : null,
  }).catch(() => {});

  if (typeof window !== "undefined" && window.localStorage) {
    const savedDevice = localStorage.getItem(SETTING_KEYS.OUTPUT_DEVICE);
    if (savedDevice) {
      invoke("set_audio_output_device", {
        deviceName: savedDevice,
        currentPos: null,
      }).catch(() => {});
    }
  }

  listen<boolean>("rustcloud:discord-toggle", (event) => {
    const enabled =
      typeof event.payload === "boolean"
        ? event.payload
        : event.payload === "true";
    if (getBooleanSetting(SETTING_KEYS.DISCORD_RPC) !== enabled) {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(SETTING_KEYS.DISCORD_RPC, String(enabled));
      }
      window.dispatchEvent(
        new CustomEvent("rustcloud:setting-changed", {
          detail: { key: SETTING_KEYS.DISCORD_RPC, value: enabled },
        }),
      );
    }
  }).catch(() => {});
}
