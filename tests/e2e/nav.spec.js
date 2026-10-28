const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

let app;
let window;

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
});

test.afterAll(async () => {
  if (app) await app.close();
});

test("logo returns home and deselects the tool", async () => {
  await window.click('#toolsNav [data-tool-id="json"]');
  await expect(window.locator("#toolContainer")).toBeVisible();
  await window.click('#homeLogo');
  await expect(window.locator("#welcomeState")).toBeVisible();
  await expect(window.locator("#toolContainer")).toBeHidden();
  await expect(window.locator("#toolsNav .nav-item.active")).toHaveCount(0);
  await expect(window.locator("#railHome")).toHaveAttribute("aria-current", "page");
});

test("rail Home and palette 'Go home' return home", async () => {
  await window.click('#toolsNav [data-tool-id="url"]');
  await expect(window.locator("#toolContainer")).toBeVisible();
  await window.click("#railHome");
  await expect(window.locator("#welcomeState")).toBeVisible();
  await window.click('#toolsNav [data-tool-id="url"]');
  await window.keyboard.press("Control+K");
  await window.fill("#cmdInput", "go home");
  await window.keyboard.press("Enter");
  await expect(window.locator("#welcomeState")).toBeVisible();
  await expect(window.locator("#toolContainer")).toBeHidden();
});

test("home search box filter 'b64' shows Base64 and opens it", async () => {
  await window.click("#homeLogo");
  await window.fill("#homeSearch", "b64");
  const tile = window.locator('#homeGrid [data-tool-tile="base64"]');
  await expect(tile).toBeVisible();
  await expect(window.locator('#homeGrid [data-tool-tile="json"]')).toBeHidden();
  await tile.click();
  await expect(window.locator("#currentToolTitle")).toHaveText(/Base64/);
  await window.click("#homeLogo");
  await window.fill("#homeSearch", "");
});

