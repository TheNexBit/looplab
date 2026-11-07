//! Single source of truth for where the app writes files.
//!
//! Development builds keep everything on the Dev Drive (`LOOPLAB_DEV_DATA_DIR`,
//! set in `.cargo/config.toml`); release builds use the standard Windows folder,
//! unless `LOOPLAB_DATA_DIR` is set (scripts/powershell/prova-build.ps1 uses it to test a release build
//! without touching the real data). The portable version (a `portable.txt` file next to the
//! exe) keeps everything in the `dati` folder beside it, so it can live on a USB stick.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::AppHandle;

/// The file that turns a copy of Looplab into the portable version.
const PORTABLE_MARK: &str = "portable.txt";
/// Folder of the portable version's data, next to the exe.
const PORTABLE_DATA: &str = "dati";

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

/// Root folder for settings, caches and WebView2 data.
pub fn data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    if let Some(dir) = std::env::var_os("LOOPLAB_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    if let Some(dir) = portable_data() {
        return Ok(dir.to_path_buf());
    }
    #[cfg(debug_assertions)]
    {
        let _ = app;
        Ok(PathBuf::from(env!("LOOPLAB_DEV_DATA_DIR")))
    }
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        app.path().app_local_data_dir()
    }
}

/// Files Looplab can rebuild at any time: audio extracted from videos, video proxies.
pub fn cache_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(data_dir(app)?.join("cache"))
}

/// Remembered window positions and sizes.
pub fn window_state_file(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(data_dir(app)?.join("windows.json"))
}

/// WebView2 profile folder (cookies, cache, local storage of the UI).
pub fn webview_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    Ok(data_dir(app)?.join("webview"))
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
}
