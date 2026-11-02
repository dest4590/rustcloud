import { createApp, App as VueApp } from "vue";
import ControlCenter from "./ControlCenter.vue";
import { downloadTrack } from "../downloader/downloader";
import { extractTrackInfo } from "../audio/player";
import { copyToClipboard } from "../core/utils";
import { toast } from "./toast";
import { SETTING_KEYS, getBooleanSetting, getStringSetting } from "./settings";

const MODAL_ID = "rustcloud-control-center-modal";
const CC_BTN_ID = "rustcloud-cc-btn";
const DL_BTN_ID = "rustcloud-dl-btn";
const COPY_BTN_ID = "rustcloud-copy-btn";
const PROXY_BADGE_ID = "rustcloud-proxy-badge";

let appInstance: VueApp | null = null;
let controlsAbortController: AbortController | null = null;
let controlsObserver: MutationObserver | null = null;

function styleControlBtn(btn: HTMLButtonElement) {
  Object.assign(btn.style, {
    background: "transparent",
    border: "none",
    color: "#999999",
    cursor: "pointer",
    padding: "4px 8px",
    margin: "0 4px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "0",
    transition: "color 0.15s ease",
    verticalAlign: "middle",
  });
  btn.addEventListener("mouseenter", () => (btn.style.color = "#ff5500"));
  btn.addEventListener("mouseleave", () => (btn.style.color = "#999999"));
}

function styleProxyBadge(btn: HTMLElement): void {
  Object.assign(btn.style, {
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    background: "#141414",
    border: "1px solid #282828",
    color: "var(--rc-primary, #ff5500)",
    cursor: "pointer",
    padding: "2px 6px",
    fontSize: "10px",
    fontWeight: "600",
    fontFamily: "monospace",
    textTransform: "lowercase",
    margin: "0 4px",
    height: "22px",
    boxSizing: "border-box",
    borderRadius: "0",
    userSelect: "none",
    transition: "all 0.15s ease",
    verticalAlign: "middle",
  });

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#1c1c1c";
    btn.style.borderColor = "var(--rc-primary, #ff5500)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#141414";
    btn.style.borderColor = "#282828";
  });
}

function updateProxyBadgeContent(el?: HTMLElement | null): void {
  const badge = el || document.getElementById(PROXY_BADGE_ID);
  if (!badge) return;

  const enabled = getBooleanSetting(SETTING_KEYS.PROXY_ENABLED, false);
  const enabledStr = enabled ? "true" : "false";
  if (!enabled) {
    if (badge.style.display !== "none") {
      badge.style.display = "none";
    }
    badge.dataset.rcEnabled = "false";
    return;
  }

  const country = getStringSetting(SETTING_KEYS.PROXY_COUNTRY, "").trim();
  const url = getStringSetting(SETTING_KEYS.PROXY_URL, "").trim();
  const label = country ? `proxy: ${country.toLowerCase()}` : "proxy";

  if (
    badge.dataset.rcEnabled === enabledStr &&
    badge.dataset.rcLabel === label &&
    badge.style.display === "inline-flex"
  ) {
    return;
  }

  badge.dataset.rcEnabled = enabledStr;
  badge.dataset.rcLabel = label;
  badge.style.display = "inline-flex";

  badge.title = url
    ? `streaming through proxy (${url}) - click to configure`
    : "streaming through proxy - click to configure";

  badge.innerHTML = `
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="display:block;flex-shrink:0;" aria-hidden="true"><path d="M7 7h10v10H7zM4 4h16v16H4zM9 9l6 6M15 9l-6 6" /></svg>
    <span>${label}</span>
  `;
}

export function isControlCenterOpen(): boolean {
  return !!document.getElementById(MODAL_ID);
}

export function toggleControlCenter(): void {
  if (isControlCenterOpen()) {
    closeControlCenter();
  } else {
    openControlCenter();
  }
}

export function openControlCenter(
  targetTab?: "equalizer" | "lyrics" | "download" | "settings",
): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    if (!targetTab) {
      closeControlCenter();
      return;
    }
  } else {
    const mountPoint = document.createElement("div");
    mountPoint.id = MODAL_ID;
    document.body.appendChild(mountPoint);

    appInstance = createApp(ControlCenter, {
      onClose: closeControlCenter,
    });
    appInstance.mount(mountPoint);
  }

  if (targetTab) {
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("rustcloud:switch-tab", { detail: { tab: targetTab } }),
      );
    }, 40);
  }
}

export function closeControlCenter(): void {
  if (appInstance) {
    appInstance.unmount();
    appInstance = null;
  }
  document.getElementById(MODAL_ID)?.remove();
}

let isDownloading = false;

async function handleCopySongLink() {
  const track = extractTrackInfo();
  if (!track || !track.title) {
    toast.warning("Play a track on SoundCloud to copy link");
    return;
  }

  let url = track.trackUrl;
  if (!url) {
    const currentLoc = window.location.href;
    if (currentLoc.includes("soundcloud.com/")) {
      url = currentLoc;
    }
  }

  if (!url) {
    toast.error("Could not find track link");
    return;
  }

  const ok = await copyToClipboard(url);
  if (ok) {
    toast.success("Song link copied to clipboard");
  } else {
    toast.error("Failed to copy link to clipboard");
  }
}

async function handleQuickDownload() {
  if (isDownloading) return;
  const track = extractTrackInfo();
  if (!track || !track.title) {
    toast.warning("Play a track on SoundCloud to download");
    return;
  }

  isDownloading = true;
  toast.info(`Downloading ${track.title}...`);
  try {
    const res = await downloadTrack(
      track.title,
      track.artist,
      track.trackUrl,
      track.artworkUrl,
    );
    if (res.success) {
      toast.success(res.message || "Download complete!");
    } else {
      toast.error(res.message || "Download failed");
    }
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : "Download error");
  } finally {
    isDownloading = false;
  }
}

export function initControlsIntegration(): void {
  if (controlsAbortController) {
    controlsAbortController.abort();
  }
  controlsAbortController = new AbortController();
  const { signal } = controlsAbortController;

  if (controlsObserver) {
    controlsObserver.disconnect();
    controlsObserver = null;
  }

  document.getElementById(CC_BTN_ID)?.remove();
  document.getElementById(DL_BTN_ID)?.remove();
  document.getElementById(COPY_BTN_ID)?.remove();
  document.getElementById(PROXY_BADGE_ID)?.remove();

  function updateDownloadBtnVisibility() {
    const dlBtn = document.getElementById(DL_BTN_ID);
    const show = getBooleanSetting(SETTING_KEYS.SHOW_DOWNLOAD_BTN);
    if (dlBtn) {
      dlBtn.style.display = show ? "inline-flex" : "none";
    }
  }

  function updateCopyLinkBtnVisibility() {
    const copyBtn = document.getElementById(COPY_BTN_ID);
    const show = getBooleanSetting(SETTING_KEYS.SHOW_COPY_LINK_BTN);
    if (copyBtn) {
      copyBtn.style.display = show ? "inline-flex" : "none";
    }
  }

  function injectButtons() {
    const playControls =
      document.querySelector(".playControls__elements") ||
      document.querySelector(".playControls__inner") ||
      document.querySelector(".playControls");

    if (!playControls) return;

    const soundBadge = playControls.querySelector(".playControls__soundBadge");

    if (!document.getElementById(CC_BTN_ID)) {
      const btn = document.createElement("button");
      btn.id = CC_BTN_ID;
      btn.title = "RustCloud Control Center (Alt+R)";
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:block;" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.18l-2.39.96a7.02 7.02 0 0 0-1.63-.94L14.5 2.5a.5.5 0 0 0-.5-.5h-3.99a.5.5 0 0 0-.5.5l-.25 2.46c-.57.23-1.1.57-1.61.94l-2.39-.96a.5.5 0 0 0-.61.18L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.25.44.34.61.18l2.39-.96c.51.37 1.04.71 1.61.94l.25 2.46a.5.5 0 0 0 .5.5h3.99a.5.5 0 0 0 .5-.5l.25-2.46c.57-.23 1.1-.57 1.61-.94l2.39.96c.17.16.47.07.61-.18l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" /></svg>`;
      styleControlBtn(btn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openControlCenter();
      });
      if (soundBadge) {
        playControls.insertBefore(btn, soundBadge);
      } else {
        playControls.appendChild(btn);
      }
    }

    if (!document.getElementById(DL_BTN_ID)) {
      const dlBtn = document.createElement("button");
      dlBtn.id = DL_BTN_ID;
      dlBtn.title = "Download MP3";
      dlBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:block;" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>`;
      styleControlBtn(dlBtn);
      dlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleQuickDownload();
      });

      const ccBtn = document.getElementById(CC_BTN_ID);
      if (ccBtn && ccBtn.parentNode) {
        ccBtn.parentNode.insertBefore(dlBtn, ccBtn.nextSibling);
      } else if (soundBadge) {
        playControls.insertBefore(dlBtn, soundBadge);
      } else {
        playControls.appendChild(dlBtn);
      }
      updateDownloadBtnVisibility();
    }

    if (!document.getElementById(COPY_BTN_ID)) {
      const copyBtn = document.createElement("button");
      copyBtn.id = COPY_BTN_ID;
      copyBtn.title = "Copy Track Link";
      copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:block;" aria-hidden="true"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" /></svg>`;
      styleControlBtn(copyBtn);
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleCopySongLink();
      });

      const dlBtn = document.getElementById(DL_BTN_ID);
      const ccBtn = document.getElementById(CC_BTN_ID);
      if (dlBtn && dlBtn.parentNode) {
        dlBtn.parentNode.insertBefore(copyBtn, dlBtn.nextSibling);
      } else if (ccBtn && ccBtn.parentNode) {
        ccBtn.parentNode.insertBefore(copyBtn, ccBtn.nextSibling);
      } else if (soundBadge) {
        playControls.insertBefore(copyBtn, soundBadge);
      } else {
        playControls.appendChild(copyBtn);
      }
      updateCopyLinkBtnVisibility();
    }

    if (!document.getElementById(PROXY_BADGE_ID)) {
      const badge = document.createElement("div");
      badge.id = PROXY_BADGE_ID;
      badge.setAttribute("role", "button");
      badge.setAttribute("tabindex", "0");
      styleProxyBadge(badge);
      updateProxyBadgeContent(badge);

      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openControlCenter("settings");
      });

      const copyBtn = document.getElementById(COPY_BTN_ID);
      const dlBtn = document.getElementById(DL_BTN_ID);
      const ccBtn = document.getElementById(CC_BTN_ID);
      if (copyBtn && copyBtn.parentNode) {
        copyBtn.parentNode.insertBefore(badge, copyBtn.nextSibling);
      } else if (dlBtn && dlBtn.parentNode) {
        dlBtn.parentNode.insertBefore(badge, dlBtn.nextSibling);
      } else if (ccBtn && ccBtn.parentNode) {
        ccBtn.parentNode.insertBefore(badge, ccBtn.nextSibling);
      } else if (soundBadge) {
        playControls.insertBefore(badge, soundBadge);
      } else {
        playControls.appendChild(badge);
      }
    }

  }

  window.addEventListener(
    "rustcloud:setting-changed",
    ((e: CustomEvent) => {
      if (e.detail?.key === SETTING_KEYS.SHOW_DOWNLOAD_BTN) {
        updateDownloadBtnVisibility();
      } else if (e.detail?.key === SETTING_KEYS.SHOW_COPY_LINK_BTN) {
        updateCopyLinkBtnVisibility();
      } else if (
        e.detail?.key === SETTING_KEYS.PROXY_ENABLED ||
        e.detail?.key === SETTING_KEYS.PROXY_URL ||
        e.detail?.key === SETTING_KEYS.PROXY_COUNTRY
      ) {
        updateProxyBadgeContent();
      }
    }) as EventListener,
    { signal },
  );

  injectButtons();
  let injectDebounce: number | null = null;
  const throttledInject = () => {
    if (injectDebounce !== null) return;
    injectDebounce = window.setTimeout(() => {
      injectDebounce = null;
      injectButtons();
    }, 200);
  };
  const obs = new MutationObserver(throttledInject);
  const rootTarget = document.body || document.documentElement;
  if (rootTarget) {
    obs.observe(rootTarget, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      const root = document.body || document.documentElement;
      if (root) {
        obs.observe(root, { childList: true, subtree: true });
      }
    });
  }
  controlsObserver = obs;
}

export function initControlCenter(): void {
  initControlsIntegration();

  const signal = controlsAbortController?.signal;
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.altKey && (e.code === "KeyR" || e.key === "r" || e.key === "R")) {
        e.preventDefault();
        toggleControlCenter();
      } else if (e.key === "Escape" && isControlCenterOpen()) {
        e.preventDefault();
        closeControlCenter();
      }
    },
    signal ? { signal } : undefined,
  );
}
