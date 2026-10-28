const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

let app;
let window;

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
  await window.setViewportSize?.({ width: 1280, height: 800 }).catch(() => {});
});

test.afterAll(async () => {
  if (app) {
    // Leave persisted shell state as other suites expect it
    await window.evaluate(() => { localStorage.removeItem("sidebar-collapsed"); localStorage.setItem("theme", "system"); }).catch(() => {});
    await app.close();
  }
});

test("window has no native title bar; caption overlay is active", async () => {
  const main = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { menu: win.isMenuBarVisible(), platform: process.platform };
  });
  expect(main.menu).toBe(false);
  if (main.platform === "darwin") return;
  const wco = await window.evaluate(() => {
    const o = navigator.windowControlsOverlay;
    const r = o?.getTitlebarAreaRect();
    const bar = document.querySelector(".titlebar").getBoundingClientRect();
    const ctrls = document.getElementById("titlebarControls").getBoundingClientRect();
    return { visible: o?.visible === true, x: r?.x, w: r?.width, vw: innerWidth, barRight: bar.right, ctrlRight: ctrls.right };
  });
  expect(wco.visible).toBe(true);
  // Our controls end right where the native caption buttons begin (4px breathing room)
  expect(wco.ctrlRight).toBeLessThanOrEqual(wco.x + wco.w);
  expect(wco.x + wco.w - wco.ctrlRight).toBeLessThanOrEqual(6);
});

test("titlebar theme button cycles and switches to light", async () => {
  const btn = window.locator("#themeToggle");
  await expect(btn).toBeVisible();
  const region = await btn.evaluate(el => getComputedStyle(el).getPropertyValue("-webkit-app-region") || getComputedStyle(el).webkitAppRegion);
  expect(region).toBe("no-drag");
  for (let i = 0; i < 3; i++) {
    if ((await btn.getAttribute("data-theme")) === "light") break;
    await btn.click();
  }
  await expect(btn).toHaveAttribute("data-theme", "light");
  expect(await window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
  await expect(btn).toHaveAttribute("aria-label", /Theme: Light/);
  await btn.click();
  await expect(btn).toHaveAttribute("data-theme", "dark");
  expect(await window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  // Native caption colours follow the theme
  const overlay = await app.evaluate(({ BrowserWindow }) => typeof BrowserWindow.getAllWindows()[0].setTitleBarOverlay);
  expect(overlay).toBe("function");
});

test("sidebar collapse toggle: button and Ctrl+B", async () => {
  const toggle = window.locator("#sidebarToggle");
  await expect(toggle).toHaveAttribute("aria-label", "Collapse sidebar");
  await toggle.click();
  await expect(window.locator("body")).toHaveClass(/sidebar-collapsed/);
  await expect(toggle).toHaveAttribute("aria-label", "Expand sidebar");
  expect(Math.round((await window.locator("#sidebar").boundingBox()).width)).toBe(56);
  await expect(window.locator("#railHome")).toBeVisible();
  await expect(window.locator("#sideCats .side-cat").first()).toBeVisible();
  await window.keyboard.press("Control+B");
  await expect(window.locator("body")).not.toHaveClass(/sidebar-collapsed/);
  await expect(window.locator('#toolsNav [data-tool-id="json"]')).toBeVisible();
  await window.keyboard.press("Control+B");
  await expect(window.locator("body")).toHaveClass(/sidebar-collapsed/);
  // Category icon expands the sidebar to that category
  await window.locator("#sideCats .side-cat").first().click();
  await expect(window.locator("body")).not.toHaveClass(/sidebar-collapsed/);
});

test("nav icons do not shift on hover or after opening tools", async () => {
  const rects = () => window.evaluate(() =>
    Array.from(document.querySelectorAll("#sidebar .nav-icon, #sidebarToggle, #themeToggle, #titlebarSettings"))
      .filter(el => el.offsetParent !== null)
      .map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 10) / 10).join(","); }));
  await window.click("#railHome");
  await window.mouse.move(600, 400);
  await window.waitForTimeout(200);
  const before = await rects();
  for (const id of ["json", "base64", "url"]) {
    await window.locator(`#toolsNav [data-tool-id="${id}"]`).hover();
    await window.click(`#toolsNav [data-tool-id="${id}"]`);
    await expect(window.locator("#toolContainer")).toBeVisible();
  }
  await window.locator("#railHome").hover();
  await window.click("#railHome");
  await window.mouse.move(600, 400);
  await window.waitForTimeout(200);
  expect(await rects()).toEqual(before);
  // Collapsed rail too
  await window.keyboard.press("Control+B");
  await window.mouse.move(600, 400);
  const railBefore = await rects();
  await window.locator("#railHome").hover();
  await window.locator("#sideCats .side-cat").nth(1).hover();
  await window.mouse.move(600, 400);
  expect(await rects()).toEqual(railBefore);
  await window.keyboard.press("Control+B");
});
