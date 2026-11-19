//! Scores linked to tracks: copied into the library's `spartiti` folder, read back for drawing.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use super::{AppError, ErrorKind};
use crate::db::Library;
use crate::scores::{self, ImportError, ScoreFile};

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
