use crate::dsp::{DspConfig, DspFilterSource};
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::cpal::Device;
use rodio::stream::{DeviceSinkBuilder, MixerDeviceSink};
use rodio::{Decoder, Player, Source};
use std::io::Cursor;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, RwLock};
use std::time::Duration;

pub fn get_device_name(dev: &Device) -> String {
    if let Ok(desc) = dev.description() {
        return desc.name().to_string();
    }
    #[allow(deprecated)]
    dev.name()
        .unwrap_or_else(|_| "Unknown Output Device".to_string())
}

pub fn open_sink_for_device(device_name: Option<&str>) -> Option<MixerDeviceSink> {
    let host = rodio::cpal::default_host();
    match device_name {
        Some(name) => {
            let found_dev = host
                .output_devices()
                .ok()
                .and_then(|mut devs| devs.find(|d| get_device_name(d) == name));
            if let Some(dev) = found_dev {
                match DeviceSinkBuilder::from_device(dev) {
                    Ok(builder) => builder.open_sink_or_fallback().ok(),
                    Err(e) => {
                        eprintln!("[rustcloud-audio] open device error: {e}");
                        DeviceSinkBuilder::open_default_sink().ok()
                    }
                }
            } else {
                DeviceSinkBuilder::open_default_sink().ok()
            }
        }
        None => DeviceSinkBuilder::open_default_sink().ok(),
    }
}

pub fn create_decoder_and_seek(
    bytes: &[u8],
    start_secs: Option<f32>,
) -> Result<Decoder<Cursor<Vec<u8>>>, String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut decoder = Decoder::new(cursor).map_err(|e| format!("decode error: {e}"))?;
    if let Some(secs) = start_secs {
        if secs > 0.05 {
            let dur = Duration::from_secs_f32(secs);
            let _ = decoder.try_seek(dur);
        }
    }
    Ok(decoder)
}

pub fn setup_player(
    sink: &MixerDeviceSink,
    bytes: &[u8],
    target_seek: Option<f32>,
    volume: f32,
    speed: f32,
    is_paused: bool,
    dsp_config: Arc<RwLock<DspConfig>>,
    dsp_version: Arc<AtomicU64>,
) -> Result<Player, String> {
    let decoder = create_decoder_and_seek(bytes, target_seek)?;
    let player = Player::connect_new(&sink.mixer());
    let dsp_source = DspFilterSource::new(decoder, dsp_config, dsp_version);
    player.append(dsp_source);
    player.set_volume(volume);
    player.set_speed(speed);
    if is_paused {
        player.pause();
    } else {
        player.play();
    }
    Ok(player)
}
