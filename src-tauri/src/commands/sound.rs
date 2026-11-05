//! Equaliser and channel commands.

use audio_engine::{ChannelMode, EqSettings};
use tauri::State;

use super::AppError;
use crate::state::AppState;

/// Rate used to draw the curve; the shape is the same at any common device rate.
const CURVE_RATE: u32 = 48_000;

#[tauri::command]
#[specta::specta]
pub fn set_eq(state: State<'_, AppState>, settings: EqSettings) -> Result<(), AppError> {
    super::player::playing_engine(&state)?.set_eq(settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_channel_mode(state: State<'_, AppState>, mode: ChannelMode) -> Result<(), AppError> {
    super::player::playing_engine(&state)?.set_channel_mode(mode);
    Ok(())
}

/// Gain in dB of `settings` at each frequency, so the UI draws exactly what the engine does.
#[tauri::command]
#[specta::specta]
pub fn eq_response(settings: EqSettings, frequencies: Vec<f32>) -> Vec<f32> {
    settings.response(&frequencies, CURVE_RATE)
}
