// Background / tray mode: close-to-tray, user-defined global shortcut, start at login,
// single instance. Preferences live in a small JSON file in the app data dir.
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub const TRAY_ID: &str = "main";
const IS_MAC: bool = cfg!(target_os = "macos");

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stored {
    pub keep_in_background: bool,
    pub open_at_login: bool,
    pub global_shortcut: Option<String>,
    pub tray_notice_shown: bool,
}

impl Default for Stored {
    fn default() -> Self {
        Self { keep_in_background: true, open_at_login: false, global_shortcut: None, tray_notice_shown: false }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSettings {
    keep_in_background: bool,
    open_at_login: bool,
    global_shortcut: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundPatch {
    keep_in_background: Option<bool>,
    open_at_login: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    accelerator: Option<String>,
}

pub struct State {
    pub prefs: Mutex<Stored>,
    pub quitting: AtomicBool,
}

pub fn is_e2e() -> bool {
    std::env::var_os("FORGE_E2E").is_some_and(|v| !v.is_empty())
}

/// Launched by the login item: start in the tray without showing a window.
pub fn start_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

/// Parse a stored JSON blob leniently, field by field, like the v0.2.1 loader.
pub fn parse_prefs(raw: &str) -> Stored {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else { return Stored::default() };
    let d = Stored::default();
    Stored {
        keep_in_background: v.get("keepInBackground").and_then(|x| x.as_bool()).unwrap_or(d.keep_in_background),
        open_at_login: v.get("openAtLogin").and_then(|x| x.as_bool()) == Some(true),
        global_shortcut: v.get("globalShortcut").and_then(|x| x.as_str()).filter(|s| !s.is_empty()).map(String::from),
        tray_notice_shown: v.get("trayNoticeShown").and_then(|x| x.as_bool()) == Some(true),
    }
}

fn prefs_file<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("background.json"))
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Stored {
    prefs_file(app).and_then(|f| std::fs::read_to_string(f).ok()).map(|s| parse_prefs(&s)).unwrap_or_default()
}

fn save<R: Runtime>(app: &AppHandle<R>, p: &Stored) {
    // Non-fatal: preferences just won't persist
    if let Some(f) = prefs_file(app) {
        if let Some(dir) = f.parent() { let _ = std::fs::create_dir_all(dir); }
        if let Ok(s) = serde_json::to_string_pretty(p) { let _ = std::fs::write(f, s); }
    }
}

fn public(p: &Stored) -> BackgroundSettings {
    BackgroundSettings { keep_in_background: p.keep_in_background, open_at_login: p.open_at_login, global_shortcut: p.global_shortcut.clone() }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

pub fn show_window<R: Runtime>(app: &AppHandle<R>, go_home: bool) {
    let Some(w) = main_window(app) else { return };
    if w.is_minimized().unwrap_or(false) { let _ = w.unminimize(); }
    let _ = w.show();
    let _ = w.set_focus();
    if go_home { let _ = app.emit("go-home", ()); }
}

pub fn toggle_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = main_window(app) else { return };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    let minimized = w.is_minimized().unwrap_or(false);
    if visible && focused && !minimized { let _ = w.hide(); } else { show_window(app, true); }
}

fn apply_login_item<R: Runtime>(app: &AppHandle<R>, on: bool) {
    // Never register a dev/test binary as a login item
    if is_e2e() || cfg!(debug_assertions) { return; }
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    let _ = if on { al.enable() } else { al.disable() };
}

pub fn display_accel(a: Option<&str>) -> String {
    match a {
        None => "Not set".into(),
        Some(a) if IS_MAC => {
            let mut s = a.to_string();
            for (from, to) in [("CommandOrControl", "\u{2318}"), ("CmdOrCtrl", "\u{2318}"), ("Command", "\u{2318}"), ("Control", "\u{2303}"), ("Alt", "\u{2325}"), ("Option", "\u{2325}"), ("Shift", "\u{21E7}"), ("+", "")] {
                s = s.replace(from, to);
            }
            s
        }
        Some(a) => a.into(),
    }
}

fn rebuild_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let p = app.state::<State>().prefs.lock().unwrap().clone();
    let build = || -> tauri::Result<Menu<R>> {
        Menu::with_items(app, &[
            &MenuItem::with_id(app, "open", "Open ForgeTools", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "shortcut", format!("Global shortcut: {}", display_accel(p.global_shortcut.as_deref())), false, None::<&str>)?,
            &CheckMenuItem::with_id(app, "login", "Start at login", true, p.open_at_login, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit ForgeTools", true, None::<&str>)?,
        ])
    };
    if let Ok(menu) = build() { let _ = tray.set_menu(Some(menu)); }
}

fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if is_e2e() { return Ok(()); }
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("ForgeTools")
        .show_menu_on_left_click(IS_MAC)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_window(app, true),
            "login" => {
                let st = app.state::<State>();
                let p = { let mut p = st.prefs.lock().unwrap(); p.open_at_login = !p.open_at_login; save(app, &p); p.clone() };
                apply_login_item(app, p.open_at_login);
                rebuild_tray_menu(app);
            }
            "quit" => { app.state::<State>().quitting.store(true, Ordering::SeqCst); app.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if IS_MAC { return; }
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_window(tray.app_handle(), false);
            }
        });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    rebuild_tray_menu(app);
    Ok(())
}

/// Close button: hide to the tray unless quitting or background mode is off.
pub fn on_close_requested<R: Runtime>(w: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    let app = w.app_handle();
    let st = app.state::<State>();
    if is_e2e() || st.quitting.load(Ordering::SeqCst) { return; }
    let notify = {
        let mut p = st.prefs.lock().unwrap();
        if !p.keep_in_background { return; }
        let first = !p.tray_notice_shown;
        if first { p.tray_notice_shown = true; save(app, &p); }
        first
    };
    api.prevent_close();
    let _ = w.hide();
    if notify {
        use tauri_plugin_notification::NotificationExt;
        let body = if IS_MAC { "Find it in the menu bar. Press \u{2318}Q to quit." } else { "Find it in the system tray. Right-click the icon to quit." };
        let _ = app.notification().builder().title("ForgeTools is still running").body(body).show();
    }
}

fn register_shortcut<R: Runtime>(app: &AppHandle<R>, accel: Option<String>) -> ShortcutResult {
    let gs = app.global_shortcut();
    let st = app.state::<State>();
    let prev = st.prefs.lock().unwrap().global_shortcut.clone();
    if let Some(p) = &prev { let _ = gs.unregister(p.as_str()); }
    let Some(accel) = accel else {
        { let mut p = st.prefs.lock().unwrap(); p.global_shortcut = None; save(app, &p); }
        rebuild_tray_menu(app);
        return ShortcutResult { ok: true, error: None, accelerator: None };
    };
    if gs.register(accel.as_str()).is_err() {
        // Put the previous one back so a failed attempt does not lose the working shortcut
        if let Some(p) = &prev { let _ = gs.register(p.as_str()); }
        return ShortcutResult { ok: false, error: Some("Shortcut is in use by another app".into()), accelerator: prev };
    }
    { let mut p = st.prefs.lock().unwrap(); p.global_shortcut = Some(accel.clone()); save(app, &p); }
    rebuild_tray_menu(app);
    ShortcutResult { ok: true, error: None, accelerator: Some(accel) }
}

pub fn clean_accel(a: Option<String>) -> Option<String> {
    a.map(|s| s.trim().chars().take(64).collect::<String>()).filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn get_background_settings(state: tauri::State<'_, State>) -> BackgroundSettings {
    public(&state.prefs.lock().unwrap())
}

#[tauri::command]
pub fn set_background_settings(app: AppHandle, patch: Option<BackgroundPatch>) -> BackgroundSettings {
    let patch = patch.unwrap_or_default();
    let st = app.state::<State>();
    let p = {
        let mut p = st.prefs.lock().unwrap();
        if let Some(k) = patch.keep_in_background { p.keep_in_background = k; }
        if let Some(o) = patch.open_at_login { p.open_at_login = o; }
        save(&app, &p);
        p.clone()
    };
    if patch.open_at_login.is_some() { apply_login_item(&app, p.open_at_login); }
    rebuild_tray_menu(&app);
    public(&p)
}

#[tauri::command]
pub fn set_global_shortcut(app: AppHandle, accelerator: Option<String>) -> ShortcutResult {
    register_shortcut(&app, clean_accel(accelerator))
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let prefs = load(app);
    let saved = prefs.global_shortcut.clone();
    app.manage(State { prefs: Mutex::new(Stored { global_shortcut: None, ..prefs }), quitting: AtomicBool::new(false) });
    create_tray(app)?;
    if saved.is_some() {
        let r = register_shortcut(app, saved.clone());
        if !r.ok {
            // keep the preference; it may free up later
            app.state::<State>().prefs.lock().unwrap().global_shortcut = saved;
            rebuild_tray_menu(app);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn renderer_accelerators_parse() {
        for a in ["Ctrl+Alt+Space", "Option+Space", "Command+Shift+K", "Super+F12", "Control+Alt+`", "CommandOrControl+Shift+Up", "Alt+/", "Ctrl+Shift+9"] {
            assert!(a.parse::<Shortcut>().is_ok(), "{a} should parse");
        }
        // Every key name the renderer's toAccelerator() can emit
        let keys = "A Z 0 9 F1 F24 Space Enter Tab Backspace Delete Insert Home End PageUp PageDown Up Down Left Right ` - = [ ] \\ ; ' , . /";
        for k in keys.split(' ') {
            let a = format!("Ctrl+Shift+{k}");
            assert!(a.parse::<Shortcut>().is_ok(), "{a} should parse");
        }
    }

    #[test]
    fn prefs_load_leniently() {
        assert_eq!(parse_prefs("not json"), Stored::default());
        let p = parse_prefs(r#"{"keepInBackground":false,"openAtLogin":"yes","globalShortcut":"","trayNoticeShown":true}"#);
        assert_eq!(p, Stored { keep_in_background: false, open_at_login: false, global_shortcut: None, tray_notice_shown: true });
        let p = parse_prefs(r#"{"globalShortcut":"Ctrl+Alt+Space"}"#);
        assert_eq!(p.global_shortcut.as_deref(), Some("Ctrl+Alt+Space"));
        assert!(p.keep_in_background);
    }

    #[test]
    fn accelerator_is_trimmed_and_capped() {
        assert_eq!(clean_accel(Some("  ".into())), None);
        assert_eq!(clean_accel(None), None);
        assert_eq!(clean_accel(Some(format!(" {} ", "A".repeat(100)))).unwrap().len(), 64);
    }
}
