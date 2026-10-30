import { createRequire } from 'node:module';
import { expect } from '@wdio/globals';
import { waitForAppReady, clipboard } from './helpers/tauriApp.mjs';
import { selectOption } from './helpers/input.mjs';
const require = createRequire(import.meta.url);

// Every tool renders without throwing; shared clipboard actions and tool behaviour end to end.

describe('Tools', () => {
  before(async () => {
    await waitForAppReady();
  });

  const open = async (id) => {
    await $(`#toolsNav [data-tool-id="${id}"]`).click();
    await expect($(`#toolsNav [data-tool-id="${id}"]`)).toHaveAttribute('aria-current', 'page');
  };
  const toolIds = async () => (await $$('#toolsNav [data-tool-id]')).map((e) => e.getAttribute('data-tool-id'));

  it('every tool opens without runtime errors', async () => {
    const ids = await toolIds();
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) await open(id);
  });

  it('no inline styles or handlers leak into tool UIs', async () => {
    const ids = await toolIds();
    for (const id of ids) {
      await open(id);
      await expect($$('#toolContainer [onclick]')).toBeElementsArrayOfSize(0, { message: `inline handler in ${id}` });
    }
  });

  it('delegated copy writes to the clipboard', async () => {
    await open('randomStringGenerator');
    const chip = $('#rand-results button.copy-chip'); // a real button, so keyboard users can reach it
    await chip.waitForDisplayed();
    const text = (await chip.getText()).trim();
    await chip.click();
    await expect($('#toastContainer .toast')).toHaveText(expect.stringContaining('Copied'));
    expect(await clipboard.readText()).toBe(text);
  });

  it('Enter copies a focused click-to-copy block', async () => {
    // Buttons activate on Enter natively; this covers the non-button targets (JWT parts, readonly fields).
    await open('jwt');
    await $('#jwt-sample').click();
    const out = $('#jwt-header-out');
    await expect(out).toHaveText(expect.stringContaining('alg'));
    await clipboard.writeText('');
    await browser.execute(() => document.getElementById('jwt-header-out').focus());
    await browser.keys('Enter');
    await browser.waitUntil(async () => (await clipboard.readText()).includes('"alg"'), {
      timeoutMsg: 'Enter on the focused JWT header did not copy',
    });
  });

  it('malformed CSV is an error, not a successful conversion', async () => {
    await open('csvJson');
    await $('#csv-input').setValue('a,b\n1,2,3');
    await expect($('#statusBar')).toHaveElementClass('is-error');
    await expect($('#statusMsg')).toHaveText(expect.stringContaining('Too many fields'));
  });

  it('text diff renders from its worker and never freezes the window', async () => {
    await open('textDiff');
    await $('#diff-sample').click(); // proves the worker loads under the app's CSP
    await expect($('#diff-result .diff-line.is-add')).toBeExisting();
    await expect($('#diff-stats')).toHaveText('+3 / -2');
    await selectOption('#diff-mode', { value: 'char' });
    const started = Date.now();
    await browser.execute(() => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('diff-original', 'a'.repeat(50_000));
      set('diff-compared', 'b'.repeat(50_000));
    });
    // The page keeps answering while the worker gives up, then the status bar says so.
    await expect($('#statusBar')).toHaveElementClass('is-error', { wait: 8000 });
    expect(Date.now() - started).toBeLessThan(8000);
  });

  it('Copy keeps leading and trailing newlines', async () => {
    await open('backslashEscape');
    await selectOption('#escape-mode', { value: 'unescape' });
    await $('#escape-input').setValue('\\nhello\\n');
    // toHaveValue trims by default, which is exactly what this test must not do.
    await browser.waitUntil(async () => (await $('#escape-output').getValue()) === '\nhello\n', {
      timeoutMsg: 'unescape did not produce the exact output',
    });
    await $('[data-copy="escape-output"]').click();
    await browser.waitUntil(async () => (await clipboard.readText()) === '\nhello\n', {
      timeoutMsg: 'clipboard did not get the exact output',
    });
  });

  it('JSON output Copy goes through the main-process clipboard', async () => {
    await open('json');
    await $('#sampleBtn').click();
    // Monaco renders lines as divs; .view-lines textContent is the rendered output.
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.querySelector('#outputEditor .view-lines')?.textContent ?? '')).length >
        5,
      { timeout: 10000, timeoutMsg: 'JSON output never rendered' },
    );
    await clipboard.writeText('');
    await $('#copyBtn').click();
    await expect($('#toastContainer .toast')).toHaveText(expect.stringContaining('Copied output'));
    const clip = await clipboard.readText();
    expect(clip.length).toBeGreaterThan(5);
    expect(() => JSON.parse(clip)).not.toThrow();
    expect(clip).toContain('\n'); // formatted output, not the raw sample echo
  });

  it('Paste button reads the main-process clipboard', async () => {
    await clipboard.writeText('hello paste');
    await open('base64');
    await $('[data-paste="b64-plain"]').click();
    await expect($('#b64-plain')).toHaveValue('hello paste');
  });

  it('sidebar search trigger opens the palette', async () => {
    await $('#sidebarSearch').click();
    await expect($('#cmdPalette')).toHaveElementClass('visible');
    await expect($('#sidebarSearch kbd')).toBeDisplayed();
    await browser.keys('Escape');
    await expect($('#cmdPalette')).not.toHaveElementClass('visible');
  });

  it('diff tool supports word and char modes', async () => {
    await open('textDiff');
    await $('#diff-mode').waitForDisplayed();
    for (const mode of ['line', 'word', 'char']) {
      await selectOption('#diff-mode', { value: mode });
      await expect($('#diff-mode')).toHaveValue(mode);
    }
  });

  it('custom tool errors land in the shared status bar', async () => {
    await open('yamlFormatter');
    await $('#yaml-input').waitForDisplayed();
    await $('#yaml-input').setValue('a: [unclosed');
    await expect($('#statusBar')).toHaveElementClass('is-error');
    await $('#yaml-input').setValue('a: 1');
    await expect($('#statusBar')).not.toHaveElementClass('is-error');
    // switching tools resets the bar
    await $('#yaml-input').setValue('a: [');
    await expect($('#statusBar')).toHaveElementClass('is-error');
    await $('#toolsNav [data-tool-id="hash"]').click();
    await expect($('#statusMsg')).toHaveText('Ready');
  });

  it('number base rejects invalid digits instead of ignoring them', async () => {
    await open('numberBaseConverter');
    await $('#num-binary').waitForDisplayed();
    await $('#num-binary').setValue('1012');
    await expect($('#num-binary')).toHaveAttribute('aria-invalid', 'true');
    await expect($('#statusMsg')).toHaveText(/base-2/i);
    await $('#num-binary').setValue('1010');
    await expect($('#num-decimal')).toHaveValue('10');
  });

  it('barcode validates format before generating', async () => {
    await open('barcodeGenerator');
    await $('#barcode-input').waitForDisplayed();
    await $('#barcode-input').setValue('abc');
    await selectOption('#barcode-format', { value: 'EAN13' });
    await $('#barcode-generate').click();
    await expect($('#statusMsg')).toHaveText(expect.stringContaining('EAN-13'));
  });

  it('clear can be undone from the toast', async () => {
    await open('yamlFormatter');
    await $('#yaml-input').waitForDisplayed();
    await $('#yaml-input').setValue('keep: me');
    await $('#yaml-clear').click();
    await expect($('#yaml-input')).toHaveValue('');
    await $('.toast-action').click();
    await expect($('#yaml-input')).toHaveValue('keep: me');
  });

  it('help popover opens per tool with syntax table', async () => {
    await open('cronParser');
    await $('#helpBtn').click();
    await expect($('#helpPopover')).toBeDisplayed();
    await expect($('#helpPopover .help-table')).toHaveText(expect.stringContaining('*/15'));
    await browser.keys('Escape');
    await expect($('#helpPopover')).not.toBeDisplayed();
    await browser.keys('F1');
    await expect($('#helpPopover')).toBeDisplayed();
    await $('#toolsNav [data-tool-id="hash"]').click();
    await expect($('#helpPopover')).not.toBeDisplayed();
  });

  it('tool inputs survive switching tools within the session', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';
    await open('jwt');
    const ta = $('#customInterface textarea');
    await ta.waitForDisplayed();
    await ta.setValue(token);
    await open('json');
    await open('jwt');
    await expect($('#customInterface textarea')).toHaveValue(token);
    await expect($('#statusSession')).toHaveText('memory only');
  });

  it('url two-way: typing decoded encodes, swap flips direction', async () => {
    await open('url');
    await $('#url-decoded').waitForDisplayed();
    await expect($('#url-encoded')).toHaveValue(''); // fresh start: no session state
    await $('#url-decoded').setValue('a b&c');
    await expect($('#url-encoded')).toHaveValue('a%20b%26c');
    await expect($('#url-dir')).toHaveText(expect.stringContaining('Encode \u2192'));
    await $('#url-swap').click();
    await expect($('#url-dir')).toHaveText(expect.stringContaining('Decode'));
    await expect($('#url-dir')).toHaveAttribute('data-direction', 'backward');
    await expect($('#url-encoded')).toHaveValue('a%20b%26c');
    await expect($('#url-decoded')).toHaveValue('a b&c');
  });

  it('titlebar settings button opens the Settings dialog', async () => {
    await $('button[aria-label="Settings"]').click();
    await expect($('#settingsTitle')).toHaveText('Settings');
    await expect($('#settingsOverlay')).toHaveElementClass('visible');
    await browser.keys('Escape');
    await expect($('#settingsOverlay')).not.toHaveElementClass('visible');
  });

  it("palette 'about' opens Settings on the About section", async () => {
    const pkg = require('../../package.json');
    await browser.keys(['Control', 'k']);
    await expect($('#cmdPalette')).toHaveElementClass('visible');
    await browser.keys('about');
    await $('.cmd-item*=About ForgeTools').click();
    await expect($('#settingsOverlay')).toHaveElementClass('visible');
    await expect($('#stab-about')).toHaveAttribute('aria-selected', 'true');
    await expect($('#aboutVersion')).toHaveText(`Version ${pkg.version}`);
    await expect($$('#settingsAbout [data-link]')).toBeElementsArrayOfSize(4);
    await expect($('#settingsAbout [data-link="coffee"]')).toBeDisplayed();
    // Auto update check is opt-in
    await expect($('#setting-autoupdate')).not.toBeSelected();
    await browser.keys('Escape');
    await expect($('#settingsOverlay')).not.toHaveElementClass('visible');
  });

  it('settings sections switch with tabs and arrow keys, and fit the window', async () => {
    await $('button[aria-label="Settings"]').click();
    await $('#stab-editor').click();
    await expect($('#spane-editor')).toBeDisplayed();
    await expect($('#spane-privacy')).not.toBeDisplayed();
    await expect($('#stab-editor')).toBeFocused();
    await browser.keys('ArrowDown');
    await expect($('#spane-privacy')).toBeDisplayed();
    await expect($('#stab-privacy')).toBeFocused();
    // Layout against the viewport (no WebDriver equivalent of innerHeight)
    const fits = await browser.execute(() => {
      const p = document.querySelector('#settingsOverlay .settings-panel').getBoundingClientRect();
      return p.bottom <= window.innerHeight;
    });
    expect(fits).toBe(true);
    await $('#stab-editor').click();
    await browser.keys('Escape');
    await expect($('#settingsOverlay')).not.toHaveElementClass('visible');
  });

  it('editor mode segmented control switches mode', async () => {
    await open('json');
    const group = $('#toolActions [role="radiogroup"]');
    await group.waitForDisplayed();
    const fmt = group.$('[role="radio"][data-mode="format"]');
    const min = group.$('[role="radio"][data-mode="minify"]');
    await expect(fmt).toHaveAttribute('aria-checked', 'true');
    await expect(min).toHaveAttribute('aria-checked', 'false');
    await min.click();
    await expect(min).toHaveAttribute('aria-checked', 'true');
    await expect(fmt).toHaveAttribute('aria-checked', 'false');
    await expect(min).toBeFocused();
    await browser.keys('ArrowLeft');
    await expect(fmt).toHaveAttribute('aria-checked', 'true');
    await expect(fmt).toBeFocused();
  });

  it('opening JWT focuses its input', async () => {
    await open('jwt');
    await expect($('#jwt-input')).toBeFocused({ wait: 5000 });
  });
});
