use crate::audio::types::{ProxyConfig, ProxyHttpResponse, ResolvedStream};
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use ureq::Agent;

pub fn sanitize_url_for_log(url: &str) -> String {
    let base = url.split('?').next().unwrap_or(url);
    if base.len() > 60 {
        if let Some(idx) = base.rfind('/') {
            let path_part = &base[idx..];
            let host_part = &base[..idx.min(30)];
            return format!("{host_part}...{path_part}");
        }
        format!("{}...", &base[..57])
    } else {
        base.to_string()
    }
}

pub fn create_agent(proxy: Option<&str>, timeout: Option<Duration>) -> Result<Agent, String> {
    let mut config =
        Agent::config_builder().timeout_global(Some(timeout.unwrap_or(Duration::from_secs(180))));
    if let Some(proxy_str) = proxy.filter(|s| !s.trim().is_empty()) {
        let proxy_obj = ureq::Proxy::new(proxy_str.trim())
            .map_err(|e| format!("invalid proxy url {proxy_str}: {e}"))?;
        config = config.proxy(Some(proxy_obj));
    }
    Ok(config.build().new_agent())
}

pub fn test_proxy_connection(proxy_url: &str) -> Result<String, String> {
    let agent = create_agent(Some(proxy_url), Some(Duration::from_secs(12)))?;
    let req = agent.get("http://ip-api.com/json");
    match req.call() {
        Ok(mut res) => {
            let mut bytes = Vec::new();
            if std::io::copy(&mut res.body_mut().as_reader(), &mut bytes).is_ok() {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if json.get("status").and_then(|s| s.as_str()) == Some("success") {
                        let country = json
                            .get("country")
                            .and_then(|c| c.as_str())
                            .unwrap_or("Unknown");
                        let country_code = json
                            .get("countryCode")
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        let query = json.get("query").and_then(|q| q.as_str()).unwrap_or("");
                        return Ok(format!("{country} ({country_code}) • {query}"));
                    }
                }
            }
            Ok("proxy connected successfully".to_string())
        }
        Err(e) => {
            let sc_req = agent.get("https://api-v2.soundcloud.com/");
            match sc_req.call() {
                Ok(_) => Ok("proxy connected to soundcloud".to_string()),
                Err(_) => Err(format!("proxy connection failed: {e}")),
            }
        }
    }
}

fn append_headers<T>(
    mut req: ureq::RequestBuilder<T>,
    headers: Option<&HashMap<String, String>>,
) -> ureq::RequestBuilder<T> {
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            let lower = k.to_lowercase();
            if lower != "host" && lower != "content-length" {
                req = req.header(k, v);
            }
        }
    }
    req
}

pub fn execute_http_request(
    agent: &Agent,
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<ProxyHttpResponse, String> {
    let mut res = match method.to_uppercase().as_str() {
        "POST" => {
            let req = append_headers(agent.post(url), headers.as_ref());
            if let Some(b) = body {
                req.send(b.as_bytes())
            } else {
                req.send_empty()
            }
        }
        "PUT" => {
            let req = append_headers(agent.put(url), headers.as_ref());
            if let Some(b) = body {
                req.send(b.as_bytes())
            } else {
                req.send_empty()
            }
        }
        "DELETE" => append_headers(agent.delete(url), headers.as_ref()).call(),
        _ => append_headers(agent.get(url), headers.as_ref()).call(),
    }
    .map_err(|e| format!("proxy http error: {e}"))?;

    let status = res.status().as_u16();
    let mut resp_headers = HashMap::new();
    for (name, val) in res.headers() {
        if let Ok(val_str) = val.to_str() {
            resp_headers.insert(name.as_str().to_lowercase(), val_str.to_string());
        }
    }

    let mut raw = Vec::new();
    let _ = std::io::copy(&mut res.body_mut().as_reader(), &mut raw);
    let body_str = String::from_utf8_lossy(&raw).to_string();

    Ok(ProxyHttpResponse {
        status,
        headers: resp_headers,
        body: body_str,
    })
}

pub fn proxy_http_request(
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    proxy: Option<&str>,
) -> Result<ProxyHttpResponse, String> {
    let agent = create_agent(proxy, Some(Duration::from_secs(20)))?;
    execute_http_request(&agent, url, method, headers, body)
}

fn urlencode(s: &str) -> String {
    let mut encoded = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char)
            }
            _ => encoded.push_str(&format!("%{:02X}", b)),
        }
    }
    encoded
}

pub fn resolve_stream_api(
    track_url: &str,
    client_id: &str,
    auth_header: Option<&str>,
    proxy: Option<&str>,
) -> Result<ResolvedStream, String> {
    let clean_url = track_url.split('?').next().unwrap_or(track_url);
    let resolve_url = format!(
        "https://api-v2.soundcloud.com/resolve?url={}&client_id={}",
        urlencode(clean_url),
        client_id
    );

    let agent = create_agent(proxy, Some(Duration::from_secs(15)))?;
    let mut req = agent.get(&resolve_url);
    if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }

    let mut res = req
        .call()
        .map_err(|e| format!("resolve_stream_api failed: {e}"))?;
    let mut raw_bytes = Vec::new();
    res.body_mut()
        .as_reader()
        .read_to_end(&mut raw_bytes)
        .map_err(|e| format!("read track info failed: {e}"))?;

    let track_data: serde_json::Value =
        serde_json::from_slice(&raw_bytes).map_err(|e| format!("parse track json failed: {e}"))?;
    let media = track_data
        .get("media")
        .and_then(|m| m.get("transcodings"))
        .and_then(|t| t.as_array())
        .ok_or_else(|| "no media transcodings in track info".to_string())?;

    let mut candidate_urls: Vec<(i32, String, bool, String)> = Vec::new();

    for item in media {
        let preset = item
            .get("preset")
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .to_lowercase();
        let quality = item
            .get("quality")
            .and_then(|q| q.as_str())
            .unwrap_or("")
            .to_lowercase();
        let protocol = item
            .get("format")
            .and_then(|f| f.get("protocol"))
            .and_then(|p| p.as_str())
            .unwrap_or("")
            .to_lowercase();
        let mime_type = item
            .get("format")
            .and_then(|f| f.get("mime_type"))
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_lowercase();
        let stream_url = match item.get("url").and_then(|u| u.as_str()) {
            Some(u) => u,
            None => continue,
        };

        let is_hls = protocol == "hls" || stream_url.contains("/hls");
        let is_hq = quality == "hq" || preset.contains("hq") || preset.contains("high");
        let is_opus =
            preset.contains("opus") || mime_type.contains("opus") || mime_type.contains("ogg");
        let is_aac = preset.contains("aac")
            || preset.contains("mp4")
            || mime_type.contains("mp4")
            || mime_type.contains("aac");
        let is_mp3 =
            preset.contains("mp3") || mime_type.contains("mpeg") || mime_type.contains("mp3");

        let (score, label) = match (is_hq, is_opus, is_aac, is_mp3, is_hls) {
            (true, true, _, _, false) => (10, "HQ Opus (256k direct)"),
            (true, _, true, _, false) => (12, "HQ AAC (256k direct)"),
            (true, true, _, _, true) => (15, "HQ Opus (256k HLS)"),
            (true, _, true, _, true) => (18, "HQ AAC (256k HLS)"),
            (true, _, _, _, _) => (25, "HQ Audio (direct)"),
            (false, true, _, _, false) => (30, "Opus/OGG (160k direct)"),
            (false, _, true, _, false) => (35, "AAC (160k direct)"),
            (false, true, _, _, true) => (40, "Opus/OGG (160k HLS)"),
            (false, _, true, _, true) => (45, "AAC (160k HLS)"),
            (false, _, _, true, false) => (50, "MP3 (128k direct)"),
            (false, _, _, true, true) => (60, "MP3 (128k HLS)"),
            _ => (100, "Standard Audio (fallback)"),
        };

        candidate_urls.push((score, stream_url.to_string(), is_hls, label.to_string()));
    }

    candidate_urls.sort_by_key(|k| k.0);

    let mut chosen_stream = None;
    let mut last_error = "no valid playable streams found".to_string();

    for (_, stream_auth_base, is_hls, quality_label) in candidate_urls {
        let auth_url = format!("{stream_auth_base}?client_id={client_id}&track_authorization=");
        let mut auth_req = agent.get(&auth_url);
        if let Some(auth) = auth_header {
            auth_req = auth_req.header("Authorization", auth);
        }

        let mut auth_res = match auth_req.call() {
            Ok(r) => r,
            Err(e) => {
                last_error = format!("transcoding auth failed: {e}");
                continue;
            }
        };

        let mut auth_bytes = Vec::new();
        if std::io::copy(&mut auth_res.body_mut().as_reader(), &mut auth_bytes).is_err() {
            continue;
        }

        let auth_data: serde_json::Value = match serde_json::from_slice(&auth_bytes) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let stream_url = match auth_data.get("url").and_then(|u| u.as_str()) {
            Some(u) => u.to_string(),
            None => continue,
        };

        if stream_url.contains("/cbcs/")
            || stream_url.contains("/cenc/")
            || stream_url.contains("encrypted")
        {
            last_error = "resolved stream was cbcs/cenc encrypted".to_string();
            continue;
        }

        println!("[rustcloud-audio] Stream selected: {quality_label} (HLS: {is_hls})");
        chosen_stream = Some(ResolvedStream { stream_url, is_hls });
        break;
    }

    chosen_stream.ok_or(last_error)
}

pub fn resolve_direct_media_url(
    url: &str,
    auth_header: Option<&str>,
    proxy: Option<&str>,
) -> Option<String> {
    let agent = create_agent(proxy, Some(Duration::from_secs(10))).ok()?;
    let mut req = agent.get(url);
    if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }

    if let Ok(mut res) = req.call() {
        let content_type = res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();
        if content_type.contains("application/json") {
            let mut raw_bytes = Vec::new();
            if std::io::copy(&mut res.body_mut().as_reader(), &mut raw_bytes).is_ok() {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&raw_bytes) {
                    if let Some(direct_url) = val.get("url").and_then(|u| u.as_str()) {
                        return Some(direct_url.to_string());
                    }
                }
            }
        }
    }
    None
}

pub fn is_audio_cdn_url(url: &str) -> bool {
    let cdn_domains = [
        "cf-media.sndcdn.com",
        "cf-hls-media.sndcdn.com",
        "media.sndcdn.com",
        "audio-ak-spotify-com",
        "audio4-ak-spotify-com",
        "audio-fa.scdn.co",
        "audio4-fa.scdn.co",
        "sndcdn.com",
    ];
    let lower = url.to_lowercase();
    cdn_domains.iter().any(|d| lower.contains(d))
}

pub fn fetch_hls_stream(
    playlist_url: &str,
    auth_header: Option<&str>,
    proxy_config: Option<&ProxyConfig>,
) -> Result<Vec<u8>, String> {
    let proxy = proxy_config.and_then(|p| if p.enabled { p.url.as_deref() } else { None });
    let agent = create_agent(proxy, Some(Duration::from_secs(30)))?;

    let mut req = agent.get(playlist_url);
    if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }
    let mut res = req
        .call()
        .map_err(|e| format!("hls playlist fetch error: {e}"))?;

    let mut body = String::new();
    res.body_mut()
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|e| format!("hls playlist read error: {e}"))?;

    let mut segments = Vec::new();
    let mut init_url = None;

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("#EXT-X-MAP:URI=") {
            let uri_part = trimmed
                .trim_start_matches("#EXT-X-MAP:URI=")
                .trim_matches('"');
            if uri_part.starts_with("http://") || uri_part.starts_with("https://") {
                init_url = Some(uri_part.to_string());
            } else if let Some(base_idx) = playlist_url.rfind('/') {
                init_url = Some(format!("{}/{}", &playlist_url[..base_idx], uri_part));
            }
        } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                segments.push(trimmed.to_string());
            } else if let Some(base_idx) = playlist_url.rfind('/') {
                segments.push(format!("{}/{}", &playlist_url[..base_idx], trimmed));
            }
        }
    }

    if segments.is_empty() {
        return Err("no segments found in hls playlist".to_string());
    }

    let seg_count = segments.len();
    let buffers: Arc<Mutex<Vec<Option<Vec<u8>>>>> =
        Arc::new(Mutex::new((0..seg_count).map(|_| None).collect()));
    let next_idx = Arc::new(AtomicUsize::new(0));
    let segs = Arc::new(segments);
    let worker_count = 8.min(seg_count);

    thread::scope(|s| {
        for _ in 0..worker_count {
            let next_idx = Arc::clone(&next_idx);
            let segs = Arc::clone(&segs);
            let buffers = Arc::clone(&buffers);
            s.spawn(move || {
                let agent = match create_agent(proxy, Some(Duration::from_secs(30))) {
                    Ok(a) => a,
                    Err(_) => return,
                };
                loop {
                    let idx = next_idx.fetch_add(1, Ordering::SeqCst);
                    if idx >= segs.len() {
                        break;
                    }
                    for _ in 0..3 {
                        let mut req = agent.get(&segs[idx]);
                        if let Some(a) = auth_header {
                            if segs[idx].contains("api-v2.soundcloud.com")
                                || segs[idx].contains("api.soundcloud.com")
                            {
                                req = req.header("Authorization", a);
                            }
                        }
                        if let Ok(mut res) = req.call() {
                            let mut seg_bytes = Vec::new();
                            if std::io::copy(&mut res.body_mut().as_reader(), &mut seg_bytes)
                                .is_ok()
                                && !seg_bytes.is_empty()
                            {
                                if let Ok(mut guard) = buffers.lock() {
                                    guard[idx] = Some(seg_bytes);
                                }
                                break;
                            }
                        }
                    }
                }
            });
        }
    });

    let mut final_bytes = Vec::new();
    if let Some(init) = init_url {
        let agent = create_agent(proxy, Some(Duration::from_secs(30)))?;
        let mut req = agent.get(&init);
        if let Some(a) = auth_header {
            req = req.header("Authorization", a);
        }
        if let Ok(mut res) = req.call() {
            let _ = std::io::copy(&mut res.body_mut().as_reader(), &mut final_bytes);
        }
    }

    let guard = buffers.lock().map_err(|e| e.to_string())?;
    for (i, seg) in guard.iter().enumerate() {
        match seg {
            Some(b) => final_bytes.extend_from_slice(b),
            None => return Err(format!("missing segment {i}")),
        }
    }

    Ok(final_bytes)
}

pub fn download_stream_bytes(
    stream_url: &str,
    auth_header: Option<&str>,
    proxy_config: Option<&ProxyConfig>,
) -> Result<Vec<u8>, String> {
    if stream_url.contains(".m3u8")
        || stream_url.contains("/hls")
        || stream_url.contains("playlist")
    {
        fetch_hls_stream(stream_url, auth_header, proxy_config)
    } else {
        let proxy = proxy_config.and_then(|p| if p.enabled { p.url.as_deref() } else { None });
        let agent = create_agent(proxy, Some(Duration::from_secs(60)))?;
        let mut req = agent.get(stream_url);
        if let Some(auth) = auth_header {
            req = req.header("Authorization", auth);
        }
        let mut res = req.call().map_err(|e| format!("http get error: {e}"))?;
        let mut bytes = Vec::new();
        std::io::copy(&mut res.body_mut().as_reader(), &mut bytes)
            .map_err(|e| format!("read error: {e}"))?;
        Ok(bytes)
    }
}
