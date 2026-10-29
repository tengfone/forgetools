import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';

/** Exact file URL of the packaged/built renderer entry point. */
export const APP_INDEX_URL = pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;

/** Dev server URL injected by electron-vite (ELECTRON_RENDERER_URL); legacy name kept for compatibility. */
export const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || '';

/** True when `url` is the app's own document (exact index.html file URL, or the dev server origin). */
export function isAppUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'file:') {
    u.hash = '';
    u.search = '';
    return u.href === APP_INDEX_URL;
  }
  if (DEV_SERVER_URL) {
    try { return u.origin === new URL(DEV_SERVER_URL).origin; } catch { return false; }
  }
  return false;
}

type AnyEvent = IpcMainEvent | IpcMainInvokeEvent;

/** Reject IPC from any frame that is not the app's own top-level document. */
export function isTrustedSender(event: AnyEvent): boolean {
  const frame = event.senderFrame;
  if (!frame || frame.parent) return false;
  return isAppUrl(frame.url);
}

/** ipcMain.handle wrapper that validates the sender first. */
export function handle<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
    return fn(event, ...(args as A));
  });
}

/** ipcMain.on wrapper that silently drops messages from untrusted senders. */
export function on<A extends unknown[]>(channel: string, fn: (event: IpcMainEvent, ...args: A) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return;
    fn(event, ...(args as A));
  });
}
