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
  await expect(window.locator(".toast").last()).toContainText("Copied");
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip).toBe(text);
});

test("JSON output Copy goes through the main-process clipboard", async () => {
  await window.click('#toolsNav [data-tool-id="json"]');
  await window.click("#sampleBtn");
  await expect.poll(async () => (await window.evaluate(() =>
    document.querySelector("#outputEditor .view-lines")?.textContent ?? "")).length, { timeout: 10000 }).toBeGreaterThan(5);
  await app.evaluate(({ clipboard }) => clipboard.writeText(""));
  await window.click("#copyBtn");
  await expect(window.locator(".toast").last()).toContainText("Copied output");
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip.length).toBeGreaterThan(5);
  expect(() => JSON.parse(clip)).not.toThrow();
  expect(clip).toContain("\n"); // formatted output, not the raw sample echo
});

test("Paste button reads the main-process clipboard", async () => {
  await app.evaluate(({ clipboard }) => clipboard.writeText("hello paste"));
  await window.click('#toolsNav [data-tool-id="base64"]');
  await window.click('[data-paste="b64-plain"]');
  await expect(window.locator("#b64-plain")).toHaveValue("hello paste");
});

test("sidebar search trigger opens the palette", async () => {
  await window.click("#sidebarSearch");
  await expect(window.locator("#cmdPalette")).toHaveClass(/visible/);
  await expect(window.locator("#sidebarSearch kbd").first()).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.locator("#cmdPalette")).not.toHaveClass(/visible/);
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

test("titlebar settings button opens the Settings dialog", async () => {
  await window.click('button[aria-label="Settings"] >> nth=0');
  await expect(window.locator("#settingsTitle")).toHaveText("Settings");
  await expect(window.locator("#settingsOverlay")).toHaveClass(/visible/);
  await window.keyboard.press("Escape");
});

test("palette 'about' opens Settings on the About section", async () => {
  const pkg = require("../../package.json");
  await window.keyboard.press("Control+K");
  await window.keyboard.type("about");
  await window.locator(".cmd-item", { hasText: "About ForgeTools" }).first().click();
  await expect(window.locator("#settingsOverlay")).toHaveClass(/visible/);
  await expect(window.locator("#stab-about")).toHaveAttribute("aria-selected", "true");
  await expect(window.locator("#aboutVersion")).toHaveText(`Version ${pkg.version}`);
  await expect(window.locator('#settingsAbout [data-link]')).toHaveCount(4);
  await expect(window.locator('#settingsAbout [data-link="coffee"]')).toBeVisible();
  // Auto update check is opt-in
  await expect(window.locator("#setting-autoupdate")).not.toBeChecked();
  await window.keyboard.press("Escape");
  await expect(window.locator("#settingsOverlay")).not.toHaveClass(/visible/);
});

test("settings sections switch with tabs and arrow keys, and fit the window", async () => {
  await window.click('button[aria-label="Settings"] >> nth=0');
  await window.click("#stab-editor");
  await expect(window.locator("#spane-editor")).toBeVisible();
  await expect(window.locator("#spane-privacy")).toBeHidden();
  await window.keyboard.press("ArrowDown");
  await expect(window.locator("#spane-privacy")).toBeVisible();
  await expect(window.locator("#stab-privacy")).toBeFocused();
  const fits = await window.evaluate(() => {
    const p = document.querySelector('#settingsOverlay .settings-panel').getBoundingClientRect();
    return p.bottom <= window.innerHeight;
  });
  expect(fits).toBe(true);
  await window.click("#stab-editor");
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
