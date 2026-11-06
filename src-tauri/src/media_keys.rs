//! Media keys (play/pause, next, previous) while Looplab is in the background.
//!
//! Off by default: while on, those keys belong to Looplab and other players stop
//! receiving them. With Looplab in front they always work, through the UI's own key handling.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_specta::Event;

use crate::commands::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MediaKeyKind {
    PlayPause,
    Next,
    Previous,
}

/// A media key pressed while another program had the focus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct MediaKey {
    pub key: MediaKeyKind,
}

const KEYS: [(Code, MediaKeyKind); 4] = [
    (Code::MediaPlayPause, MediaKeyKind::PlayPause),
    (Code::MediaStop, MediaKeyKind::PlayPause),
    (Code::MediaTrackNext, MediaKeyKind::Next),
    (Code::MediaTrackPrevious, MediaKeyKind::Previous),
];

/// Takes the media keys for Looplab system-wide, or gives them back.
#[tauri::command]
#[specta::specta]
pub fn set_global_media_keys(app: AppHandle, enabled: bool) -> Result<(), AppError> {
    let shortcuts = app.global_shortcut();
    for (code, key) in KEYS {
        let shortcut = Shortcut::new(None, code);
        let registered = shortcuts.is_registered(shortcut);
        if enabled && !registered {
            shortcuts
                .on_shortcut(shortcut, move |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = MediaKey { key }.emit(app);
                    }
                })
                .map_err(AppError::internal)?;
        } else if !enabled && registered {
            shortcuts.unregister(shortcut).map_err(AppError::internal)?;
        }
    }
    Ok(())
}
