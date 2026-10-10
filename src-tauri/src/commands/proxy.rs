use crate::audio::{self, AudioEngine};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn set_proxy_config(
    enabled: bool,
    url: Option<String>,
    audio: State<'_, Arc<AudioEngine>>,
) -> Result<(), String> {
    audio.set_proxy_config(enabled, url);
    Ok(())
}

#[tauri::command]
pub async fn rust_resolve_stream(
    track_url: String,
    client_id: String,
    auth_header: Option<String>,
    audio: State<'_, Arc<AudioEngine>>,
) -> Result<audio::ResolvedStream, String> {
    let engine = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.resolve_stream(&track_url, &client_id, auth_header.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn test_proxy_connection(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || audio::test_proxy_connection(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rust_proxy_http(
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
    audio: State<'_, Arc<AudioEngine>>,
) -> Result<audio::ProxyHttpResponse, String> {
    let engine = audio.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.proxy_http(&url, method.as_deref().unwrap_or("GET"), headers, body)
    })
    .await
    .map_err(|e| e.to_string())?
}
