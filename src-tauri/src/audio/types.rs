use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const ST_IDLE: u8 = 0;
pub const ST_LOADING: u8 = 1;
pub const ST_READY: u8 = 2;
pub const ST_FAILED: u8 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedStream {
    pub stream_url: String,
    pub is_hls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyHttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[allow(dead_code)]
pub enum AudioCommand {
    PlayUrl {
        url: String,
        auth_header: Option<String>,
        start_secs: Option<f32>,
        generation: u64,
    },
    StreamLoaded {
        generation: u64,
        bytes: std::sync::Arc<Vec<u8>>,
        start_secs: Option<f32>,
    },
    StreamFailed {
        generation: u64,
        error: String,
    },
    Pause,
    Resume,
    Stop,
    Seek(f32),
    SetVolume(f32),
    SetPlaybackSpeed(f32),
    SetOutputDevice {
        device_name: Option<String>,
        current_pos: Option<f32>,
    },
    SyncPosition(f32),
    UpdateDsp(crate::dsp::DspConfig),
}
