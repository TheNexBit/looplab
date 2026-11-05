use std::path::{Path, PathBuf};

use audio_engine::{LoadError, LoopSettings, time};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;

use super::{AppError, ErrorKind};
use crate::state::AppState;
use crate::{media, paths};

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
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    on_progress: Channel<f32>,
) -> Result<TrackInfo, AppError> {
    let engine = state.engine()?;
    let output_rate = engine.sample_rate();
    let file = PathBuf::from(&path);
    let name = file_name(&file);
    let cache = paths::cache_dir(&app).map_err(AppError::internal)?;

    let loaded = tauri::async_runtime::spawn_blocking(move || -> Result<_, AppError> {
        let report = |fraction: f32| {
            let _ = on_progress.send(fraction);
        };
        match audio_engine::load(&file, output_rate, report) {
            // symphonia cannot read it (e.g. Opus): let FFmpeg extract the audio, then retry
            Err(LoadError::UnsupportedCodec | LoadError::UnsupportedFormat)
                if media::ffmpeg().is_some() =>
            {
                let extracted = media::extract_audio(&cache, &file, |p| report(p * 0.5))?;
                Ok(audio_engine::load(&extracted, output_rate, |p| {
                    report(0.5 + p * 0.5)
                })?)
            }
            other => Ok(other?),
        }
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
    super::library::remember(&app, &info.path);
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

/// Playback speed without changing pitch: 1 is the original speed.
#[tauri::command]
#[specta::specta]
pub fn set_speed(state: State<'_, AppState>, speed: f32) -> Result<(), AppError> {
    playing_engine(&state)?.set_speed(speed);
    Ok(())
}

/// Pitch shift in semitones; the fractional part is cents (e.g. -0.25 = 25 cents down).
#[tauri::command]
#[specta::specta]
pub fn set_pitch(state: State<'_, AppState>, semitones: f32) -> Result<(), AppError> {
    playing_engine(&state)?.set_pitch(semitones);
    Ok(())
}

/// Loop region and options, in seconds.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LoopRequest {
    pub enabled: bool,
    pub start: f64,
    pub end: f64,
    /// Played before `start` on every repetition
    pub lead_in: f64,
    /// Silence between repetitions
    pub gap: f64,
}

#[tauri::command]
#[specta::specta]
pub fn set_loop(state: State<'_, AppState>, settings: LoopRequest) -> Result<(), AppError> {
    let engine = playing_engine(&state)?;
    let frames = |seconds: f64| time::seconds_to_frames(seconds, engine.sample_rate());
    engine.set_loop(LoopSettings {
        enabled: settings.enabled,
        start: frames(settings.start),
        end: frames(settings.end),
        lead_in: frames(settings.lead_in),
        gap: frames(settings.gap),
    });
    Ok(())
}

/// Transport commands need a healthy engine; they never restart it (that would lose the track).
pub(super) fn playing_engine(
    state: &AppState,
) -> Result<std::sync::Arc<audio_engine::Engine>, AppError> {
    let engine = state
        .running_engine()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if engine.is_lost() {
        return Err(AppError::new(
            ErrorKind::AudioDevice,
            "the output device stopped",
        ));
    }
    Ok(engine)
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    )
}
