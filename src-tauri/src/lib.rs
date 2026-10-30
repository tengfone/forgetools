mod background;

use tauri::{Manager, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;
#[cfg(not(feature = "wdio"))]
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// Route panics into the log file (release builds abort, so this is the only trace), then
/// defer to the default hook.
fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<non-string payload>");
        let loc = info
            .location()
            .map_or_else(|| "<unknown>".to_string(), ToString::to_string);
        log::error!("panic at {loc}: {payload}");
        prev(info);
    }));
}

/// # Panics
/// If the Tauri application fails to build.
pub fn run() {
    install_panic_hook();
    let mut builder = tauri::Builder::default();

    // Single instance must be registered first. Tests run their own instances.
    if !background::is_e2e() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second `--hidden` launch (login item racing a running instance) stays in the tray
            if !args.iter().any(|a| a == "--hidden") {
                background::show_window(app, false);
            }
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

    // The wdio plugins install their own global logger; a second one panics at startup.
    #[cfg(not(feature = "wdio"))]
    {
        builder = builder.plugin(
            tauri_plugin_log::Builder::new()
                // Log files live in the OS log dir for the app identifier:
                //   Windows: %LOCALAPPDATA%\com.tengfone.forgetools\logs
                //   macOS:   ~/Library/Logs/com.tengfone.forgetools
                //   Linux:   ~/.local/share/com.tengfone.forgetools/logs
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .max_file_size(1_000_000)
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        );
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
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--hidden"])
                .build(),
        )
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
            background::init(app.handle());
            Ok(())
        })
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                background::on_close_requested(w, api);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building ForgeTools")
        .run(|app, e| match e {
            tauri::RunEvent::ExitRequested { .. } => {
                app.state::<background::State>()
                    .quitting
                    .store(true, std::sync::atomic::Ordering::SeqCst);
            }
            // Dock icon clicked while the window is hidden in the tray
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => background::show_window(app, false),
            _ => {}
        });
}

/// True when launched by the login item: the frontend must not show the window.
#[tauri::command]
fn start_hidden() -> bool {
    background::start_hidden()
}
