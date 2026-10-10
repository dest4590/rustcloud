<template>
  <div class="rc-lyrics-tab">
    <div class="rc-lyrics-meta-card">
      <div>
        <div class="rc-track-title">
          {{ (track.title || "no track playing").toLowerCase() }}
        </div>
        <div class="rc-track-artist">
          {{ (track.artist || "soundcloud").toLowerCase() }}
        </div>
      </div>
      <button class="rc-btn" :disabled="loading" @click="fetch">
        {{ loading ? "loading..." : "refresh" }}
      </button>
    </div>

    <div class="rc-lyrics-scroll" ref="box">
      <div v-if="loading" class="rc-center-msg">loading lyrics...</div>
      <div
        v-else-if="!lyrics || (!lyrics.synced && !lyrics.text)"
        class="rc-center-msg"
      >
        no lyrics found
      </div>
      <div v-else-if="lyrics.synced" class="rc-synced-wrapper">
        <div
          v-for="(line, idx) in lyrics.lines"
          :key="idx"
          class="rc-lrc-line"
          :class="{ active: currentIdx === idx, past: currentIdx > idx }"
          :ref="
            (el) => {
              if (currentIdx === idx) activeEl = el as HTMLElement;
            }
          "
          @click="seek(line.time)"
        >
          {{ line.text }}
        </div>
      </div>
      <div v-else class="rc-plain-wrapper">{{ lyrics.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { fetchLyrics, LyricsResult } from "../../lyrics/lyrics";
import { TrackInfo, seekTo } from "../../audio/player";

const props = defineProps<{ track: TrackInfo }>();

const loading = ref(false);
const lyrics = ref<LyricsResult | null>(null);
const currentIdx = ref(-1);
const activeEl = ref<HTMLElement | null>(null);
const box = ref<HTMLElement | null>(null);

function seek(time: number) {
  seekTo(time);
}

async function fetch() {
  if (!props.track.title) return;
  loading.value = true;
  lyrics.value = null;
  try {
    lyrics.value = await fetchLyrics(props.track.title, props.track.artist);
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.track.title,
  (newTitle) => {
    if (newTitle) fetch();
  },
  { immediate: true },
);

watch(
  () => props.track.position,
  (time) => {
    if (!lyrics.value?.synced || !lyrics.value.lines.length) return;
    const lines = lyrics.value.lines;
    let found = -1;
    for (let i = 0; i < lines.length; i++) {
      if (time >= lines[i].time) {
        found = i;
      } else {
        break;
      }
    }
    if (found !== currentIdx.value) {
      currentIdx.value = found;
      nextTick(() => {
        if (activeEl.value && box.value) {
          const top =
            activeEl.value.offsetTop -
            box.value.clientHeight / 2 +
            activeEl.value.clientHeight / 2;
          box.value.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }
      });
    }
  },
);
</script>

<style scoped>
.rc-lyrics-tab {
  display: flex;
  flex-direction: column;
  height: 440px;
  gap: 12px;
}
.rc-lyrics-meta-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--rc-bg-card);
  border: 1px solid var(--rc-border);
  border-radius: 0;
  padding: 10px 14px;
}
.rc-track-title {
  font-weight: 600;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.rc-track-artist {
  font-size: 11px;
  color: var(--rc-primary);
  margin-top: 2px;
}
.rc-lyrics-scroll {
  flex: 1;
  overflow-y: auto;
  background: var(--rc-bg-card);
  border: 1px solid var(--rc-border);
  border-radius: 0;
  padding: 24px 16px;
  text-align: center;
}
.rc-center-msg {
  color: var(--rc-text-muted);
  font-size: 13px;
  margin-top: 80px;
}
.rc-synced-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rc-lrc-line {
  font-size: 14px;
  font-weight: 500;
  color: #555555;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.4;
  user-select: none;
}
.rc-lrc-line:hover {
  color: #dddddd;
}
.rc-lrc-line.past {
  color: #777777;
}
.rc-lrc-line.active {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  transform: scale(1.03);
}
.rc-plain-wrapper {
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  color: #cccccc;
}
</style>
