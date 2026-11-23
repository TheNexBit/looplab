//! Window creation. Windows are built in code (not in tauri.conf.json) so the
//! WebView2 data folder can be redirected before the webview starts.

use std::sync::Mutex;

use tauri::window::Color;
use tauri::{
    AppHandle, LogicalSize, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::state::lock;
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

/// Smallest main window, in CSS pixels (the mini bar goes below it).
const MAIN_MIN: (f64, f64) = (900.0, 600.0);
/// The mini bar: size when it opens, and the smallest it can be made.
const MINI_SIZE: (f64, f64) = (640.0, 96.0);
const MINI_MIN: (f64, f64) = (440.0, 96.0);

/// Where the main window was before it became the mini bar, to go back there.
struct Before {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}

static MINI: Mutex<Option<Before>> = Mutex::new(None);

/// True while the main window is the mini bar.
pub fn is_mini() -> bool {
    MINI.lock().is_ok_and(|before| before.is_some())
}

/// Mini mode, like the mini player of a media player: the main window shrinks to a slim bar
/// that stays above other programs (a score or tab in the browser, a lesson video); turned
/// off, it goes back to where and how big it was.
pub fn set_mini(window: &WebviewWindow, on: bool) -> tauri::Result<()> {
    let mut mini = lock(&MINI);
    if on == mini.is_some() {
        return Ok(());
    }
    if on {
        *mini = Some(Before {
            position: window.outer_position()?,
            size: window.inner_size()?,
            maximized: window.is_maximized()?,
        });
        window.unmaximize()?;
        window.set_min_size(Some(LogicalSize::new(MINI_MIN.0, MINI_MIN.1)))?;
        window.set_size(LogicalSize::new(MINI_SIZE.0, MINI_SIZE.1))?;
        window.set_always_on_top(true)?;
        // A maximised mini bar would only be a big empty strip
        window.set_maximizable(false)?;
    } else if let Some(before) = mini.take() {
        window.set_always_on_top(false)?;
        window.set_maximizable(true)?;
        window.set_min_size(Some(LogicalSize::new(MAIN_MIN.0, MAIN_MIN.1)))?;
        window.set_size(before.size)?;
        window.set_position(before.position)?;
        if before.maximized {
            window.maximize()?;
        }
    }
    Ok(())
}

pub fn create_main(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = builder(app, MAIN, "Looplab")?
        .inner_size(1280.0, 800.0)
        .min_inner_size(MAIN_MIN.0, MAIN_MIN.1)
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
