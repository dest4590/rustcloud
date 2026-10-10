mod audio;
mod commands;
mod discord;
mod dsp;
mod smtc;
mod tray;

use audio::AudioEngine;
use discord::DiscordRpcState;
use smtc::SmtcManager;
use std::sync::Arc;
use tauri::webview::NewWindowResponse;
use tauri::{Listener, Manager, WebviewUrl, WindowEvent};
use tray::TrayManager;

#[cfg(debug_assertions)]
fn get_inject_script_path() -> Option<std::path::PathBuf> {
    let candidates = ["dist/inject.js", "../dist/inject.js"];
    for path in &candidates {
        let p = std::path::PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[cfg(debug_assertions)]
fn get_inject_script() -> String {
    if let Some(path) = get_inject_script_path() {
        if let Ok(content) = std::fs::read_to_string(path) {
            return content;
        }
    }
    include_str!("../../dist/inject.js").to_string()
}

#[cfg(debug_assertions)]
fn start_inject_hot_reload_watcher(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_modified = None;
        let mut last_len = 0usize;

        if let Some(path) = get_inject_script_path() {
            if let Ok(metadata) = std::fs::metadata(&path) {
                last_modified = metadata.modified().ok();
                last_len = metadata.len() as usize;
            }
        }

        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));

            if let Some(path) = get_inject_script_path() {
                if let Ok(metadata) = std::fs::metadata(&path) {
                    let modified = metadata.modified().ok();
                    let len = metadata.len() as usize;

                    let changed = last_modified.is_some()
                        && (modified != last_modified || (len != last_len && len > 0));

                    if changed {
                        std::thread::sleep(std::time::Duration::from_millis(50));

                        if let Ok(content) = std::fs::read_to_string(&path) {
                            if !content.trim().is_empty() {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    eprintln!(
                                        "[rustcloud] dist/inject.js rebuilt ({} bytes), hot-reloading...",
                                        content.len()
                                    );
                                    let _ = window.eval(&content);
                                }
                            }
                        }
                    }

                    last_modified = modified;
                    last_len = len;
                }
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn get_inject_script() -> &'static str {
    include_str!("../../dist/inject.js")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let discord_state = Arc::new(DiscordRpcState::new());
    let audio_engine = Arc::new(AudioEngine::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .manage(discord_state.clone())
        .manage(audio_engine.clone())
        .invoke_handler(tauri::generate_handler![
            commands::discord::track_changed,
            commands::download::save_audio_file,
            commands::audio::rust_play_stream,
            commands::audio::rust_pause_stream,
            commands::audio::rust_resume_stream,
            commands::audio::rust_stop_stream,
            commands::audio::rust_seek_stream,
            commands::audio::rust_set_volume,
            commands::audio::rust_set_playback_speed,
            commands::audio::rust_set_dsp_config,
            commands::audio::get_audio_output_devices,
            commands::audio::set_audio_output_device,
            commands::audio::rust_sync_audio_position,
            commands::discord::set_discord_rpc_enabled,
            commands::smtc::set_smtc_enabled,
            commands::audio::rust_audio_status,
            commands::proxy::set_proxy_config,
            commands::proxy::rust_resolve_stream,
            commands::proxy::test_proxy_connection,
            commands::proxy::rust_proxy_http
        ])
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let soundcloud_url = "https://soundcloud.com".parse::<url::Url>().unwrap();
            let script = get_inject_script();
            let window =
                tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::External(soundcloud_url))
                    .title("rustcloud")
                    .inner_size(1366.0, 768.0)
                    .min_inner_size(800.0, 600.0)
                    .center()
                    .initialization_script(script)
                    .on_new_window(|url, _target| {
                        let url_str = url.as_str();
                        let is_auth = url_str.starts_with("https://secure.soundcloud.com")
                            || url_str.starts_with("https://auth.soundcloud.com")
                            || url_str.starts_with("https://api-v2.soundcloud.com")
                            || url_str.contains("/signin")
                            || url_str.contains("/connect")
                            || url_str.contains("accounts.google.com")
                            || url_str.contains("appleid.apple.com")
                            || url_str.contains("facebook.com");

                        if is_auth {
                            NewWindowResponse::Allow
                        } else {
                            let _ = tauri_plugin_opener::open_url(url_str, None::<&str>);
                            NewWindowResponse::Deny
                        }
                    })
                    .build()?;

            #[cfg(target_os = "windows")]
            let hwnd = window.hwnd().map(|h| h.0 as *mut std::ffi::c_void).ok();
            #[cfg(not(target_os = "windows"))]
            let hwnd = None;

            audio_engine.start_default_output_monitor();

            let smtc_manager = SmtcManager::new(app.handle(), hwnd);
            app.manage(smtc_manager);

            let tray = TrayManager::setup(app.handle(), discord_state.clone())
                .expect("failed to setup system tray");
            app.manage(tray);

            #[cfg(debug_assertions)]
            {
                let app_handle = app.handle().clone();
                start_inject_hot_reload_watcher(app_handle);
            }

            let app_handle = app.handle().clone();
            window.listen("rustcloud-open-settings", move |_| {
                if let Some(w) = app_handle.get_webview_window("settings") {
                    let _ = w.show();
                    let _ = w.set_focus();
                } else {
                    let builder = tauri::WebviewWindowBuilder::new(
                        &app_handle,
                        "settings",
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("rustcloud - settings")
                    .inner_size(720.0, 520.0)
                    .resizable(true);

                    #[cfg(target_os = "windows")]
                    let builder = builder.decorations(false).shadow(false);

                    if let Ok(w) = builder.build() {
                        let w_clone = w.clone();
                        w.on_window_event(move |event| {
                            if let WindowEvent::CloseRequested { api, .. } = event {
                                api.prevent_close();
                                let _ = w_clone.hide();
                            }
                        });
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
