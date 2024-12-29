const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

let app;
let window;

test.beforeAll(async () => {
  const launched = await launchElectronApp();
  app = launched.app;
  window = launched.window;
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

test.describe("Application Tests", () => {
  test.beforeEach(async () => {
    // Verify window state before each test
    const isReady = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win && !win.isDestroyed() && win.isVisible();
    });
    expect(isReady).toBe(true);
  });

  test("should launch and verify basic app state", async () => {
    // Get window title through main process to avoid direct window access
    const title = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getTitle();
    });
    expect(title).toContain("ForgeTools");

    // Verify window visibility through main process
    const isVisible = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.isVisible();
    });
    expect(isVisible).toBe(true);
  });

  test("should display sidebar elements correctly", async () => {
    // Debug: Log the page content
    const content = await window.evaluate(() => document.body.innerHTML);
    console.log('Page content:', content);

    // Wait for any sidebar element
    const sidebar = window.locator('.sidebar, #sidebar, [data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Check for specific sidebar sections using more flexible selectors
    const formatters = window.locator(':text("Formatters"), [data-testid="formatters-section"]');
    const converters = window.locator(':text("Converters"), [data-testid="converters-section"]');
    const generators = window.locator(':text("Generators"), [data-testid="generators-section"]');

    // Verify each section is visible
    await expect(formatters).toBeVisible({ timeout: 5000 });
    await expect(converters).toBeVisible({ timeout: 5000 });
    await expect(generators).toBeVisible({ timeout: 5000 });
  });
});
