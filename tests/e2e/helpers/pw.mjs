// Playwright-compatible helpers over WebdriverIO, so the ported specs keep their exact
// assertions and semantics. Only what the six specs use is implemented:
//  - locators (CSS, `>> nth=N`, .first/.last/.nth, .locator, { hasText }) resolved in the page;
//  - auto-retrying assertions (toBeVisible, toHaveText, toHaveValue, ...) with a 10 s default,
//    matching the old playwright.config `expect.timeout`;
//  - fill() = focus + select all + one insertText (Playwright's behaviour, not per-key typing);
//  - selectOption() = set value + dispatch input/change (as Playwright does);
//  - expect.poll(fn).matcher(...).
import { expect as wdioExpect } from '@wdio/globals';
import { Key } from 'webdriverio';

const DEFAULT_TIMEOUT = 10000;
const ACTION_TIMEOUT = 30000;

// ---------------------------------------------------------------------------
// In-page query. One self-contained function (the page CSP forbids eval).
function pageQuery(steps, op, arg) {
  let els = [document];
  for (const s of steps) {
    if (s.css !== undefined) {
      const out = [];
      for (const e of els) out.push(...e.querySelectorAll(s.css));
      els = [...new Set(out)];
    } else if (s.nth !== undefined) {
      const e = s.nth < 0 ? els[els.length + s.nth] : els[s.nth];
      els = e ? [e] : [];
    } else if (s.hasText !== undefined) {
      els = els.filter(e => (e.textContent || '').includes(s.hasText));
    }
  }
  const norm = t => (t || '').replace(/[\s\u200b]+/g, ' ').trim();
  const visible = e => {
    if (!e || !e.isConnected) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  };
  const el = els[0];
  switch (op) {
    case 'state':
      return {
        count: els.length,
        visible: visible(el),
        text: el ? el.textContent : null,
        texts: els.map(e => norm(e.textContent)),
        value: el && 'value' in el ? el.value : null,
        className: el ? (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '') : null,
        attr: el && arg ? el.getAttribute(arg) : null,
        focused: !!el && document.activeElement === el,
        checked: !!el && !!el.checked,
      };
    case 'el': {
      // Tag the element so WebdriverIO can address it by CSS (no element-reference round trip).
      if (!el) return null;
      const id = String(++window.__e2eRef || (window.__e2eRef = 1));
      el.setAttribute('data-e2e-ref', id);
      return id;
    }
    case 'scroll':
      // Like Playwright: only scroll when the element is not already in view
      if (el) { if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false); else el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      return !!el;
    case 'center': {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, key: [r.x, r.y, r.width, r.height].join(','), hits: !!hit && (hit === el || el.contains(hit)) };
    }
    case 'clickfocus': {
      // Browser default for a real mousedown: focus the nearest focusable ancestor of the target.
      // Applied inside the next mousedown event (one-shot), so it can never run after the click
      // handler has already moved focus elsewhere.
      if (!el) return false;
      document.addEventListener('mousedown', (e) => {
        if (e.defaultPrevented || !(e.target instanceof Element)) return;
        const f = e.target.closest('button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]');
        if (f && !f.disabled && !f.contains(document.activeElement)) f.focus({ preventScroll: true });
      }, { capture: false, once: true });
      return true;
    }
    case 'focus':
      if (el) el.focus();
      return !!el;
    case 'fill': {
      if (!el) return false;
      el.focus();
      const textLike = el.isContentEditable || el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && ['', 'text', 'search', 'password', 'url', 'tel', 'email'].includes(el.type));
      if (textLike && typeof el.select === 'function') {
        el.select();
        if (arg === '') document.execCommand('delete');
        else document.execCommand('insertText', false, arg);
        if (el.value !== arg) { // execCommand unavailable: same events, set directly
          el.value = arg;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        el.value = arg;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    case 'select': {
      if (!el || el.tagName !== 'SELECT') return false;
      const opts = [...el.options];
      const want = typeof arg === 'string' ? opts.find(o => o.value === arg) ?? opts.find(o => o.label === arg) : opts.find(o => o.label === arg.label);
      if (!want) return false;
      el.focus();
      el.value = want.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    default:
      throw new Error('unknown op ' + op);
  }
}

const query = (steps, op, arg) => browser.execute(pageQuery, steps, op, arg ?? null);

function parseSelector(sel) {
  const steps = [];
  for (const part of sel.split(/\s*>>\s*/)) {
    const m = /^nth=(-?\d+)$/.exec(part);
    steps.push(m ? { nth: Number(m[1]) } : { css: part });
  }
  return steps;
}

async function retry(fn, timeout, what) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { return await fn(); } catch (e) { last = e; }
    if (Date.now() > end) {
      if (last && what) last.message = `${what}: ${last.message}`;
      throw last;
    }
    await browser.pause(100);
  }
}

// ---------------------------------------------------------------------------
// Keyboard: Playwright key names -> WebDriver keys.
const KEY_MAP = {
  Control: Key.Ctrl, Shift: Key.Shift, Alt: Key.Alt, Meta: Key.Command,
  Enter: Key.Enter, Escape: Key.Escape, Tab: Key.Tab, Backspace: Key.Backspace, Delete: Key.Delete,
  ArrowUp: Key.ArrowUp, ArrowDown: Key.ArrowDown, ArrowLeft: Key.ArrowLeft, ArrowRight: Key.ArrowRight,
  Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown, Space: Key.Space,
  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
};
async function pressCombo(combo) {
  const parts = combo.split('+');
  const keyName = parts.pop();
  const mods = parts.map(m => KEY_MAP[m]);
  const shift = parts.includes('Shift');
  // Single letters: Playwright sends the physical key; lowercase unless Shift is held.
  const key = KEY_MAP[keyName] ?? (keyName.length === 1 && !shift ? keyName.toLowerCase() : keyName);
  await browser.keys([...mods, key]);
}

// ---------------------------------------------------------------------------
export class Locator {
  constructor(steps) { this.steps = steps; }
  locator(sel, opts) { return new Locator([...this.steps, ...parseSelector(sel), ...(opts?.hasText ? [{ hasText: opts.hasText }] : [])]); }
  first() { return new Locator([...this.steps, { nth: 0 }]); }
  last() { return new Locator([...this.steps, { nth: -1 }]); }
  nth(i) { return new Locator([...this.steps, { nth: i }]); }
  state(attr) { return query(this.steps, 'state', attr); }
  async count() { return (await this.state()).count; }
  async isVisible() { return (await this.state()).visible; }
  async textContent() { return (await this.state()).text; }
  async inputValue() { return (await this.waitFor({ state: 'attached' }), (await this.state()).value); }
  async getAttribute(name) { return (await this.state(name)).attr; }

  async waitFor({ state = 'visible', timeout = ACTION_TIMEOUT } = {}) {
    await retry(async () => {
      const s = await this.state();
      const ok = state === 'visible' ? s.visible : state === 'hidden' ? !s.visible : state === 'detached' ? s.count === 0 : s.count > 0;
      if (!ok) throw new Error(`locator ${JSON.stringify(this.steps)} not ${state}`);
    }, timeout);
  }

  /** The element as a WebdriverIO element (for real pointer/keyboard input). */
  async element() {
    const ref = await query(this.steps, 'el');
    if (!ref) throw new Error(`no element for ${JSON.stringify(this.steps)}`);
    return browser.$(`[data-e2e-ref="${ref}"]`);
  }

  async click() {
    await retry(async () => {
      await this.waitFor({ timeout: 500 });
      await this.pointer(true);
    }, ACTION_TIMEOUT, `click ${JSON.stringify(this.steps)}`);
  }
  /** Like Playwright: scroll only if needed, then act at the element's centre in viewport coordinates
   *  (WebDriver element actions would re-scroll the element into view). */
  async pointer(click) {
    await query(this.steps, 'scroll');
    // Actionability (Playwright): stable for two samples and receives the pointer at its centre.
    let p = await query(this.steps, 'center');
    for (;;) {
      if (!p) throw new Error(`no element for ${JSON.stringify(this.steps)}`);
      await browser.pause(50);
      const q = await query(this.steps, 'center');
      if (q && q.key === p.key) { p = q; break; }
      p = q;
    }
    if (click && !p.hits) throw new Error(`element is covered at its centre: ${JSON.stringify(this.steps)}`);
    let a = browser.action('pointer').move({ x: p.x, y: p.y, origin: 'viewport' });
    if (click) {
      await query(this.steps, 'clickfocus');
      a = a.down({ button: 0 }).up({ button: 0 });
    }
    await a.perform();
  }
  async hover() {
    await this.waitFor();
    await this.pointer(false);
  }
  async fill(value) {
    await this.waitFor();
    if (!(await query(this.steps, 'fill', value))) throw new Error(`fill failed for ${JSON.stringify(this.steps)}`);
  }
  async focus() { await this.waitFor({ state: 'attached' }); await query(this.steps, 'focus'); }
  async press(key) { await this.focus(); await pressCombo(key); }
  async pressSequentially(text) { await this.focus(); await browser.keys(text.split('')); }
  async selectOption(v) {
    await retry(async () => {
      await this.waitFor({ timeout: 500 });
      if (!(await query(this.steps, 'select', v))) throw new Error(`no option ${JSON.stringify(v)} in ${JSON.stringify(this.steps)}`);
    }, ACTION_TIMEOUT);
  }
  async boundingBox() {
    const el = await this.element();
    return browser.execute(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, el);
  }
  async evaluate(fn) { await this.waitFor({ state: 'attached' }); return browser.execute(fn, await this.element()); }
}

/** The page: same surface as Playwright's `window` (Page) object in the old specs. */
export const page = {
  locator: (sel, opts) => new Locator([...parseSelector(sel), ...(opts?.hasText ? [{ hasText: opts.hasText }] : [])]),
  click: sel => new Locator(parseSelector(sel)).click(),
  fill: (sel, v) => new Locator(parseSelector(sel)).fill(v),
  press: (sel, key) => new Locator(parseSelector(sel)).press(key),
  focus: sel => new Locator(parseSelector(sel)).focus(),
  selectOption: (sel, v) => new Locator(parseSelector(sel)).selectOption(v),
  inputValue: sel => new Locator(parseSelector(sel)).inputValue(),
  waitForSelector: (sel, opts = {}) => new Locator(parseSelector(sel)).waitFor({ state: opts.state ?? 'visible', timeout: opts.timeout ?? ACTION_TIMEOUT }),
  waitForTimeout: ms => browser.pause(ms),
  /** Resize the webview's client area (Playwright viewport) via the Tauri window API. */
  setViewportSize: ({ width, height }) => browser.tauri.execute(async (_t, w, h) => {
    const T = window.__TAURI__;
    await T.window.getCurrentWindow().setSize(new T.dpi.LogicalSize(w, h));
  }, width, height).then(() => browser.waitUntil(() => browser.execute((w, h) => innerWidth === w && innerHeight === h, width, height), { timeout: 5000 })),
  evaluate: (fn, arg) => browser.execute(fn, arg),
  /** Elements matching sel are passed to fn as an array (like Playwright). */
  $$eval: async (sel, fn) => browser.execute(fn, [...(await browser.$$(sel))]),
  keyboard: {
    press: pressCombo,
    type: text => browser.keys(text.split('')),
  },
  mouse: {
    move: (x, y) => browser.action('pointer').move({ x: Math.round(x), y: Math.round(y), origin: 'viewport' }).perform(),
  },
};

// ---------------------------------------------------------------------------
// expect(): locator assertions retry like Playwright; everything else is WDIO/Jest expect.
const isRegExp = v => v instanceof RegExp;
const normWs = t => (t ?? '').replace(/[\s\u200b]+/g, ' ').trim();
const matchText = (actual, expected) => isRegExp(expected) ? expected.test(actual ?? '') : normWs(actual) === normWs(expected);

function locatorAssertions(loc, negate) {
  const check = (name, fn, attr) => async (...args) => {
    const opts = typeof args[args.length - 1] === 'object' && args[args.length - 1] && !isRegExp(args[args.length - 1]) && !Array.isArray(args[args.length - 1]) ? args[args.length - 1] : {};
    const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
    let last;
    await retry(async () => {
      last = await loc.state(attr?.(...args));
      const [ok, msg] = fn(last, ...args);
      if (ok === negate) throw new Error(`expect(${JSON.stringify(loc.steps)})${negate ? '.not' : ''}.${name} failed: ${msg}`);
    }, timeout);
  };
  return {
    toBeVisible: check('toBeVisible', s => [s.visible, `visible=${s.visible}`]),
    toBeHidden: check('toBeHidden', s => [!s.visible, `visible=${s.visible}`]),
    toBeFocused: check('toBeFocused', s => [s.focused, `focused=${s.focused}`]),
    toBeChecked: check('toBeChecked', s => [s.checked, `checked=${s.checked}`]),
    toHaveCount: check('toHaveCount', (s, n) => [s.count === n, `count=${s.count}, expected ${n}`]),
    toHaveText: check('toHaveText', (s, exp) => Array.isArray(exp)
      ? [s.texts.length === exp.length && exp.every((e, i) => matchText(s.texts[i], e)), `texts=${JSON.stringify(s.texts)}, expected ${exp}`]
      : [s.count > 0 && matchText(s.text, exp), `text=${JSON.stringify(normWs(s.text))}, expected ${exp}`]),
    toContainText: check('toContainText', (s, exp) => [s.count > 0 && (isRegExp(exp) ? exp.test(s.text ?? '') : normWs(s.text).includes(normWs(exp))), `text=${JSON.stringify(normWs(s.text))}, expected to contain ${exp}`]),
    toHaveValue: check('toHaveValue', (s, exp) => [s.count > 0 && (isRegExp(exp) ? exp.test(s.value ?? '') : s.value === exp), `value=${JSON.stringify(s.value)}, expected ${exp}`]),
    toHaveClass: check('toHaveClass', (s, exp) => [s.count > 0 && (isRegExp(exp) ? exp.test(s.className) : s.className === exp), `class=${JSON.stringify(s.className)}, expected ${exp}`]),
    toHaveAttribute: check('toHaveAttribute', (s, _n, exp) => [s.attr !== null && (exp === undefined || (isRegExp(exp) ? exp.test(s.attr) : s.attr === exp)), `attr=${JSON.stringify(s.attr)}, expected ${exp}`], n => n),
  };
}

export function expect(actual, message) {
  if (actual instanceof Locator) {
    const a = locatorAssertions(actual, false);
    a.not = locatorAssertions(actual, true);
    return a;
  }
  if (!message) return wdioExpect(actual);
  // Playwright's custom message: prefix it to any failure from the wrapped matcher.
  const wrap = m => new Proxy(m, { get: (t, k) => {
    const v = t[k];
    if (k === 'not') return wrap(v);
    if (typeof v !== 'function') return v;
    return (...a) => { try { const r = v.apply(t, a); return r && typeof r.then === 'function' ? r.catch(e => { e.message = `: ${e.message}`; throw e; }) : r; } catch (e) { e.message = `: ${e.message}`; throw e; } };
  } });
  return wrap(wdioExpect(actual));
}

/** expect.poll(fn, { timeout }).matcher(...args): retries until the Jest matcher passes. */
expect.poll = (fn, { timeout = DEFAULT_TIMEOUT } = {}) => {
  const build = negate => new Proxy({}, {
    get: (_t, name) => {
      if (name === 'not') return build(true);
      return async (...args) => retry(async () => {
        const v = await fn();
        const m = negate ? wdioExpect(v).not : wdioExpect(v);
        await m[name](...args);
      }, timeout, `expect.poll().${negate ? 'not.' : ''}${String(name)}`);
    },
  });
  return build(false);
};
expect.stringContaining = (...a) => wdioExpect.stringContaining(...a);

// ---------------------------------------------------------------------------
/** Record page errors, console errors and CSP violations (Playwright `pageerror`/`console`). */
export async function captureErrors() {
  await browser.execute(() => {
    if (window.__e2e) return;
    const e2e = (window.__e2e = { pageErrors: [], consoleErrors: [] });
    window.addEventListener('error', ev => e2e.pageErrors.push(ev.message || String(ev.error)));
    // Like Playwright's pageerror: a rejection the page handled (preventDefault) is not an error.
    window.addEventListener('unhandledrejection', ev => ev.defaultPrevented || e2e.pageErrors.push(String(ev.reason && ev.reason.message || ev.reason)));
    document.addEventListener('securitypolicyviolation', ev =>
      e2e.consoleErrors.push(`Refused by Content Security Policy directive "${ev.violatedDirective}": ${ev.blockedURI}`));
    const orig = console.error.bind(console);
    console.error = (...a) => { e2e.consoleErrors.push(a.map(String).join(' ')); orig(...a); };
  });
}
export const pageErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.pageErrors : []));
export const consoleErrors = () => browser.execute(() => (window.__e2e ? window.__e2e.consoleErrors : []));

/** System clipboard via the clipboard plugin (Playwright specs read it via app.evaluate). */
export const clipboard = {
  readText: () => browser.tauri.execute(({ core }) => core.invoke('plugin:clipboard-manager|read_text')),
  writeText: text => browser.tauri.execute(({ core }, t) => core.invoke('plugin:clipboard-manager|write_text', { text: t }), text),
};
