//! Video files: letting the WebView read them, and proxies for codecs it cannot play.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

use super::AppError;
use crate::media;

/// The detached video window was closed by the user (it is only hidden): dock the video again.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct VideoWindowHidden;

/// Lets the UI load this one file through the asset protocol (the scope starts empty).
fn allow(app: &AppHandle, path: &Path) -> Result<(), AppError> {
    app.asset_protocol_scope()
        .allow_file(path)
        .map_err(AppError::internal)
}

/// Makes a video file readable by the video panel.
#[tauri::command]
#[specta::specta]
pub fn prepare_video(app: AppHandle, path: String) -> Result<(), AppError> {
    allow(&app, Path::new(&path))
}

/// Builds (or reuses) a silent H.264 copy WebView2 can play, and returns its path.
/// `on_progress` receives values from 0 to 1.
#[tauri::command]
#[specta::specta]
pub async fn make_video_proxy(
    app: AppHandle,
    path: String,
    on_progress: Channel<f32>,
) -> Result<String, AppError> {
    let cache = super::cache_dir(&app)?;
    let source = PathBuf::from(path);
    let proxy = tauri::async_runtime::spawn_blocking(move || {
        media::make_proxy(&cache, &source, |fraction| {
            let _ = on_progress.send(fraction);
        })
    })
    .await
    .map_err(AppError::internal)??;
    allow(&app, &proxy)?;
    Ok(proxy.to_string_lossy().into_owned())
}

/// Whether FFmpeg is installed (Opus audio and video proxies need it).
#[tauri::command]
#[specta::specta]
pub fn ffmpeg_available() -> bool {
    media::ffmpeg().is_some()
}
