//! Imported click sounds, like MetroFlow's sound slots: any audio file becomes a click (from
//! its first sound, at most two seconds) kept in the app's data folder, and each kind of
//! click — accent, beat, subdivision, cross rhythm — can use one instead of its synthesised
//! sound, over the tracks and in the metronome alike.

use std::fs;
use std::path::{Path, PathBuf};

use audio_engine::decode::Decoder;
use audio_engine::wav::{BitDepth, WavWriter};
use audio_engine::{ClickKind, ClickSamples, LoadError, click_from_stereo};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::AppError;
use crate::state::AppState;

/// Folder of the imported sounds, inside the app's data folder.
const FOLDER: &str = "suoni";
/// Seconds of a file read to find its click: a long recording is not decoded to the end.
const READ_SECONDS: f32 = 30.0;

/// An imported sound: its file name without extension is both its id and its name.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CustomSound {
    pub id: String,
}

/// Which kind of click: accent, beat, subdivision or cross rhythm.
#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SoundSlot {
    Accent,
    Beat,
    Sub,
    Cross,
}

impl From<SoundSlot> for ClickKind {
    fn from(slot: SoundSlot) -> Self {
        match slot {
            SoundSlot::Accent => ClickKind::Accent,
            SoundSlot::Beat => ClickKind::Beat,
            SoundSlot::Sub => ClickKind::Sub,
            SoundSlot::Cross => ClickKind::Cross,
        }
    }
}

fn folder(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = super::data_dir(app)?.join(FOLDER);
    fs::create_dir_all(&dir).map_err(AppError::internal)?;
    Ok(dir)
}

/// A name usable as a file name: no path separators or characters Windows refuses.
fn file_name(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let clean = clean.trim().trim_matches('.').to_string();
    if clean.is_empty() {
        "Suono".into()
    } else {
        clean
    }
}

/// The path of the sound `id`, refusing anything that would leave the folder.
fn sound_path(dir: &Path, id: &str) -> Option<PathBuf> {
    (file_name(id) == id).then(|| dir.join(format!("{id}.wav")))
}

/// The imported sounds, by name.
#[tauri::command]
#[specta::specta]
pub fn list_click_sounds(app: AppHandle) -> Result<Vec<CustomSound>, AppError> {
    let dir = folder(&app)?;
    let mut sounds: Vec<CustomSound> = fs::read_dir(&dir)
        .map_err(AppError::internal)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let is_wav = path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("wav"));
            let id = path.file_stem()?.to_str()?.to_string();
            is_wav.then_some(CustomSound { id })
        })
        .collect();
    sounds.sort_by_key(|s| s.id.to_lowercase());
    Ok(sounds)
}

/// Makes `path` (any audio file Looplab opens) an imported sound, named after the file.
#[tauri::command]
#[specta::specta]
pub async fn import_click_sound(app: AppHandle, path: PathBuf) -> Result<CustomSound, AppError> {
    let dir = folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || import(&dir, &path))
        .await
        .map_err(AppError::internal)?
}

fn import(dir: &Path, path: &Path) -> Result<CustomSound, AppError> {
    let decoder = Decoder::open(path)?;
    let rate = decoder.sample_rate();
    let limit = (READ_SECONDS * rate as f32) as usize * 2;
    let mut stereo = Vec::new();
    let read = decoder.run(
        |chunk| {
            stereo.extend_from_slice(chunk);
            // Enough read: stop decoding (reported as cancelled, and taken as done)
            if stereo.len() >= limit {
                Err(LoadError::Cancelled)
            } else {
                Ok(())
            }
        },
        |_| {},
    );
    match read {
        Ok(()) | Err(LoadError::Cancelled) => {}
        Err(err) => return Err(err.into()),
    }
    let click = click_from_stereo(&stereo, rate);
    if click.iter().all(|s| s.abs() < 1e-4) {
        return Err(LoadError::Empty.into());
    }

    // Named after the file; a second one with the same name gets a number
    let base = file_name(
        &path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
    );
    let id = (1..)
        .map(|n| {
            if n == 1 {
                base.clone()
            } else {
                format!("{base} {n}")
            }
        })
        .find(|id| !dir.join(format!("{id}.wav")).exists())
        .unwrap_or(base);
    let target = dir.join(format!("{id}.wav"));
    let interleaved: Vec<f32> = click.iter().flat_map(|&s| [s, s]).collect();
    let mut writer =
        WavWriter::create(&target, rate, BitDepth::Pcm16).map_err(AppError::internal)?;
    writer.write(&interleaved).map_err(AppError::internal)?;
    writer.finish().map_err(AppError::internal)?;
    Ok(CustomSound { id })
}

/// Deletes an imported sound (the kinds of click using it go back to their synthesised one).
#[tauri::command]
#[specta::specta]
pub fn delete_click_sound(app: AppHandle, id: String) -> Result<(), AppError> {
    let dir = folder(&app)?;
    if let Some(path) = sound_path(&dir, &id) {
        fs::remove_file(path).map_err(AppError::internal)?;
    }
    Ok(())
}

/// The imported sound each kind of click uses — accent, beat, subdivision, cross rhythm —
/// or None for its synthesised sound. Kept, so an engine started (or restarted) later gets
/// them too: choosing a sound never starts the audio device by itself.
#[tauri::command]
#[specta::specta]
pub fn set_click_samples(
    app: AppHandle,
    state: State<'_, AppState>,
    slots: [Option<String>; 4],
) -> Result<(), AppError> {
    let dir = folder(&app)?;
    let paths = slots.map(|id| id.and_then(|id| sound_path(&dir, &id)));
    state.set_click_sample_paths(paths);
    // A running engine gets them now; one started later takes them when it starts
    if let Some(engine) = state.running_engine() {
        engine.set_click_samples(load_samples(
            &state.click_sample_paths(),
            engine.sample_rate(),
        ));
    }
    Ok(())
}

/// The imported sounds at `paths`, ready for an engine at `sample_rate` (missing: synth).
pub fn load_samples(paths: &[Option<PathBuf>; 4], sample_rate: u32) -> ClickSamples {
    let bytes = paths
        .clone()
        .map(|path| path.and_then(|p| fs::read(p).ok()));
    ClickSamples::from_wavs([0, 1, 2, 3].map(|i| bytes[i].as_deref()), sample_rate)
}

/// Plays one click of a kind now, with its current sound, to hear it.
#[tauri::command]
#[specta::specta]
pub fn preview_sound(state: State<'_, AppState>, slot: SoundSlot) -> Result<(), AppError> {
    state.engine()?.preview_kind(slot.into());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_audio_file_is_imported_kept_and_loaded_as_a_click() {
        let dir = std::env::temp_dir().join(format!("looplab-sounds-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // A "recording": half a second of silence, then a 1 kHz tone for 3 s
        let sources = dir.join("sources");
        fs::create_dir_all(&sources).unwrap();
        let source = sources.join("My clap.wav");
        let rate = 44_100;
        let mut writer = WavWriter::create(&source, rate, BitDepth::Pcm16).unwrap();
        let tone: Vec<f32> = (0..rate as usize * 7 / 2)
            .flat_map(|i| {
                let s = if i < rate as usize / 2 {
                    0.0
                } else {
                    (i as f32 * 1_000.0 * std::f32::consts::TAU / rate as f32).sin() * 0.5
                };
                [s, s]
            })
            .collect();
        writer.write(&tone).unwrap();
        writer.finish().unwrap();

        let first = import(&dir, &source).unwrap();
        let second = import(&dir, &source).unwrap();
        assert_eq!(first.id, "My clap");
        assert_eq!(second.id, "My clap 2", "the same name twice gets a number");

        let kept = sound_path(&dir, &first.id).unwrap();
        let samples = load_samples(&[Some(kept), None, None, None], 48_000);
        assert_eq!(samples, {
            let bytes = fs::read(sound_path(&dir, &first.id).unwrap()).unwrap();
            ClickSamples::from_wavs([Some(&bytes), None, None, None], 48_000)
        });
        assert_ne!(samples, ClickSamples::default(), "the accent has a sound");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn names_become_safe_file_names_and_ids_stay_in_the_folder() {
        assert_eq!(file_name("Cowbell: 2/3"), "Cowbell_ 2_3");
        assert_eq!(file_name("  ..  "), "Suono");
        let dir = Path::new("x");
        assert!(sound_path(dir, "Clap").is_some());
        assert!(sound_path(dir, "../evil").is_none());
    }
}
