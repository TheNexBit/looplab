//! Waveform data travels as raw bytes (an ArrayBuffer in the UI), not JSON.
//!
//! tauri-specta cannot describe a raw `Response`, so this command is registered
//! with Tauri's own handler (see `main.rs`) and wrapped by hand in
//! `src/features/waveform/peaks.ts`. Keep the name in sync with `GET_PEAKS` there.

use tauri::State;
use tauri::ipc::Response;

use super::{AppError, ErrorKind};
use crate::state::AppState;

pub const GET_PEAKS: &str = "get_peaks";
/// Waveform of one lane of the stems from files (`file_stems.rs`); `GET_STEM_PEAKS` in peaks.ts.
pub const GET_STEM_PEAKS: &str = "get_stem_peaks";
/// The commands that answer raw bytes, routed to `handler` by `main.rs`.
pub const BINARY: &[&str] = &[GET_PEAKS, GET_STEM_PEAKS];

/// Tauri handler for the binary commands (this module's and the stem lanes').
pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![get_peaks, super::file_stems::get_stem_peaks]
}

#[tauri::command]
pub fn get_peaks(state: State<'_, AppState>) -> Result<Response, AppError> {
    let bytes = state
        .peaks_bytes()
        .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "no track loaded"))?;
    Ok(Response::new(bytes))
}
