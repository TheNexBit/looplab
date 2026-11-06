use std::path::{Path, PathBuf};

use audio_engine::{ClickSettings, LoadError, LoopSettings, time};
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
    /// Seconds; while the track still loads, the length the file announces
    pub duration: f64,
    /// Rate of the original file
    pub source_sample_rate: u32,
    /// False while the rest of the track is loading in the background (see `TrackLoading`)
    pub complete: bool,
    /// Seconds already playable
    pub ready: f64,
}

/// Background loading of the open track: a few times a second, and once when it is done.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct TrackLoading {
    pub path: String,
    /// Seconds already playable
    pub ready: f64,
    pub done: bool,
    /// Exact length once done
    pub duration: f64,
    /// Set when loading stopped early: what was loaded stays playable
    pub error: Option<ErrorKind>,
}

/// Opens a file and makes it the current track (paused at the start), like Reaper: it returns
/// after the first seconds, the rest loads in the background (`TrackLoading` events), and the
/// decoded audio stays in the cache so the next opening is instant.
/// `on_progress` receives values from 0 to 1 while FFmpeg converts files symphonia cannot read.
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
    let cancel = state.new_load();

    let events_app = app.clone();
    let events_path = path.clone();
    let on_event = move |event: audio_engine::LoadEvent| {
        let seconds = |frames: u64| time::frames_to_seconds(frames, output_rate);
        let loading = match event {
            audio_engine::LoadEvent::Progress { ready_frames } => TrackLoading {
                path: events_path.clone(),
                ready: seconds(ready_frames),
                done: false,
                duration: 0.0,
                error: None,
            },
            audio_engine::LoadEvent::Done { frames, error } => TrackLoading {
                path: events_path.clone(),
                ready: seconds(frames),
                done: true,
                duration: seconds(frames),
                error: error.map(|err| AppError::from(err).kind),
            },
        };
        let _ = tauri_specta::Event::emit(&loading, &events_app);
    };

    let opened = tauri::async_runtime::spawn_blocking(move || -> Result<_, AppError> {
        let stem = |source: &Path| -> Result<PathBuf, AppError> {
            let stem = media::cache_stem(&cache, crate::cache::CacheKind::Decoded.folder(), source)
                .map_err(AppError::internal)?;
            let stem = stem.with_file_name(format!(
                "{}-{output_rate}",
                stem.file_name()
                    .map(|n| n.to_string_lossy())
                    .unwrap_or_default()
            ));
            // Room for this track (estimated from the file size: decoded audio is never
            // smaller than ten times an mp3), then mark its files as just used
            let size = std::fs::metadata(source).map_or(0, |m| m.len());
            crate::cache::trim_decoded(&cache, size.saturating_mul(10));
            let (audio, peaks) = audio_engine::load::cache_files(&stem);
            crate::cache::touch(&audio);
            crate::cache::touch(&peaks);
            Ok(stem)
        };
        let cache_stem = stem(&file)?;
        match audio_engine::open(
            &file,
            output_rate,
            &cache_stem,
            cancel.clone(),
            on_event.clone(),
        ) {
            // symphonia cannot read it (e.g. Opus): let FFmpeg extract the audio, then retry
            Err(LoadError::UnsupportedCodec | LoadError::UnsupportedFormat)
                if media::ffmpeg().is_some() =>
            {
                let extracted = media::extract_audio(&cache, &file, |p| {
                    let _ = on_progress.send(p);
                })?;
                Ok(audio_engine::open(
                    &extracted,
                    output_rate,
                    &cache_stem,
                    cancel,
                    on_event,
                )?)
            }
            other => Ok(other?),
        }
    })
    .await
    .map_err(AppError::internal)??;

    let info = TrackInfo {
        path,
        name,
        duration: opened.pcm.duration_seconds(),
        source_sample_rate: opened.source_sample_rate,
        complete: opened.pcm.is_complete(),
        ready: time::frames_to_seconds(opened.pcm.ready_frames(), output_rate),
    };
    state.set_peaks(opened.peaks);
    state.set_track(std::sync::Arc::clone(&opened.pcm));
    engine.set_track(opened.pcm);
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

/// Tempo, metronome and count-in, in the units of the UI.
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClickRequest {
    /// Quarter notes per minute of the track at its original speed (as in DAWs); 0 when unknown
    pub bpm: f64,
    /// Note value of one beat: 4 for x/4 meters, 8 for x/8…
    pub beat_unit: u32,
    /// Seconds: a moment that falls on the first beat of a bar
    pub anchor: f64,
    /// Beats counted in before playback and before every loop repetition
    pub count_in: u32,
    /// Click on every beat while playing
    pub metronome: bool,
    /// Beats in a bar (the first is accented)
    pub beats_per_bar: u32,
    /// 0..1
    pub volume: f32,
}

#[tauri::command]
#[specta::specta]
pub fn set_click(state: State<'_, AppState>, settings: ClickRequest) -> Result<(), AppError> {
    let engine = playing_engine(&state)?;
    let rate = engine.sample_rate();
    let beat = if settings.bpm > 0.0 {
        let quarters_per_beat = 4.0 / f64::from(settings.beat_unit.max(1));
        time::seconds_to_frames(60.0 / settings.bpm * quarters_per_beat, rate)
    } else {
        0
    };
    engine.set_click(ClickSettings {
        beat,
        anchor: time::seconds_to_frames(settings.anchor.max(0.0), rate),
        count_in: settings.count_in,
        metronome: settings.metronome,
        beats_per_bar: settings.beats_per_bar,
        volume: settings.volume.clamp(0.0, 1.0),
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
