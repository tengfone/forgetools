import { expect } from '@wdio/globals';
import { waitForAppReady } from './helpers/tauriApp.mjs';

// Settings > Background and About. The native side (tray, login item, close-to-tray) is
// disabled under FORGE_E2E and covered by tests/MANUAL_CHECKLIST.md; these tests cover the UI
// and its round trip through the backend commands.
// NOTE: background prefs live in the app data dir shared with an installed build of the same
// identifier, so every test restores what it changed.

const backend = () => browser.tauri.execute(({ core }) => core.invoke('get_background_settings'));
const setShortcut = (accelerator) =>
  browser.tauri.execute(({ core }, a) => core.invoke('set_global_shortcut', { accelerator: a }), accelerator);

describe('Settings', () => {
  let initial;

  before(async () => {
    await waitForAppReady();
    initial = await backend();
  });

  after(async () => {
    // Restore the developer's background prefs (shortcut and toggles).
    await setShortcut(initial.globalShortcut ?? null);
    await browser.tauri.execute(({ core }, p) => core.invoke('set_background_settings', { patch: p }), {
      keepInBackground: initial.keepInBackground,
      openAtLogin: initial.openAtLogin,
    });
  });

  const openPane = async (tab) => {
    if (!(await $('#settingsOverlay').getAttribute('class')).includes('visible')) {
      await $('button[aria-label="Settings"]').click();
      await expect($('#settingsOverlay')).toHaveElementClass('visible');
    }
    await $(`#stab-${tab}`).click();
    await expect($(`#spane-${tab}`)).toBeDisplayed();
  };

  it('background toggles round-trip through the backend', async () => {
    await openPane('background');
    for (const [id, key] of [
      ['setting-background', 'keepInBackground'],
      ['setting-login', 'openAtLogin'],
    ]) {
      const box = $(`#${id}`);
      await expect(box).toHaveElementProperty('checked', initial[key]);
      await $(`label[for="${id}"]`).click();
      await expect(box).toHaveElementProperty('checked', !initial[key]);
      await browser.waitUntil(async () => (await backend())[key] === !initial[key], {
        timeout: 5000,
        timeoutMsg: `${key} never reached the backend`,
      });
      await $(`label[for="${id}"]`).click();
      await expect(box).toHaveElementProperty('checked', initial[key]);
      await browser.waitUntil(async () => (await backend())[key] === initial[key], {
        timeout: 5000,
        timeoutMsg: `${key} never reverted in the backend`,
      });
    }
  });

  it('shortcut recorder: needs a modifier, Esc cancels, chip sets, Clear clears', async () => {
    await openPane('background');
    const rec = $('#shortcutRec');
    const msg = $('#shortcutMsg');
    await rec.click();
    await expect(rec).toHaveAttribute('aria-pressed', 'true');
    await browser.keys('q');
    await expect(msg).toHaveText('Add Ctrl, Alt or Shift to the key.');
    await expect(msg).toHaveElementClass('is-error');
    // Esc cancels recording without closing the Settings dialog
    await browser.keys('Escape');
    await expect(rec).toHaveAttribute('aria-pressed', 'false');
    await expect(msg).not.toHaveElementClass('is-error');
    await expect($('#settingsOverlay')).toHaveElementClass('visible');
    // A suggestion chip registers a real global shortcut
    const chip = $$('#shortcutChips [data-accel]')[1];
    const accel = await chip.getAttribute('data-accel');
    await chip.click();
    await expect(msg).toHaveText(expect.stringContaining('now shows or hides ForgeTools'));
    await expect(rec).toHaveText(await chip.getText());
    expect((await backend()).globalShortcut).toBe(accel);
    await $('#shortcutClear').click();
    await expect(rec).toHaveText('Not set');
    await expect($('#shortcutClear')).toBeDisabled();
    expect((await backend()).globalShortcut).toBeNull();
  });

  it('an unparseable shortcut is rejected with "Invalid shortcut"', async () => {
    // The recorder only emits valid accelerators, so this goes straight to the command the UI uses.
    const before = (await backend()).globalShortcut;
    const r = await setShortcut('Ctrl+NotAKey');
    expect(r).toEqual(expect.objectContaining({ ok: false, error: 'Invalid shortcut', accelerator: before }));
    expect((await backend()).globalShortcut).toBe(before);
  });

  it('enabling automatic update checks never touches the network in e2e', async () => {
    await openPane('about');
    const auto = $('#setting-autoupdate');
    await expect(auto).not.toBeSelected();
    await $('label[for="setting-autoupdate"]').click();
    await expect(auto).toBeSelected();
    // Stored as opted-in, but the check itself is skipped: no request, no lastCheck, no status.
    const stored = await browser.execute(() => JSON.parse(localStorage.getItem('forge-updates')));
    expect(stored).toEqual(expect.objectContaining({ autoCheck: true, lastCheck: 0 }));
    const github = await browser.execute(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('github')),
    );
    expect(github).toEqual([]);
    await expect($('#aboutUpdate')).toHaveText('');
    await expect($('#aboutCheck')).toHaveText('Check for updates');
    await browser.keys('Escape');
    await expect($('#settingsOverlay')).not.toHaveElementClass('visible');
  });
});
