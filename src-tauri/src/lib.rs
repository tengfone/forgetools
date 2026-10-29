mod background;

use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single instance must be registered first. Tests run their own instances.
    if !background::is_e2e() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            background::show_window(app, false);
        }));
    }

    // E2E-only: WebdriverIO execute/mock bridge + embedded W3C WebDriver server.
    // Compiled in only with `--features wdio`; release builds never contain them.
    #[cfg(feature = "wdio")]
    {
        builder = builder
            .plugin(tauri_plugin_wdio::init())
            .plugin(tauri_plugin_wdio_webdriver::init());
    }

    builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        background::toggle_window(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().args(["--hidden"]).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            background::get_background_settings,
            background::set_background_settings,
            background::set_global_shortcut,
            start_hidden,
        ])
        .setup(|app| {
            background::init(app.handle())?;
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                background::on_close_requested(w, api);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building ForgeTools")
        .run(|app, e| {
            if let tauri::RunEvent::ExitRequested { .. } = e {
                app.state::<background::State>().quitting.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        });
}

/// True when launched by the login item: the frontend must not show the window.
#[tauri::command]
fn start_hidden() -> bool {
    background::start_hidden()
}
