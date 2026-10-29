import { page as window, expect, captureErrors } from "./helpers/pw.mjs";
import { waitForAppReady, windowState } from "./helpers/tauriApp.mjs";


before(async () => {
  await waitForAppReady();
  await captureErrors();
});

describe("Application Tests", () => {
  it("should launch and display basic UI", async () => {
    // Verify window title
    const { title } = await windowState();
    expect(title).toContain("ForgeTools");

    // Verify window is visible
    const { visible: isVisible } = await windowState();
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

  it("should display sidebar with tools", async () => {
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

  it("should be able to navigate to a tool", async () => {
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
