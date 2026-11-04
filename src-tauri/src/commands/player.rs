use std::path::{Path, PathBuf};

use audio_engine::time;
use serde::Serialize;
use tauri::State;
use tauri::ipc::Channel;

use super::{AppError, ErrorKind};
use crate::state::AppState;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub path: String,
    pub name: String,
    /// Seconds
    pub duration: f64,
    /// Rate of the original file
    pub source_sample_rate: u32,
}

/// Decodes a file in the background and makes it the current track (paused at the start).
/// `on_progress` receives values from 0 to 1.
#[tauri::command]
#[specta::specta]
pub async fn open_file(
    state: State<'_, AppState>,
    path: String,
    on_progress: Channel<f32>,
) -> Result<TrackInfo, AppError> {
    let engine = state.engine()?;
    let output_rate = engine.sample_rate();
    let file = PathBuf::from(&path);
    let name = file_name(&file);

    let loaded = tauri::async_runtime::spawn_blocking(move || {
        audio_engine::load(&file, output_rate, |fraction| {
            let _ = on_progress.send(fraction);
        })
    })
    .await
    .map_err(AppError::internal)??;

    let info = TrackInfo {
        path,
        name,
        duration: loaded.pcm.duration_seconds(),
        source_sample_rate: loaded.source_sample_rate,
    };
    state.set_peaks(loaded.peaks.to_bytes());
    engine.set_track(loaded.pcm);
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub fn play(state: State<'_, AppState>) -> Result<(), AppError> {
    playing_engine(&state)?.play();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn pause(state: State<'_, AppState>) -> Result<(), AppError> {
    playing_engine(&state)?.pause();
    Ok(())
}

/// Moves the playhead to `seconds` (clamped to the track length by the engine).
#[tauri::command]
#[specta::specta]
pub fn seek(state: State<'_, AppState>, seconds: f64) -> Result<(), AppError> {
    let engine = playing_engine(&state)?;
    engine.seek(time::seconds_to_frames(seconds, engine.sample_rate()));
    Ok(())
}

/// Transport commands need a healthy engine; they never restart it (that would lose the track).
fn playing_engine(state: &AppState) -> Result<std::sync::Arc<audio_engine::Engine>, AppError> {
    let engine = state
        .running_engine()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if engine.is_lost() {
        return Err(AppError::new(ErrorKind::AudioDevice, "the output device stopped"));
    }
    Ok(engine)
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(|| path.display().to_string(), |n| n.to_string_lossy().into_owned())
}
