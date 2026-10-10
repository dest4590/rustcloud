<template>
  <div class="rc-root" :class="{ 'rc-closing': isClosing }">
    <div class="rc-backdrop" @click="handleClose"></div>
    <div class="rc-slide-panel">
      <div class="rc-header-bar">
        <div class="rc-tabs-bar">
          <TabButton
            label="equalizer"
            :active="tab === 'equalizer'"
            @click="tab = 'equalizer'"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="currentColor"
              >
                <path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />
              </svg>
            </template>
          </TabButton>
          <TabButton
            label="lyrics"
            :active="tab === 'lyrics'"
            @click="tab = 'lyrics'"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="currentColor"
              >
                <path
                  d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                />
              </svg>
            </template>
          </TabButton>
          <TabButton
            label="download"
            :active="tab === 'download'"
            @click="tab = 'download'"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="currentColor"
              >
                <path
                  d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"
                />
              </svg>
            </template>
          </TabButton>
          <TabButton
            label="settings"
            :active="tab === 'settings'"
            @click="tab = 'settings'"
          >
            <template #icon>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="currentColor"
              >
                <path
                  d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                />
              </svg>
            </template>
          </TabButton>
        </div>
        <button class="rc-hide-btn" title="close" @click="handleClose">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
            <path
              d="M6.94 8l-4.47 4.47 1.06 1.06L8 9.06l4.47 4.47 1.06-1.06L9.06 8l4.47-4.47-1.06-1.06L8 6.94 3.53 2.47 2.47 3.53 6.94 8z"
            />
          </svg>
        </button>
      </div>

      <div v-if="isDrmFallback" class="rc-drm-banner">
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          style="flex-shrink: 0"
        >
          <rect x="3" y="11" width="18" height="11" rx="0" ry="0" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Track is encrypted, playing without DRM</span>
      </div>

      <div class="rc-body">
        <EqualizerTab v-if="tab === 'equalizer'" />
        <LyricsTab v-else-if="tab === 'lyrics'" :track="track" />
        <DownloadTab v-else-if="tab === 'download'" :track="track" />
        <SettingsTab v-else-if="tab === 'settings'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from "vue";
import "./styles.css";
import TabButton from "./components/TabButton.vue";
import EqualizerTab from "./components/EqualizerTab.vue";
import LyricsTab from "./components/LyricsTab.vue";
import DownloadTab from "./components/DownloadTab.vue";
import SettingsTab from "./components/SettingsTab.vue";
import {
  extractTrackInfo,
  isNativeDrmFallbackActive,
  TrackInfo,
} from "../audio/player";

const emit = defineEmits<{ (e: "close"): void }>();
const tab = ref<"equalizer" | "lyrics" | "download" | "settings">("equalizer");
const isClosing = ref(false);
const isDrmFallback = ref(isNativeDrmFallbackActive());

function handleClose() {
  if (isClosing.value) return;
  isClosing.value = true;
  setTimeout(() => {
    emit("close");
  }, 160);
}

const track = reactive<TrackInfo>({
  title: "",
  artist: "",
  artworkUrl: "",
  trackUrl: "",
  isPlaying: false,
  position: 0,
  duration: 0,
});

let timer: number | null = null;
function syncTrack() {
  const current = extractTrackInfo();
  if (current) Object.assign(track, current);
  isDrmFallback.value = isNativeDrmFallbackActive();
}

function handleSwitchTab(e: Event) {
  const custom = e as CustomEvent<{
    tab?: "equalizer" | "lyrics" | "download" | "settings";
  }>;
  if (custom.detail?.tab) {
    tab.value = custom.detail.tab;
  }
}

function handleDrmFallback(e: Event) {
  const custom = e as CustomEvent<{ active: boolean }>;
  isDrmFallback.value = custom.detail?.active ?? isNativeDrmFallbackActive();
}

onMounted(() => {
  syncTrack();
  timer = window.setInterval(syncTrack, 800);
  window.addEventListener("rustcloud:switch-tab", handleSwitchTab);
  window.addEventListener("rustcloud:drm-fallback", handleDrmFallback);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener("rustcloud:switch-tab", handleSwitchTab);
  window.removeEventListener("rustcloud:drm-fallback", handleDrmFallback);
});
</script>

<style scoped>
.rc-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  font-family:
    Söhne,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
  color: var(--rc-text);
  user-select: none;
  pointer-events: none;
}

.rc-backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  pointer-events: auto;
}

.rc-slide-panel {
  position: fixed;
  right: 0;
  bottom: 48px;
  width: 440px;
  max-width: 100vw;
  height: 520px;
  max-height: calc(100vh - 48px);
  background: #0d0d0d;
  border-left: 1px solid #222222;
  border-top: 1px solid #222222;
  border-radius: 0;
  box-shadow: -4px -4px 20px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: rc-panel-enter 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.rc-closing .rc-slide-panel {
  animation: rc-panel-leave 0.15s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

@keyframes rc-panel-enter {
  0% {
    opacity: 0;
    transform: translateY(18px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes rc-panel-leave {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(18px);
  }
}

.rc-tab-fade-enter-active,
.rc-tab-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.rc-tab-fade-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.rc-tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

.rc-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #181818;
  border-bottom: 1px solid #222222;
  padding: 0 8px 0 0;
  height: 42px;
  min-height: 42px;
}

.rc-tabs-bar {
  display: flex;
  flex: 1;
  height: 100%;
}

.rc-hide-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #999999;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.rc-hide-btn:hover {
  color: #ffffff;
  background: #222222;
}

.rc-drm-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #181410;
  border-bottom: 1px solid #442a15;
  color: #ff8833;
  padding: 8px 14px;
  font-size: 11px;
  font-family: monospace;
  font-weight: 600;
  border-radius: 0;
  flex-shrink: 0;
}

.rc-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background: #121212;
}
</style>
