// Shared WDIO helpers: Tauri replacement for helpers/electronApp.js.
// The service launches the app per spec file; this waits for it to be ready the same
// way the Electron helper did (tools registry loaded, sidebar populated, window shown).

/** Wait until the app shell is initialised and the window is visible. */
export async function waitForAppReady() {
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
