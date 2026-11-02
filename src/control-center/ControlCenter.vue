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
                aria-hidden="true"
              >
                <path d="M3 18h4V8H3v10zm6 0h4V4h-4v14zm6 0h4v-6h-4v6z" />
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
                aria-hidden="true"
              >
                <path d="M18.5 3H6a2 2 0 0 0-2 2v13.5A2.5 2.5 0 0 0 6.5 21H18v-2H6.5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h12v16h2V5a2 2 0 0 0-2-2zm-2 3h-7v2h7V6zm0 4h-7v2h7v-2zm-7 4h4v2h-4v-2z" />
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
                aria-hidden="true"
              >
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
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
                aria-hidden="true"
              >
                <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.02 7.02 0 0 0-1.63-.94L14.5 2.5a.5.5 0 0 0-.5-.5h-3.99a.5.5 0 0 0-.5.5l-.25 2.46c-.57.23-1.1.57-1.61.94l-2.39-.96a.5.5 0 0 0-.61.18L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.25.44.34.61.18l2.39-.96c.51.37 1.04.71 1.61.94l.25 2.46a.5.5 0 0 0 .5.5h3.99a.5.5 0 0 0 .5-.5l.25-2.46c.57-.23 1.1-.57 1.61-.94l2.39.96c.17.16.47.07.61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
              </svg>
            </template>
          </TabButton>
        </div>
        <button class="rc-hide-btn" title="close" @click="handleClose">
          <svg
            viewBox="0 0 16 16"
            width="11"
            height="11"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4.4 3.4L8 7l3.6-3.6L12.6 4 9 7.6l3.6 3.6-1.1 1.1L8 8.7 4.4 12.3l-1.1-1.1L6.9 7.6 3.3 4l1.1-1.1z" />
          </svg>
        </button>
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
import { extractTrackInfo, TrackInfo } from "../audio/player";

const emit = defineEmits<{ (e: "close"): void }>();
const tab = ref<"equalizer" | "lyrics" | "download" | "settings">("equalizer");
const isClosing = ref(false);

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
}

function handleSwitchTab(e: Event) {
  const custom = e as CustomEvent<{
    tab?: "equalizer" | "lyrics" | "download" | "settings";
  }>;
  if (custom.detail?.tab) {
    tab.value = custom.detail.tab;
  }
}

onMounted(() => {
  syncTrack();
  timer = window.setInterval(syncTrack, 800);
  window.addEventListener("rustcloud:switch-tab", handleSwitchTab);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener("rustcloud:switch-tab", handleSwitchTab);
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
