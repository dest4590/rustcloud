<template>
  <div class="rc-download-tab">
    <div class="rc-subtabs-nav">
      <button
        class="rc-subtab-btn"
        :class="{ active: mode === 'single' }"
        @click="mode = 'single'"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path
            d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
          />
        </svg>
        <span>current track</span>
      </button>
      <button
        class="rc-subtab-btn"
        :class="{ active: mode === 'playlist' }"
        @click="switchMode('playlist')"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path
            d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"
          />
        </svg>
        <span>playlist batch</span>
        <span class="rc-count-tag" v-if="playlist?.trackCount">{{
          playlist.trackCount
        }}</span>
      </button>
    </div>

    <template v-if="mode === 'single'">
      <div class="rc-card-box">
        <div class="rc-track-preview" v-if="track.title">
          <img
            v-if="track.artworkUrl"
            :src="track.artworkUrl"
            class="rc-art"
            alt="art"
          />
          <div>
            <div class="rc-track-title">{{ track.title.toLowerCase() }}</div>
            <div class="rc-track-artist">{{ track.artist.toLowerCase() }}</div>
          </div>
        </div>
        <div v-else class="rc-empty">
          play a track on soundcloud to download it
        </div>
      </div>

      <div class="rc-action-buttons" v-if="track.title">
        <button
          class="rc-btn rc-btn-primary rc-dl-btn"
          :disabled="busy || !track.title"
          @click="downloadSingle"
        >
          {{ busy ? "downloading..." : "download mp3" }}
        </button>
        <button
          class="rc-btn rc-copy-btn"
          :disabled="!track.trackUrl"
          @click="copySingleLink"
          title="copy song link"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path
              d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
            />
          </svg>
          <span>copy link</span>
        </button>
      </div>
      <button
        v-else
        class="rc-btn rc-btn-primary rc-btn-full rc-dl-btn"
        disabled
      >
        download mp3
      </button>

      <div v-if="status" class="rc-status-msg" :class="{ error: isErr }">
        {{ status.toLowerCase() }}
      </div>
    </template>

    <template v-else>
      <div class="rc-card-box rc-playlist-meta-box">
        <div class="rc-playlist-header">
          <div>
            <div class="rc-section-title">playlist downloader</div>
            <div class="rc-playlist-sub">
              {{
                playlist
                  ? `${playlist.title.toLowerCase()} (${playlist.trackCount} tracks)`
                  : "no playlist detected on current page"
              }}
            </div>
          </div>
          <button
            class="rc-rescan-btn"
            @click="scanPlaylist"
            title="rescan page"
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
            <span>scan</span>
          </button>
        </div>

        <div
          class="rc-queue-progress-box"
          v-if="queueState.isActive || queueState.items.length > 0"
        >
          <div class="rc-queue-meta">
            <span class="rc-queue-stat">
              progress: {{ queueState.completed + queueState.failed }} /
              {{ queueState.total }}
              <span v-if="queueState.failed > 0" class="rc-failed-count"
                >({{ queueState.failed }} failed)</span
              >
            </span>
            <button
              v-if="queueState.isActive"
              class="rc-cancel-batch-btn"
              @click="cancelBatch"
            >
              cancel
            </button>
          </div>
          <div class="rc-slider-track-wrap rc-batch-track">
            <div
              class="rc-progress-bar"
              :style="{
                width:
                  queueState.total > 0
                    ? `${((queueState.completed + queueState.failed) / queueState.total) * 100}%`
                    : '0%',
              }"
            ></div>
          </div>
        </div>
      </div>

      <div class="rc-playlist-actions" v-if="playlist">
        <button
          class="rc-btn rc-btn-primary rc-btn-full"
          :disabled="queueState.isActive || playlist.tracks.length === 0"
          @click="startPlaylistDownload"
        >
          {{
            queueState.isActive
              ? "downloading queue..."
              : `download full playlist (${playlist.trackCount} tracks)`
          }}
        </button>
      </div>

      <div
        class="rc-tracklist-box"
        v-if="playlist && playlist.tracks.length > 0"
      >
        <div class="rc-tracklist-scroll">
          <div
            v-for="(t, idx) in playlist.tracks"
            :key="t.id"
            class="rc-track-row"
            :class="{
              active: queueState.currentIndex === idx && queueState.isActive,
            }"
          >
            <span class="rc-track-num">{{ idx + 1 }}</span>
            <div class="rc-track-info-col">
              <div class="rc-row-title">{{ t.title.toLowerCase() }}</div>
              <div class="rc-row-artist">{{ t.artist.toLowerCase() }}</div>
            </div>
            <div class="rc-row-right">
              <span class="rc-status-pill" :class="getItemStatus(idx)">
                {{ getItemStatusText(idx) }}
              </span>
              <button
                class="rc-row-dl-btn"
                v-if="t.trackUrl"
                @click="copyTrackUrl(t.trackUrl)"
                title="copy song link"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="10"
                  height="10"
                  fill="currentColor"
                >
                  <path
                    d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                  />
                </svg>
              </button>
              <button
                class="rc-row-dl-btn"
                :disabled="queueState.isActive"
                @click="downloadIndividual(t)"
                title="download track"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="10"
                  height="10"
                  fill="currentColor"
                >
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rc-card-box rc-empty">
        navigate to a soundcloud playlist or album page to load tracks
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import {
  downloadTrack,
  extractPlaylistFromPage,
  startBatchDownload,
  cancelBatchDownload,
  onBatchQueueUpdate,
  PlaylistInfo,
  PlaylistTrack,
  BatchQueueState,
  getBatchQueueState,
} from "../../downloader/downloader";
import { TrackInfo } from "../../audio/player";
import { copyToClipboard } from "../../core/utils";
import { toast } from "../toast";

const props = defineProps<{ track: TrackInfo }>();
const mode = ref<"single" | "playlist">("single");

const busy = ref(false);
const status = ref("");
const isErr = ref(false);

const playlist = ref<PlaylistInfo | null>(null);
const queueState = ref<BatchQueueState>(getBatchQueueState());

let unbindQueue: (() => void) | null = null;

function switchMode(m: "single" | "playlist") {
  mode.value = m;
  if (m === "playlist") {
    scanPlaylist();
  }
}

function scanPlaylist() {
  playlist.value = extractPlaylistFromPage();
}

function getItemStatus(idx: number): string {
  if (queueState.value.items[idx]) {
    return queueState.value.items[idx].status;
  }
  return "idle";
}

function getItemStatusText(idx: number): string {
  if (queueState.value.items[idx]) {
    const item = queueState.value.items[idx];
    if (item.status === "downloading")
      return item.progressMessage.toLowerCase();
    if (item.status === "completed") return "saved";
    if (item.status === "error") return "failed";
    if (item.status === "pending") return "queued";
  }
  return "ready";
}

async function copySingleLink() {
  if (!props.track.trackUrl) {
    toast.warning("Play a track on SoundCloud to copy link");
    return;
  }
  const ok = await copyToClipboard(props.track.trackUrl);
  if (ok) {
    toast.success("Song link copied to clipboard");
  } else {
    toast.error("Failed to copy link");
  }
}

async function copyTrackUrl(url: string) {
  if (!url) return;
  const ok = await copyToClipboard(url);
  if (ok) {
    toast.success("Song link copied to clipboard");
  } else {
    toast.error("Failed to copy link");
  }
}

async function downloadSingle() {
  if (!props.track.title) return;
  busy.value = true;
  status.value = "Starting download...";
  isErr.value = false;
  toast.info(`Downloading ${props.track.title}...`);
  try {
    const res = await downloadTrack(
      props.track.title,
      props.track.artist,
      props.track.trackUrl,
      props.track.artworkUrl,
      (msg: string) => {
        status.value = msg;
      },
    );
    status.value = res.message;
    isErr.value = !res.success;
    if (res.success) {
      toast.success(res.message || "Download complete!");
    } else {
      toast.error(res.message || "Download failed");
    }
  } catch (e: unknown) {
    const errText = e instanceof Error ? e.message : String(e);
    status.value = errText;
    isErr.value = true;
    toast.error(errText);
  } finally {
    busy.value = false;
  }
}

async function startPlaylistDownload() {
  if (!playlist.value || playlist.value.tracks.length === 0) return;
  toast.info(
    `Starting batch download of ${playlist.value.tracks.length} tracks...`,
  );
  startBatchDownload(playlist.value.tracks);
}

function cancelBatch() {
  cancelBatchDownload();
  toast.info("Batch download cancelled");
}

async function downloadIndividual(t: PlaylistTrack) {
  toast.info(`Downloading ${t.title}...`);
  try {
    const res = await downloadTrack(
      t.title,
      t.artist,
      t.trackUrl,
      t.artworkUrl,
      () => {},
    );
    if (res.success) {
      toast.success(`${t.title}: saved`);
    } else {
      toast.error(`${t.title}: download failed`);
    }
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : "Download failed");
  }
}

function handleOpenPlaylistDownload() {
  mode.value = "playlist";
  scanPlaylist();
}

onMounted(() => {
  scanPlaylist();
  unbindQueue = onBatchQueueUpdate((state) => {
    queueState.value = state;
  });
  window.addEventListener(
    "rustcloud:open-playlist-download",
    handleOpenPlaylistDownload,
  );
});

onUnmounted(() => {
  unbindQueue?.();
  window.removeEventListener(
    "rustcloud:open-playlist-download",
    handleOpenPlaylistDownload,
  );
});
</script>

<style scoped>
.rc-download-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rc-subtabs-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #0d0d0d;
}
.rc-subtab-btn {
  background: #141414;
  border: 1px solid #222222;
  color: #888888;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 0;
  transition: all 0.15s ease;
  text-transform: lowercase;
}
.rc-subtab-btn:hover {
  background: #181818;
  color: #cccccc;
}
.rc-subtab-btn.active {
  background: #1e130c;
  color: var(--rc-primary);
  border-color: var(--rc-primary);
  font-weight: 600;
}
.rc-count-tag {
  background: #252525;
  color: #aaaaaa;
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 0;
  font-family: monospace;
}
.rc-subtab-btn.active .rc-count-tag {
  background: var(--rc-primary);
  color: #ffffff;
}

.rc-track-preview {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rc-art {
  width: 48px;
  height: 48px;
  border-radius: 0;
  object-fit: cover;
  border: 1px solid var(--rc-border);
}
.rc-track-title {
  font-weight: 600;
  font-size: 14px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 380px;
}
.rc-track-artist {
  font-size: 12px;
  color: var(--rc-primary);
  margin-top: 2px;
}
.rc-empty {
  color: var(--rc-text-muted);
  font-size: 12px;
  text-align: center;
  padding: 10px 0;
  text-transform: lowercase;
}
.rc-action-buttons {
  display: flex;
  gap: 6px;
}
.rc-action-buttons .rc-dl-btn {
  flex: 1;
}
.rc-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 12px;
  background: #141414;
  border: 1px solid #282828;
  color: #cccccc;
  border-radius: 0;
  text-transform: lowercase;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rc-copy-btn:hover:not(:disabled) {
  background: #1e1e1e;
  border-color: #383838;
  color: #ffffff;
}
.rc-dl-btn {
  padding: 10px 14px;
  font-size: 13px;
}
.rc-status-msg {
  font-size: 12px;
  color: #4ade80;
  background: #181818;
  border: 1px solid #222;
  padding: 8px 12px;
  border-radius: 0;
}
.rc-status-msg.error {
  color: #f87171;
}

.rc-playlist-meta-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rc-playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.rc-playlist-sub {
  font-size: 11px;
  color: #777777;
  margin-top: 1px;
  text-transform: lowercase;
}
.rc-rescan-btn {
  background: #141414;
  border: 1px solid #282828;
  color: #888888;
  font-size: 10px;
  padding: 3px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  border-radius: 0;
  transition: all 0.15s ease;
  text-transform: lowercase;
}
.rc-rescan-btn:hover {
  background: #1c1c1c;
  color: #ffffff;
  border-color: #383838;
}

.rc-queue-progress-box {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
}
.rc-queue-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10.5px;
  font-family: monospace;
  color: #888888;
}
.rc-failed-count {
  color: #f87171;
  margin-left: 4px;
}
.rc-cancel-batch-btn {
  background: #201414;
  border: 1px solid #4a2222;
  color: #ff6666;
  font-size: 9.5px;
  padding: 1px 6px;
  cursor: pointer;
  border-radius: 0;
  text-transform: lowercase;
}
.rc-slider-track-wrap.rc-batch-track {
  height: 4px;
  background: #222222;
  position: relative;
  overflow: hidden;
}
.rc-batch-track .rc-progress-bar {
  height: 100%;
  background: var(--rc-primary);
  transition: width 0.2s ease;
}

.rc-tracklist-box {
  background: #141414;
  border: 1px solid #222222;
  padding: 2px 0;
  border-radius: 0;
}
.rc-tracklist-scroll {
  max-height: 240px;
  overflow-y: auto;
}
.rc-track-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #1a1a1a;
  transition: background 0.1s ease;
}
.rc-track-row:last-child {
  border-bottom: none;
}
.rc-track-row:hover {
  background: #1a1a1a;
}
.rc-track-row.active {
  background: #1f140c;
  border-left: 2px solid var(--rc-primary);
}
.rc-track-num {
  font-size: 10px;
  font-family: monospace;
  color: #555555;
  width: 16px;
  text-align: right;
  flex-shrink: 0;
}
.rc-track-info-col {
  flex: 1;
  min-width: 0;
}
.rc-row-title {
  font-size: 11.5px;
  font-weight: 500;
  color: #eeeeee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rc-row-artist {
  font-size: 10px;
  color: #777777;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rc-row-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.rc-status-pill {
  font-size: 9px;
  font-family: monospace;
  padding: 1px 5px;
  border-radius: 0;
  text-transform: lowercase;
  border: 1px solid transparent;
}
.rc-status-pill.ready,
.rc-status-pill.idle {
  color: #666666;
  border-color: #282828;
}
.rc-status-pill.queued,
.rc-status-pill.pending {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(56, 189, 248, 0.08);
}
.rc-status-pill.downloading {
  color: var(--rc-primary);
  border-color: rgba(255, 85, 0, 0.4);
  background: rgba(255, 85, 0, 0.1);
}
.rc-status-pill.completed,
.rc-status-pill.saved {
  color: #4ade80;
  border-color: rgba(74, 222, 128, 0.3);
  background: rgba(74, 222, 128, 0.08);
}
.rc-status-pill.error,
.rc-status-pill.failed {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(248, 113, 113, 0.08);
}
.rc-row-dl-btn {
  background: transparent;
  border: 1px solid #282828;
  color: #888888;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 0;
  transition: all 0.15s ease;
}
.rc-row-dl-btn:hover:not(:disabled) {
  background: #222222;
  color: #ffffff;
  border-color: #444444;
}
.rc-row-dl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
