//! The app's own files: cache of conversions and the error log.

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

use super::AppError;
use crate::cache::{self, CacheUsage};
use crate::{log, paths};

/// Space taken by each kind of conversion in the cache.
#[tauri::command]
#[specta::specta]
pub fn cache_usage(app: AppHandle) -> Result<Vec<CacheUsage>, AppError> {
    let dir = paths::cache_dir(&app).map_err(AppError::internal)?;
    Ok(cache::usage(&dir))
}

/// Empties the cache except the files in `keep` (the video on screen); returns the bytes freed.
#[tauri::command]
#[specta::specta]
pub async fn clear_cache(app: AppHandle, keep: Vec<String>) -> Result<f64, AppError> {
    let dir = paths::cache_dir(&app).map_err(AppError::internal)?;
    let keep: Vec<PathBuf> = keep.into_iter().map(PathBuf::from).collect();
    let freed = tauri::async_runtime::spawn_blocking(move || cache::clear(&dir, &keep))
        .await
        .map_err(AppError::internal)?;
    Ok(freed as f64)
}

/// Writes an error of the UI (uncaught exceptions, failed promises) into the log.
#[tauri::command]
#[specta::specta]
pub fn log_ui_error(source: String, message: String) {
    log::error(&format!("ui:{source}"), &message);
}

/// Opens Explorer on `path`: the file selected in its folder, or the folder itself.
fn explore(path: &Path, select: bool) -> Result<(), AppError> {
    let mut command = Command::new("explorer");
    if select {
        // Explorer wants the quotes around the path only, which normal argument quoting breaks
        #[cfg(windows)]
        std::os::windows::process::CommandExt::raw_arg(
            &mut command,
            format!("/select,\"{}\"", path.display()),
        );
        #[cfg(not(windows))]
        command.arg(path);
    } else {
        command.arg(path);
    }
    // Explorer's exit code means nothing (it is 1 even on success): only a failed start counts
    command.spawn().map_err(AppError::internal)?;
    Ok(())
}

/// Opens the log folder in Explorer, with the log file selected.
#[tauri::command]
#[specta::specta]
pub fn show_log(app: AppHandle) -> Result<(), AppError> {
    if let Some(file) = log::file().filter(|file| file.is_file()) {
        return explore(file, true);
    }
    let data = paths::data_dir(&app).map_err(AppError::internal)?;
    let dir = log::dir(&data);
    std::fs::create_dir_all(&dir).map_err(AppError::internal)?;
    explore(&dir, false)
}

/// Shows a file (e.g. one just exported) selected in its Explorer folder.
#[tauri::command]
#[specta::specta]
pub fn reveal_file(path: String) -> Result<(), AppError> {
    explore(Path::new(&path), true)
}
