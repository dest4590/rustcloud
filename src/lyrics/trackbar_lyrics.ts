import { fetchLyrics, LyricsResult } from "./lyrics";
import { extractTrackInfo } from "../audio/player";
import { getBooleanSetting, SETTING_KEYS } from "../control-center/settings";

const BUBBLE_ID = "rustcloud-trackbar-lyrics-bubble";

let currentTrackKey = "";
let lyricsCache: LyricsResult | null = null;
let isFetching = false;
let bubbleElement: HTMLDivElement | null = null;
let updateInterval: number | null = null;

function createBubble(): HTMLDivElement {
  const el = document.createElement("div");
  el.id = BUBBLE_ID;
  Object.assign(el.style, {
    position: "absolute",
    bottom: "100%",
    left: "0px",
    transform: "translate(-50%, -12px)",
    pointerEvents: "none",
    zIndex: "1000",
    background: "rgba(20, 20, 20, 0.95)",
    border: "1px solid #ff5500",
    borderRadius: "0px",
    padding: "5px 11px",
    color: "#ffffff",
    fontFamily: "monospace, 'Segoe UI', sans-serif",
    fontSize: "13px",
    lineHeight: "1.25",
    whiteSpace: "nowrap",
    maxWidth: "420px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.6)",
    transition: "left 0.1s linear, opacity 0.2s ease",
    opacity: "0",
    display: "none",
  });

  const arrow = document.createElement("div");
  Object.assign(arrow.style, {
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "0",
    height: "0",
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: "5px solid #ff5500",
  });
  el.appendChild(arrow);

  const textNode = document.createElement("span");
  textNode.className = "rustcloud-lyrics-text";
  Object.assign(textNode.style, {
    display: "inline-block",
    transition: "transform 0.15s ease-out, opacity 0.15s ease-out",
    transform: "translateY(0)",
    opacity: "1",
  });
  el.appendChild(textNode);

  return el;
}

async function loadLyricsForTrack(title: string, artist: string) {
  const key = `${title} - ${artist}`;
  if (key === currentTrackKey || isFetching) return;
  currentTrackKey = key;
  isFetching = true;
  lyricsCache = null;

  try {
    lyricsCache = await fetchLyrics(title, artist);
  } catch {
    lyricsCache = null;
  } finally {
    isFetching = false;
  }
}

export function updateTrackbarLyrics(): void {
  const enabled = getBooleanSetting(SETTING_KEYS.TRACKBAR_LYRICS, true);

  const progressWrapper = document.querySelector<HTMLElement>(
    ".playbackTimeline__progressWrapper",
  );
  if (!progressWrapper) {
    if (bubbleElement) {
      bubbleElement.style.display = "none";
    }
    return;
  }

  if (!bubbleElement || !bubbleElement.parentElement) {
    if (bubbleElement) bubbleElement.remove();
    bubbleElement = createBubble();
    progressWrapper.style.position = "relative";
    progressWrapper.appendChild(bubbleElement);
  }

  if (!enabled) {
    bubbleElement.style.display = "none";
    bubbleElement.style.opacity = "0";
    return;
  }

  const track = extractTrackInfo();
  if (!track || !track.title) {
    bubbleElement.style.display = "none";
    bubbleElement.style.opacity = "0";
    return;
  }

  const trackKey = `${track.title} - ${track.artist}`;
  if (trackKey !== currentTrackKey && !isFetching) {
    loadLyricsForTrack(track.title, track.artist);
  }

  if (!lyricsCache || !lyricsCache.synced || !lyricsCache.lines.length) {
    bubbleElement.style.display = "none";
    bubbleElement.style.opacity = "0";
    return;
  }

  const currentSeconds = track.position;
  let activeLine: { time: number; text: string } | null = null;

  for (let i = lyricsCache.lines.length - 1; i >= 0; i--) {
    if (currentSeconds >= lyricsCache.lines[i].time) {
      activeLine = lyricsCache.lines[i];
      break;
    }
  }

  if (!activeLine || !activeLine.text.trim()) {
    bubbleElement.style.display = "none";
    bubbleElement.style.opacity = "0";
    return;
  }

  const progressHandle = progressWrapper.querySelector<HTMLElement>(
    ".playbackTimeline__progressHandle",
  );
  const handleLeft = progressHandle ? progressHandle.style.left : "0%";

  bubbleElement.style.left = handleLeft || "0%";
  bubbleElement.style.display = "block";

  const textNode = bubbleElement.querySelector<HTMLElement>(
    ".rustcloud-lyrics-text",
  );
  if (textNode && textNode.textContent !== activeLine.text) {
    textNode.textContent = activeLine.text;
  }

  bubbleElement.style.opacity = "1";
}

export function initTrackbarLyrics(): void {
  const w = window as unknown as {
    __RUSTCLOUD_LYRICS_INTERVAL__?: number;
  };
  if (w.__RUSTCLOUD_LYRICS_INTERVAL__) {
    clearInterval(w.__RUSTCLOUD_LYRICS_INTERVAL__);
    w.__RUSTCLOUD_LYRICS_INTERVAL__ = undefined;
  }
  if (updateInterval !== null) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  document.getElementById(BUBBLE_ID)?.remove();
  bubbleElement = null;

  updateTrackbarLyrics();

  const id = window.setInterval(() => {
    updateTrackbarLyrics();
  }, 250);
  updateInterval = id;
  w.__RUSTCLOUD_LYRICS_INTERVAL__ = id;
}
