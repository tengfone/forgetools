// Shared WDIO helpers: app launch, error capture and native window state (Tauri APIs that
// have no WebDriver equivalent). Element interaction lives in the specs, in plain WDIO.

/** Identifier of the E2E build (tauri.wdio.conf.json); never the production one. */
const E2E_IDENTIFIER = 'com.tengfone.forgetools.e2e';

/** Record uncaught page errors, console errors and CSP violations in the page (window.__e2e). */
async function captureErrors() {
  await browser.execute(() => {
    if (window.__e2e) return;
    const e2e = (window.__e2e = { pageErrors: [], consoleErrors: [] });
    window.addEventListener('error', (ev) => e2e.pageErrors.push(ev.message || String(ev.error)));
    // A rejection the page handled (preventDefault) is not an error.
    window.addEventListener(
      'unhandledrejection',
      (ev) => ev.defaultPrevented || e2e.pageErrors.push(String((ev.reason && ev.reason.message) || ev.reason)),
    );
    document.addEventListener('securitypolicyviolation', (ev) =>
      e2e.consoleErrors.push(
        `Refused by Content Security Policy directive "${ev.violatedDirective}": ${ev.blockedURI}`,
      ),
    );
    const orig = console.error.bind(console);
    console.error = (...a) => {
      e2e.consoleErrors.push(a.map(String).join(' '));
      orig(...a);
    };
  });
}
export const pageErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.pageErrors : null));
export const consoleErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.consoleErrors : null));

/**
 * The service keeps ONE app process for all spec files (maxInstances 1). Give every spec file a
 * fresh start: empty localStorage/sessionStorage and a reloaded webview, so no state leaks
 * between files. The reload is detected by performance.timeOrigin changing (a new document).
 * Storage is keyed by the app identifier, so refuse to clear it unless this is the E2E build
 * (tauri.wdio.conf.json); clearing the production identifier's storage would wipe real user data.
 */
async function freshStart() {
  const id = await browser.tauri.execute(() => window.__TAURI__.app.getIdentifier());
  if (id !== E2E_IDENTIFIER) {
    throw new Error(`refusing to clear storage: app identifier is "${id}", expected "${E2E_IDENTIFIER}"`);
  }
  const origin = await browser.execute(() => {
    localStorage.clear();
    sessionStorage.clear();
    setTimeout(() => location.reload(), 0);
    return performance.timeOrigin;
  });
  // While the page is unloading, execute can fail transiently; that just means "not ready yet".
  await browser.waitUntil(
    async () => {
      try {
        return await browser.execute((o) => performance.timeOrigin !== o && document.readyState !== 'loading', origin);
      } catch {
        return false;
      }
    },
    { timeout: 20000, timeoutMsg: 'webview did not reload' },
  );
  // Install error capture right after the reload, before the app finishes initialising,
  // so startup errors are recorded too.
  await captureErrors();
}

/** Fresh start, then wait until the app shell is initialised and the window is visible. */
export async function waitForAppReady() {
  await freshStart();
  await $('#toolsNav [data-tool-id]').waitForDisplayed({
    timeout: 20000,
    timeoutMsg: 'app did not initialise (#toolsNav)',
  });
  await browser.waitUntil(() => windowState().then((s) => s.visible), {
    timeout: 10000,
    timeoutMsg: 'window never became visible',
  });
}

/** Assert no uncaught page errors were recorded (shared afterEach, see wdio.conf.mjs). */
export async function expectNoPageErrors() {
  const errs = await pageErrors();
  if (errs && errs.length) throw new Error(`uncaught page errors: ${JSON.stringify(errs)}`);
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
      menu: outer.height - inner.height - (outer.width - inner.width) > 1,
      theme: await win.theme(),
      platform: T.os.platform(),
    };
  });
}

/** System clipboard via the Tauri clipboard plugin (the real OS clipboard the app writes to). */
export const clipboard = {
  readText: () => browser.tauri.execute(({ core }) => core.invoke('plugin:clipboard-manager|read_text')),
  writeText: (text) =>
    browser.tauri.execute(({ core }, t) => core.invoke('plugin:clipboard-manager|write_text', { text: t }), text),
};
