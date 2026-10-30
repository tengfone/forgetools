// Harness smoke tests: fast sanity checks that the WDIO/Tauri harness itself works
// (launch, window state, a tool, the palette). Feature coverage lives in the other specs.
import fs from 'node:fs';
import { expect } from '@wdio/globals';
import { waitForAppReady, windowState } from './helpers/tauriApp.mjs';

describe('Harness smoke', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('launches with title ForgeTools and a visible window', async () => {
    const { title, visible } = await windowState();
    expect(title).toContain('ForgeTools');
    expect(visible).toBe(true);
    await expect($('.titlebar')).toBeDisplayed();
    await expect($('aside')).toBeDisplayed();
    await expect($('main')).toBeDisplayed();
    await expect($('#loadingScreen')).not.toBeDisplayed();
  });

  it('opens at the configured window size (no runtime resizing)', async () => {
    const conf = JSON.parse(fs.readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
    const { width, height } = conf.app.windows[0];
    expect(await browser.execute(() => [innerWidth, innerHeight])).toEqual([width, height]);
  });

  it('shows the home screen with tools in the sidebar', async () => {
    const items = await $$('#toolsNav [data-tool-id]');
    expect(items.length).toBeGreaterThan(20);
  });

  it('opens the JSON tool and formats the sample', async () => {
    await $('#toolsNav [data-tool-id="json"]').click();
    await expect($('#toolContainer')).toBeDisplayed();
    await $('#sampleBtn').click();
    await browser.waitUntil(
      () => browser.execute(() => (document.querySelector('#outputEditor .view-lines')?.textContent ?? '').length > 5),
      { timeout: 15000, timeoutMsg: 'JSON output never rendered' },
    );
  });

  it("palette fuzzy search finds Base64 for 'b64'", async () => {
    await browser.keys(['Control', 'k']);
    await browser.keys('b64');
    await expect($('#cmdResults')).toHaveText(expect.stringContaining('Base64'));
    await browser.keys('Escape');
  });
});
