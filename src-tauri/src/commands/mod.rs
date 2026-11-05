//! Commands exposed to the UI. Keep them thin: they delegate to `audio-engine`.
//! Their TypeScript types are generated into `src/lib/bindings.ts` by tauri-specta.

mod app;
mod error;
mod library;
mod player;
pub mod waveform;

pub use error::{AppError, ErrorKind};
use tauri_specta::{Builder, collect_commands, collect_events};

use crate::playback::PlaybackStatus;

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            app::app_info,
            player::open_file,
            player::play,
            player::pause,
            player::seek,
            player::set_speed,
            player::set_pitch,
            player::set_loop,
            library::load_project,
            library::save_project,
            library::recent_files,
            library::forget_recent,
        ])
        .events(collect_events![PlaybackStatus])
}

/// Writes the TypeScript bindings used by the UI. Only called in debug builds and tests.
#[cfg(any(debug_assertions, test))]
pub fn export_bindings(builder: &Builder<tauri::Wry>) {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings.ts");
    builder
        .export(specta_typescript::Typescript::default(), path)
        .expect("failed to export TypeScript bindings");
}
