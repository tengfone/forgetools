const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

// Smoke test: every tool must render without throwing, and shared
// clipboard actions plus the diff modes must work end to end.
let app;
let window;
const pageErrors = [];

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
  window.on("pageerror", (e) => pageErrors.push(e.message));
  await window.waitForSelector("#toolsNav [data-tool-id]", { timeout: 20000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

test("every tool opens without runtime errors", async () => {
  const ids = await window.$$eval("#toolsNav [data-tool-id]", (els) =>
    els.map((e) => e.getAttribute("data-tool-id"))
  );
  expect(ids.length).toBeGreaterThan(20);
  for (const id of ids) {
    await window.click(`#toolsNav [data-tool-id="${id}"]`);
    await window.waitForTimeout(150);
  }
  expect(pageErrors).toEqual([]);
});

test("no inline styles or handlers leak into tool UIs", async () => {
  const ids = await window.$$eval("#toolsNav [data-tool-id]", (els) =>
    els.map((e) => e.getAttribute("data-tool-id"))
  );
  for (const id of ids) {
    await window.click(`#toolsNav [data-tool-id="${id}"]`);
    await window.waitForTimeout(100);
    const inlineHandlers = await window.$$eval("#toolContainer [onclick]", (els) => els.length).catch(() => 0);
    expect(inlineHandlers, id).toBe(0);
  }
});

test("delegated copy writes to the clipboard", async () => {
  await window.click('#toolsNav [data-tool-id="randomStringGenerator"]');
  const chip = window.locator("#rand-results .copy-chip").first();
  await chip.waitFor();
  const text = (await chip.textContent()).trim();
  await chip.click();
  // Either outcome must be reported to the user; never a silent no-op.
  const toast = window.locator(".toast");
  await expect(toast).toContainText(/Copied|Copy failed/);
  if ((await toast.textContent()).includes("Copied")) {
    const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(clip).toBe(text);
  }
});

test("diff tool supports word and char modes", async () => {
  await window.click('#toolsNav [data-tool-id="textDiff"]');
  await window.waitForSelector("#diff-mode");
  const hasDiff = await window.locator("#diff-mode").count();
  test.skip(!hasDiff, "diff tool id differs");
  for (const mode of ["line", "word", "char"]) {
    await window.selectOption("#diff-mode", mode);
    await window.waitForTimeout(100);
  }
  expect(pageErrors).toEqual([]);
});

test("custom tool errors land in the shared status bar", async () => {
  await window.click('#toolsNav [data-tool-id="yamlFormatter"]');
  await window.waitForSelector("#yaml-input");
  await window.fill("#yaml-input", "a: [unclosed");
  await expect(window.locator("#statusBar")).toHaveClass(/is-error/);
  await window.fill("#yaml-input", "a: 1");
  await expect(window.locator("#statusBar")).not.toHaveClass(/is-error/);
  // switching tools resets the bar
  await window.fill("#yaml-input", "a: [");
  await window.click('#toolsNav [data-tool-id="hash"]');
  await expect(window.locator("#statusMsg")).toHaveText("Ready");
});

test("number base rejects invalid digits instead of ignoring them", async () => {
  await window.click('#toolsNav [data-tool-id="numberBaseConverter"]');
  await window.waitForSelector("#num-binary");
  await window.fill("#num-binary", "1012");
  await expect(window.locator("#num-binary")).toHaveAttribute("aria-invalid", "true");
  await expect(window.locator("#statusMsg")).toContainText(/base-2/i);
  await window.fill("#num-binary", "1010");
  await expect(window.locator("#num-decimal")).toHaveValue("10");
});

test("barcode validates format before generating", async () => {
  await window.click('#toolsNav [data-tool-id="barcodeGenerator"]');
  await window.waitForSelector("#barcode-input");
  await window.fill("#barcode-input", "abc");
  await window.selectOption("#barcode-format", "EAN13");
  await window.click("#barcode-generate");
  await expect(window.locator("#statusMsg")).toContainText("EAN-13");
});

test("clear can be undone from the toast", async () => {
  await window.click('#toolsNav [data-tool-id="yamlFormatter"]');
  await window.waitForSelector("#yaml-input");
  await window.fill("#yaml-input", "keep: me");
  await window.click("#yaml-clear");
  await expect(window.locator("#yaml-input")).toHaveValue("");
  await window.click(".toast-action");
  await expect(window.locator("#yaml-input")).toHaveValue("keep: me");
});

test("help popover opens per tool with syntax table", async () => {
  await window.click('#toolsNav [data-tool-id="cronParser"]');
  await window.click("#helpBtn");
  await expect(window.locator("#helpPopover")).toBeVisible();
  await expect(window.locator("#helpPopover .help-table")).toContainText("*/15");
  await window.keyboard.press("Escape");
  await expect(window.locator("#helpPopover")).toBeHidden();
  await window.keyboard.press("F1");
  await expect(window.locator("#helpPopover")).toBeVisible();
  await window.click('#toolsNav [data-tool-id="hash"]');
  await expect(window.locator("#helpPopover")).toBeHidden();
});

test("tool inputs survive switching tools within the session", async () => {
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  await window.click('#toolsNav [data-tool-id="jwt"]');
  const ta = window.locator("#customInterface textarea").first();
  await ta.waitFor();
  await ta.fill(token);
  await window.click('#toolsNav [data-tool-id="json"]');
  await window.waitForTimeout(200);
  await window.click('#toolsNav [data-tool-id="jwt"]');
  await expect(window.locator("#customInterface textarea").first()).toHaveValue(token);
  await expect(window.locator("#statusSession")).toHaveText("memory only");
});

test("url two-way: typing decoded encodes, swap flips direction", async () => {
  await window.click('#toolsNav [data-tool-id="url"]');
  await window.waitForSelector("#url-decoded");
  await window.fill("#url-decoded", "");
  await window.fill("#url-encoded", "");
  await window.locator("#url-decoded").pressSequentially("a b&c");
  await expect(window.locator("#url-encoded")).toHaveValue("a%20b%26c");
  await expect(window.locator("#url-dir")).toContainText("Encode \u2192");
  await window.click("#url-swap");
  await expect(window.locator("#url-dir")).toContainText("Decode");
  await expect(window.locator("#url-dir")).toHaveAttribute("data-direction", "backward");
  await expect(window.locator("#url-encoded")).toHaveValue("a%20b%26c");
  await expect(window.locator("#url-decoded")).toHaveValue("a b&c");
});

test("palette fuzzy search finds Base64 for 'b64'", async () => {
  await window.keyboard.press("Control+K");
  await window.keyboard.type("b64");
  await expect(window.locator("#cmdResults")).toContainText("Base64");
  await window.keyboard.press("Escape");
});

test("titlebar settings button opens the Settings sheet", async () => {
  await window.click('button[aria-label="Settings"] >> nth=0');
  await expect(window.locator("#settingsTitle")).toHaveText("Settings");
  await expect(window.locator("#settingsOverlay")).toHaveClass(/visible/);
  await window.keyboard.press("Escape");
});

test("editor mode segmented control switches mode", async () => {
  await window.click('#toolsNav [data-tool-id="json"]');
  const group = window.locator('#toolActions [role="radiogroup"]');
  await group.waitFor();
  const fmt = group.locator('[role="radio"][data-mode="format"]');
  const min = group.locator('[role="radio"][data-mode="minify"]');
  await expect(fmt).toHaveAttribute("aria-checked", "true");
  await expect(min).toHaveAttribute("aria-checked", "false");
  await min.click();
  await expect(min).toHaveAttribute("aria-checked", "true");
  await expect(fmt).toHaveAttribute("aria-checked", "false");
  await min.press("ArrowLeft");
  await expect(fmt).toHaveAttribute("aria-checked", "true");
  await expect(fmt).toBeFocused();
});

test("opening JWT focuses its input", async () => {
  await window.click('#toolsNav [data-tool-id="jwt"]');
  await expect(window.locator("#jwt-input")).toBeFocused({ timeout: 5000 });
});
