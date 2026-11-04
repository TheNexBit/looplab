//! Commands exposed to the UI. Keep them thin: they delegate to `audio-engine`.
//! Their TypeScript types are generated into `src/lib/bindings.ts` by tauri-specta.

mod app;

use tauri_specta::{Builder, collect_commands};

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![app::app_info])
}

/// Writes the TypeScript bindings used by the UI. Only called in debug builds and tests.
#[cfg(any(debug_assertions, test))]
pub fn export_bindings(builder: &Builder<tauri::Wry>) {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings.ts");
    builder
        .export(specta_typescript::Typescript::default(), path)
        .expect("failed to export TypeScript bindings");
}
