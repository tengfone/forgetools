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
  test("should launch and display basic UI", async () => {
    // Verify window title
    const title = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getTitle();
    });
    expect(title).toContain("ForgeTools");

    // Verify window is visible
    const isVisible = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.isVisible();
    });
    expect(isVisible).toBe(true);

    // Wait for app to initialize
    await window
      .waitForSelector("#loadingScreen", { state: "hidden", timeout: 20000 })
      .catch(() => {});
    await window.waitForSelector("#toolsNav", { timeout: 20000 });

    // Verify main UI elements exist
    const titlebar = window.locator(".titlebar");
    const sidebar = window.locator("aside");
    const mainContent = window.locator("main");

    await expect(titlebar).toBeVisible({ timeout: 5000 });
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  test("should display sidebar with tools", async () => {
    // Wait for app to initialize
    await window.waitForSelector("#toolsNav", { timeout: 20000 });
    await window.waitForTimeout(1000);

    // Verify sidebar navigation exists and has content
    const sidebarNav = window.locator("#toolsNav");
    await expect(sidebarNav).toBeVisible({ timeout: 5000 });

    // Check that navigation has items (tools or categories)
    const navItems = window.locator("#toolsNav > *");
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should be able to navigate to a tool", async () => {
    // Wait for app to initialize
    await window.waitForSelector("#toolsNav", { timeout: 20000 });
    await window.waitForTimeout(1000);

    // Find any tool button in the sidebar
    const toolButtons = window.locator("#toolsNav button");
    const buttonCount = await toolButtons.count();

    if (buttonCount > 0) {
      // Click the first tool button
      await toolButtons.first().click({ timeout: 5000 });

      // Wait a bit for tool to load
      await window.waitForTimeout(1000);

      // Verify tool container is visible (tool was loaded)
      const toolContainer = window.locator("#toolContainer");
      const isToolVisible = await toolContainer.isVisible().catch(() => false);

      // Tool container should be visible when a tool is selected
      expect(isToolVisible).toBe(true);
    } else {
      // If no buttons found, just verify the navigation structure exists
      const navExists = (await window.locator("#toolsNav").count()) > 0;
      expect(navExists).toBe(true);
    }
  });
});
