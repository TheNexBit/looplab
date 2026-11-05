//! Single source of truth for where the app writes files.
//!
//! Development builds keep everything on the Dev Drive (`LOOPLAB_DEV_DATA_DIR`,
//! set in `.cargo/config.toml`); release builds use the standard Windows folder.

use std::path::PathBuf;

use tauri::AppHandle;

/// Root folder for settings, caches and WebView2 data.
pub fn data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
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
