import { page as window, expect, captureErrors } from "./helpers/pw.mjs";
import { waitForAppReady, nativeWindow } from "./helpers/tauriApp.mjs";

before(async () => {
  await waitForAppReady();
  await captureErrors();
  await window.setViewportSize?.({ width: 1280, height: 800 }).catch(() => {});
});

after(async () => {
  // Leave persisted shell state as other suites expect it
  await window.evaluate(() => { localStorage.removeItem("sidebar-collapsed"); localStorage.setItem("theme", "system"); }).catch(() => {});
});

it("window has no native title bar; caption overlay is active", async () => {
  // Tauri: no native decorations and no menu bar; the app draws the caption buttons itself
  // (#windowControls) on Windows/Linux. macOS keeps native traffic lights in an overlay title bar.
  const main = await nativeWindow();
  expect(main.menu).toBe(false);
  if (main.platform === "macos") return;
  expect(main.decorated).toBe(false);
  const wco = await window.evaluate(() => {
    const box = document.getElementById("windowControls");
    const r = box.getBoundingClientRect();
    const ctrls = document.getElementById("titlebarControls").getBoundingClientRect();
    return { visible: !box.hidden && r.width > 0, buttons: box.querySelectorAll("button").length, x: r.x, w: r.width, vw: innerWidth, ctrlRight: ctrls.right };
  });
  expect(wco.visible).toBe(true);
  expect(wco.buttons).toBe(3);
  expect(wco.vw - (wco.x + wco.w)).toBeLessThanOrEqual(1); // caption buttons flush with the right edge
  // Our controls end right where the caption buttons begin (4px breathing room)
  expect(wco.ctrlRight).toBeLessThanOrEqual(wco.x);
  expect(wco.x - wco.ctrlRight).toBeLessThanOrEqual(6);
});

it("titlebar theme button cycles and switches to light", async () => {
  const btn = window.locator("#themeToggle");
  await expect(btn).toBeVisible();
  // Tauri drag region: the header drags (data-tauri-drag-region="deep") but buttons inside never do.
  const region = await btn.evaluate(el => {
    const bar = el.closest("[data-tauri-drag-region]");
    const own = el.getAttribute("data-tauri-drag-region");
    return bar && bar.getAttribute("data-tauri-drag-region") === "deep" && el.tagName === "BUTTON" && (own === null || own === "false") ? "no-drag" : "drag";
  });
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
  await expect.poll(async () => (await nativeWindow()).theme).toBe("dark");
});

it("sidebar collapse toggle: button and Ctrl+B", async () => {
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

it("nav icons do not shift on hover or after opening tools", async () => {
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
