// The app's single bridge to the native side: Tauri core APIs, official plugins and our
// own Rust commands (background/tray settings). Everything else stays in the webview.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { arch, platform as osPlatform } from '@tauri-apps/plugin-os';

// ── Platform ────────────────────────────────────────────────────────────────
export type Platform = 'mac' | 'win' | 'linux';
let cachedPlatform: Platform | null = null;
/** Synchronous: plugin-os injects the OS at startup. Falls back to the UA outside Tauri. */
export function getPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;
  let p: string;
  try { p = osPlatform(); } catch { p = navigator.platform.toLowerCase(); }
  cachedPlatform = /mac|darwin|ios/i.test(p) ? 'mac' : /linux|freebsd|openbsd|netbsd|android/i.test(p) ? 'linux' : 'win';
  return cachedPlatform;
}
export const isMac = (): boolean => getPlatform() === 'mac';

// ── Window ──────────────────────────────────────────────────────────────────
export const appWindow = {
  show: (): Promise<void> => getCurrentWindow().show(),
  minimize: (): Promise<void> => getCurrentWindow().minimize(),
  toggleMaximize: (): Promise<void> => getCurrentWindow().toggleMaximize(),
  /** Same path as a native close: hides to the tray when background mode is on. */
  close: (): Promise<void> => getCurrentWindow().close(),
  startDragging: (): Promise<void> => getCurrentWindow().startDragging(),
  /** null follows the OS theme. */
  setTheme: (theme: 'dark' | 'light' | null): Promise<void> => getCurrentWindow().setTheme(theme),
};

/** Launched by the login item with --hidden: stay in the tray, don't show the window. */
export const startHidden = (): Promise<boolean> => invoke<boolean>('start_hidden');

// ── Clipboard ───────────────────────────────────────────────────────────────
export const CLIPBOARD_MAX = 20 * 1024 * 1024;
export const clipboard = {
  async writeText(text: string): Promise<void> {
    if (typeof text !== 'string') throw new Error('clipboard text must be a string');
    if (text.length > CLIPBOARD_MAX) throw new Error('clipboard text is too large');
    await writeText(text);
  },
  async readText(): Promise<string> {
    const t = (await readText()) ?? '';
    return t.length > CLIPBOARD_MAX ? t.slice(0, CLIPBOARD_MAX) : t;
  },
};

// ── External links ──────────────────────────────────────────────────────────
/** The only URLs the app may open in the browser (also scoped in the opener capability). */
export const EXTERNAL_LINKS = {
  github: 'https://github.com/tengfone/forgetools',
  releases: 'https://github.com/tengfone/forgetools/releases',
  issues: 'https://github.com/tengfone/forgetools/issues',
  coffee: 'https://www.buymeacoffee.com/tengfone',
} as const;
export type ExternalLinkId = keyof typeof EXTERNAL_LINKS | 'latestRelease';
export const RELEASE_PREFIX = 'https://github.com/tengfone/forgetools/releases/';

/** Resolve an allowlisted link id to its URL; throws for anything else. */
export function linkUrl(id: unknown, latestReleaseUrl: () => string): string {
  if (id === 'latestRelease') {
    const u = latestReleaseUrl();
    if (!u.startsWith(RELEASE_PREFIX)) throw new Error('Unknown link');
    return u;
  }
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(EXTERNAL_LINKS, id)) throw new Error('Unknown link');
  return EXTERNAL_LINKS[id as keyof typeof EXTERNAL_LINKS];
}

export async function openLink(id: ExternalLinkId): Promise<void> {
  const { releaseUrl } = await import('./updates');
  await openUrl(linkUrl(id, releaseUrl));
}

// ── App info ────────────────────────────────────────────────────────────────
export interface AppInfo { name: string; version: string; tauri: string; webview: string; platform: string; arch: string }

const webviewVersion = (): string => {
  const m = /(?:Edg|Chrome|AppleWebKit|WebKitGTK)\/([\d.]+)/.exec(navigator.userAgent);
  return m?.[1] ?? 'unknown';
};

export async function getAppInfo(): Promise<AppInfo> {
  const [version, tauri] = await Promise.all([getVersion(), getTauriVersion()]);
  let a = 'unknown';
  try { a = arch(); } catch { /* not in Tauri */ }
  return { name: 'ForgeTools', version, tauri, webview: webviewVersion(), platform: osPlatform(), arch: a };
}

// ── Background / tray (our Rust commands) ───────────────────────────────────
export interface BackgroundSettings { keepInBackground: boolean; openAtLogin: boolean; globalShortcut: string | null }
export interface ShortcutResult { ok: boolean; error?: string; accelerator: string | null }

export const background = {
  get: (): Promise<BackgroundSettings> => invoke('get_background_settings'),
  set: (patch: Partial<Pick<BackgroundSettings, 'keepInBackground' | 'openAtLogin'>>): Promise<BackgroundSettings> =>
    invoke('set_background_settings', { patch }),
  setGlobalShortcut: (accelerator: string | null): Promise<ShortcutResult> => invoke('set_global_shortcut', { accelerator }),
  /** Global shortcut or tray brought the window back: show Home with the search box focused. */
  onGoHome: (cb: () => void): Promise<() => void> => listen('go-home', () => cb()),
};

export { isTauri };
