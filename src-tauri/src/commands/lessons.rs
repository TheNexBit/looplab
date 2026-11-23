//! The lesson Home (see `crate::lessons`): course folders, their lessons, the user's choices,
//! and the tab found beside a track.

use std::path::Path;

use tauri::State;

use super::{AppError, ErrorKind};
use crate::db::Library;
use crate::lessons::{self, LessonChoice, LessonLibrary, LessonProgress};

/// The lessons as last read: shown at once, then `scan_lessons` brings them up to date.
#[tauri::command]
#[specta::specta]
pub fn lesson_library(library: State<'_, Library>) -> Result<LessonLibrary, AppError> {
    Ok(library.with(lessons::library)?)
}

/// Reads the course folders again in the background (only the changed folders are listed).
#[tauri::command]
#[specta::specta]
pub async fn scan_lessons(library: State<'_, Library>) -> Result<LessonLibrary, AppError> {
    let old = library.with(lessons::listings)?;
    let new = tauri::async_runtime::spawn_blocking(move || lessons::rescan(&old))
        .await
        .map_err(AppError::internal)?;
    Ok(library.with(|conn| {
        lessons::store_listings(conn, &new)?;
        lessons::library(conn)
    })?)
}

/// Adds a course folder and reads it.
#[tauri::command]
#[specta::specta]
pub async fn add_lesson_root(
    library: State<'_, Library>,
    path: String,
) -> Result<LessonLibrary, AppError> {
    if !Path::new(&path).is_dir() {
        return Err(AppError::new(ErrorKind::FileNotFound, &path));
    }
    library.with(|conn| lessons::add_root(conn, &path))?;
    scan_lessons(library).await
}

/// Takes a course folder off the Home; its files are not touched.
#[tauri::command]
#[specta::specta]
pub fn remove_lesson_root(
    library: State<'_, Library>,
    path: String,
) -> Result<LessonLibrary, AppError> {
    Ok(library.with(|conn| {
        lessons::remove_root(conn, &path)?;
        lessons::library(conn)
    })?)
}

/// Remembers which file a lesson opens and which tab goes with it (its mark stays).
#[tauri::command]
#[specta::specta]
pub fn set_lesson_choice(
    library: State<'_, Library>,
    id: String,
    choice: LessonChoice,
) -> Result<LessonLibrary, AppError> {
    Ok(library.with(|conn| {
        lessons::set_choice(conn, &id, &choice)?;
        lessons::library(conn)
    })?)
}

/// Marks a lesson done, to review, or neither (the files picked for it stay).
#[tauri::command]
#[specta::specta]
pub fn set_lesson_progress(
    library: State<'_, Library>,
    id: String,
    progress: LessonProgress,
) -> Result<LessonLibrary, AppError> {
    Ok(library.with(|conn| {
        lessons::set_progress(conn, &id, progress)?;
        lessons::library(conn)
    })?)
}

/// The lesson `track` belongs to (read from its own folder, also outside the course folders):
/// the score bar lists its tabs to switch between them.
#[tauri::command]
#[specta::specta]
pub fn lesson_of_track(
    library: State<'_, Library>,
    track: String,
) -> Result<Option<lessons::Lesson>, AppError> {
    Ok(library.with(|conn| lessons::lesson_of(conn, &track))?)
}

/// The score beside `track` (same folder, same name), to link when its project has none.
#[tauri::command]
#[specta::specta]
pub fn score_beside(
    library: State<'_, Library>,
    track: String,
) -> Result<Option<String>, AppError> {
    Ok(library.with(|conn| lessons::score_beside(conn, &track))?)
}

/// The user removed the tab of `track`: it is not linked again by itself.
#[tauri::command]
#[specta::specta]
pub fn forget_score_beside(library: State<'_, Library>, track: String) -> Result<(), AppError> {
    Ok(library.with(|conn| lessons::forget_score(conn, &track))?)
}

/// Opens a lesson's document (a PDF study guide) in the system's own viewer.
#[tauri::command]
#[specta::specta]
pub fn open_document(path: String) -> Result<(), AppError> {
    let file = Path::new(&path);
    let is_pdf = file
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if !is_pdf || !file.is_file() {
        return Err(AppError::new(ErrorKind::FileNotFound, &path));
    }
    super::data::explore(file, false)
}
