//! Commands exposed to the UI. Keep them thin: they delegate to `audio-engine`.
//! Their TypeScript types are generated into `src/lib/bindings.ts` by tauri-specta.

mod app;
mod archive;
mod click_sounds;
mod data;
mod error;
mod exercise;
mod export;
pub(crate) mod file_stems;
mod lessons;
mod library;
mod metronome;
mod player;
mod scores;
mod setlists;
mod sound;
mod spectrum;
mod stems;
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
            player::set_score_notes,
            player::set_synth_level,
            metronome::set_metronome,
            metronome::run_metronome,
            metronome::set_sequence,
            metronome::set_voice_language,
            click_sounds::list_click_sounds,
            click_sounds::import_click_sound,
            click_sounds::delete_click_sound,
            click_sounds::set_click_samples,
            click_sounds::preview_sound,
            scores::align_score,
            scores::import_score,
            scores::prepare_score,
            scores::prepare_guitar_pro,
            library::load_project,
            library::save_project,
            library::recent_files,
            library::forget_recent,
            library::clear_recent,
            library::default_project,
            library::practice_diary,
            library::record_practice,
            library::load_prefs,
            library::set_pref,
            library::import_prefs,
            archive::archive_info,
            archive::backup_now,
            archive::restore_backup,
            archive::set_backup_mirror,
            archive::set_stems_folder,
            archive::show_archive_folder,
            sound::set_eq,
            sound::set_channel_mode,
            sound::eq_response,
            video::prepare_video,
            video::make_video_proxy,
            video::has_picture,
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
            stems::load_stems,
            stems::separate_stems,
            stems::cancel_stems,
            stems::export_stems,
            stems::set_stem_levels,
            file_stems::open_stem_files,
            file_stems::close_stem_files,
            file_stems::media_in_folder,
            exercise::open_exercise,
            exercise::save_exercise,
            exercise::align_exercise,
            lessons::lesson_library,
            lessons::scan_lessons,
            lessons::add_lesson_root,
            lessons::remove_lesson_root,
            lessons::set_lesson_choice,
            lessons::set_lesson_progress,
            lessons::lesson_of_track,
            lessons::score_beside,
            lessons::forget_score_beside,
            lessons::open_document,
            setlists::setlist_library,
            setlists::save_setlist,
            setlists::delete_setlist,
        ])
        .events(collect_events![
            PlaybackStatus,
            VideoWindowHidden,
            player::TrackLoading,
            MidiTrigger,
            MediaKey
        ])
        // The media files the app opens: one list, read by the UI too
        .constant("AUDIO_FORMATS", crate::formats::AUDIO)
        .constant("VIDEO_FORMATS", crate::formats::VIDEO)
        // The keys a setlist song can be marked in
        .constant("SETLIST_KEYS", crate::setlist::KEYS)
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
