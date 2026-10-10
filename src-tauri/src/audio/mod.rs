pub mod playback;
pub mod stream;
pub mod types;

use playback::{get_device_name, open_sink_for_device, setup_player};
use rodio::cpal::traits::HostTrait;
use rodio::stream::MixerDeviceSink;
use rodio::Player;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

pub use stream::{
    is_audio_cdn_url, proxy_http_request, resolve_direct_media_url, resolve_stream_api,
    sanitize_url_for_log, test_proxy_connection,
};
use types::AudioCommand;
pub use types::{
    AudioDeviceInfo, ProxyConfig, ProxyHttpResponse, ResolvedStream, ST_FAILED, ST_IDLE,
    ST_LOADING, ST_READY,
};

pub struct AudioEngine {
    tx: Mutex<Sender<AudioCommand>>,
    generation: AtomicU64,
    status: Arc<AtomicU8>,
    dsp_config: Arc<RwLock<crate::dsp::DspConfig>>,
    dsp_version: Arc<AtomicU64>,
    selected_device: Arc<RwLock<Option<String>>>,
    proxy_config: Arc<RwLock<ProxyConfig>>,
    cached_agent: Arc<RwLock<Option<(Option<String>, ureq::Agent)>>>,
}

impl AudioEngine {
    pub fn new() -> Self {
        let (tx, rx) = channel::<AudioCommand>();
        let worker_tx = tx.clone();
        let status = Arc::new(AtomicU8::new(ST_IDLE));
        let worker_status = status.clone();

        let dsp_config = Arc::new(RwLock::new(crate::dsp::DspConfig::default()));
        let dsp_version = Arc::new(AtomicU64::new(1));
        let worker_dsp_config = dsp_config.clone();
        let worker_dsp_version = dsp_version.clone();
        let selected_device = Arc::new(RwLock::new(None));
        let proxy_config = Arc::new(RwLock::new(ProxyConfig::default()));
        let worker_proxy_config = proxy_config.clone();
        let cached_agent = Arc::new(RwLock::new(None));

        thread::spawn(move || {
            let mut sink_handle: Option<MixerDeviceSink> = open_sink_for_device(None);
            let mut current_player: Option<Player> = None;
            let mut current_bytes: Option<Arc<Vec<u8>>> = None;
            let mut current_volume: f32 = 1.0;
            let mut current_speed: f32 = 1.0;
            let mut is_paused = false;
            let mut last_seek_pos: f32 = -1.0;
            let mut last_seek_time = Instant::now();
            let mut current_generation: u64 = 0;
            let mut current_url: Option<String> = None;
            let mut pending_seek: Option<f32> = None;

            while let Ok(cmd) = rx.recv() {
                match cmd {
                    AudioCommand::PlayUrl {
                        url,
                        auth_header,
                        start_secs,
                        generation,
                    } => {
                        if url.contains("/cenc/")
                            || url.contains("/cbcs/")
                            || url.contains("encrypted")
                            || url.contains(".m4s")
                        {
                            let _ = worker_tx.send(AudioCommand::StreamFailed {
                                generation,
                                error:
                                    "stream is DRM encrypted (cenc/cbcs) or an unparseable fragment"
                                        .to_string(),
                            });
                            continue;
                        }

                        let clean_new_url = url.split('?').next().unwrap_or(&url);
                        let same_media = current_url
                            .as_deref()
                            .map(|u| u.split('?').next().unwrap_or(u))
                            == Some(clean_new_url);

                        if same_media {
                            if let Some(ref player) = current_player {
                                if let Some(secs) = start_secs {
                                    let dur = Duration::from_secs_f32(secs);
                                    let _ = player.try_seek(dur);
                                    last_seek_pos = secs;
                                    last_seek_time = Instant::now();
                                }
                                if is_paused {
                                    player.play();
                                    is_paused = false;
                                }
                                worker_status.store(ST_READY, Ordering::SeqCst);
                                continue;
                            }
                        }

                        current_generation = generation;
                        current_url = Some(url.clone());
                        pending_seek = start_secs;
                        worker_status.store(ST_LOADING, Ordering::SeqCst);

                        let short_url = sanitize_url_for_log(&url);
                        println!("[rustcloud-audio] Loading track gen#{generation} ({short_url})");

                        if let Some(player) = current_player.take() {
                            player.stop();
                        }
                        current_bytes = None;
                        is_paused = false;
                        last_seek_pos = start_secs.unwrap_or(0.0);
                        last_seek_time = Instant::now();

                        let tx_clone = worker_tx.clone();
                        let proxy_cfg = worker_proxy_config
                            .read()
                            .ok()
                            .map(|c| c.clone())
                            .unwrap_or_default();
                        thread::spawn(move || {
                            let mut download_url = url.clone();
                            if !url.contains(".m3u8") && !is_audio_cdn_url(&url) {
                                if let Some(direct) = resolve_direct_media_url(
                                    &url,
                                    auth_header.as_deref(),
                                    if proxy_cfg.enabled {
                                        proxy_cfg.url.as_deref()
                                    } else {
                                        None
                                    },
                                ) {
                                    download_url = direct;
                                }
                            }

                            match stream::download_stream_bytes(
                                &download_url,
                                auth_header.as_deref(),
                                Some(&proxy_cfg),
                            ) {
                                Ok(data) => {
                                    let _ = tx_clone.send(AudioCommand::StreamLoaded {
                                        generation,
                                        bytes: Arc::new(data),
                                        start_secs,
                                    });
                                }
                                Err(err) => {
                                    let _ = tx_clone.send(AudioCommand::StreamFailed {
                                        generation,
                                        error: err,
                                    });
                                }
                            }
                        });
                    }

                    AudioCommand::StreamLoaded {
                        generation,
                        bytes,
                        start_secs,
                    } => {
                        if generation != current_generation {
                            continue;
                        }

                        current_bytes = Some(bytes.clone());
                        let sink = match sink_handle {
                            Some(ref s) => s,
                            None => {
                                if let Some(handle) = open_sink_for_device(None) {
                                    sink_handle = Some(handle);
                                    sink_handle.as_ref().unwrap()
                                } else {
                                    worker_status.store(ST_FAILED, Ordering::SeqCst);
                                    continue;
                                }
                            }
                        };

                        let target_seek = start_secs.or(pending_seek.take());
                        match setup_player(
                            sink,
                            &bytes,
                            target_seek,
                            current_volume,
                            current_speed,
                            is_paused,
                            worker_dsp_config.clone(),
                            worker_dsp_version.clone(),
                        ) {
                            Ok(player) => {
                                last_seek_time = Instant::now();
                                if let Some(secs) = target_seek {
                                    last_seek_pos = secs;
                                }
                                current_player = Some(player);
                                worker_status.store(ST_READY, Ordering::SeqCst);
                                let mb = bytes.len() as f32 / (1024.0 * 1024.0);
                                println!("[rustcloud-audio] Playback started gen#{generation} ({mb:.2} MB buffer)");
                            }
                            Err(_) => {
                                worker_status.store(ST_FAILED, Ordering::SeqCst);
                            }
                        }
                    }

                    AudioCommand::StreamFailed { generation, error } => {
                        if generation == current_generation {
                            eprintln!("[rustcloud-audio] Stream failed gen#{generation}: {error}");
                            worker_status.store(ST_FAILED, Ordering::SeqCst);
                        }
                    }

                    AudioCommand::Pause => {
                        is_paused = true;
                        if let Some(ref player) = current_player {
                            if !player.is_paused() {
                                player.pause();
                                if last_seek_pos >= 0.0 {
                                    last_seek_pos += last_seek_time.elapsed().as_secs_f32();
                                }
                                last_seek_time = Instant::now();
                            }
                        }
                    }

                    AudioCommand::Resume => {
                        is_paused = false;
                        if let Some(ref player) = current_player {
                            if player.is_paused() {
                                player.play();
                                last_seek_time = Instant::now();
                            }
                        }
                    }

                    AudioCommand::Stop => {
                        if let Some(ref player) = current_player {
                            player.stop();
                        }
                        current_player = None;
                        current_bytes = None;
                        current_url = None;
                        is_paused = false;
                        last_seek_pos = -1.0;
                        worker_status.store(ST_IDLE, Ordering::SeqCst);
                    }

                    AudioCommand::Seek(seconds) => {
                        last_seek_pos = seconds;
                        last_seek_time = Instant::now();
                        let target_seek = if seconds > 0.05 { Some(seconds) } else { None };

                        if let Some(ref mut player) = current_player {
                            let dur = Duration::from_secs_f32(seconds);
                            if player.try_seek(dur).is_err() {
                                if let (Some(ref bytes), Some(ref sink)) =
                                    (&current_bytes, &sink_handle)
                                {
                                    if let Ok(new_player) = setup_player(
                                        sink,
                                        bytes,
                                        target_seek,
                                        current_volume,
                                        current_speed,
                                        is_paused,
                                        worker_dsp_config.clone(),
                                        worker_dsp_version.clone(),
                                    ) {
                                        player.stop();
                                        current_player = Some(new_player);
                                    }
                                }
                            }
                        }
                    }

                    AudioCommand::SetVolume(vol) => {
                        current_volume = vol;
                        if let Some(ref player) = current_player {
                            player.set_volume(vol);
                        }
                    }

                    AudioCommand::SetPlaybackSpeed(spd) => {
                        if !is_paused && last_seek_pos >= 0.0 {
                            last_seek_pos += last_seek_time.elapsed().as_secs_f32() * current_speed;
                            last_seek_time = Instant::now();
                        }
                        current_speed = spd;
                        if let Some(ref player) = current_player {
                            player.set_speed(spd);
                        }
                    }

                    AudioCommand::SetOutputDevice {
                        device_name,
                        current_pos,
                    } => {
                        if let Some(new_handle) = open_sink_for_device(device_name.as_deref()) {
                            let target_pos = current_pos.unwrap_or_else(|| {
                                if last_seek_pos >= 0.0 {
                                    let mut pos = last_seek_pos;
                                    if !is_paused {
                                        pos +=
                                            last_seek_time.elapsed().as_secs_f32() * current_speed;
                                    }
                                    pos
                                } else {
                                    0.0
                                }
                            });

                            if let Some(ref bytes) = current_bytes {
                                let target_seek = if target_pos > 0.05 {
                                    Some(target_pos)
                                } else {
                                    None
                                };
                                if let Ok(new_player) = setup_player(
                                    &new_handle,
                                    bytes,
                                    target_seek,
                                    current_volume,
                                    current_speed,
                                    is_paused,
                                    worker_dsp_config.clone(),
                                    worker_dsp_version.clone(),
                                ) {
                                    if let Some(ref p) = current_player {
                                        p.stop();
                                    }
                                    current_player = Some(new_player);
                                }
                            }
                            sink_handle = Some(new_handle);
                        }
                    }

                    AudioCommand::SyncPosition(pos) => {
                        if !is_paused && pos > 0.0 {
                            let current_calc = if last_seek_pos >= 0.0 {
                                last_seek_pos
                                    + last_seek_time.elapsed().as_secs_f32() * current_speed
                            } else {
                                0.0
                            };
                            if (pos - current_calc).abs() > 0.75 {
                                last_seek_pos = pos;
                                last_seek_time = Instant::now();
                            }
                        }
                    }

                    AudioCommand::UpdateDsp(cfg) => {
                        if let Ok(mut dsp) = worker_dsp_config.write() {
                            *dsp = cfg;
                            worker_dsp_version.fetch_add(1, Ordering::SeqCst);
                        }
                    }
                }
            }
        });

        Self {
            tx: Mutex::new(tx),
            generation: AtomicU64::new(0),
            status,
            dsp_config,
            dsp_version,
            selected_device,
            proxy_config,
            cached_agent,
        }
    }

    pub fn set_proxy_config(&self, enabled: bool, url: Option<String>) {
        if let Ok(mut cfg) = self.proxy_config.write() {
            cfg.enabled = enabled;
            cfg.url = url;
        }
        if let Ok(mut cache) = self.cached_agent.write() {
            *cache = None;
        }
    }

    pub fn proxy_http(
        &self,
        url: &str,
        method: &str,
        headers: Option<HashMap<String, String>>,
        body: Option<String>,
    ) -> Result<ProxyHttpResponse, String> {
        let proxy = {
            let cfg = self.proxy_config.read().map_err(|e| e.to_string())?;
            if cfg.enabled {
                cfg.url.clone()
            } else {
                None
            }
        };
        proxy_http_request(url, method, headers, body, proxy.as_deref())
    }

    pub fn resolve_stream(
        &self,
        track_url: &str,
        client_id: &str,
        auth_header: Option<&str>,
    ) -> Result<ResolvedStream, String> {
        let proxy = {
            if let Ok(cfg) = self.proxy_config.read() {
                if cfg.enabled {
                    cfg.url.clone()
                } else {
                    None
                }
            } else {
                None
            }
        };
        resolve_stream_api(track_url, client_id, auth_header, proxy.as_deref())
    }

    pub fn status(&self) -> u8 {
        self.status.load(Ordering::SeqCst)
    }

    pub fn play_url(
        &self,
        url: String,
        auth_header: Option<String>,
        start_secs: Option<f32>,
    ) -> Result<(), String> {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(tx) = self.tx.lock() {
            tx.send(AudioCommand::PlayUrl {
                url,
                auth_header,
                start_secs,
                generation: gen,
            })
            .map_err(|e| e.to_string())
        } else {
            Err("audio channel locked".to_string())
        }
    }

    pub fn pause(&self) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::Pause);
        }
    }

    pub fn resume(&self) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::Resume);
        }
    }

    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::Stop);
        }
    }

    pub fn seek(&self, seconds: f32) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::Seek(seconds));
        }
    }

    pub fn set_volume(&self, volume: f32) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::SetVolume(volume));
        }
    }

    pub fn update_dsp(&self, config: crate::dsp::DspConfig) {
        if let Ok(mut lock) = self.dsp_config.write() {
            *lock = config.clone();
            self.dsp_version.fetch_add(1, Ordering::SeqCst);
        }
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::UpdateDsp(config));
        }
    }

    pub fn set_speed(&self, speed: f32) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::SetPlaybackSpeed(speed));
        }
    }

    pub fn set_output_device(&self, device_name: Option<String>, current_pos: Option<f32>) {
        if let Ok(mut lock) = self.selected_device.write() {
            *lock = device_name.clone();
        }
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::SetOutputDevice {
                device_name,
                current_pos,
            });
        }
    }

    pub fn sync_position(&self, pos: f32) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(AudioCommand::SyncPosition(pos));
        }
    }

    pub fn get_output_devices() -> Vec<AudioDeviceInfo> {
        let host = rodio::cpal::default_host();
        let default_name = host.default_output_device().map(|d| get_device_name(&d));
        let mut result = Vec::new();

        if let Ok(devices) = host.output_devices() {
            for dev in devices {
                let name = get_device_name(&dev);
                let is_default = default_name.as_ref() == Some(&name);
                result.push(AudioDeviceInfo {
                    id: name.clone(),
                    name,
                    is_default,
                });
            }
        }
        result
    }

    pub fn start_default_output_monitor(self: &Arc<Self>) {
        let engine = Arc::clone(self);
        thread::spawn(move || {
            let mut last_default = String::new();
            loop {
                thread::sleep(Duration::from_millis(1500));
                let selected_is_none = engine
                    .selected_device
                    .read()
                    .map(|d| d.is_none())
                    .unwrap_or(false);
                if !selected_is_none {
                    continue;
                }

                let host = rodio::cpal::default_host();
                if let Some(dev) = host.default_output_device() {
                    let name = get_device_name(&dev);
                    if !last_default.is_empty() && name != last_default {
                        if let Ok(tx) = engine.tx.lock() {
                            let _ = tx.send(AudioCommand::SetOutputDevice {
                                device_name: None,
                                current_pos: None,
                            });
                        }
                    }
                    last_default = name;
                }
            }
        });
    }
}
