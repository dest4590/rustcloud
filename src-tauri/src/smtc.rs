use crate::discord::TrackInfo;
#[cfg(target_os = "windows")]
use souvlaki::{MediaControlEvent, PlatformConfig, SeekDirection};
use souvlaki::{MediaControls, MediaMetadata, MediaPlayback, MediaPosition};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
#[cfg(target_os = "windows")]
use tauri::{Emitter, Manager};

fn prepare_cover_url(url: &str) -> Option<String> {
    if url.is_empty() {
        return None;
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        let clean = url
            .trim_start_matches("file:///")
            .trim_start_matches("file://")
            .trim_start_matches(r"\\?\");
        #[cfg(target_os = "windows")]
        let native_path = clean.replace('/', "\\");
        #[cfg(not(target_os = "windows"))]
        let native_path = clean.to_string();

        Some(format!("file://{native_path}"))
    }
}

pub struct SmtcManager {
    controls: Mutex<Option<MediaControls>>,
    enabled: AtomicBool,
}

impl SmtcManager {
    #[allow(unused_variables)]
    pub fn new(app: &AppHandle, hwnd: Option<*mut std::ffi::c_void>) -> Arc<Self> {
        #[cfg(target_os = "windows")]
        let controls = {
            let config = PlatformConfig {
                dbus_name: "rustcloud",
                display_name: "RustCloud",
                hwnd,
            };
            match MediaControls::new(config) {
                Ok(mut c) => {
                    let app_clone = app.clone();
                    let attach_res = c.attach(move |event| {
                        println!("[rustcloud-smtc] control event: {:?}", event);
                        match event {
                            MediaControlEvent::Play => {
                                let _ = app_clone.emit("media-play", ());
                                let _ = app_clone.emit("media-play-pause", ());
                            }
                            MediaControlEvent::Pause => {
                                let _ = app_clone.emit("media-pause", ());
                                let _ = app_clone.emit("media-play-pause", ());
                            }
                            MediaControlEvent::Toggle => {
                                let _ = app_clone.emit("media-play-pause", ());
                            }
                            MediaControlEvent::Next => {
                                let _ = app_clone.emit("media-next", ());
                            }
                            MediaControlEvent::Previous => {
                                let _ = app_clone.emit("media-prev", ());
                            }
                            MediaControlEvent::Stop => {
                                let _ = app_clone.emit("media-stop", ());
                            }
                            MediaControlEvent::SetPosition(pos) => {
                                let _ = app_clone.emit("media-seek", pos.0.as_secs_f64());
                            }
                            MediaControlEvent::Seek(dir) => {
                                let delta = match dir {
                                    SeekDirection::Forward => 10.0,
                                    SeekDirection::Backward => -10.0,
                                };
                                let _ = app_clone.emit("media-seek-relative", delta);
                            }
                            MediaControlEvent::SeekBy(dir, dur) => {
                                let secs = dur.as_secs_f64();
                                let delta = match dir {
                                    SeekDirection::Forward => secs,
                                    SeekDirection::Backward => -secs,
                                };
                                let _ = app_clone.emit("media-seek-relative", delta);
                            }
                            MediaControlEvent::Raise => {
                                if let Some(w) = app_clone.get_webview_window("main") {
                                    let _ = w.unminimize();
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            _ => {}
                        }
                    });
                    if let Err(e) = attach_res {
                        eprintln!("[rustcloud-smtc] attach event handler error: {e}");
                    }
                    Some(c)
                }
                Err(e) => {
                    eprintln!("[rustcloud-smtc] initialization error: {e}");
                    None
                }
            }
        };

        #[cfg(not(target_os = "windows"))]
        let controls = None;

        Arc::new(Self {
            controls: Mutex::new(controls),
            enabled: AtomicBool::new(true),
        })
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        let mut lock = self.controls.lock().unwrap();
        if let Some(controls) = lock.as_mut() {
            if !enabled {
                let _ = controls.set_playback(MediaPlayback::Stopped);
            }
        }
    }

    #[allow(dead_code)]
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub fn update_track(&self, track: &TrackInfo) {
        if !self.enabled.load(Ordering::Relaxed) {
            return;
        }

        let mut lock = self.controls.lock().unwrap();
        let controls = match lock.as_mut() {
            Some(c) => c,
            None => return,
        };

        let duration = if track.duration > 0 {
            Some(Duration::from_secs(track.duration))
        } else {
            None
        };

        let cover_url = prepare_cover_url(&track.artwork_url);

        let metadata = MediaMetadata {
            title: Some(&track.title),
            artist: Some(&track.artist),
            album: Some("SoundCloud"),
            duration,
            cover_url: cover_url.as_deref(),
        };

        if let Err(e) = controls.set_metadata(metadata) {
            eprintln!("[rustcloud-smtc] set_metadata error: {e}");
        }

        let playback = if track.is_playing {
            MediaPlayback::Playing {
                progress: Some(MediaPosition(Duration::from_secs(track.position))),
            }
        } else if track.duration > 0 {
            MediaPlayback::Paused {
                progress: Some(MediaPosition(Duration::from_secs(track.position))),
            }
        } else {
            MediaPlayback::Stopped
        };

        if let Err(e) = controls.set_playback(playback) {
            eprintln!("[rustcloud-smtc] set_playback error: {e}");
        }
    }

    pub fn set_playback_status(&self, is_playing: bool) {
        if !self.enabled.load(Ordering::Relaxed) {
            return;
        }

        let mut lock = self.controls.lock().unwrap();
        let controls = match lock.as_mut() {
            Some(c) => c,
            None => return,
        };

        let playback = if is_playing {
            MediaPlayback::Playing { progress: None }
        } else {
            MediaPlayback::Paused { progress: None }
        };

        let _ = controls.set_playback(playback);
    }

    pub fn set_stopped(&self) {
        if !self.enabled.load(Ordering::Relaxed) {
            return;
        }
        let mut lock = self.controls.lock().unwrap();
        if let Some(controls) = lock.as_mut() {
            let _ = controls.set_playback(MediaPlayback::Stopped);
        }
    }
}
