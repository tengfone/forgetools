// Input workarounds for the embedded WebDriver (tauri-plugin-wdio-webdriver on WebView2).
// Each one exists because the native WDIO command was observed to fail on this driver
// (probe spec run during the migration away from the Playwright shim). Prefer native
// commands everywhere else.

/**
 * Click an element and then apply the browser's default mousedown focus change.
 *
 * Observed: element.click() and pointer actions dispatch only synthetic events (isTrusted
 * false). The driver focuses the target when it is focusable, but clicking a NON-focusable
 * element leaves focus where it was, whereas a real click moves focus to the nearest
 * focusable ancestor or to <body>. Recorded: after `$('#homeBrowseHeading').click()`,
 * document.activeElement was still #homeSearch.
 */
export async function clickAndMoveFocus(selector) {
  const el = await $(selector);
  await el.click();
  await browser.execute((e) => {
    const f = e.closest('button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]');
    if (f && !f.disabled) f.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, el);
}

/**
 * Replace a text field's value the way a user edit does (one trusted `input` event).
 *
 * Observed: setValue/addValue/browser.keys all produce `input` events with isTrusted=false.
 * The app deliberately ignores untrusted input for user-only behaviour (two-way direction in
 * tools/ui/common.ts, input history in app.ts), so with setValue those features never fire
 * (url two-way stayed empty; tool-history was never written). document.execCommand('insertText')
 * is the browser's own editing path and yields a trusted InputEvent, like typing or pasting.
 * Use only where the assertion depends on the edit being seen as a user edit.
 */
export async function typeText(selector, text) {
  const el = await $(selector);
  await el.waitForDisplayed();
  const ok = await browser.execute((e, t) => {
    e.focus();
    e.select();
    if (t === '') document.execCommand('delete');
    else document.execCommand('insertText', false, t);
    return e.value === t;
  }, el, text);
  if (!ok) throw new Error(`typeText: ${selector} did not take the value ${JSON.stringify(text)}`);
}

/**
 * Choose an <option> by value or visible label and notify the page (input + change).
 *
 * Observed: selectByAttribute('value', ...), clicking the <option>, and ArrowDown/Enter on a
 * focused <select> all left `select.value` unchanged on this driver (WebView2 renders the
 * dropdown natively, outside the DOM the driver drives).
 */
export async function selectOption(selector, { value, label }) {
  const el = await $(selector);
  await el.waitForDisplayed();
  const ok = await browser.execute((e, v, l) => {
    const opt = [...e.options].find(o => (v !== null ? o.value === v : o.label === l));
    if (!opt) return false;
    e.focus();
    e.value = opt.value;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, el, value ?? null, label ?? null);
  if (!ok) throw new Error(`selectOption: no option ${JSON.stringify(value ?? label)} in ${selector}`);
}
