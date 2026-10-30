import { expect } from "@wdio/globals";
import { waitForAppReady, windowState, pageErrors } from "./helpers/tauriApp.mjs";

before(async () => {
  await waitForAppReady();
});

after(async () => {
  expect(await pageErrors()).toEqual([]);
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
    await expect($("#loadingScreen")).not.toBeDisplayed({ wait: 20000 });
    await expect($("#toolsNav")).toBeDisplayed({ wait: 20000 });

    // Verify main UI elements exist
    await expect($(".titlebar")).toBeDisplayed({ wait: 5000 });
    await expect($("aside")).toBeDisplayed({ wait: 5000 });
    await expect($("main")).toBeDisplayed({ wait: 5000 });
  });

  it("should display sidebar with tools", async () => {
    // Wait for app to initialize
    await expect($("#toolsNav [data-tool-id]")).toBeDisplayed({ wait: 20000 });

    // Verify sidebar navigation exists and has content
    await expect($("#toolsNav")).toBeDisplayed({ wait: 5000 });

    // Check that navigation has items (tools or categories)
    await expect($$("#toolsNav > *")).toBeElementsArrayOfSize({ gte: 1 });
  });

  it("should be able to navigate to a tool", async () => {
    // Wait for app to initialize
    await expect($("#toolsNav [data-tool-id]")).toBeDisplayed({ wait: 20000 });

    // Click the first tool button; the sidebar is guaranteed non-empty by the wait above
    const toolButton = $("#toolsNav [data-tool-id]");
    const id = await toolButton.getAttribute("data-tool-id");
    await toolButton.click();

    // The tool is loaded once its nav item is marked current and the container is shown
    await expect($(`#toolsNav [data-tool-id="${id}"]`)).toHaveAttribute("aria-current", "page");
    await expect($("#toolContainer")).toBeDisplayed();
  });
});
