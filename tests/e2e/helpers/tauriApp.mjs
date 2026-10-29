// Shared WDIO helpers: app launch and native window state.
// The service launches the app per spec file; this waits for it to be ready the same
// way v0.2.1 did (tools registry loaded, sidebar populated, window shown).

/**
 * The service keeps ONE app process for all spec files (maxInstances 1), while the v0.2.1
 * suite launched a fresh app per file. Recreate that: default window size (tauri.conf.json)
 * and a reloaded webview, so no in-memory state (open tool, dialogs) leaks between files.
 * localStorage persists, exactly like the app data dir did across launches.
 */
async function freshStart() {
  await browser.tauri.execute(async () => {
    const T = window.__TAURI__;
    await T.window.getCurrentWindow().setSize(new T.dpi.LogicalSize(1000, 600));
  });
  await browser.execute(() => { window.__e2eStale = true; setTimeout(() => location.reload(), 0); });
  await browser.waitUntil(() => browser.execute(() => !window.__e2eStale && document.readyState === 'complete').catch(() => false),
    { timeout: 20000, timeoutMsg: 'webview did not reload' });
}

/** Wait until the app shell is initialised and the window is visible. */
export async function waitForAppReady() {
  await freshStart();
  await browser.waitUntil(
    () => browser.execute(() => {
      const nav = document.getElementById('toolsNav');
      return typeof window.tools !== 'undefined' && !!nav && nav.children.length > 0;
    }),
    { timeout: 20000, timeoutMsg: 'app did not initialise (window.tools / #toolsNav)' },
  );
  await $('#toolsNav [data-tool-id]').waitForDisplayed({ timeout: 10000 });
  const visible = await browser.waitUntil(() => windowState().then((s) => s.visible), {
    timeout: 10000, timeoutMsg: 'window never became visible',
  });
  return visible;
}

/** Native window state via the Tauri window API (replaces BrowserWindow in app.evaluate). */
export function windowState() {
  // browser.tauri.execute injects only `core`; the window API comes from the global
  // (withGlobalTauri is enabled in the wdio build only).
  return browser.tauri.execute(async () => {
    const win = window.__TAURI__.window.getCurrentWindow();
    return { title: await win.title(), visible: await win.isVisible() };
  });
}

/** Window chrome: decorations, menu bar, native theme and OS (shell.spec). */
export function nativeWindow() {
  return browser.tauri.execute(async () => {
    const T = window.__TAURI__;
    const win = T.window.getCurrentWindow();
    const [inner, outer] = await Promise.all([win.innerSize(), win.outerSize()]);
    return {
      decorated: await win.isDecorated(),
      // A menu bar or native title bar adds height only. Undecorated Windows windows keep an invisible
      // resize frame (8px left/right/bottom, 1px top), so compare vertical chrome with horizontal chrome.
      menu: (outer.height - inner.height) - (outer.width - inner.width) > 1,
      theme: await win.theme(),
      platform: T.os.platform(),
    };
  });
}
