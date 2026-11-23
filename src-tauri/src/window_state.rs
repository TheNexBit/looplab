//! Remembers where each window was, per label, in the app data folder.
//!
//! Positions are restored only if they still fall on a connected monitor, so a window
//! last seen on an unplugged screen comes back on the main one.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::{json_file, paths};

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
        .map(|file| json_file::read_or_default(&file))
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

/// A usable place: Windows parks a minimised window at -32000 with no size.
fn is_usable(g: &Geometry) -> bool {
    g.width > 0 && g.height > 0 && g.x > -30000 && g.y > -30000
}

/// Puts the window back where it was, maximised if it was; a place no longer on a monitor (or
/// never known) leaves the default one, but a maximised window is maximised all the same.
pub fn restore(window: &WebviewWindow) {
    let app = window.app_handle();
    let Some(geometry) = read(app).get(window.label()).copied() else {
        return;
    };
    if is_usable(&geometry) && on_screen(app, &geometry) {
        let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
        let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
    }
    if geometry.maximized {
        let _ = window.maximize();
    }
}

/// What to remember after a save: the window's place when it is a usable, normal one; while
/// maximised the place from before (un-maximising later goes back to a sensible window); while
/// minimised nothing changes (its place and its maximised state are not real ones).
fn remembered(
    previous: Option<Geometry>,
    current: Option<Geometry>,
    maximized: bool,
    minimized: bool,
) -> Option<Geometry> {
    if minimized {
        return previous;
    }
    match current.filter(|g| !maximized && is_usable(g)) {
        Some(normal) => Some(normal),
        None => previous
            .filter(is_usable)
            .map(|g| Geometry { maximized, ..g })
            .or(Some(Geometry {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                maximized,
            })),
    }
}

/// Saves the window's current place (see `remembered`).
pub fn save(window: &WebviewWindow) {
    let app = window.app_handle();
    let maximized = window.is_maximized().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    let current = match (window.outer_position(), window.inner_size()) {
        (Ok(position), Ok(size)) => Some(Geometry {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized,
        }),
        _ => None,
    };
    let mut all = read(app);
    let Some(geometry) = remembered(
        all.get(window.label()).copied(),
        current,
        maximized,
        minimized,
    ) else {
        return;
    };
    all.insert(window.label().to_owned(), geometry);
    if let Ok(file) = paths::window_state_file(app) {
        let _ = json_file::write(&file, &all);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NORMAL: Geometry = Geometry {
        x: 100,
        y: 80,
        width: 1280,
        height: 800,
        maximized: false,
    };
    /// What Windows reports for a minimised window
    const PARKED: Geometry = Geometry {
        x: -32000,
        y: -32000,
        width: 0,
        height: 0,
        maximized: false,
    };

    #[test]
    fn a_normal_window_is_remembered_as_it_is() {
        assert_eq!(remembered(None, Some(NORMAL), false, false), Some(NORMAL));
    }

    #[test]
    fn maximised_keeps_the_place_from_before() {
        let max = remembered(Some(NORMAL), Some(PARKED), true, false).unwrap();
        assert!(max.maximized);
        assert_eq!((max.x, max.width), (NORMAL.x, NORMAL.width));
    }

    #[test]
    fn maximised_with_no_place_known_is_still_maximised() {
        let max = remembered(Some(PARKED), None, true, false).unwrap();
        assert!(max.maximized);
        assert!(!is_usable(&max));
    }

    #[test]
    fn a_minimised_window_changes_nothing() {
        let before = Geometry {
            maximized: true,
            ..NORMAL
        };
        assert_eq!(
            remembered(Some(before), Some(PARKED), false, true),
            Some(before)
        );
        assert_eq!(remembered(None, Some(PARKED), false, true), None);
    }

    #[test]
    fn a_parked_place_is_never_saved_as_normal() {
        assert_eq!(
            remembered(Some(NORMAL), Some(PARKED), false, false),
            Some(NORMAL)
        );
    }
}
