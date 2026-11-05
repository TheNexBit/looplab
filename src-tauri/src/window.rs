//! Window creation. Windows are built in code (not in tauri.conf.json) so the
//! WebView2 data folder can be redirected before the webview starts.

use tauri::window::Color;
use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{paths, window_state};

pub const MAIN: &str = "main";
/// Detached video. Created hidden at start-up, so detaching shows it instantly.
pub const VIDEO: &str = "video";

/// Same as the `--color-bg-from` theme token: avoids a white flash before the UI paints.
const BACKGROUND: Color = Color(15, 23, 42, 255);

fn builder<'a>(
    app: &'a AppHandle,
    label: &'a str,
    title: &str,
) -> tauri::Result<WebviewWindowBuilder<'a, tauri::Wry, AppHandle>> {
    Ok(WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title(title)
        .background_color(BACKGROUND)
        .data_directory(paths::webview_dir(app)?)
        // Shown once the remembered place is applied, so it never jumps on screen
        .visible(false))
}

pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = builder(app, MAIN, "Looplab")?
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .build()?;
    window_state::restore(&window);
    window.show()?;
    Ok(window)
}

pub fn create_video(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = builder(app, VIDEO, "Looplab — Video")?
        .inner_size(640.0, 360.0)
        .min_inner_size(240.0, 135.0)
        .build()?;
    window_state::restore(&window);
    Ok(window)
}
