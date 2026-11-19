// Release builds have no console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup;
mod cache;
mod commands;
mod db;
mod diary;
mod hash;
mod json_file;
mod legacy;
mod log;
mod media;
mod media_keys;
mod midi;
mod paths;
mod playback;
mod prefs;
mod project;
mod recent;
mod scores;
mod state;
mod stems_out;
mod voice;
mod window;
mod window_state;

use tauri::{Manager, WindowEvent};
use tauri_specta::Event;

fn main() {
    let specta = commands::builder();

    #[cfg(debug_assertions)]
    commands::export_bindings(&specta);

    // Typed commands go through tauri-specta; binary ones through Tauri directly
    let typed = specta.invoke_handler();
    let binary = commands::waveform::handler();

    let builder = tauri::Builder::default()
        // Must be the first plugin: a second launch focuses the running window instead
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window(window::MAIN) {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // Updates exist only in official builds: their config (public key, address) is added by
    // scripts/powershell/build.ps1. Without it the plugin is left out instead of failing at start-up
    let context = tauri::generate_context!();
    let builder = if context.config().plugins.0.contains_key("updater") {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    } else {
        builder
    };

    builder
        .manage(state::AppState::default())
        .invoke_handler(move |invoke| {
            if invoke.message.command() == commands::waveform::GET_PEAKS {
                binary(invoke)
            } else {
                typed(invoke)
            }
        })
        .on_window_event(|window, event| {
            // Checked first: once destroyed, the window can no longer be looked up
            if window.label() == window::MAIN && matches!(event, WindowEvent::Destroyed) {
                // The hidden video window would otherwise keep the app alive
                window.app_handle().exit(0);
                return;
            }
            let Some(webview) = window.app_handle().get_webview_window(window.label()) else {
                return;
            };
            match (window.label(), event) {
                // Closing the detached video only hides it: it must reopen instantly
                (window::VIDEO, WindowEvent::CloseRequested { api, .. }) => {
                    api.prevent_close();
                    window_state::save(&webview);
                    let _ = webview.hide();
                    let _ = commands::VideoWindowHidden.emit(window.app_handle());
                }
                (window::MAIN, WindowEvent::CloseRequested { .. }) => {
                    // The place to remember is the full window, not the mini bar
                    if window::is_mini() {
                        let _ = window::set_mini(&webview, false);
                    }
                    window_state::save(&webview);
                    if let Some(video) = window.app_handle().get_webview_window(window::VIDEO) {
                        window_state::save(&video);
                    }
                }
                _ => {}
            }
        })
        .setup(move |app| {
            let places = paths::places(app.handle())?;
            log::init(&places.local, &app.package_info().version.to_string());
            // The library before any window: the UI reads its preferences from it at start
            app.manage(db::Library::start(places));
            // The day's automatic backup now, and again whenever the day changes
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    backup::auto_if_due(&handle.state::<db::Library>());
                    std::thread::sleep(std::time::Duration::from_secs(30 * 60));
                }
            });
            specta.mount_events(app);
            window::create_main(app.handle())?;
            window::create_video(app.handle())?;
            // Open the audio device off the main thread so the window appears at once
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = handle.state::<state::AppState>().engine();
            });
            playback::spawn_status_loop(app.handle().clone());
            midi::spawn_midi_listener(app.handle().clone());
            Ok(())
        })
        .run(context)
        .expect("failed to run Looplab");
}

#[cfg(test)]
mod tests {
    /// `npm run bindings` runs this to regenerate `src/lib/bindings.ts` without launching the app.
    #[test]
    fn export_bindings() {
        crate::commands::export_bindings(&crate::commands::builder());
    }
}
