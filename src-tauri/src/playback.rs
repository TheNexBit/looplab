//! Low-frequency playback status sent to the UI.
//!
//! The UI animates the playhead itself at 60 fps; these updates only correct it,
//! so a few per second are enough and the IPC channel stays quiet.

use std::time::Duration;

use audio_engine::time;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::state::AppState;

const INTERVAL: Duration = Duration::from_millis(66);

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStatus {
    /// Seconds
    pub position: f64,
    pub playing: bool,
    /// The output device failed: the track must be reopened
    pub device_lost: bool,
}

/// Emits the status while playing, and once after every change.
pub fn spawn_status_loop(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = None;
        loop {
            std::thread::sleep(INTERVAL);
            let Some(engine) = app.state::<AppState>().running_engine() else { continue };
            let status = engine.status();
            let current = PlaybackStatus {
                position: time::frames_to_seconds(status.position_frames, engine.sample_rate()),
                playing: status.playing,
                device_lost: engine.is_lost(),
            };
            if current.playing || last != Some(current) {
                let _ = current.emit(&app);
                last = Some(current);
            }
        }
    });
}
