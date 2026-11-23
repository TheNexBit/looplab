//! Scores linked to tracks: copied into the library's `spartiti` folder, read back for drawing.

use std::path::PathBuf;

use audio_engine::align;
use tauri::{AppHandle, Manager, State};

use super::{AppError, ErrorKind};
use crate::db::Library;
use crate::scores::{self, ImportError, ScoreFile};
use crate::state::AppState;

impl From<ImportError> for AppError {
    fn from(err: ImportError) -> Self {
        match err {
            ImportError::Unsupported => Self::new(ErrorKind::UnsupportedFormat, "not a score file"),
            ImportError::TooLarge => Self::new(ErrorKind::ScoreTooLarge, "score file too large"),
            ImportError::Empty => Self::new(ErrorKind::EmptyFile, "empty score file"),
            ImportError::Io(err) if err.kind() == std::io::ErrorKind::NotFound => {
                Self::new(ErrorKind::FileNotFound, err)
            }
            ImportError::Io(err) => Self::new(ErrorKind::FileUnreadable, err),
        }
    }
}

/// Copies a score file into the library (once per content) and says what it is. The project
/// of the song then names it; the user's file is never changed.
#[tauri::command]
#[specta::specta]
pub async fn import_score(
    library: State<'_, Library>,
    path: PathBuf,
) -> Result<ScoreFile, AppError> {
    let dir = library.places().scores();
    tauri::async_runtime::spawn_blocking(move || scores::import(&dir, &path))
        .await
        .map_err(AppError::internal)?
        .map_err(AppError::from)
}

/// Lets the UI read one library score through the asset protocol (bytes as they are, no JSON
/// round trip) and returns its path. Only that file is opened up, never the folder.
#[tauri::command]
#[specta::specta]
pub fn prepare_score(
    app: AppHandle,
    library: State<'_, Library>,
    file: String,
) -> Result<String, AppError> {
    let path = scores::path_of(&library.places().scores(), &file)
        .ok_or_else(|| AppError::new(ErrorKind::FileNotFound, format!("not a score: {file}")))?;
    if !path.is_file() {
        return Err(AppError::new(ErrorKind::ScoreMissing, path.display()));
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(AppError::internal)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Lets the UI read a Guitar Pro file where the user keeps it (a lesson's tab beside its PDF,
/// to count its bars) and returns its path. Only that file, and only a Guitar Pro file.
#[tauri::command]
#[specta::specta]
pub fn prepare_guitar_pro(app: AppHandle, path: PathBuf) -> Result<String, AppError> {
    if scores::kind_of(&path) != Some(scores::ScoreKind::Notation) {
        return Err(AppError::new(ErrorKind::UnsupportedFormat, path.display()));
    }
    if !path.is_file() {
        return Err(AppError::new(ErrorKind::FileNotFound, path.display()));
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(AppError::internal)?;
    Ok(path.to_string_lossy().into_owned())
}

/// A note group of a bar for the automatic sync: when it starts (0..1 of the bar) and its pitches.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlignOnset {
    pub at: f64,
    pub midis: Vec<u8>,
}

/// One pass through a bar, in playback order: its length at the written tempo and its notes.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlignBar {
    pub seconds: f64,
    pub onsets: Vec<AlignOnset>,
}

/// Where a bar starts in the recording, and how sure the match is (0..1).
#[derive(Debug, Clone, Copy, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlignedBar {
    pub time: f64,
    pub confidence: f32,
}

/// Finds where every bar of the score starts in the open recording, from its notes. `first`
/// fixes bar 1 when already known. One result per bar plus the end of the last one.
#[tauri::command]
#[specta::specta]
pub async fn align_score(
    state: State<'_, AppState>,
    bars: Vec<AlignBar>,
    first: Option<f64>,
    on_progress: tauri::ipc::Channel<f32>,
) -> Result<Vec<AlignedBar>, AppError> {
    let pcm = state
        .track()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    if !pcm.is_complete() {
        return Err(AppError::new(
            ErrorKind::StillLoading,
            "track still loading",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let attacks = align::Attacks::from_pcm(&pcm, |p| {
            let _ = on_progress.send(p * 0.9);
        });
        let bars: Vec<align::BarNotes> = bars
            .into_iter()
            .map(|b| align::BarNotes {
                seconds: b.seconds,
                onsets: b
                    .onsets
                    .into_iter()
                    .map(|o| align::Onset {
                        at: o.at,
                        midis: o.midis,
                    })
                    .collect(),
            })
            .collect();
        let found = align::align(&attacks, &bars, first);
        let _ = on_progress.send(1.0);
        found
            .into_iter()
            .map(|f| AlignedBar {
                time: f.time,
                confidence: f.confidence,
            })
            .collect()
    })
    .await
    .map_err(AppError::internal)
}
