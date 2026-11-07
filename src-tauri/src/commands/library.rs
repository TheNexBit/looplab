//! Project files, recently opened tracks and the practice diary.

use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;

use super::{AppError, ErrorKind};
use crate::diary::{self, DiaryEntry};
use crate::paths;
use crate::project::{self, Project, ProjectError, ProjectLocation};
use crate::recent::{self, RecentFile};

impl From<ProjectError> for AppError {
    fn from(err: ProjectError) -> Self {
        Self::new(ErrorKind::ProjectFile, err)
    }
}

#[derive(Serialize, specta::Type)]
pub struct LoadedProject {
    pub project: Project,
    pub location: ProjectLocation,
}

/// The saved project of a track, or `null` if it has none yet.
#[tauri::command]
#[specta::specta]
pub fn load_project(app: AppHandle, track: String) -> Result<Option<LoadedProject>, AppError> {
    let data_dir = super::data_dir(&app)?;
    let loaded = project::load(&data_dir, Path::new(&track))?;
    Ok(loaded.map(|(project, location)| LoadedProject { project, location }))
}

/// Saves the project of a track and says where it went.
#[tauri::command]
#[specta::specta]
pub fn save_project(
    app: AppHandle,
    track: String,
    project: Project,
) -> Result<ProjectLocation, AppError> {
    let data_dir = super::data_dir(&app)?;
    Ok(project::save(&data_dir, Path::new(&track), &project)?)
}

/// Every day of practice of every track, oldest first.
#[tauri::command]
#[specta::specta]
pub fn practice_diary(app: AppHandle) -> Result<Vec<DiaryEntry>, AppError> {
    let data_dir = super::data_dir(&app)?;
    Ok(diary::list(&data_dir))
}

/// Adds practice time (and the speed reached) to a track's day.
#[tauri::command]
#[specta::specta]
pub fn record_practice(app: AppHandle, practice: DiaryEntry) -> Result<(), AppError> {
    let data_dir = super::data_dir(&app)?;
    diary::record(&data_dir, practice).map_err(AppError::internal)
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
pub fn recent_files(app: AppHandle) -> Result<Vec<RecentFile>, AppError> {
    let data_dir = super::data_dir(&app)?;
    Ok(recent::list(&data_dir))
}

#[tauri::command]
#[specta::specta]
pub fn forget_recent(app: AppHandle, track: String) -> Result<(), AppError> {
    let data_dir = super::data_dir(&app)?;
    recent::remove(&data_dir, &track).map_err(AppError::internal)
}

/// Called after a track opens successfully; a failure here must not fail the opening.
pub fn remember(app: &AppHandle, track: &str, duration: f64) {
    if let Ok(data_dir) = paths::data_dir(app) {
        let _ = recent::add(&data_dir, track, (duration > 0.0).then_some(duration));
    }
}
