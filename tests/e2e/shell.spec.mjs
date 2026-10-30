import { expect } from '@wdio/globals';
import { waitForAppReady, nativeWindow } from './helpers/tauriApp.mjs';

describe('Window shell', () => {
  before(async () => {
    await waitForAppReady();
  });

  const isDark = () => browser.execute(() => document.documentElement.classList.contains('dark'));

  it('window has no native title bar; caption overlay is active', async () => {
    // Tauri: no native decorations and no menu bar; the app draws the caption buttons itself
    // (#windowControls) on Windows/Linux. macOS keeps native traffic lights in an overlay title bar.
    const main = await nativeWindow();
    expect(main.menu).toBe(false);
    if (main.platform === 'macos') return;
    expect(main.decorated).toBe(false);
    await expect($('#windowControls')).toBeDisplayed();
    await expect($$('#windowControls button')).toBeElementsArrayOfSize(3);
    // Layout relative to the viewport: no WebDriver equivalent of getBoundingClientRect/innerWidth.
    const wco = await browser.execute(() => {
      const r = document.getElementById('windowControls').getBoundingClientRect();
      const ctrls = document.getElementById('titlebarControls').getBoundingClientRect();
      return { x: r.x, w: r.width, vw: innerWidth, ctrlRight: ctrls.right };
    });
    expect(wco.vw - (wco.x + wco.w)).toBeLessThanOrEqual(1); // caption buttons flush with the right edge
    // Our controls end right where the caption buttons begin (4px breathing room)
    expect(wco.ctrlRight).toBeLessThanOrEqual(wco.x);
    expect(wco.x - wco.ctrlRight).toBeLessThanOrEqual(6);
  });

  it('titlebar theme button cycles and switches to light', async () => {
    const btn = $('#themeToggle');
    await expect(btn).toBeDisplayed();
    // Tauri drag region: the header drags (data-tauri-drag-region="deep") but buttons inside never do.
    await expect(btn).toHaveElementProperty('tagName', 'BUTTON');
    const own = await btn.getAttribute('data-tauri-drag-region');
    expect([null, 'false']).toContain(own);
    // closest() has no WebDriver equivalent
    const region = await browser.execute(
      (el) => el.closest('[data-tauri-drag-region]')?.getAttribute('data-tauri-drag-region') ?? null,
      await btn,
    );
    expect(region).toBe('deep');
    for (let i = 0; i < 3; i++) {
      if ((await btn.getAttribute('data-theme')) === 'light') break;
      await btn.click();
    }
    await expect(btn).toHaveAttribute('data-theme', 'light');
    expect(await isDark()).toBe(false);
    await expect(btn).toHaveAttribute('aria-label', expect.stringContaining('Theme: Light'));
    await btn.click();
    await expect(btn).toHaveAttribute('data-theme', 'dark');
    expect(await isDark()).toBe(true);
    // Native caption colours follow the theme
    await browser.waitUntil(async () => (await nativeWindow()).theme === 'dark', {
      timeout: 10000,
      timeoutMsg: 'native window theme never became dark',
    });
  });

  it('sidebar collapse toggle: button and Ctrl+B', async () => {
    const toggle = $('#sidebarToggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse sidebar');
    await toggle.click();
    await expect($('body')).toHaveElementClass('sidebar-collapsed');
    await expect(toggle).toHaveAttribute('aria-label', 'Expand sidebar');
    await expect($('#sidebar')).toHaveWidth(56);
    await expect($('#railHome')).toBeDisplayed();
    await expect($('#sideCats .side-cat')).toBeDisplayed();
    await browser.keys(['Control', 'b']);
    await expect($('body')).not.toHaveElementClass('sidebar-collapsed');
    await expect($('#toolsNav [data-tool-id="json"]')).toBeDisplayed();
    await browser.keys(['Control', 'b']);
    await expect($('body')).toHaveElementClass('sidebar-collapsed');
    // Category icon expands the sidebar to that category
    await $('#sideCats .side-cat').click();
    await expect($('body')).not.toHaveElementClass('sidebar-collapsed');
  });

  it('nav icons do not shift on hover or after opening tools', async () => {
    // Sub-pixel layout positions of every visible nav icon (no WebDriver equivalent). Positions are
    // in content coordinates of their scroll containers: WebDriver brings targets into view before
    // acting (observed: #toolsNav scrollTop 0 -> 210 after a pointer move to a tool item), and
    // scrolling is not the layout shift this test guards against.
    const rects = () =>
      browser.execute(() =>
        Array.from(document.querySelectorAll('#sidebar .nav-icon, #sidebarToggle, #themeToggle, #titlebarSettings'))
          .filter((el) => el.offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            let x = r.x,
              y = r.y;
            for (let p = el.parentElement; p; p = p.parentElement) {
              x += p.scrollLeft;
              y += p.scrollTop;
            }
            return [x, y, r.width, r.height].map((n) => Math.round(n * 10) / 10).join(',');
          }),
      );
    // Hover transitions have finished once two consecutive polls agree.
    const settledRects = async () => {
      let prev = await rects(),
        cur;
      await browser.waitUntil(
        async () => {
          cur = await rects();
          const same = JSON.stringify(cur) === JSON.stringify(prev);
          prev = cur;
          return same;
        },
        { timeout: 5000, interval: 100, timeoutMsg: 'nav icons never settled' },
      );
      return cur;
    };
    const moveAway = () => browser.action('pointer').move({ x: 600, y: 400, origin: 'viewport' }).perform();
    await $('#railHome').click();
    await expect($('#welcomeState')).toBeDisplayed();
    await moveAway();
    const before = await settledRects();
    for (const id of ['json', 'base64', 'url']) {
      const item = $(`#toolsNav [data-tool-id="${id}"]`);
      await item.moveTo();
      await item.click();
      await expect(item).toHaveAttribute('aria-current', 'page');
      await expect($('#toolContainer')).toBeDisplayed();
    }
    await $('#railHome').moveTo();
    await $('#railHome').click();
    await expect($('#welcomeState')).toBeDisplayed();
    await moveAway();
    expect(await settledRects()).toEqual(before);
    // Collapsed rail too
    await browser.keys(['Control', 'b']);
    await expect($('body')).toHaveElementClass('sidebar-collapsed');
    await moveAway();
    const railBefore = await settledRects();
    await $('#railHome').moveTo();
    await $$('#sideCats .side-cat')[1].moveTo();
    await moveAway();
    expect(await settledRects()).toEqual(railBefore);
    await browser.keys(['Control', 'b']);
    await expect($('body')).not.toHaveElementClass('sidebar-collapsed');
  });
});
