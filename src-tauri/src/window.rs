//! Window creation. Windows are built in code (not in tauri.conf.json) so the
//! WebView2 data folder can be redirected before the webview starts.

use tauri::window::Color;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

use crate::paths;

pub const MAIN: &str = "main";

/// Same as the `--color-bg-from` theme token: avoids a white flash before the UI paints.
const BACKGROUND: Color = Color(15, 23, 42, 255);

pub fn create_main(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::default())
        .title("Looplab")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .background_color(BACKGROUND)
        .data_directory(paths::webview_dir(app)?)
        .build()?;
    Ok(())
}
