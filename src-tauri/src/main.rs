// Release builds have no console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod paths;
mod window;

use tauri::Manager;

fn main() {
    let specta = commands::builder();

    #[cfg(debug_assertions)]
    commands::export_bindings(&specta);

    tauri::Builder::default()
        // Must be the first plugin: a second launch focuses the running window instead
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window(window::MAIN) {
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            specta.mount_events(app);
            window::create_main(app.handle())?;
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
