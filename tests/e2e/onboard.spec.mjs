import { expect } from '@wdio/globals';
import { waitForAppReady } from './helpers/tauriApp.mjs';
import { clickAndMoveFocus } from './helpers/input.mjs';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('Home onboarding', () => {
  before(async () => {
    await waitForAppReady();
  });

  it("home box filters the grid for 'b64'", async () => {
    await $('#homeSearch').setValue('b64');
    await expect($('#homeGrid [data-tool-tile="base64"]')).toBeDisplayed();
    await expect($('#homeGrid [data-tool-tile="json"]')).not.toBeDisplayed();
    await expect($$('#homeDetect button')).toBeElementsArrayOfSize(0);
    await browser.keys('Escape'); // focus is in #homeSearch after setValue
    await expect($('#homeSearch')).toHaveValue('');
    await expect($('#homeGrid [data-tool-tile="json"]')).toBeDisplayed();
  });

  it('Arrow Down moves from the box into the grid', async () => {
    await $('#homeSearch').setValue('b64');
    await browser.keys('ArrowDown');
    await expect($('#homeGrid [data-tool-tile="base64"]')).toBeFocused();
    await $('#homeSearch').clearValue();
    await expect($('#homeSearch')).toHaveValue('');
  });

  it('Ctrl+K on Home focuses and selects the box', async () => {
    await $('#homeSearch').setValue('abc');
    await clickAndMoveFocus('#homeBrowseHeading');
    await expect($('#homeSearch')).not.toBeFocused();
    await browser.keys(['Control', 'k']);
    await expect($('#homeSearch')).toBeFocused();
    await expect($('#cmdPalette')).not.toHaveElementClass('visible');
    // Selection range has no WebDriver getter
    const sel = await browser.execute(() => {
      const b = document.getElementById('homeSearch');
      return [b.selectionStart, b.selectionEnd];
    });
    expect(sel).toEqual([0, 3]);
    await $('#homeSearch').clearValue();
  });

  it('pasting a JWT into the box and pressing Enter opens the decoder with it', async () => {
    await $('#homeSearch').setValue(JWT);
    await expect($('#homeDetect .btn-primary')).toHaveText(expect.stringContaining('Looks like a JWT'));
    await expect($('#homeDetect .btn-primary')).toHaveText(expect.stringContaining('JWT Decoder'));
    await browser.keys('Enter');
    await expect($('#jwt-input')).toHaveValue(JWT);
    await expect($('#jwt-header-out')).toHaveText(expect.stringContaining('HS256'));
    // Inside a tool, Ctrl+K opens the palette as before
    await browser.keys(['Control', 'k']);
    await expect($('#cmdPalette')).toHaveElementClass('visible');
    await browser.keys('Escape');
    await $('#homeLogo').click();
    await expect($('#homeSearch')).toHaveValue('');
  });
});
