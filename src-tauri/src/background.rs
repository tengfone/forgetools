// Background / tray mode: close-to-tray, user-defined global shortcut, start at login,
// single instance. Preferences live in a small JSON file in the app data dir.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_notification::NotificationExt;

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
        Self {
            keep_in_background: true,
            open_at_login: false,
            global_shortcut: None,
            tray_notice_shown: false,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSettings {
    keep_in_background: bool,
    open_at_login: bool,
    global_shortcut: Option<String>,
    /// Set only when enabling/disabling the login item failed (the pref was reverted).
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
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
    /// False when the tray icon could not be created; closing then quits normally.
    pub tray_available: AtomicBool,
    /// Serializes writes to disk so the newest snapshot always lands last.
    io: Mutex<()>,
    /// Serializes register/unregister so the OS state and `prefs.global_shortcut` stay consistent.
    shortcut_op: Mutex<()>,
}

/// Lock a mutex, recovering the data if another thread panicked while holding it.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// E2E mode only exists in `--features wdio` builds; release builds ignore `FORGE_E2E`.
pub fn is_e2e() -> bool {
    cfg!(feature = "wdio") && std::env::var_os("FORGE_E2E").is_some_and(|v| !v.is_empty())
}

/// Launched by the login item: start in the tray without showing a window.
pub fn start_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

/// Parse a stored JSON blob leniently, field by field, like the v0.2.1 loader.
pub fn parse_prefs(raw: &str) -> Stored {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Stored::default();
    };
    let d = Stored::default();
    Stored {
        keep_in_background: v
            .get("keepInBackground")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(d.keep_in_background),
        open_at_login: v.get("openAtLogin").and_then(serde_json::Value::as_bool) == Some(true),
        global_shortcut: v
            .get("globalShortcut")
            .and_then(serde_json::Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from),
        tray_notice_shown: v
            .get("trayNoticeShown")
            .and_then(serde_json::Value::as_bool)
            == Some(true),
    }
}

const PREFS_NAME: &str = "background.json";

fn prefs_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    match app.path().app_data_dir() {
        Ok(d) => Some(d.join(PREFS_NAME)),
        Err(e) => {
            log::error!("no app data dir: {e}");
            None
        }
    }
}

/// Where the v0.2.1 build kept its preferences: `<userData>/background.json`.
/// v0.2.1's userData is `<appData>/ForgeTools`, where appData is `$XDG_CONFIG_HOME`
/// (`config_dir`) on Linux and `data_dir` (`%APPDATA%`, `~/Library/Application Support`)
/// on Windows/macOS. Pure: `os` is `std::env::consts::OS`.
pub fn legacy_prefs_path(os: &str, config_dir: &Path, data_dir: &Path) -> PathBuf {
    let base = if os == "linux" { config_dir } else { data_dir };
    base.join("ForgeTools").join(PREFS_NAME)
}

/// Migrate only when the new file is absent and the legacy one exists (and they differ).
pub fn needs_migration(new: &Path, legacy: &Path, new_exists: bool, legacy_exists: bool) -> bool {
    !new_exists && legacy_exists && new != legacy
}

fn migrate_legacy<R: Runtime>(app: &AppHandle<R>, new: &Path) {
    let (Ok(config), Ok(data)) = (app.path().config_dir(), app.path().data_dir()) else {
        return;
    };
    let legacy = legacy_prefs_path(std::env::consts::OS, &config, &data);
    if !needs_migration(new, &legacy, new.exists(), legacy.exists()) {
        return;
    }
    if let Some(dir) = new.parent() {
        if let Err(e) = std::fs::create_dir_all(dir) {
            log::error!("migration: cannot create app data dir: {e}");
            return;
        }
    }
    match std::fs::copy(&legacy, new) {
        Ok(_) => log::info!("migrated legacy {PREFS_NAME} from the v0.2.1 build"),
        Err(e) => log::error!("migrating legacy {PREFS_NAME} failed: {e}"),
    }
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Stored {
    let Some(f) = prefs_file(app) else {
        return Stored::default();
    };
    migrate_legacy(app, &f);
    match std::fs::read_to_string(&f) {
        Ok(s) => parse_prefs(&s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Stored::default(),
        Err(e) => {
            log::error!("reading {PREFS_NAME}: {e}");
            Stored::default()
        }
    }
}

fn write_atomic(f: &Path, s: &str) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(dir) = f.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = f.with_extension("json.tmp");
    let written = std::fs::File::create(&tmp).and_then(|mut file| {
        file.write_all(s.as_bytes())?;
        file.sync_all()
    });
    let res = written.and_then(|()| std::fs::rename(&tmp, f));
    if res.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    res
}

/// Persist the current preferences. Snapshot is taken under the io lock (prefs lock is
/// released before touching disk). Non-fatal: preferences just won't persist.
fn save<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<State>();
    let _io = lock(&st.io);
    let p = lock(&st.prefs).clone();
    let Some(f) = prefs_file(app) else { return };
    let res = serde_json::to_string_pretty(&p)
        .map_err(std::io::Error::other)
        .and_then(|s| write_atomic(&f, &s));
    if let Err(e) = res {
        log::error!("saving {PREFS_NAME}: {e}");
    }
}

fn public(p: &Stored) -> BackgroundSettings {
    BackgroundSettings {
        keep_in_background: p.keep_in_background,
        open_at_login: p.open_at_login,
        global_shortcut: p.global_shortcut.clone(),
        error: None,
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

fn log_err<E: std::fmt::Display>(what: &str, r: Result<(), E>) {
    if let Err(e) = r {
        log::warn!("{what}: {e}");
    }
}

pub fn show_window<R: Runtime>(app: &AppHandle<R>, go_home: bool) {
    let Some(w) = main_window(app) else { return };
    if w.is_minimized().unwrap_or(false) {
        log_err("unminimize", w.unminimize());
    }
    log_err("show", w.show());
    log_err("focus", w.set_focus());
    if go_home {
        log_err("emit go-home", app.emit("go-home", ()));
    }
}

pub fn toggle_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = main_window(app) else { return };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    let minimized = w.is_minimized().unwrap_or(false);
    if visible && focused && !minimized {
        log_err("hide", w.hide());
    } else {
        show_window(app, true);
    }
}

fn apply_login_item<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<(), String> {
    // Never register a dev/test binary as a login item
    if is_e2e() || cfg!(debug_assertions) {
        return Ok(());
    }
    let al = app.autolaunch();
    let r = if on { al.enable() } else { al.disable() };
    r.map_err(|e| {
        log::error!("login item ({on}): {e}");
        e.to_string()
    })
}

/// Set the login preference; on OS failure revert it so the UI reflects reality.
fn set_login<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<(), String> {
    let st = app.state::<State>();
    lock(&st.prefs).open_at_login = on;
    let res = apply_login_item(app, on);
    if res.is_err() {
        lock(&st.prefs).open_at_login = !on;
    }
    save(app);
    res
}

/// Make the OS login item match the stored preference (it may have been removed by the
/// user or an OS cleanup, or left behind by an old install).
fn reconcile_login_item<R: Runtime>(app: &AppHandle<R>) {
    if is_e2e() || cfg!(debug_assertions) {
        return;
    }
    let want = lock(&app.state::<State>().prefs).open_at_login;
    match app.autolaunch().is_enabled() {
        Ok(have) if have == want => {}
        Ok(_) => {
            log::info!("login item out of sync, setting to {want}");
            let _ = apply_login_item(app, want);
        }
        Err(e) => log::warn!("querying login item: {e}"),
    }
}

fn display_mod(tok: &str, mac: bool) -> Option<&'static str> {
    let t = tok.to_ascii_lowercase();
    Some(match (t.as_str(), mac) {
        ("commandorcontrol" | "commandorctrl" | "cmdorctrl" | "cmdorcontrol", false) => "Ctrl",
        (
            "commandorcontrol" | "commandorctrl" | "cmdorctrl" | "cmdorcontrol" | "command" | "cmd"
            | "super" | "meta",
            true,
        ) => "\u{2318}",
        ("ctrl" | "control", true) => "\u{2303}",
        ("alt" | "option", true) => "\u{2325}",
        ("shift", true) => "\u{21E7}",
        _ => return None,
    })
}

/// Human-readable accelerator. Pure; `mac` selects macOS symbols.
pub fn format_accel(a: &str, mac: bool) -> String {
    // A literal '+' key appears as a trailing "++" (or the whole string is "+").
    let (mods, key) = if a == "+" {
        ("", "+")
    } else if let Some(m) = a.strip_suffix("++") {
        (m, "+")
    } else {
        match a.rsplit_once('+') {
            Some((m, k)) => (m, k),
            None => ("", a),
        }
    };
    let mut parts: Vec<String> = mods
        .split('+')
        .filter(|t| !t.is_empty())
        .map(|t| display_mod(t, mac).map_or_else(|| t.to_string(), String::from))
        .collect();
    parts.push(key.to_string());
    parts.join(if mac { "" } else { "+" })
}

pub fn display_accel(a: Option<&str>) -> String {
    match a {
        None => "Not set".into(),
        Some(a) => format_accel(a, IS_MAC),
    }
}

fn rebuild_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let p = lock(&app.state::<State>().prefs).clone();
    let build = || -> tauri::Result<Menu<R>> {
        Menu::with_items(
            app,
            &[
                &MenuItem::with_id(app, "open", "Open ForgeTools", true, None::<&str>)?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(
                    app,
                    "shortcut",
                    format!(
                        "Global shortcut: {}",
                        display_accel(p.global_shortcut.as_deref())
                    ),
                    false,
                    None::<&str>,
                )?,
                &CheckMenuItem::with_id(
                    app,
                    "login",
                    "Start at login",
                    true,
                    p.open_at_login,
                    None::<&str>,
                )?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(app, "quit", "Quit ForgeTools", true, None::<&str>)?,
            ],
        )
    };
    match build() {
        Ok(menu) => log_err("set tray menu", tray.set_menu(Some(menu))),
        Err(e) => log::error!("building tray menu: {e}"),
    }
}

fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut b = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("ForgeTools")
        .show_menu_on_left_click(IS_MAC)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_window(app, true),
            "login" => {
                let on = !lock(&app.state::<State>().prefs).open_at_login;
                // Failure is logged and the checkmark reverts via the rebuilt menu
                let _ = set_login(app, on);
                rebuild_tray_menu(app);
            }
            "quit" => {
                app.state::<State>().quitting.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if IS_MAC {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = e
            {
                show_window(tray.app_handle(), false);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    rebuild_tray_menu(app);
    Ok(())
}

/// Pure close decision: hide to tray only with background mode on, a working tray, and not quitting.
pub fn should_hide_on_close(
    keep_in_background: bool,
    tray_available: bool,
    quitting: bool,
) -> bool {
    keep_in_background && tray_available && !quitting
}

/// Close button: hide to the tray unless quitting, background mode is off, or there is no tray.
pub fn on_close_requested<R: Runtime>(w: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    let app = w.app_handle();
    let st = app.state::<State>();
    if is_e2e() {
        return;
    }
    let notify = {
        let mut p = lock(&st.prefs);
        if !should_hide_on_close(
            p.keep_in_background,
            st.tray_available.load(Ordering::SeqCst),
            st.quitting.load(Ordering::SeqCst),
        ) {
            return;
        }
        let first = !p.tray_notice_shown;
        p.tray_notice_shown = true;
        first
    };
    if notify {
        save(app);
    }
    api.prevent_close();
    log_err("hide", w.hide());
    if notify {
        let body = if IS_MAC {
            "Find it in the menu bar. Press \u{2318}Q to quit."
        } else {
            "Find it in the system tray. Right-click the icon to quit."
        };
        log_err(
            "notification",
            app.notification()
                .builder()
                .title("ForgeTools is still running")
                .body(body)
                .show(),
        );
    }
}

fn register_shortcut<R: Runtime>(app: &AppHandle<R>, accel: Option<String>) -> ShortcutResult {
    let gs = app.global_shortcut();
    let st = app.state::<State>();
    // Held for the whole operation so concurrent calls can't interleave unregister/register.
    let op = lock(&st.shortcut_op);
    let prev = lock(&st.prefs).global_shortcut.clone();
    let parsed = match accel.as_deref().map(str::parse::<Shortcut>) {
        Some(Err(e)) => {
            log::warn!("invalid shortcut {accel:?}: {e}");
            return ShortcutResult {
                ok: false,
                error: Some("Invalid shortcut".into()),
                accelerator: prev,
            };
        }
        Some(Ok(s)) => Some(s),
        None => None,
    };
    if let Some(p) = &prev {
        log_err("unregister shortcut", gs.unregister(p.as_str()));
    }
    let result = match (parsed, accel) {
        (Some(sc), Some(accel)) => {
            if let Err(e) = gs.register(sc) {
                log::warn!("registering {accel}: {e}");
                // Put the previous one back so a failed attempt does not lose the working shortcut
                if let Some(p) = &prev {
                    log_err("re-register previous shortcut", gs.register(p.as_str()));
                }
                return ShortcutResult {
                    ok: false,
                    error: Some("Shortcut is in use by another app".into()),
                    accelerator: prev,
                };
            }
            Some(accel)
        }
        _ => None,
    };
    lock(&st.prefs).global_shortcut.clone_from(&result);
    drop(op);
    save(app);
    rebuild_tray_menu(app);
    ShortcutResult {
        ok: true,
        error: None,
        accelerator: result,
    }
}

pub fn clean_accel(a: Option<String>) -> Option<String> {
    a.map(|s| s.trim().chars().take(64).collect::<String>())
        .filter(|s| !s.is_empty())
}

#[allow(clippy::needless_pass_by_value)] // tauri::State must be taken by value
#[tauri::command]
pub fn get_background_settings(state: tauri::State<'_, State>) -> BackgroundSettings {
    public(&lock(&state.prefs))
}

#[allow(clippy::needless_pass_by_value)] // Tauri commands take AppHandle by value
#[tauri::command]
pub fn set_background_settings(
    app: AppHandle,
    patch: Option<BackgroundPatch>,
) -> BackgroundSettings {
    let patch = patch.unwrap_or_default();
    let st = app.state::<State>();
    if let Some(k) = patch.keep_in_background {
        lock(&st.prefs).keep_in_background = k;
    }
    // set_login saves; on failure the reverted value plus `error` is returned
    let error = if let Some(o) = patch.open_at_login {
        set_login(&app, o)
            .err()
            .map(|_| "Could not update the login item".to_string())
    } else {
        save(&app);
        None
    };
    rebuild_tray_menu(&app);
    let out = public(&lock(&st.prefs));
    BackgroundSettings { error, ..out }
}

#[allow(clippy::needless_pass_by_value)] // Tauri commands take AppHandle by value
#[tauri::command]
pub fn set_global_shortcut(app: AppHandle, accelerator: Option<String>) -> ShortcutResult {
    register_shortcut(&app, clean_accel(accelerator))
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let prefs = load(app);
    let saved = prefs.global_shortcut.clone();
    app.manage(State {
        prefs: Mutex::new(Stored {
            global_shortcut: None,
            ..prefs
        }),
        quitting: AtomicBool::new(false),
        tray_available: AtomicBool::new(false),
        io: Mutex::new(()),
        shortcut_op: Mutex::new(()),
    });
    reconcile_login_item(app);
    if !is_e2e() {
        match create_tray(app) {
            Ok(()) => app
                .state::<State>()
                .tray_available
                .store(true, Ordering::SeqCst),
            Err(e) => log::error!("tray unavailable, closing will quit: {e}"),
        }
    }
    if saved.is_some() {
        let r = register_shortcut(app, saved.clone());
        if !r.ok {
            // keep the preference; it may free up later
            lock(&app.state::<State>().prefs).global_shortcut = saved;
            rebuild_tray_menu(app);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renderer_accelerators_parse() {
        for a in [
            "Ctrl+Alt+Space",
            "Option+Space",
            "Command+Shift+K",
            "Super+F12",
            "Control+Alt+`",
            "CommandOrControl+Shift+Up",
            "Alt+/",
            "Ctrl+Shift+9",
        ] {
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
        let p = parse_prefs(
            r#"{"keepInBackground":false,"openAtLogin":"yes","globalShortcut":"","trayNoticeShown":true}"#,
        );
        assert_eq!(
            p,
            Stored {
                keep_in_background: false,
                open_at_login: false,
                global_shortcut: None,
                tray_notice_shown: true
            }
        );
        let p = parse_prefs(r#"{"globalShortcut":"Ctrl+Alt+Space"}"#);
        assert_eq!(p.global_shortcut.as_deref(), Some("Ctrl+Alt+Space"));
        assert!(p.keep_in_background);
    }

    #[test]
    fn accelerator_is_trimmed_and_capped() {
        assert_eq!(clean_accel(Some("  ".into())), None);
        assert_eq!(clean_accel(None), None);
        assert_eq!(
            clean_accel(Some(format!(" {} ", "A".repeat(100))))
                .unwrap()
                .len(),
            64
        );
    }

    #[test]
    fn close_decision() {
        assert!(should_hide_on_close(true, true, false));
        assert!(!should_hide_on_close(false, true, false));
        assert!(!should_hide_on_close(true, false, false));
        assert!(!should_hide_on_close(true, true, true));
    }

    #[test]
    fn migration_paths() {
        let (cfg, data) = (Path::new("cfg"), Path::new("data"));
        assert_eq!(
            legacy_prefs_path("linux", cfg, data),
            cfg.join("ForgeTools").join("background.json")
        );
        for os in ["windows", "macos"] {
            assert_eq!(
                legacy_prefs_path(os, cfg, data),
                data.join("ForgeTools").join("background.json")
            );
        }
        let legacy = legacy_prefs_path("windows", cfg, data);
        let new = Path::new("appdata").join("background.json");
        assert!(needs_migration(&new, &legacy, false, true));
        assert!(!needs_migration(&new, &legacy, true, true));
        assert!(!needs_migration(&new, &legacy, false, false));
        assert!(!needs_migration(&legacy, &legacy, false, true));
    }

    #[test]
    fn accel_display() {
        assert_eq!(display_accel(None), "Not set");
        assert_eq!(
            format_accel("Ctrl+Alt+Space", true),
            "\u{2303}\u{2325}Space"
        );
        assert_eq!(format_accel("Control+Shift+K", true), "\u{2303}\u{21E7}K");
        assert_eq!(format_accel("Command+K", true), "\u{2318}K");
        assert_eq!(format_accel("Cmd+K", true), "\u{2318}K");
        assert_eq!(
            format_accel("CommandOrControl+Shift+Up", true),
            "\u{2318}\u{21E7}Up"
        );
        assert_eq!(format_accel("Super+F12", true), "\u{2318}F12");
        assert_eq!(format_accel("Option+Space", true), "\u{2325}Space");
        assert_eq!(format_accel("Ctrl++", true), "\u{2303}+");
        assert_eq!(format_accel("Ctrl++", false), "Ctrl++");
        assert_eq!(format_accel("CommandOrControl+A", false), "Ctrl+A");
        assert_eq!(format_accel("Ctrl+Alt+Space", false), "Ctrl+Alt+Space");
    }
}
