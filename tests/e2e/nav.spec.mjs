import { expect } from "@wdio/globals";
import { waitForAppReady, pageErrors } from "./helpers/tauriApp.mjs";

before(async () => {
  await waitForAppReady();
});

after(async () => {
  expect(await pageErrors()).toEqual([]);
});

it("logo returns home and deselects the tool", async () => {
  await $('#toolsNav [data-tool-id="json"]').click();
  await expect($("#toolContainer")).toBeDisplayed();
  await $("#homeLogo").click();
  await expect($("#welcomeState")).toBeDisplayed();
  await expect($("#toolContainer")).not.toBeDisplayed();
  await expect($$("#toolsNav .nav-item.active")).toBeElementsArrayOfSize(0);
  await expect($("#railHome")).toHaveAttribute("aria-current", "page");
});

it("rail Home and palette 'Go home' return home", async () => {
  await $('#toolsNav [data-tool-id="url"]').click();
  await expect($("#toolContainer")).toBeDisplayed();
  await $("#railHome").click();
  await expect($("#welcomeState")).toBeDisplayed();
  await $('#toolsNav [data-tool-id="url"]').click();
  await expect($("#toolContainer")).toBeDisplayed();
  await browser.keys(["Control", "k"]);
  await $("#cmdInput").setValue("go home");
  await browser.keys("Enter");
  await expect($("#welcomeState")).toBeDisplayed();
  await expect($("#toolContainer")).not.toBeDisplayed();
});

it("home search box filter 'b64' shows Base64 and opens it", async () => {
  await $("#homeLogo").click();
  await $("#homeSearch").setValue("b64");
  const tile = $('#homeGrid [data-tool-tile="base64"]');
  await expect(tile).toBeDisplayed();
  await expect($('#homeGrid [data-tool-tile="json"]')).not.toBeDisplayed();
  await tile.click();
  await expect($("#currentToolTitle")).toHaveText(/Base64/);
  await $("#homeLogo").click();
  await $("#homeSearch").clearValue();
  await expect($("#homeSearch")).toHaveValue("");
});
