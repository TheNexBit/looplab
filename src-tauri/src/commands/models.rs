//! Downloading the models of "Analyse tempo" and "Separate instruments" (`crate::models`).

use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use super::{AppError, ErrorKind};
use crate::models::{self, DownloadError, Model};
use crate::state::AppState;

/// Whether a model is ready, and how big its download is.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub installed: bool,
    pub bytes: f64,
}

impl From<DownloadError> for AppError {
    fn from(err: DownloadError) -> Self {
        let kind = match err {
            DownloadError::Cancelled => ErrorKind::Cancelled,
            DownloadError::Network(_) => ErrorKind::ModelDownloadFailed,
            DownloadError::Damaged => ErrorKind::ModelDamaged,
            DownloadError::Io(_) => ErrorKind::ModelDownloadFailed,
        };
        Self::new(kind, err)
    }
}

#[tauri::command]
#[specta::specta]
pub fn model_info(app: AppHandle, model: Model) -> ModelInfo {
    ModelInfo {
        installed: models::find(&app, model).is_some(),
        bytes: model.file().bytes as f64,
    }
}

/// Downloads `model` once, checked against its SHA-256; `on_progress` receives 0..1.
#[tauri::command]
#[specta::specta]
pub async fn download_model(
    app: AppHandle,
    model: Model,
    on_progress: Channel<f32>,
) -> Result<(), AppError> {
    if models::find(&app, model).is_some() {
        return Ok(());
    }
    let dir = models::dir(&app).map_err(AppError::internal)?;
    let state = app.state::<AppState>();
    state.model_cancel.store(false, Ordering::Relaxed);
    models::download(&dir, model, &state.model_cancel, |fraction| {
        let _ = on_progress.send(fraction);
    })
    .await?;
    Ok(())
}

/// Stops the model download in progress (nothing is kept).
#[tauri::command]
#[specta::specta]
pub fn cancel_model_download(state: State<'_, AppState>) {
    state.model_cancel.store(true, Ordering::Relaxed);
}
