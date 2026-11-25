//! "Analyse tempo": beats and downbeats of the open track found by the Beat This! network,
//! turned into a tempo map (crate `beat-detect`).

use audio_engine::Pcm;
use audio_engine::resample::StreamResampler;
use beat_detect::{Hints, SAMPLE_RATE};
use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use super::{AppError, ErrorKind};
use crate::project::TempoMarker;
use crate::state::AppState;

/// Share of the progress bar taken by the conversion to mono 22050 Hz; the network is the rest.
const PREPARE_SHARE: f32 = 0.05;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TempoRequest {
    /// Markers the user set or edited: kept as they are, and their bar starts guide the rest
    pub keep: Vec<TempoMarker>,
}

/// The track as the network wants it: mono (the mean of the channels) at 22050 Hz.
fn mono_22050(pcm: &Pcm, mut progress: impl FnMut(f32)) -> Result<Vec<f32>, AppError> {
    const CHUNK: usize = 8192;
    let frames = pcm.frames() as usize;
    let mut resampler =
        StreamResampler::new(pcm.sample_rate(), SAMPLE_RATE).map_err(AppError::from)?;
    let mut mono = Vec::with_capacity(frames / 2 + CHUNK);
    let mut sink = |chunk: &[f32]| {
        mono.extend(chunk.as_chunks::<2>().0.iter().map(|[l, r]| (l + r) * 0.5));
    };
    let mut interleaved = Vec::with_capacity(CHUNK * 2);
    for start in (0..frames).step_by(CHUNK) {
        interleaved.clear();
        for i in start..(start + CHUNK).min(frames) {
            interleaved.extend_from_slice(&pcm.frame(i));
        }
        resampler
            .push(&interleaved, &mut sink)
            .map_err(AppError::from)?;
        progress(start as f32 / frames.max(1) as f32);
    }
    resampler.finish(&mut sink).map_err(AppError::from)?;
    Ok(mono)
}

/// Finds the tempo map of the open track. `on_progress` receives 0..1. The markers it returns
/// are flagged `auto`, except the kept ones.
#[tauri::command]
#[specta::specta]
pub async fn analyze_tempo(
    app: AppHandle,
    state: State<'_, AppState>,
    request: TempoRequest,
    on_progress: Channel<f32>,
) -> Result<Vec<TempoMarker>, AppError> {
    let pcm = state
        .track()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if !pcm.is_complete() {
        return Err(AppError::new(
            ErrorKind::StillLoading,
            "track still loading",
        ));
    }
    let model = crate::models::find(&app, crate::models::Model::Tempo)
        .ok_or_else(|| AppError::new(ErrorKind::TempoModelMissing, "tempo model"))?;
    let analyzer = state.tempo_analyzer(&model).map_err(AppError::internal)?;

    tauri::async_runtime::spawn_blocking(move || {
        let report = |p: f32| {
            let _ = on_progress.send(p.clamp(0.0, 1.0));
        };
        let signal = mono_22050(&pcm, |p| report(p * PREPARE_SHARE))?;
        let hints = Hints {
            downbeats: request.keep.iter().map(|m| m.time).collect(),
            locked: request
                .keep
                .iter()
                .map(|m| beat_detect::TempoMarker {
                    time: m.time,
                    bpm: m.bpm,
                    beats_per_bar: m.beats_per_bar,
                    beat_unit: m.beat_unit,
                })
                .collect(),
        };
        let analysis = analyzer
            .analyze(&signal, &hints, |p| {
                report(PREPARE_SHARE + p * (1.0 - PREPARE_SHARE));
            })
            .map_err(AppError::internal)?;
        Ok(analysis
            .markers
            .into_iter()
            .map(|m| TempoMarker {
                time: m.time,
                bpm: m.bpm,
                beats_per_bar: m.beats_per_bar,
                beat_unit: m.beat_unit,
                // A kept marker comes back exactly as it was sent
                auto: !request.keep.iter().any(|k| {
                    k.time == m.time && k.bpm == m.bpm && k.beats_per_bar == m.beats_per_bar
                }),
            })
            .collect())
    })
    .await
    .map_err(AppError::internal)?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A click track at 48 kHz stereo: 4/4 at 120 BPM with an accented first beat.
    fn click_track(seconds: f64) -> Pcm {
        let rate = 48_000;
        let frames = (seconds * f64::from(rate)) as usize;
        let mut samples = vec![0.0f32; frames * 2];
        let beat = rate as usize / 2;
        for (k, start) in (rate as usize / 4..frames).step_by(beat).enumerate() {
            let (pitch, gain) = if k % 4 == 0 {
                (1760.0, 0.9)
            } else {
                (880.0, 0.5)
            };
            for i in 0..2400.min(frames - start) {
                let t = i as f32 / rate as f32;
                let v = gain * (std::f32::consts::TAU * pitch * t).sin() * (-t * 60.0).exp();
                samples[(start + i) * 2] = v;
                samples[(start + i) * 2 + 1] = v;
            }
        }
        let mut pcm = Pcm::with_capacity(rate, frames);
        pcm.extend_from_f32(&samples);
        pcm
    }

    #[test]
    fn conversion_keeps_the_length_at_22050_hz() {
        let pcm = click_track(3.0);
        let mono = mono_22050(&pcm, |_| {}).unwrap();
        assert!(
            (mono.len() as i64 - 3 * 22_050).abs() < 64,
            "{}",
            mono.len()
        );
    }

    /// The real network on a click track (skipped where the model is not installed).
    #[test]
    fn a_click_track_is_found_at_its_tempo() {
        let model = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("models")
            .join(crate::models::Model::Tempo.file().file);
        if !model.is_file() {
            eprintln!("SKIPPED: no model at {}", model.display());
            return;
        }
        let analyzer = beat_detect::Analyzer::new(&model).unwrap();
        let signal = mono_22050(&click_track(40.0), |_| {}).unwrap();
        let analysis = analyzer
            .analyze(&signal, &Hints::default(), |_| {})
            .unwrap();
        let first = analysis.markers.first().expect("a marker");
        assert!((first.bpm - 120.0).abs() < 1.0, "{:?}", analysis.markers);
        assert_eq!(first.beats_per_bar, 4, "{:?}", analysis.markers);
        // On a click (from 0.25 s every 0.5 s). Which click opens the bar is a guess with
        // synthetic clicks (the network hears no music): the user fixes that by hand
        let beats = (first.time - 0.25) / 0.5;
        assert!(
            (beats - beats.round()).abs() * 0.5 < 0.035,
            "{:?}",
            analysis.markers
        );
    }
}
