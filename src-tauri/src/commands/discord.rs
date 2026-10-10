use crate::discord::{DiscordRpcState, TrackInfo};
use crate::smtc::SmtcManager;
use crate::tray::TrayManager;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn track_changed(
    track: Option<TrackInfo>,
    discord: State<'_, Arc<DiscordRpcState>>,
    smtc: State<'_, Arc<SmtcManager>>,
    tray: State<'_, Arc<TrayManager>>,
) {
    println!("[rustcloud] track_changed: {:?}", track);
    if let Some(t) = track.as_ref() {
        discord.update_presence(t);
        smtc.update_track(t);
        tray.update_track(&t.title, &t.artist, t.is_playing);
    } else {
        discord.clear();
        smtc.set_stopped();
        tray.update_track("", "", false);
    }
}

#[tauri::command]
pub fn set_discord_rpc_enabled(
    enabled: bool,
    discord: State<'_, Arc<DiscordRpcState>>,
    tray: State<'_, Arc<TrayManager>>,
) -> Result<(), String> {
    discord.set_enabled(enabled);
    tray.set_discord_enabled(enabled);
    Ok(())
}
