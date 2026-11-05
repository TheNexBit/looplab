// Release builds have no console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod paths;
mod playback;
mod project;
mod recent;
mod state;
mod window;

use tauri::Manager;

fn main() {
    let specta = commands::builder();

    #[cfg(debug_assertions)]
    commands::export_bindings(&specta);

    // Typed commands go through tauri-specta; binary ones through Tauri directly
    let typed = specta.invoke_handler();
    let binary = commands::waveform::handler();

    tauri::Builder::default()
        // Must be the first plugin: a second launch focuses the running window instead
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window(window::MAIN) {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(move |invoke| {
            if invoke.message.command() == commands::waveform::GET_PEAKS {
                binary(invoke)
            } else {
                typed(invoke)
            }
        })
        .setup(move |app| {
            specta.mount_events(app);
            window::create_main(app.handle())?;
            // Open the audio device off the main thread so the window appears at once
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = handle.state::<state::AppState>().engine();
            });
            playback::spawn_status_loop(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
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
