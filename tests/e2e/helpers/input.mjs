// Input workarounds for the embedded WebDriver (tauri-plugin-wdio-webdriver on WebView2).
// Each one exists because the native WDIO command was observed to fail on this driver (see the
// recorded evidence on each helper). Prefer native commands everywhere else.

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
 * Choose an <option> by value or visible label and notify the page (input + change).
 *
 * Observed (re-probed after the app stopped checking isTrusted): on #diff-mode,
 * selectByAttribute('value', 'word'), selectByVisibleText(<3rd label>) and selectByIndex(0) all
 * returned without error but select.value stayed 'line'. Clicking the <option> and ArrowDown/Enter
 * on a focused <select> also left it unchanged (WebView2 renders the dropdown natively, outside
 * the DOM the driver drives).
 */
export async function selectOption(selector, { value, label }) {
  const el = await $(selector);
  await el.waitForDisplayed();
  const ok = await browser.execute(
    (e, v, l) => {
      const opt = [...e.options].find((o) => (v !== null ? o.value === v : o.label === l));
      if (!opt) return false;
      e.focus();
      e.value = opt.value;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    el,
    value ?? null,
    label ?? null,
  );
  if (!ok) throw new Error(`selectOption: no option ${JSON.stringify(value ?? label)} in ${selector}`);
}
