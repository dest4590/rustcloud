<template>
  <div class="rc-settings-tab">
    <SettingRow
      title="discord rich presence"
      desc="show current track in discord"
      v-model="discordRpc"
      @update:model-value="onSave"
    />
    <SettingRow
      title="adblocker"
      desc="block ads and audio promos"
      v-model="adblock"
      @update:model-value="onSave"
    />
    <SettingRow
      title="show download button"
      desc="display quick download button in bottom player bar"
      v-model="showDownloadBtn"
      @update:model-value="onSave"
    />
    <SettingRow
      title="show copy link button"
      desc="display copy track link button in bottom player bar"
      v-model="showCopyLinkBtn"
      @update:model-value="onSave"
    />
    <SettingRow
      title="trackbar lyrics bubble"
      desc="show current lyric line above seekbar"
      v-model="trackbarLyrics"
      @update:model-value="onSave"
    />
    <SettingRow
      title="rust native audio player"
      desc="stream and play tracks directly using rust engine"
      v-model="rustAudio"
      @update:model-value="onSave"
    />

    <div class="rc-card-box rc-proxy-card">
      <div class="rc-proxy-header">
        <div>
          <div class="rc-proxy-title">network proxy</div>
          <div class="rc-proxy-sub">
            route stream resolution and audio download through proxy
          </div>
        </div>
        <ToggleSwitch
          v-model="proxyEnabled"
          @update:model-value="onSaveProxy"
        />
      </div>

      <div class="rc-proxy-body" v-if="proxyEnabled">
        <div class="rc-proxy-input-group">
          <div class="rc-proxy-label-row">
            <span class="rc-proxy-label">proxy url</span>
            <span class="rc-proxy-hint"
              >http://username:password@hostname:port</span
            >
          </div>
          <input
            type="text"
            class="rc-proxy-input"
            v-model="proxyUrl"
            placeholder="http://username:password@hostname:port"
            spellcheck="false"
            @blur="onSaveProxy"
            @keyup.enter="onSaveProxy"
          />
        </div>

        <div class="rc-proxy-actions">
          <button
            class="rc-btn rc-test-proxy-btn"
            :disabled="isTestingProxy || !proxyUrl.trim()"
            @click="testProxy"
          >
            <span v-if="isTestingProxy">testing connection...</span>
            <span v-else>test proxy</span>
          </button>
          <div
            v-if="proxyTestResult"
            class="rc-proxy-status-pill"
            :class="{ error: proxyTestFailed, success: !proxyTestFailed }"
          >
            {{ proxyTestResult }}
          </div>
        </div>
      </div>
    </div>

    <div class="rc-card-box rc-device-card">
      <div class="rc-device-header">
        <div>
          <div class="rc-device-title">audio output device</div>
          <div class="rc-device-sub">
            route rust player stream to hardware or virtual sink
          </div>
        </div>
        <button
          class="rc-refresh-device-btn"
          @click="fetchDevices"
          title="refresh devices"
        >
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
            />
          </svg>
        </button>
      </div>
      <div class="rc-device-select-wrap">
        <select
          class="rc-device-select"
          v-model="selectedDevice"
          @change="onDeviceChange"
        >
          <option value="">system default</option>
          <option v-for="dev in devices" :key="dev.id" :value="dev.id">
            {{ dev.name.toLowerCase() }}{{ dev.is_default ? " (default)" : "" }}
          </option>
        </select>
      </div>
    </div>

    <div class="rc-card-box rc-timer-card">
      <div class="rc-timer-header">
        <div>
          <div class="rc-timer-title">sleep timer</div>
          <div class="rc-timer-sub">
            {{
              sleepState.isActive
                ? sleepState.remainingSeconds <= 30
                  ? `fading out... [ ${sleepState.formattedRemaining} ]`
                  : `stopping in [ ${sleepState.formattedRemaining} ]`
                : "fade-out and stop playback after timer"
            }}
          </div>
        </div>
        <button
          v-if="sleepState.isActive"
          class="rc-cancel-timer-btn"
          @click="cancelTimer"
        >
          cancel
        </button>
      </div>
      <div class="rc-timer-pills">
        <button
          class="rc-timer-pill"
          :class="{ active: !sleepState.isActive }"
          @click="setTimer(0)"
        >
          off
        </button>
        <button
          class="rc-timer-pill"
          :class="{ active: sleepState.isActive && sleepState.mode === 15 }"
          @click="setTimer(15)"
        >
          15m
        </button>
        <button
          class="rc-timer-pill"
          :class="{ active: sleepState.isActive && sleepState.mode === 30 }"
          @click="setTimer(30)"
        >
          30m
        </button>
        <button
          class="rc-timer-pill"
          :class="{ active: sleepState.isActive && sleepState.mode === 45 }"
          @click="setTimer(45)"
        >
          45m
        </button>
        <button
          class="rc-timer-pill"
          :class="{ active: sleepState.isActive && sleepState.mode === 60 }"
          @click="setTimer(60)"
        >
          60m
        </button>
        <button
          class="rc-timer-pill"
          :class="{
            active: sleepState.isActive && sleepState.mode === 'track',
          }"
          @click="setTimer('track')"
        >
          end of track
        </button>
      </div>
    </div>

    <div class="rc-card-box rc-shortcuts">
      <span class="rc-shortcuts-title">windows media controls</span>
      <div class="rc-shortcut-row">
        <span>hardware media keys</span>
        <kbd>play / pause / next / prev</kbd>
      </div>
      <div class="rc-shortcut-row">
        <span>close modal</span>
        <kbd>esc</kbd>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import SettingRow from "./SettingRow.vue";
import ToggleSwitch from "./ToggleSwitch.vue";
import {
  SETTING_KEYS,
  getBooleanSetting,
  setBooleanSetting,
  getStringSetting,
  setStringSetting,
} from "../settings";
import {
  getSleepTimerState,
  startSleepTimer,
  cancelSleepTimer,
  onSleepTimerChange,
  SleepTimerMode,
  SleepTimerState,
} from "../../audio/sleep_timer";
import { extractTrackInfo } from "../../audio/player";

interface AudioDeviceInfo {
  id: string;
  name: string;
  is_default: boolean;
}

const discordRpc = ref(getBooleanSetting(SETTING_KEYS.DISCORD_RPC));
const adblock = ref(getBooleanSetting(SETTING_KEYS.ADBLOCK));
const showDownloadBtn = ref(getBooleanSetting(SETTING_KEYS.SHOW_DOWNLOAD_BTN));
const showCopyLinkBtn = ref(getBooleanSetting(SETTING_KEYS.SHOW_COPY_LINK_BTN));
const trackbarLyrics = ref(
  getBooleanSetting(SETTING_KEYS.TRACKBAR_LYRICS, true),
);
const rustAudio = ref(getBooleanSetting(SETTING_KEYS.RUST_AUDIO, false));
const proxyEnabled = ref(getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false));
const proxyUrl = ref(getStringSetting(SETTING_KEYS.PROXY_URL, ""));
const isTestingProxy = ref(false);
const proxyTestResult = ref("");
const proxyTestFailed = ref(false);

const devices = ref<AudioDeviceInfo[]>([]);
const selectedDevice = ref<string>(
  localStorage.getItem(SETTING_KEYS.OUTPUT_DEVICE) || "",
);
const sleepState = ref<SleepTimerState>(getSleepTimerState());

let unbindSleepTimer: (() => void) | null = null;

async function fetchDevices() {
  try {
    devices.value = await invoke<AudioDeviceInfo[]>("get_audio_output_devices");
  } catch (err) {
    console.error("[rustcloud] failed to fetch audio output devices:", err);
  }
}

function onDeviceChange() {
  const currentPos = extractTrackInfo()?.position ?? null;
  if (selectedDevice.value) {
    localStorage.setItem(SETTING_KEYS.OUTPUT_DEVICE, selectedDevice.value);
    invoke("set_audio_output_device", {
      deviceName: selectedDevice.value,
      currentPos,
    }).catch(() => {});
  } else {
    localStorage.removeItem(SETTING_KEYS.OUTPUT_DEVICE);
    invoke("set_audio_output_device", {
      deviceName: null,
      currentPos,
    }).catch(() => {});
  }
}

function setTimer(mode: SleepTimerMode) {
  startSleepTimer(mode);
}

function cancelTimer() {
  cancelSleepTimer();
}

function onSaveProxy() {
  setBooleanSetting(SETTING_KEYS.PROXY_ENABLED, proxyEnabled.value);
  setStringSetting(SETTING_KEYS.PROXY_URL, proxyUrl.value);
}

async function testProxy() {
  if (!proxyUrl.value.trim()) return;
  isTestingProxy.value = true;
  proxyTestResult.value = "";
  proxyTestFailed.value = false;

  try {
    const res = await invoke<string>("test_proxy_connection", {
      url: proxyUrl.value.trim(),
    });
    proxyTestResult.value = res;
    proxyTestFailed.value = false;

    const match = res.match(/\(([A-Z]{2})\)/);
    if (match && match[1]) {
      setStringSetting(SETTING_KEYS.PROXY_COUNTRY, match[1]);
    }
  } catch (err: unknown) {
    proxyTestResult.value = err instanceof Error ? err.message : String(err);
    proxyTestFailed.value = true;
  } finally {
    isTestingProxy.value = false;
  }
}

function onSave() {
  setBooleanSetting(SETTING_KEYS.DISCORD_RPC, discordRpc.value);
  setBooleanSetting(SETTING_KEYS.ADBLOCK, adblock.value);
  setBooleanSetting(SETTING_KEYS.SHOW_DOWNLOAD_BTN, showDownloadBtn.value);
  setBooleanSetting(SETTING_KEYS.SHOW_COPY_LINK_BTN, showCopyLinkBtn.value);
  setBooleanSetting(SETTING_KEYS.TRACKBAR_LYRICS, trackbarLyrics.value);
  setBooleanSetting(SETTING_KEYS.RUST_AUDIO, rustAudio.value);
}

function handleSettingChanged(e: Event) {
  const custom = e as CustomEvent<{ key: string; value: any }>;
  if (custom.detail?.key === SETTING_KEYS.DISCORD_RPC) {
    discordRpc.value = custom.detail.value;
  } else if (custom.detail?.key === SETTING_KEYS.PROXY_ENABLED) {
    proxyEnabled.value = custom.detail.value;
  } else if (custom.detail?.key === SETTING_KEYS.PROXY_URL) {
    proxyUrl.value = custom.detail.value;
  }
}

onMounted(() => {
  window.addEventListener("rustcloud:setting-changed", handleSettingChanged);
  unbindSleepTimer = onSleepTimerChange((state) => {
    sleepState.value = state;
  });
  fetchDevices();
});

onUnmounted(() => {
  window.removeEventListener("rustcloud:setting-changed", handleSettingChanged);
  unbindSleepTimer?.();
});
</script>

<style scoped>
.rc-settings-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rc-proxy-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rc-proxy-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rc-proxy-title {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  text-transform: lowercase;
}
.rc-proxy-sub {
  font-size: 10px;
  color: #777777;
  margin-top: 1px;
  text-transform: lowercase;
}
.rc-proxy-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px solid #1f1f1f;
}
.rc-proxy-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rc-proxy-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rc-proxy-label {
  font-size: 10px;
  font-weight: 600;
  color: #888888;
  text-transform: lowercase;
}
.rc-proxy-hint {
  font-size: 9px;
  color: #555555;
  font-family: monospace;
}
.rc-proxy-input {
  width: 100%;
  background: #0d0d0d;
  border: 1px solid #282828;
  color: #ffffff;
  font-size: 11px;
  font-family: monospace;
  padding: 6px 8px;
  outline: none;
  border-radius: 0;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}
.rc-proxy-input:focus {
  border-color: var(--rc-primary);
}
.rc-proxy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rc-test-proxy-btn {
  font-size: 10px;
  padding: 4px 8px;
  text-transform: lowercase;
}
.rc-proxy-status-pill {
  font-size: 10px;
  font-family: monospace;
  padding: 3px 6px;
  border: 1px solid #282828;
  background: #101010;
  color: #aaaaaa;
}
.rc-proxy-status-pill.success {
  border-color: #1e3a1e;
  background: #0d1e0d;
  color: #4ade80;
}
.rc-proxy-status-pill.error {
  border-color: #3a1e1e;
  background: #1e0d0d;
  color: #f87171;
}

.rc-device-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rc-device-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.rc-device-title {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  text-transform: lowercase;
}
.rc-device-sub {
  font-size: 10px;
  color: #777777;
  margin-top: 1px;
  text-transform: lowercase;
}
.rc-refresh-device-btn {
  background: #141414;
  border: 1px solid #282828;
  color: #888888;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-refresh-device-btn:hover {
  background: #1c1c1c;
  color: #ffffff;
  border-color: #383838;
}
.rc-device-select-wrap {
  width: 100%;
}
.rc-device-select {
  width: 100%;
  background: #0d0d0d;
  border: 1px solid #282828;
  color: #ffffff;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 0;
  outline: none;
  font-family: inherit;
  text-transform: lowercase;
}
.rc-device-select:focus {
  border-color: var(--rc-primary);
}

.rc-timer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rc-timer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.rc-timer-title {
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  text-transform: lowercase;
}
.rc-timer-sub {
  font-size: 10px;
  color: #777777;
  margin-top: 1px;
  text-transform: lowercase;
  font-family: monospace;
}
.rc-cancel-timer-btn {
  background: #201414;
  border: 1px solid #4a2222;
  color: #ff6666;
  font-size: 9.5px;
  padding: 2px 7px;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
}
.rc-cancel-timer-btn:hover {
  background: #301919;
}
.rc-timer-pills {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.rc-timer-pill {
  background: #141414;
  border: 1px solid #242424;
  color: #888888;
  font-size: 10px;
  padding: 5px 2px;
  text-align: center;
  border-radius: 0;
  cursor: pointer;
  text-transform: lowercase;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rc-timer-pill:hover {
  background: #1c1c1c;
  color: #cccccc;
  border-color: #333333;
}
.rc-timer-pill.active {
  background: #25160d;
  color: var(--rc-primary);
  border-color: var(--rc-primary);
  font-weight: 600;
}

.rc-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rc-shortcuts-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--rc-text);
  margin-bottom: 2px;
}
.rc-shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--rc-text-muted);
}
kbd {
  background: #1e1e1e;
  border: 1px solid #333333;
  padding: 2px 6px;
  border-radius: 0;
  font-family: monospace;
  font-size: 11px;
  color: var(--rc-text);
}
</style>
