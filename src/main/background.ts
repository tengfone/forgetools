// Background / tray mode: close-to-tray, user-defined global shortcut, start at login,
// single instance. Preferences live in a small JSON file in userData (main process only).
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, Notification, Tray } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS, type BackgroundSettings, type ShortcutResult } from '../types/ipc';
import { handle } from './ipcGuard';

interface Stored extends BackgroundSettings { trayNoticeShown: boolean }

const DEFAULTS: Stored = { keepInBackground: true, openAtLogin: false, globalShortcut: null, trayNoticeShown: false };
const isE2E = !!process.env.FORGE_E2E;
const isMac = process.platform === 'darwin';

let prefs: Stored = { ...DEFAULTS };
let tray: Tray | null = null;
let quitting = false;
let getWindow: () => BrowserWindow | null = () => null;

const prefsFile = (): string => path.join(app.getPath('userData'), 'background.json');

function load(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as Partial<Stored>;
    prefs = {
      keepInBackground: typeof raw.keepInBackground === 'boolean' ? raw.keepInBackground : DEFAULTS.keepInBackground,
      openAtLogin: raw.openAtLogin === true,
      globalShortcut: typeof raw.globalShortcut === 'string' && raw.globalShortcut ? raw.globalShortcut : null,
      trayNoticeShown: raw.trayNoticeShown === true,
    };
  } catch {
    prefs = { ...DEFAULTS };
  }
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2));
  } catch {
    // Non-fatal: preferences just won't persist
  }
}

const publicSettings = (): BackgroundSettings => ({
  keepInBackground: prefs.keepInBackground,
  openAtLogin: prefs.openAtLogin,
  globalShortcut: prefs.globalShortcut,
});

/** True while the app is really quitting (Quit menu, Cmd+Q, app.quit()). */
export const isQuitting = (): boolean => quitting;

/** Launched by the login item: start in the tray without showing a window. */
export const startHidden = (): boolean => process.argv.includes('--hidden');

function iconPath(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'tray.png'),
    path.join(app.getAppPath(), 'build', 'icon256.png'),
    path.join(__dirname, '../../build/icon256.png'),
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) ?? '';
}

export function showWindow(goHome = false): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (goHome) win.webContents.send(IPC_CHANNELS.BACKGROUND.GO_HOME);
}

function toggleWindow(): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused() && !win.isMinimized()) win.hide();
  else showWindow(true);
}

function applyLoginItem(): void {
  if (isE2E || !app.isPackaged) return; // never register a dev/test binary as a login item
  try {
    app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, args: ['--hidden'] });
  } catch {
    // Unsupported on this platform (e.g. some Linux desktops)
  }
}

function registerShortcut(accel: string | null): ShortcutResult {
  if (prefs.globalShortcut) {
    try { globalShortcut.unregister(prefs.globalShortcut); } catch { /* ignore */ }
  }
  if (!accel) {
    prefs.globalShortcut = null;
    save();
    rebuildTrayMenu();
    return { ok: true, accelerator: null };
  }
  let ok = false;
  try { ok = globalShortcut.register(accel, toggleWindow); } catch { ok = false; }
  if (!ok) {
    // Put the previous one back so a failed attempt does not lose the working shortcut
    const prev = prefs.globalShortcut;
    if (prev) { try { globalShortcut.register(prev, toggleWindow); } catch { /* ignore */ } }
    return { ok: false, error: 'Shortcut is in use by another app', accelerator: prev };
  }
  prefs.globalShortcut = accel;
  save();
  rebuildTrayMenu();
  return { ok: true, accelerator: accel };
}

const displayAccel = (a: string | null): string =>
  !a ? 'Not set' : isMac ? a.replace(/CommandOrControl|CmdOrCtrl|Command/g, '⌘').replace(/Control/g, '⌃').replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '') : a;

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ForgeTools', click: () => showWindow(true) },
    { type: 'separator' },
    { label: `Global shortcut: ${displayAccel(prefs.globalShortcut)}`, enabled: false },
    {
      label: 'Start at login', type: 'checkbox', checked: prefs.openAtLogin,
      click: item => { prefs.openAtLogin = item.checked; save(); applyLoginItem(); },
    },
    { type: 'separator' },
    { label: 'Quit ForgeTools', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray(): void {
  if (tray || isE2E) return;
  const file = iconPath();
  let img = file ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(img);
  tray.setToolTip('ForgeTools');
  if (!isMac) tray.on('click', () => showWindow());
  rebuildTrayMenu();
}

/**
 * Close button behaviour: hide to the tray unless the app is quitting or the user turned
 * background mode off. Session inputs live in the renderer and survive the hide.
 */
export function attachWindow(win: BrowserWindow): void {
  win.on('close', e => {
    if (quitting || !prefs.keepInBackground || isE2E) return; // tests must be able to close normally
    e.preventDefault();
    win.hide();
    if (!prefs.trayNoticeShown && !isE2E) {
      prefs.trayNoticeShown = true;
      save();
      if (Notification.isSupported()) {
        new Notification({
          title: 'ForgeTools is still running',
          body: isMac ? 'Find it in the menu bar. Press ⌘Q to quit.' : 'Find it in the system tray. Right-click the icon to quit.',
        }).show();
      }
    }
  });
}

/** Single-instance lock. Returns false when another instance owns the lock (caller should quit). */
export function claimSingleInstance(): boolean {
  if (isE2E) return true; // parallel test workers each need their own instance
  if (!app.requestSingleInstanceLock()) return false;
  app.on('second-instance', () => showWindow());
  return true;
}

export function initBackground(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  load();
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());

  handle(IPC_CHANNELS.BACKGROUND.GET, () => publicSettings());
  handle(IPC_CHANNELS.BACKGROUND.SET, (_e, patch: unknown) => {
    const p = (patch ?? {}) as Partial<BackgroundSettings>;
    if (typeof p.keepInBackground === 'boolean') prefs.keepInBackground = p.keepInBackground;
    if (typeof p.openAtLogin === 'boolean') { prefs.openAtLogin = p.openAtLogin; applyLoginItem(); }
    save();
    rebuildTrayMenu();
    return publicSettings();
  });
  handle(IPC_CHANNELS.BACKGROUND.SET_SHORTCUT, (_e, accel: unknown): ShortcutResult => {
    const a = typeof accel === 'string' && accel.trim() ? accel.trim().slice(0, 64) : null;
    return registerShortcut(a);
  });

  createTray();
  if (prefs.globalShortcut) {
    const saved = prefs.globalShortcut;
    prefs.globalShortcut = null; // registerShortcut unregisters the "previous"; nothing is registered yet
    const r = registerShortcut(saved);
    if (!r.ok) { prefs.globalShortcut = saved; rebuildTrayMenu(); } // keep the preference; it may free up later
  }
}
