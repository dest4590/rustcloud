use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, StatusDisplayType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CLIENT_ID: &str = "1556422841430179860";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackInfo {
    pub title: String,
    pub artist: String,
    #[serde(rename = "artworkUrl")]
    pub artwork_url: String,
    #[serde(rename = "trackUrl")]
    pub track_url: String,
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    pub position: u64,
    pub duration: u64,
}

struct InnerState {
    client: Option<DiscordIpcClient>,
    last_title: String,
    last_artist: String,
    last_is_playing: bool,
    last_position: u64,
}

pub struct DiscordRpcState {
    inner: Mutex<InnerState>,
    enabled: AtomicBool,
}

impl DiscordRpcState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(InnerState {
                client: None,
                last_title: String::new(),
                last_artist: String::new(),
                last_is_playing: false,
                last_position: 0,
            }),
            enabled: AtomicBool::new(true),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        if !enabled {
            self.clear();
        }
    }

    pub fn clear(&self) {
        if let Ok(mut state) = self.inner.lock() {
            if let Some(mut client) = state.client.take() {
                let _ = client.clear_activity();
                let _ = client.close();
            }
            state.last_title.clear();
            state.last_artist.clear();
            state.last_is_playing = false;
            state.last_position = 0;
        }
    }

    pub fn update_presence(&self, track: &TrackInfo) {
        if !self.enabled.load(Ordering::SeqCst) {
            return;
        }

        if track.artist.is_empty() || track.title.is_empty() {
            return;
        }

        let mut state = match self.inner.lock() {
            Ok(s) => s,
            Err(_) => return,
        };

        if state.client.is_none() {
            let mut client = DiscordIpcClient::new(CLIENT_ID);
            match client.connect() {
                Ok(()) => {
                    println!("[rustcloud] connected to discord rpc");
                    state.client = Some(client);
                }
                Err(e) => {
                    eprintln!("[rustcloud] discord rpc not connected: {:?}", e);
                    return;
                }
            }
        }

        if state.client.is_none() {
            return;
        }

        let same_track = state.last_title == track.title && state.last_artist == track.artist;
        let same_state = state.last_is_playing == track.is_playing;
        let pos_diff = if track.position >= state.last_position {
            track.position - state.last_position
        } else {
            state.last_position - track.position
        };

        if same_track && same_state && pos_diff < 2 {
            return;
        }

        state.last_title = track.title.clone();
        state.last_artist = track.artist.clone();
        state.last_is_playing = track.is_playing;
        state.last_position = track.position;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let start_time = now - (track.position as i64);

        let mut activity = Activity::new()
            .activity_type(ActivityType::Listening)
            .details(&track.title)
            .state(&track.artist);

        if track.is_playing {
            let mut timestamps = Timestamps::new().start(start_time);
            if track.duration > 0 {
                timestamps = timestamps.end(start_time + (track.duration as i64));
            }
            activity = activity.timestamps(timestamps);
        } else {
            activity = activity.status_display_type(StatusDisplayType::Details);
        }

        let mut assets = Assets::new()
            .large_text(&track.title)
            .small_text(if track.is_playing {
                "Playing"
            } else {
                "Paused"
            });

        if !track.artwork_url.is_empty() {
            assets = assets.large_image(&track.artwork_url);
        } else {
            assets = assets.large_image("soundcloud");
        }

        assets = assets.small_image(if track.is_playing { "play" } else { "pause" });
        activity = activity.assets(assets);

        if !track.track_url.is_empty() {
            activity =
                activity.buttons(vec![Button::new("Listen on SoundCloud", &track.track_url)]);
        }

        let res = match state.client.as_mut() {
            Some(client) => client.set_activity(activity),
            None => return,
        };

        if let Err(e) = res {
            eprintln!("[rustcloud] discord rpc set_activity error: {:?}", e);
            if let Some(mut client) = state.client.take() {
                let _ = client.close();
            }
        }
    }
}
