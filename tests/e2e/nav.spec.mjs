import { page as window, expect, captureErrors } from "./helpers/pw.mjs";
import { waitForAppReady } from "./helpers/tauriApp.mjs";


before(async () => {
  await waitForAppReady();
  await captureErrors();
});

it("logo returns home and deselects the tool", async () => {
  await window.click('#toolsNav [data-tool-id="json"]');
  await expect(window.locator("#toolContainer")).toBeVisible();
  await window.click('#homeLogo');
  await expect(window.locator("#welcomeState")).toBeVisible();
  await expect(window.locator("#toolContainer")).toBeHidden();
  await expect(window.locator("#toolsNav .nav-item.active")).toHaveCount(0);
  await expect(window.locator("#railHome")).toHaveAttribute("aria-current", "page");
});

it("rail Home and palette 'Go home' return home", async () => {
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

it("home search box filter 'b64' shows Base64 and opens it", async () => {
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

