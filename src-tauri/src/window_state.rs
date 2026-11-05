//! Remembers where each window was, per label, in the app data folder.
//!
//! Positions are restored only if they still fall on a connected monitor, so a window
//! last seen on an unplugged screen comes back on the main one.

use std::collections::HashMap;
use std::fs;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::paths;

/// Physical pixels: they map exactly to one monitor whatever its scaling.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
struct Geometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn read(app: &AppHandle) -> HashMap<String, Geometry> {
    paths::window_state_file(app)
        .ok()
        .and_then(|file| fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// True if the window's centre is on one of the connected monitors.
fn on_screen(app: &AppHandle, g: &Geometry) -> bool {
    let (cx, cy) = (g.x + g.width as i32 / 2, g.y + g.height as i32 / 2);
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .any(|monitor| {
            let (p, s) = (monitor.position(), monitor.size());
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        })
}

/// Puts the window back where it was; leaves it alone the first time or if that place is gone.
pub fn restore(window: &WebviewWindow) {
    let app = window.app_handle();
    let Some(geometry) = read(app).get(window.label()).copied() else {
        return;
    };
    if !on_screen(app, &geometry) {
        return;
    }
    let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
    let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
    if geometry.maximized {
        let _ = window.maximize();
    }
}

/// Saves the window's current place. Size and position are kept from before a maximise,
/// so un-maximising later goes back to a sensible window.
pub fn save(window: &WebviewWindow) {
    let app = window.app_handle();
    let maximized = window.is_maximized().unwrap_or(false);
    let mut all = read(app);
    let geometry = match (window.outer_position(), window.inner_size()) {
        (Ok(position), Ok(size)) if !maximized => Geometry {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized,
        },
        _ => match all.get(window.label()) {
            Some(previous) => Geometry {
                maximized,
                ..*previous
            },
            None => return,
        },
    };
    all.insert(window.label().to_owned(), geometry);
    if let (Ok(file), Ok(json)) = (
        paths::window_state_file(app),
        serde_json::to_string_pretty(&all),
    ) {
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(file, json);
    }
}
