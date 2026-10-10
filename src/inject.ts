import { onDomReady } from "./core/dom";
import { initAdblock } from "./features/adblock";
import { initPlayerSync } from "./audio/player";
import { initMediaControls } from "./audio/media_controls";
import { initAudioDsp } from "./audio/dsp";
import {
  initControlCenter,
  closeControlCenter,
  openControlCenter,
  isControlCenterOpen,
} from "./control-center";
import { refreshToastContainer } from "./control-center/toast";
import { initDownloader, initPlaylistInjector } from "./downloader";
import { initAudioHooks } from "./audio/audio_hook";
import { initSettingsSync } from "./control-center/settings";
import { initTrackbarLyrics } from "./lyrics/trackbar_lyrics";

try {
  if (window.top === window.self) {
    const isHotReload = Boolean(
      (window as unknown as { __RUSTCLOUD_INJECTED__?: boolean })
        .__RUSTCLOUD_INJECTED__,
    );
    (
      window as unknown as { __RUSTCLOUD_INJECTED__?: boolean }
    ).__RUSTCLOUD_INJECTED__ = true;

    initSettingsSync();

    if (isHotReload) {
      console.log("[rustcloud] In-place hot-reload applied");
      const wasOpen = isControlCenterOpen();
      closeControlCenter();
      refreshToastContainer();
      initControlCenter();
      initAdblock();
      initTrackbarLyrics();
      initPlaylistInjector();
      initMediaControls();

      if (wasOpen) {
        openControlCenter();
      }
    } else {
      initAdblock();
      initDownloader();
      initPlaylistInjector();
      initAudioDsp();
      initAudioHooks();

      onDomReady(() => {
        initPlayerSync();
        initMediaControls();
        initControlCenter();
        initTrackbarLyrics();
      });
    }
  }
} catch (err) {
  console.error("[rustcloud] injection error:", err);
}
