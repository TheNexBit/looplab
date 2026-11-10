//! Commands exposed to the UI. Keep them thin: they delegate to `audio-engine`.
//! Their TypeScript types are generated into `src/lib/bindings.ts` by tauri-specta.

mod app;
mod click_sounds;
mod data;
mod error;
mod export;
mod library;
mod metronome;
mod player;
mod sound;
mod spectrum;
mod tempo;
mod video;
pub mod waveform;

pub use click_sounds::load_samples as load_click_samples;
pub use error::{AppError, ErrorKind};
use std::path::PathBuf;

use tauri::AppHandle;
use tauri_specta::{Builder, collect_commands, collect_events};
pub use video::VideoWindowHidden;

use crate::media_keys::MediaKey;
use crate::midi::MidiTrigger;
use crate::playback::PlaybackStatus;

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            app::app_info,
            app::set_mini_mode,
            player::open_file,
            player::play,
            player::pause,
            player::seek,
            player::set_speed,
            player::set_track_volume,
            player::set_pitch,
            player::set_loop,
            player::set_click,
            player::set_tempo_map,
            player::set_reference_tone,
            metronome::set_metronome,
            metronome::run_metronome,
            metronome::set_sequence,
            metronome::set_voice_language,
            click_sounds::list_click_sounds,
            click_sounds::import_click_sound,
            click_sounds::delete_click_sound,
            click_sounds::set_click_samples,
            click_sounds::preview_sound,
            library::load_project,
            library::save_project,
            library::recent_files,
            library::forget_recent,
            library::default_project,
            library::practice_diary,
            library::record_practice,
            sound::set_eq,
            sound::set_channel_mode,
            sound::eq_response,
            video::prepare_video,
            video::make_video_proxy,
            video::ffmpeg_available,
            crate::media_keys::set_global_media_keys,
            data::cache_usage,
            data::clear_cache,
            data::log_ui_error,
            data::show_log,
            data::reveal_file,
            export::export_audio,
            export::cancel_export,
            spectrum::spectrum,
            tempo::analyze_tempo,
        ])
        .events(collect_events![
            PlaybackStatus,
            VideoWindowHidden,
            player::TrackLoading,
            MidiTrigger,
            MediaKey
        ])
}

/// The app's data folder, as a command error if it cannot be found.
fn data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    crate::paths::data_dir(app).map_err(AppError::internal)
}

/// The cache folder, as a command error if it cannot be found.
fn cache_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    crate::paths::cache_dir(app).map_err(AppError::internal)
}

/// Writes the TypeScript bindings used by the UI. Only called in debug builds and tests.
#[cfg(any(debug_assertions, test))]
pub fn export_bindings(builder: &Builder<tauri::Wry>) {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings.ts");
    builder
        .export(specta_typescript::Typescript::default(), path)
        .expect("failed to export TypeScript bindings");
}
