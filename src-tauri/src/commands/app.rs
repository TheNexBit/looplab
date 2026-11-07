use serde::Serialize;

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub engine_version: String,
    /// The portable version: data next to the exe, updates downloaded by hand
    pub portable: bool,
    /// Most space the decoded tracks may take, in bytes
    pub decoded_limit: f64,
}

/// Basic app information, also used to verify the typed Rust ↔ UI bridge.
#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        engine_version: audio_engine::VERSION.to_owned(),
        portable: crate::paths::portable_data().is_some(),
        decoded_limit: crate::cache::decoded_limit() as f64,
    }
}
