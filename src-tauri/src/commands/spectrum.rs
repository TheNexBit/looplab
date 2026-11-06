//! Note view: levels of the piano notes around the playhead or over the loop.

use audio_engine::spectrum::Analyzer;
use audio_engine::{ChannelMode, time};
use serde::Deserialize;
use tauri::State;

use super::{AppError, ErrorKind};
use crate::state::AppState;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumRequest {
    /// Seconds; when `end` is not after `start`, one window centred on `start`
    pub start: f64,
    pub end: f64,
    pub channels: ChannelMode,
    /// Pitch shift in semitones (fractions are cents), so the keys match what is heard
    pub semitones: f32,
}

/// Levels in dB at five points per semitone from A0 (MIDI 21) to C8 (MIDI 108).
#[tauri::command]
#[specta::specta]
pub async fn spectrum(
    state: State<'_, AppState>,
    request: SpectrumRequest,
) -> Result<Vec<f32>, AppError> {
    let pcm = state
        .track()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    let rate = pcm.sample_rate();
    let frames = |seconds: f64| time::seconds_to_frames(seconds.max(0.0), rate);
    let (start, end) = (frames(request.start), frames(request.end));
    let mut analyzer = state
        .take_analyzer(rate)
        .unwrap_or_else(|| Analyzer::new(rate));
    // Off the async runtime: averaging a long loop takes a few milliseconds
    let (levels, analyzer) = tauri::async_runtime::spawn_blocking(move || {
        let levels = analyzer.analyze(&pcm, start, end, request.channels, request.semitones);
        (levels, analyzer)
    })
    .await
    .map_err(AppError::internal)?;
    state.keep_analyzer(rate, analyzer);
    Ok(levels)
}
