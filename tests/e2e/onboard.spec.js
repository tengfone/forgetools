const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

let app;
let window;

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
  await window.waitForSelector("#homeSearch", { timeout: 20000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test("home box filters the grid for 'b64'", async () => {
  await window.fill("#homeSearch", "b64");
  await expect(window.locator('#homeGrid [data-tool-tile="base64"]')).toBeVisible();
  await expect(window.locator('#homeGrid [data-tool-tile="json"]')).toBeHidden();
  await expect(window.locator("#homeDetect button")).toHaveCount(0);
  await window.press("#homeSearch", "Escape");
  await expect(window.locator("#homeSearch")).toHaveValue("");
  await expect(window.locator('#homeGrid [data-tool-tile="json"]')).toBeVisible();
});

test("Arrow Down moves from the box into the grid", async () => {
  await window.fill("#homeSearch", "b64");
  await window.press("#homeSearch", "ArrowDown");
  await expect(window.locator('#homeGrid [data-tool-tile="base64"]')).toBeFocused();
  await window.fill("#homeSearch", "");
});

test("Ctrl+K on Home focuses and selects the box", async () => {
  await window.fill("#homeSearch", "abc");
  await window.locator("#homeBrowseHeading").click();
  await window.keyboard.press("Control+K");
  await expect(window.locator("#homeSearch")).toBeFocused();
  await expect(window.locator("#cmdPalette")).not.toHaveClass(/visible/);
  const sel = await window.evaluate(() => { const b = document.getElementById("homeSearch"); return [b.selectionStart, b.selectionEnd]; });
  expect(sel).toEqual([0, 3]);
  await window.fill("#homeSearch", "");
});

test("pasting a JWT into the box and pressing Enter opens the decoder with it", async () => {
  await window.fill("#homeSearch", JWT);
  await expect(window.locator("#homeDetect .btn-primary")).toContainText("Looks like a JWT");
  await expect(window.locator("#homeDetect .btn-primary")).toContainText("JWT Decoder");
  await window.press("#homeSearch", "Enter");
  await expect(window.locator("#jwt-input")).toHaveValue(JWT, { timeout: 10000 });
  await expect(window.locator("#jwt-header-out")).toContainText("HS256");
  // Inside a tool, Ctrl+K opens the palette as before
  await window.keyboard.press("Control+K");
  await expect(window.locator("#cmdPalette")).toHaveClass(/visible/);
  await window.keyboard.press("Escape");
  await window.click("#homeLogo");
  await expect(window.locator("#homeSearch")).toHaveValue("");
});
