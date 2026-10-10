import { openControlCenter } from "../control-center";
import { toast } from "../control-center/toast";

const BTN_CLASS = "rc-playlist-dl-btn";

export function initPlaylistInjector(): void {
  const w = window as unknown as {
    __RUSTCLOUD_PLAYLIST_OBSERVER__?: MutationObserver;
  };
  if (w.__RUSTCLOUD_PLAYLIST_OBSERVER__) {
    w.__RUSTCLOUD_PLAYLIST_OBSERVER__.disconnect();
    w.__RUSTCLOUD_PLAYLIST_OBSERVER__ = undefined;
  }

  document.querySelectorAll(`.${BTN_CLASS}`).forEach((el) => el.remove());

  function inject() {
    const buttonGroups = document.querySelectorAll(
      ".listenEngagement__actions .sc-button-group, .soundActions.soundActions__medium .sc-button-group, .listenEngagement .sc-button-group",
    );

    buttonGroups.forEach((group) => {
      if (group.querySelector(`.${BTN_CLASS}`)) return;

      const isPlaylistPage =
        document.querySelector(".fullListenHero") !== null ||
        document.querySelector(".listenDetails__trackList") !== null ||
        window.location.pathname.includes("/sets/");

      if (!isPlaylistPage) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sc-button sc-button-medium sc-button-responsive sc-button-secondary ${BTN_CLASS}`;
      btn.title = "Download entire playlist with RustCloud";
      btn.setAttribute("aria-label", "Download Playlist");

      btn.innerHTML = `
        <div style="display:flex;align-items:center;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
          </svg>
        </div>
        <span class="sc-button-label" style="display:inline;margin-left:4px;font-size:11px;font-weight:600;">download playlist</span>
      `;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openControlCenter();
        toast.info(
          "Opened Control Center -> Switch to Download tab to process playlist",
          4000,
        );
      });

      group.appendChild(btn);
    });
  }

  const target = document.body || document.documentElement;
  if (target) {
    inject();
    const observer = new MutationObserver(() => inject());
    observer.observe(target, { childList: true, subtree: true });
    w.__RUSTCLOUD_PLAYLIST_OBSERVER__ = observer;
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      const root = document.body || document.documentElement;
      if (root) {
        inject();
        const observer = new MutationObserver(() => inject());
        observer.observe(root, { childList: true, subtree: true });
        w.__RUSTCLOUD_PLAYLIST_OBSERVER__ = observer;
      }
    });
  }
}
