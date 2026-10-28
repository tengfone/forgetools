const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

let app;
let window;

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
  await window.waitForSelector("#welcomePaste", { timeout: 20000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test("welcome paste detects a JWT and Enter opens the decoder with it", async () => {
  await window.fill("#welcomePaste", JWT);
  await expect(window.locator("#welcomeDetect .btn-primary")).toContainText("JWT");
  await window.press("#welcomePaste", "Enter");
  await expect(window.locator("#jwt-input")).toHaveValue(JWT, { timeout: 10000 });
  await expect(window.locator("#jwt-header-out")).toContainText("HS256");
  await expect(window.locator("#welcomePaste")).toHaveValue("");
});
