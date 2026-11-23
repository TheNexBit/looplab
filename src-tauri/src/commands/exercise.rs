//! The files of one take (see `crate::exercise`): found and lined up from their sound.

use std::path::{Path, PathBuf};

use audio_engine::LoadError;
use audio_engine::offset::{self, Sound};
use serde::Serialize;
use tauri::{AppHandle, State};

use super::{AppError, ErrorKind};
use crate::db::{Library, path_key};
use crate::exercise::{self, Exercise, ExerciseFile, LineUp};
use crate::media;
use crate::project::Project;

/// The exercise of the open track (its other files found in its folder), or `null` when the
/// track is alone.
#[tauri::command]
#[specta::specta]
pub fn open_exercise(
    library: State<'_, Library>,
    track: String,
) -> Result<Option<Exercise>, AppError> {
    Ok(library.with(|conn| exercise::open(conn, &track))?)
}

/// Saves names, hand-set shifts, roles and the chosen angle; a file moved by hand may bring
/// the open track's shared parts (score sync, markers…) to other times.
#[tauri::command]
#[specta::specta]
pub fn save_exercise(
    library: State<'_, Library>,
    track: String,
    exercise: Exercise,
) -> Result<LinedUp, AppError> {
    let mut exercise = exercise;
    let project = library.with(|conn| {
        exercise::save_moved(conn, &mut exercise)?;
        let own = crate::project::find(conn, &track)?;
        exercise::share(conn, &track, own.as_ref())
    })?;
    Ok(LinedUp { exercise, project })
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LinedUp {
    pub exercise: Exercise,
    /// The open track's project, when another file of the take brought a newer score sync,
    /// markers or loops (already moved onto this file's times and saved)
    pub project: Option<Project>,
}

/// A file read for the comparison; `None` when it has no sound to compare.
fn read(cache: &Path, path: &Path) -> Option<Sound> {
    let loaded = match audio_engine::load(path, offset::RATE, |_| {}) {
        Err(LoadError::UnsupportedCodec | LoadError::UnsupportedFormat)
            if media::ffmpeg().is_some() =>
        {
            let extracted = media::extract_audio(cache, path, |_| {}).ok()?;
            audio_engine::load(&extracted, offset::RATE, |_| {}).ok()?
        }
        other => other.ok()?,
    };
    let sound = Sound::from_pcm(&loaded.pcm);
    (!sound.is_silent()).then_some(sound)
}

/// Lines up, from their sound, the files of the open track's exercise not compared yet (and
/// `redo`, compared again). Then shares the newest score sync, markers and loops of the take
/// with the open track.
#[tauri::command]
#[specta::specta]
pub async fn align_exercise(
    app: AppHandle,
    library: State<'_, Library>,
    track: String,
    redo: Option<String>,
) -> Result<Option<LinedUp>, AppError> {
    let Some(mut ex) = library.with(|conn| exercise::of_track(conn, &track))? else {
        return Ok(None);
    };
    if let Some(redo) = &redo
        && path_key(redo) != path_key(&track)
        && let Some(file) = ex
            .files
            .iter_mut()
            .find(|f| path_key(&f.path) == path_key(redo))
    {
        file.line_up = LineUp::Pending;
    }
    let pending: Vec<usize> = (0..ex.files.len())
        .filter(|&i| ex.files[i].line_up == LineUp::Pending)
        .collect();
    if !pending.is_empty() {
        // The anchor: the open track if lined up, else the first file that is
        let anchor = ex
            .files
            .iter()
            .position(|f| path_key(&f.path) == path_key(&track) && f.lined_up())
            .or_else(|| ex.files.iter().position(ExerciseFile::lined_up))
            .ok_or_else(|| AppError::new(ErrorKind::NoTrack, "nothing lined up"))?;
        let cache = super::cache_dir(&app)?;
        let anchor_path = PathBuf::from(&ex.files[anchor].path);
        let anchor_shift = ex.files[anchor].shift;
        let paths: Vec<PathBuf> = pending
            .iter()
            .map(|&i| PathBuf::from(&ex.files[i].path))
            .collect();
        let results = tauri::async_runtime::spawn_blocking(move || {
            let Some(base) = read(&cache, &anchor_path) else {
                return Vec::new();
            };
            paths
                .iter()
                .map(|path| read(&cache, path).map(|sound| offset::find(&base, &sound)))
                .collect::<Vec<_>>()
        })
        .await
        .map_err(AppError::internal)?;
        for (&i, result) in pending.iter().zip(&results) {
            let file = &mut ex.files[i];
            match result {
                Some(Some(found)) if found.matches() => {
                    file.shift = anchor_shift + found.seconds;
                    file.line_up = LineUp::Sound;
                }
                Some(Some(_)) => file.line_up = LineUp::Mismatch,
                _ => file.line_up = LineUp::NoSound,
            }
        }
        library.with(|conn| exercise::save_moved(conn, &mut ex))?;
    }
    let project = library.with(|conn| {
        let own = crate::project::find(conn, &track)?;
        exercise::share(conn, &track, own.as_ref())
    })?;
    Ok(Some(LinedUp {
        exercise: ex,
        project,
    }))
}
