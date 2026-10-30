// Shared WDIO helpers: app launch, error capture and native window state (Tauri APIs that
// have no WebDriver equivalent). Element interaction lives in the specs, in plain WDIO.
import fs from 'node:fs';

// Default window size, read from the app config so the tests follow it.
const conf = JSON.parse(fs.readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const mainWindow = conf.app.windows[0];
const DEFAULT_SIZE = { width: mainWindow.width, height: mainWindow.height };

/**
 * Resize the webview's client area via the Tauri window API. WebDriver's setWindowSize sets the
 * outer size, which on an undecorated window with an invisible resize frame is not the viewport.
 */
export async function setInnerSize(width, height) {
  await browser.tauri.execute(async (_t, w, h) => {
    const T = window.__TAURI__;
    await T.window.getCurrentWindow().setSize(new T.dpi.LogicalSize(w, h));
  }, width, height);
  await browser.waitUntil(() => browser.execute((w, h) => innerWidth === w && innerHeight === h, width, height),
    { timeout: 5000, timeoutMsg: `viewport never became ${width}x${height}` });
}

/** Record uncaught page errors, console errors and CSP violations in the page (window.__e2e). */
async function captureErrors() {
  await browser.execute(() => {
    if (window.__e2e) return;
    const e2e = (window.__e2e = { pageErrors: [], consoleErrors: [] });
    window.addEventListener('error', ev => e2e.pageErrors.push(ev.message || String(ev.error)));
    // A rejection the page handled (preventDefault) is not an error.
    window.addEventListener('unhandledrejection', ev => ev.defaultPrevented || e2e.pageErrors.push(String(ev.reason && ev.reason.message || ev.reason)));
    document.addEventListener('securitypolicyviolation', ev =>
      e2e.consoleErrors.push(`Refused by Content Security Policy directive "${ev.violatedDirective}": ${ev.blockedURI}`));
    const orig = console.error.bind(console);
    console.error = (...a) => { e2e.consoleErrors.push(a.map(String).join(' ')); orig(...a); };
  });
}
export const pageErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.pageErrors : null));
export const consoleErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.consoleErrors : null));

/**
 * The service keeps ONE app process for all spec files (maxInstances 1). Give every spec file a
 * fresh start: default window size (tauri.conf.json) and a reloaded webview, so no in-memory
 * state leaks between files. localStorage persists, like the app data dir across launches.
 */
async function freshStart() {
  await setInnerSize(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
  await browser.execute(() => { window.__e2eStale = true; setTimeout(() => location.reload(), 0); });
  // While the page is unloading, execute can fail transiently; that just means "not ready yet".
  await browser.waitUntil(async () => {
    try { return await browser.execute(() => !window.__e2eStale && document.readyState === 'complete'); }
    catch { return false; }
  }, { timeout: 20000, timeoutMsg: 'webview did not reload' });
  // Install error capture right after the reload, before the app finishes initialising,
  // so startup errors are recorded too.
  await captureErrors();
}

/** Fresh start, then wait until the app shell is initialised and the window is visible. */
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
  await browser.waitUntil(() => windowState().then((s) => s.visible), {
    timeout: 10000, timeoutMsg: 'window never became visible',
  });
}

/** Native window state via the Tauri window API. */
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

/** System clipboard via the Tauri clipboard plugin (the real OS clipboard the app writes to). */
export const clipboard = {
  readText: () => browser.tauri.execute(({ core }) => core.invoke('plugin:clipboard-manager|read_text')),
  writeText: text => browser.tauri.execute(({ core }, t) => core.invoke('plugin:clipboard-manager|write_text', { text: t }), text),
};
