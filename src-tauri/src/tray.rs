use crate::discord::DiscordRpcState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

pub struct TrayManager {
    track_item: MenuItem<Wry>,
    play_pause_item: MenuItem<Wry>,
    discord_item: MenuItem<Wry>,
    adblock_item: MenuItem<Wry>,
    discord_enabled: AtomicBool,
    adblock_enabled: AtomicBool,
    discord_state: Arc<DiscordRpcState>,
}

impl TrayManager {
    pub fn setup(
        app: &AppHandle,
        discord_state: Arc<DiscordRpcState>,
    ) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let track_item =
            MenuItem::with_id(app, "tray_track", "SoundCloud - Idle", false, None::<&str>)?;
        let play_pause_item =
            MenuItem::with_id(app, "tray_play_pause", "Play / Pause", true, None::<&str>)?;
        let next_item = MenuItem::with_id(app, "tray_next", "Next Track", true, None::<&str>)?;
        let prev_item = MenuItem::with_id(app, "tray_prev", "Previous Track", true, None::<&str>)?;
        let sep1 = PredefinedMenuItem::separator(app)?;

        let discord_item =
            MenuItem::with_id(app, "tray_discord", "Discord RPC: ON", true, None::<&str>)?;
        let adblock_item =
            MenuItem::with_id(app, "tray_adblock", "AdBlock: ON", true, None::<&str>)?;
        let sep2 = PredefinedMenuItem::separator(app)?;

        let toggle_win_item = MenuItem::with_id(
            app,
            "tray_toggle_window",
            "Show / Hide Window",
            true,
            None::<&str>,
        )?;
        let quit_item = MenuItem::with_id(app, "tray_quit", "Quit rustcloud", true, None::<&str>)?;

        let menu = Menu::with_items(
            app,
            &[
                &track_item,
                &play_pause_item,
                &prev_item,
                &next_item,
                &sep1,
                &discord_item,
                &adblock_item,
                &sep2,
                &toggle_win_item,
                &quit_item,
            ],
        )?;

        let tray_manager = Arc::new(Self {
            track_item,
            play_pause_item,
            discord_item,
            adblock_item,
            discord_enabled: AtomicBool::new(true),
            adblock_enabled: AtomicBool::new(true),
            discord_state,
        });

        let app_handle = app.clone();
        let tm = tray_manager.clone();

        let mut builder = TrayIconBuilder::with_id("rustcloud-tray")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(move |app, event| {
                let id = event.id.as_ref();
                match id {
                    "tray_play_pause" => {
                        let _ = app.emit("media-play-pause", ());
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("document.querySelector('.playControl')?.click()");
                        }
                    }
                    "tray_next" => {
                        let _ = app.emit("media-next", ());
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("document.querySelector('.skipControl__next')?.click()");
                        }
                    }
                    "tray_prev" => {
                        let _ = app.emit("media-prev", ());
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("document.querySelector('.skipControl__previous')?.click()");
                        }
                    }
                    "tray_discord" => {
                        let current = tm.discord_enabled.fetch_xor(true, Ordering::SeqCst);
                        let new_val = !current;
                        let text = if new_val { "Discord RPC: ON" } else { "Discord RPC: OFF" };
                        let _ = tm.discord_item.set_text(text);
                        tm.discord_state.set_enabled(new_val);
                        let _ = app.emit("rustcloud:discord-toggle", new_val);
                    }
                    "tray_adblock" => {
                        let current = tm.adblock_enabled.fetch_xor(true, Ordering::SeqCst);
                        let new_val = !current;
                        let text = if new_val { "AdBlock: ON" } else { "AdBlock: OFF" };
                        let _ = tm.adblock_item.set_text(text);
                        if let Some(win) = app.get_webview_window("main") {
                            let js = format!("window.dispatchEvent(new CustomEvent('rustcloud:adblock-toggle', {{ detail: {} }}));", new_val);
                            let _ = win.eval(&js);
                        }
                    }
                    "tray_toggle_window" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "tray_quit" => {
                        app.exit(0);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(win) = app.get_webview_window("main") {
                        if win.is_visible().unwrap_or(false) {
                            let _ = win.hide();
                        } else {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                }
            });

        if let Some(icon) = app_handle.default_window_icon() {
            builder = builder.icon(icon.clone());
        }

        builder.build(app)?;

        Ok(tray_manager)
    }

    pub fn update_track(&self, title: &str, artist: &str, is_playing: bool) {
        let label = if title.is_empty() {
            "SoundCloud - Idle".to_string()
        } else {
            format!("{artist} - {title}")
        };
        let _ = self.track_item.set_text(&label);

        let play_text = if is_playing { "Pause" } else { "Play" };
        let _ = self.play_pause_item.set_text(play_text);
    }

    pub fn set_discord_enabled(&self, enabled: bool) {
        self.discord_enabled.store(enabled, Ordering::SeqCst);
        let text = if enabled {
            "Discord RPC: ON"
        } else {
            "Discord RPC: OFF"
        };
        let _ = self.discord_item.set_text(text);
    }
}
