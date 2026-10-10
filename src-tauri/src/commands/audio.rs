use crate::audio::{AudioDeviceInfo, AudioEngine};
use crate::dsp::DspConfig;
use crate::smtc::SmtcManager;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn rust_play_stream(
    url: String,
    auth_header: Option<String>,
    start_secs: Option<f32>,
    audio: State<'_, Arc<AudioEngine>>,
) -> Result<(), String> {
    audio.play_url(url, auth_header, start_secs)
}

#[tauri::command]
pub fn rust_pause_stream(audio: State<'_, Arc<AudioEngine>>, smtc: State<'_, Arc<SmtcManager>>) {
    audio.pause();
    smtc.set_playback_status(false);
}

#[tauri::command]
pub fn rust_resume_stream(audio: State<'_, Arc<AudioEngine>>, smtc: State<'_, Arc<SmtcManager>>) {
    audio.resume();
    smtc.set_playback_status(true);
}

#[tauri::command]
pub fn rust_stop_stream(audio: State<'_, Arc<AudioEngine>>, smtc: State<'_, Arc<SmtcManager>>) {
    audio.stop();
    smtc.set_stopped();
}

#[tauri::command]
pub fn rust_seek_stream(seconds: f32, audio: State<'_, Arc<AudioEngine>>) {
    audio.seek(seconds);
}

#[tauri::command]
pub fn rust_set_volume(volume: f32, audio: State<'_, Arc<AudioEngine>>) {
    audio.set_volume(volume);
}

#[tauri::command]
pub fn rust_set_playback_speed(speed: f32, audio: State<'_, Arc<AudioEngine>>) {
    audio.set_speed(speed);
}

#[tauri::command]
pub fn get_audio_output_devices() -> Vec<AudioDeviceInfo> {
    AudioEngine::get_output_devices()
}

#[tauri::command]
pub fn set_audio_output_device(
    device_name: Option<String>,
    current_pos: Option<f32>,
    audio: State<'_, Arc<AudioEngine>>,
) {
    audio.set_output_device(device_name, current_pos);
}

#[tauri::command]
pub fn rust_sync_audio_position(pos: f32, audio: State<'_, Arc<AudioEngine>>) {
    audio.sync_position(pos);
}

#[tauri::command]
pub fn rust_audio_status(audio: State<'_, Arc<AudioEngine>>) -> u8 {
    audio.status()
}

#[tauri::command]
pub fn rust_set_dsp_config(config: DspConfig, audio: State<'_, Arc<AudioEngine>>) {
    audio.update_dsp(config);
}
