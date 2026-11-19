//! Single source of truth for where the app writes files.
//!
//! Three places, kept apart on purpose:
//! - **user**: the player's work — the library database and the imported click sounds. This is
//!   what a backup saves.
//! - **local**: what this PC can rebuild or does not need to keep (cache, log, WebView2 data,
//!   window places). Never backed up.
//! - **backup**: the automatic and manual backups, where the user can find them.
//! - **stems_out**: separated tracks saved as WAV files ("Export tracks"), beside the backups.
//!
//! An installed copy uses the standard Windows folders: `%APPDATA%\Looplab`,
//! `%LOCALAPPDATA%\Looplab` and `Documents\Looplab\Backup`. Development builds
//! (`LOOPLAB_DEV_DATA_DIR`, set in `.cargo/config.toml`), a release build tested with
//! `LOOPLAB_DATA_DIR` (scripts/powershell/prova-build.ps1) and the portable version (a
//! `portable.txt` file next to the exe, data in the `dati` folder beside it) keep all three under
//! one folder, with the same layout.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::AppHandle;

/// The file that turns a copy of Looplab into the portable version.
const PORTABLE_MARK: &str = "portable.txt";
/// Folder of the portable version's data, next to the exe.
const PORTABLE_DATA: &str = "dati";
/// Name of the app's folders in the standard Windows places.
const APP_FOLDER: &str = "Looplab";

/// Where everything goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Places {
    /// The player's work: library database and imported sounds
    pub user: PathBuf,
    /// Rebuildable or machine-only files: cache, log, WebView2, window places
    pub local: PathBuf,
    /// Backups
    pub backup: PathBuf,
    /// Separated tracks saved as WAV files, one folder per song
    pub stems_out: PathBuf,
    /// Where versions before the library kept their JSON files
    pub legacy: PathBuf,
}

/// Folder of the separated tracks saved as WAV files.
const STEMS_FOLDER: &str = "Tracce separate";
/// Folders of the user's work beside the library, saved in every backup (no subfolders).
pub const SOUNDS_FOLDER: &str = "suoni";
pub const SCORES_FOLDER: &str = "spartiti";
pub const USER_FOLDERS: [&str; 2] = [SOUNDS_FOLDER, SCORES_FOLDER];

impl Places {
    /// Everything under one folder: development, release tests and the portable version.
    pub fn under(root: &Path) -> Self {
        Self {
            user: root.to_path_buf(),
            local: root.to_path_buf(),
            backup: root.join("backup"),
            stems_out: root.join(STEMS_FOLDER),
            legacy: root.to_path_buf(),
        }
    }

    /// Files Looplab can rebuild at any time: decoded audio, waveforms, stems, video proxies.
    pub fn cache(&self) -> PathBuf {
        self.local.join("cache")
    }

    /// The imported click sounds.
    pub fn sounds(&self) -> PathBuf {
        self.user.join(SOUNDS_FOLDER)
    }

    /// The score files (Guitar Pro, PDF) linked to tracks, copied in once and named by content.
    pub fn scores(&self) -> PathBuf {
        self.user.join(SCORES_FOLDER)
    }
}

/// The data folder of a portable copy whose exe sits in `exe_dir`, if it is one.
fn portable_data_in(exe_dir: &Path) -> Option<PathBuf> {
    exe_dir
        .join(PORTABLE_MARK)
        .is_file()
        .then(|| exe_dir.join(PORTABLE_DATA))
}

/// The portable version's data folder, when this copy is portable (checked once).
pub fn portable_data() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let exe = std::env::current_exe().ok()?;
        portable_data_in(exe.parent()?)
    })
    .as_deref()
}

/// The single folder holding everything, when this copy does not use the Windows places.
fn single_root() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("LOOPLAB_DATA_DIR") {
        return Some(PathBuf::from(dir));
    }
    if let Some(dir) = portable_data() {
        return Some(dir.to_path_buf());
    }
    #[cfg(debug_assertions)]
    return Some(PathBuf::from(env!("LOOPLAB_DEV_DATA_DIR")));
    #[cfg(not(debug_assertions))]
    None
}

/// The folders of this copy.
pub fn places(app: &AppHandle) -> tauri::Result<Places> {
    if let Some(root) = single_root() {
        return Ok(Places::under(&root));
    }
    use tauri::Manager;
    let path = app.path();
    Ok(Places {
        user: path.data_dir()?.join(APP_FOLDER),
        local: path.local_data_dir()?.join(APP_FOLDER),
        backup: path.document_dir()?.join(APP_FOLDER).join("Backup"),
        stems_out: path.document_dir()?.join(APP_FOLDER).join(STEMS_FOLDER),
        // Before the library, installed copies kept everything in Tauri's own app folder
        legacy: path.app_local_data_dir()?,
    })
}

/// Files Looplab can rebuild at any time: audio extracted from videos, video proxies.
pub fn cache_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(places(app)?.cache())
}

/// Remembered window positions and sizes: they belong to this PC's screens.
pub fn window_state_file(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(places(app)?.local.join("windows.json"))
}

/// WebView2 profile folder (its own caches; the preferences live in the library).
pub fn webview_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(places(app)?.local.join("webview"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::project::tests::temp_dir;

    #[test]
    fn a_copy_is_portable_only_with_the_mark_next_to_the_exe() {
        let dir = temp_dir("portable");
        assert_eq!(portable_data_in(&dir), None);
        fs::write(dir.join(PORTABLE_MARK), "").unwrap();
        assert_eq!(portable_data_in(&dir), Some(dir.join(PORTABLE_DATA)));
    }

    #[test]
    fn one_folder_keeps_work_cache_and_backups_apart() {
        let places = Places::under(Path::new("D:/data"));
        assert_eq!(places.user, Path::new("D:/data"));
        assert_eq!(places.cache(), Path::new("D:/data/cache"));
        assert_eq!(places.backup, Path::new("D:/data/backup"));
        assert_eq!(places.sounds(), Path::new("D:/data/suoni"));
    }
}
