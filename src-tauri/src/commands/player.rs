use std::path::{Path, PathBuf};

use audio_engine::{
    BarPattern, ClickSettings, LoadError, LoopSettings, Note, SynthSettings, TempoMap,
    TempoSegment, ToneSettings, time,
};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::Channel;

use super::metronome::SoundsRequest;
use super::{AppError, ErrorKind};
use crate::media;
use crate::project::TempoMarker;
use crate::state::AppState;

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

/// Where the decoded audio of `source` is cached at `rate`: one entry per file and output rate,
/// "<hash>-48000.pcm" and "<hash>-48000.peaks". Makes room for it (estimated from the file
/// size: decoded audio is never smaller than ten times an mp3) and marks its files as just used.
pub(super) fn decoded_cache_stem(
    cache: &Path,
    source: &Path,
    rate: u32,
) -> Result<PathBuf, AppError> {
    let folder = crate::cache::CacheKind::Decoded.folder();
    let stem = media::cache_path(cache, folder, source, &format!("-{rate}"))
        .map_err(AppError::internal)?;
    let size = std::fs::metadata(source).map_or(0, |m| m.len());
    crate::cache::trim_decoded(cache, size.saturating_mul(10));
    let (audio, peaks) = audio_engine::load::cache_files(&stem);
    crate::cache::touch(&audio);
    crate::cache::touch(&peaks);
    Ok(stem)
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
    let cache = super::cache_dir(&app)?;
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
        let cache_stem = decoded_cache_stem(&cache, &file, output_rate)?;
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
    super::library::remember(&app, &info.path, info.duration);
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

/// Level of the track alone, 0..1: the clicks, the metronome and the reference note keep theirs.
#[tauri::command]
#[specta::specta]
pub fn set_track_volume(state: State<'_, AppState>, volume: f32) -> Result<(), AppError> {
    playing_engine(&state)?.set_track_volume(volume);
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

/// Metronome and count-in over the track, in the units of the UI. Where the beats fall comes
/// from the tempo map (`set_tempo_map`).
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClickRequest {
    /// Bars counted in before playback and before every loop repetition
    pub count_in: u32,
    /// Click on every beat while playing
    pub metronome: bool,
    /// 0..1
    pub volume: f32,
    pub sounds: SoundsRequest,
}

#[tauri::command]
#[specta::specta]
pub fn set_click(state: State<'_, AppState>, settings: ClickRequest) -> Result<(), AppError> {
    let engine = playing_engine(&state)?;
    engine.set_click(ClickSettings {
        count_in: settings.count_in,
        metronome: settings.metronome,
        volume: settings.volume.clamp(0.0, 1.0),
        sounds: settings.sounds.sounds(),
    });
    Ok(())
}

/// The tempo map of the open track: the clicks over it and the count-ins follow its tempo and
/// meter changes. Each marker rules until the next one; an empty map means no tempo (no clicks).
#[tauri::command]
#[specta::specta]
pub fn set_tempo_map(
    state: State<'_, AppState>,
    markers: Vec<TempoMarker>,
) -> Result<(), AppError> {
    let engine = playing_engine(&state)?;
    engine.set_tempo_map(tempo_map(&markers, engine.sample_rate()));
    Ok(())
}

/// The markers in the engine's terms: frames, and frames per beat (a quarter in x/4, an eighth
/// in x/8), kept fractional so a long stretch never drifts.
fn tempo_map(markers: &[TempoMarker], rate: u32) -> TempoMap {
    TempoMap::new(
        markers
            .iter()
            .filter(|m| m.bpm > 0.0 && m.beat_unit > 0 && m.beats_per_bar > 0)
            .map(|m| TempoSegment {
                start: time::seconds_to_frames(m.time.max(0.0), rate),
                beat_frames: 60.0 / m.bpm * 4.0 / f64::from(m.beat_unit) * f64::from(rate),
                pattern: BarPattern::regular(m.beats_per_bar),
            })
            .collect(),
    )
}

/// Reference note to tune by ear: `hz` 0 stops it. Heard over the track and while paused, and
/// before any track is open (it starts the audio device like `preview_sound`).
#[tauri::command]
#[specta::specta]
pub fn set_reference_tone(state: State<'_, AppState>, hz: f32, level: f32) -> Result<(), AppError> {
    state.engine()?.set_tone(ToneSettings { hz, level });
    Ok(())
}

/// A note of the score for the synth over the track, in seconds of the recording.
#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScoreNote {
    pub time: f64,
    /// Seconds it lasts at speed 1
    pub length: f64,
    /// MIDI note number, transposition already applied (fractional: cents)
    pub midi: f32,
    /// 0..1
    pub velocity: f32,
}

/// The notes the synth plays over the track (replacing the ones before; empty: none).
#[tauri::command]
#[specta::specta]
pub fn set_score_notes(state: State<'_, AppState>, notes: Vec<ScoreNote>) -> Result<(), AppError> {
    let Some(engine) = state.running_engine() else {
        return Ok(());
    };
    let rate = engine.sample_rate();
    engine.set_notes(
        notes
            .into_iter()
            .filter(|n| {
                n.time.is_finite() && n.time >= 0.0 && n.length.is_finite() && n.midi.is_finite()
            })
            .map(|n| Note {
                start: time::seconds_to_frames(n.time, rate),
                length: time::seconds_to_frames(n.length.max(0.01), rate),
                midi: n.midi.clamp(0.0, 127.0),
                velocity: n.velocity.clamp(0.0, 1.0),
            })
            .collect(),
    );
    Ok(())
}

/// Level of the synth that plays the score over the track (0 = off).
#[tauri::command]
#[specta::specta]
pub fn set_synth_level(state: State<'_, AppState>, level: f32) -> Result<(), AppError> {
    if let Some(engine) = state.running_engine() {
        engine.set_synth(SynthSettings { level });
    }
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

#[cfg(test)]
mod tempo_tests {
    use super::*;

    #[test]
    fn markers_become_segments_in_frames() {
        let markers = [
            TempoMarker {
                time: 2.0,
                bpm: 120.0,
                beats_per_bar: 7,
                beat_unit: 8,
                auto: false,
            },
            TempoMarker {
                time: 0.0,
                bpm: 60.0,
                beats_per_bar: 4,
                beat_unit: 4,
                auto: false,
            },
            TempoMarker {
                time: 5.0,
                bpm: 0.0,
                beats_per_bar: 4,
                beat_unit: 4,
                auto: false,
            },
        ];
        let map = tempo_map(&markers, 48_000);
        let segments = map.segments();
        assert_eq!(segments.len(), 2, "sorted, the one without a tempo dropped");
        assert_eq!(segments[0].start, 0);
        assert_eq!(segments[0].beat_frames, 48_000.0, "a quarter at 60");
        assert_eq!(segments[1].start, 96_000);
        assert_eq!(
            segments[1].beat_frames, 12_000.0,
            "an eighth at 120 quarters"
        );
        assert_eq!(segments[1].pattern.pulses(), 7);
    }
}
