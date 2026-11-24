//! Settings → Data: where the library, the cache and the backups are, the backups themselves.

use serde::{Deserialize, Serialize};
use tauri::State;

use super::{AppError, ErrorKind};
use crate::backup::{self, BackupInfo, BackupKind};
use crate::db::{Library, LibraryError};
use crate::stems_out;

/// What the settings show about the library and its backups.
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInfo {
    /// The library file
    pub library: String,
    pub library_bytes: f64,
    pub backup_dir: String,
    /// The second backup folder, if one was chosen
    pub mirror_dir: Option<String>,
    pub cache_dir: String,
    /// Where "Export tracks" saves the separated tracks
    pub stems_dir: String,
    /// True when the user chose that folder (false: the default one)
    pub stems_dir_chosen: bool,
    /// Newest first
    pub backups: Vec<BackupInfo>,
    /// The backup put back at start because the library was damaged
    pub recovered: Option<String>,
}

fn backup_error(err: LibraryError) -> AppError {
    AppError::new(ErrorKind::Backup, err)
}

#[tauri::command]
#[specta::specta]
pub fn archive_info(library: State<'_, Library>) -> Result<ArchiveInfo, AppError> {
    let places = library.places();
    let file = library.file();
    let mirror_dir = library
        .with(|conn| Ok(backup::mirror(conn)?))?
        .map(|dir| dir.to_string_lossy().into_owned());
    let (chosen, stems_dir) =
        library.with(|conn| Ok((stems_out::chosen(conn)?, stems_out::root(conn, places)?)))?;
    Ok(ArchiveInfo {
        stems_dir_chosen: chosen.is_some(),
        stems_dir: stems_dir.to_string_lossy().into_owned(),
        library_bytes: std::fs::metadata(&file).map_or(0.0, |m| m.len() as f64),
        library: file.to_string_lossy().into_owned(),
        backup_dir: places.backup.to_string_lossy().into_owned(),
        mirror_dir,
        cache_dir: places.cache().to_string_lossy().into_owned(),
        backups: backup::list(&places.backup),
        recovered: library.recovered().map(str::to_owned),
    })
}

/// A backup made on request (never deleted by the rotation).
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewBackup {
    pub backup: BackupInfo,
    /// Why the copy in the second backup folder failed, if it did
    pub mirror_error: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn backup_now(library: State<'_, Library>) -> Result<NewBackup, AppError> {
    let made = library
        .with(|conn| backup::create(conn, library.places(), BackupKind::Manual))
        .map_err(backup_error)?;
    Ok(NewBackup {
        backup: made.info,
        mirror_error: made.mirror_error,
    })
}

/// Puts a backup back (the UI then reloads its windows).
#[tauri::command]
#[specta::specta]
pub async fn restore_backup(library: State<'_, Library>, name: String) -> Result<(), AppError> {
    backup::restore(&library, &name).map_err(backup_error)
}

/// Chooses a second backup folder, or stops using it with `null`.
#[tauri::command]
#[specta::specta]
pub fn set_backup_mirror(library: State<'_, Library>, dir: Option<String>) -> Result<(), AppError> {
    Ok(library.with(|conn| Ok(backup::set_mirror(conn, dir.as_deref())?))?)
}

/// Chooses where "Export tracks" saves, or goes back to the default folder with `null`.
#[tauri::command]
#[specta::specta]
pub fn set_stems_folder(library: State<'_, Library>, dir: Option<String>) -> Result<(), AppError> {
    Ok(library.with(|conn| Ok(stems_out::choose(conn, dir.as_deref())?))?)
}

/// Which folder to open in Explorer.
#[derive(Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveFolder {
    Library,
    Backups,
    Mirror,
    Stems,
}

#[tauri::command]
#[specta::specta]
pub fn show_archive_folder(
    library: State<'_, Library>,
    folder: ArchiveFolder,
) -> Result<(), AppError> {
    let places = library.places();
    match folder {
        ArchiveFolder::Library => super::data::explore(&library.file(), true),
        ArchiveFolder::Backups => {
            std::fs::create_dir_all(&places.backup).map_err(AppError::internal)?;
            super::data::explore(&places.backup, false)
        }
        ArchiveFolder::Mirror => {
            let dir = library
                .with(|conn| Ok(backup::mirror(conn)?))?
                .ok_or_else(|| AppError::internal("no second backup folder"))?;
            std::fs::create_dir_all(&dir).map_err(AppError::internal)?;
            super::data::explore(&dir, false)
        }
        ArchiveFolder::Stems => {
            let dir = library.with(|conn| stems_out::root(conn, places))?;
            std::fs::create_dir_all(&dir).map_err(AppError::internal)?;
            super::data::explore(&dir, false)
        }
    }
}
