//! Exporting part of the track as an audio file, as it sounds in Looplab.

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use audio_engine::export::{self, ExportError};
use audio_engine::{BitDepth, ChannelMode, EqSettings, ExportSettings, StemLevels, time};
use serde::Deserialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use super::{AppError, ErrorKind};
use crate::media;
use crate::state::AppState;

/// File formats, like the render formats of a DAW. FLAC and MP3 need FFmpeg.
#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Wav16,
    Wav24,
    Flac,
    Mp3,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    /// File to write (chosen by the user)
    pub path: String,
    /// Seconds of the track
    pub start: f64,
    pub end: f64,
    pub repeats: u32,
    pub speed: f32,
    /// Semitones; fractions are cents
    pub semitones: f32,
    pub eq: EqSettings,
    pub channels: ChannelMode,
    pub format: ExportFormat,
    /// With the mix of the separated tracks or stems from files as heard (off: the song alone)
    #[serde(default)]
    pub with_stems: bool,
}

impl From<ExportError> for AppError {
    fn from(err: ExportError) -> Self {
        let kind = match err {
            ExportError::Cancelled => ErrorKind::Cancelled,
            ExportError::Empty => ErrorKind::NoTrack,
            ExportError::Io(_) => ErrorKind::ExportFailed,
        };
        Self::new(kind, err)
    }
}

/// Share of the progress bar spent rendering when FFmpeg encodes afterwards.
const RENDER_SHARE: f32 = 0.8;

/// Renders the request and writes the file. `on_progress` receives values from 0 to 1.
#[tauri::command]
#[specta::specta]
pub async fn export_audio(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ExportRequest,
    on_progress: Channel<f32>,
) -> Result<(), AppError> {
    let pcm = state
        .track()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if !pcm.is_complete() {
        return Err(AppError::new(
            ErrorKind::StillLoading,
            "track still loading",
        ));
    }
    let rate = pcm.sample_rate();
    let settings = ExportSettings {
        start: time::seconds_to_frames(request.start.max(0.0), rate),
        end: time::seconds_to_frames(request.end.max(0.0), rate),
        repeats: request.repeats,
        speed: request.speed,
        semitones: request.semitones,
        eq: request.eq,
        channels: request.channels,
    };
    let target = PathBuf::from(&request.path);
    let encoder: Option<&'static [&'static str]> = match request.format {
        ExportFormat::Wav16 | ExportFormat::Wav24 => None,
        ExportFormat::Flac => Some(&["-c:a", "flac"]),
        ExportFormat::Mp3 => Some(&["-c:a", "libmp3lame", "-b:a", "320k"]),
    };
    if encoder.is_some() && media::ffmpeg().is_none() {
        return Err(AppError::new(
            ErrorKind::FfmpegMissing,
            "export needs FFmpeg",
        ));
    }
    let depth = match request.format {
        ExportFormat::Wav16 | ExportFormat::Mp3 => BitDepth::Pcm16,
        ExportFormat::Wav24 | ExportFormat::Flac => BitDepth::Pcm24,
    };
    let cache = super::cache_dir(&app)?;
    let (stems, levels) = if request.with_stems {
        state.engine()?.mix()
    } else {
        (None, StemLevels::default())
    };
    state.export_cancel.store(false, Ordering::Relaxed);

    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        use tauri::Manager;
        let cancel = &app.state::<AppState>().export_cancel;
        let report = |fraction: f32| {
            let _ = on_progress.send(fraction);
        };
        let mix = export::Mix {
            stems: stems.as_deref(),
            levels,
        };
        let Some(args) = encoder else {
            export::export_wav(&pcm, mix, &settings, depth, &target, report, cancel)?;
            return Ok(());
        };
        // FFmpeg encodes a temporary WAV in the cache, removed afterwards
        let dir = cache.join("export");
        std::fs::create_dir_all(&dir).map_err(AppError::internal)?;
        let wav = dir.join("render.wav");
        export::export_wav(
            &pcm,
            mix,
            &settings,
            depth,
            &wav,
            |p| report(p * RENDER_SHARE),
            cancel,
        )?;
        let encoded = media::encode(&wav, &target, args, |p| {
            report(RENDER_SHARE + p * (1.0 - RENDER_SHARE));
        });
        let _ = std::fs::remove_file(&wav);
        Ok(encoded?)
    })
    .await
    .map_err(AppError::internal)?
}

/// Stops the export in progress (its file is not written).
#[tauri::command]
#[specta::specta]
pub fn cancel_export(state: State<'_, AppState>) {
    state.export_cancel.store(true, Ordering::Relaxed);
}
