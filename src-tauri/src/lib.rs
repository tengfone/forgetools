#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // E2E-only: WebdriverIO execute/mock bridge + embedded W3C WebDriver server.
    // Compiled in only with `--features wdio`; release builds never contain them.
    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running ForgeTools");
}
