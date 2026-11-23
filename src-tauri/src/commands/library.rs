//! Track projects, recently opened tracks, practice diary and preferences: all in the library.

use std::collections::BTreeMap;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::{AppError, ErrorKind};
use crate::db::{Library, LibraryError};
use crate::diary::{self, DiaryEntry};
use crate::legacy;
use crate::project::{self, Project};
use crate::recent::{self, RecentFile};
use crate::{log, prefs};

impl From<LibraryError> for AppError {
    fn from(err: LibraryError) -> Self {
        match err {
            LibraryError::Invalid(_) => Self::new(ErrorKind::ProjectFile, err),
            _ => Self::new(ErrorKind::Library, err),
        }
    }
}

/// The saved project of a track, or `null` if it has none yet.
#[tauri::command]
#[specta::specta]
pub fn load_project(
    library: State<'_, Library>,
    track: String,
) -> Result<Option<Project>, AppError> {
    let old_files = legacy::old_files_dir(library.places());
    Ok(library.with(|conn| {
        let own = project::load(conn, &track, &old_files)?;
        // Another file of the same take may have a newer score sync, markers or loops
        Ok(crate::exercise::share(conn, &track, own.as_ref())?.or(own))
    })?)
}

/// Saves the project of a track.
#[tauri::command]
#[specta::specta]
pub fn save_project(
    library: State<'_, Library>,
    track: String,
    project: Project,
) -> Result<(), AppError> {
    Ok(library.with(|conn| project::save(conn, &track, &project))?)
}

/// Every day of practice of every track, oldest first.
#[tauri::command]
#[specta::specta]
pub fn practice_diary(library: State<'_, Library>) -> Result<Vec<DiaryEntry>, AppError> {
    Ok(library.with(diary::list)?)
}

/// Adds practice time (and the speed reached) to a track's day.
#[tauri::command]
#[specta::specta]
pub fn record_practice(library: State<'_, Library>, practice: DiaryEntry) -> Result<(), AppError> {
    Ok(library.with(|conn| diary::record(conn, &practice))?)
}

/// A project with every default, for tracks opened for the first time.
/// The defaults live in Rust only, so the UI never keeps its own copy.
#[tauri::command]
#[specta::specta]
pub fn default_project() -> Project {
    Project::default()
}

#[tauri::command]
#[specta::specta]
pub fn recent_files(library: State<'_, Library>) -> Result<Vec<RecentFile>, AppError> {
    Ok(library.with(recent::list)?)
}

#[tauri::command]
#[specta::specta]
pub fn forget_recent(library: State<'_, Library>, track: String) -> Result<(), AppError> {
    Ok(library.with(|conn| recent::remove(conn, &track))?)
}

/// Empties the recent list, or (`only_missing`) takes off the files no longer on the disk.
#[tauri::command]
#[specta::specta]
pub fn clear_recent(library: State<'_, Library>, only_missing: bool) -> Result<u32, AppError> {
    let removed = library.with(|conn| recent::clear(conn, only_missing))?;
    Ok(u32::try_from(removed).unwrap_or(u32::MAX))
}

/// Called after a track opens successfully; a failure here must not fail the opening.
pub fn remember(app: &AppHandle, track: &str, duration: f64) {
    let library = app.state::<Library>();
    let duration = (duration > 0.0).then_some(duration);
    if let Err(err) = library.with(|conn| recent::add(conn, track, duration)) {
        log::error("library", &format!("recent list not updated: {err}"));
    }
}

/// The UI's preferences, read once when a window starts.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredPrefs {
    /// JSON text by key
    pub values: BTreeMap<String, String>,
    /// False until the preferences an older version kept in the WebView were imported
    pub imported: bool,
}

#[tauri::command]
#[specta::specta]
pub fn load_prefs(library: State<'_, Library>) -> Result<StoredPrefs, AppError> {
    let (values, imported) = library.with(prefs::all)?;
    Ok(StoredPrefs { values, imported })
}

/// Saves one preference (JSON text), or removes it with `null`.
#[tauri::command]
#[specta::specta]
pub fn set_pref(
    library: State<'_, Library>,
    key: String,
    value: Option<String>,
) -> Result<(), AppError> {
    Ok(library.with(|conn| prefs::set(conn, &key, value.as_deref()))?)
}

/// Imports, once, the preferences an older version kept in the WebView; returns them all.
#[tauri::command]
#[specta::specta]
pub fn import_prefs(
    library: State<'_, Library>,
    values: BTreeMap<String, String>,
) -> Result<StoredPrefs, AppError> {
    let (values, imported) = library.with(|conn| {
        prefs::import(conn, &values)?;
        prefs::all(conn)
    })?;
    Ok(StoredPrefs { values, imported })
}
