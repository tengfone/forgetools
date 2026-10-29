const { test, expect } = require("@playwright/test");
const { launchElectronApp } = require("./helpers/electronApp");

// Every new tool: open it, click Sample, and assert the real output.
let app;
let window;
const pageErrors = [];
const consoleErrors = [];

test.beforeAll(async () => {
  ({ app, window } = await launchElectronApp());
  window.on("pageerror", (e) => pageErrors.push(e.message));
  window.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await window.waitForSelector("#toolsNav [data-tool-id]", { timeout: 20000 });
});

test.afterAll(async () => {
  if (app) await app.close();
});

async function open(id) {
  await window.click(`#toolsNav [data-tool-id="${id}"]`);
}

// [tool id, element prefix, expected output pattern]
const CASES = [
  ["hmac", "hmac", /5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843/],
  ["csrDecoder", "csr", /CN=forgetools\.example[\s\S]*DNS:www\.forgetools\.example/],
  ["samlDecoder", "saml", /<samlp:AuthnRequest[\s\S]*<saml:Issuer>/],
  ["urlParser", "urlp", /api\.example\.com[\s\S]*tag = b/],
  ["userAgent", "ua", /Chrome 124[\s\S]*macOS/],
  ["cidr", "cidr", /192\.168\.10\.64\/26[\s\S]*INSIDE/],
  ["decompress", "gz", /^Hello world$/],
  ["binaryDecoder", "bin", /"field": 1[\s\S]*150[\s\S]*testing/],
  ["unicodeInspector", "uni", /U\+200B/],
  ["dockerfileLint", "dfl", /DL3006[\s\S]*SEC-SECRET/],
  ["cssJsFormat", "cjs", /\.btn \{\n {2}color: #fff;/],
  ["graphqlFormat", "gql", /query GetUser\(\$id: ID!\) \{\n {2}user\(id: \$id\) \{/],
  ["jsonYaml", "jy", /name: forge[\s\S]*port: 8080/],
  ["jsonTypes", "jt", /qty\?: number;[\s\S]*export interface Root/],
  ["tomlJson", "tj", /"title": "ForgeTools"[\s\S]*"port": 8080/],
  ["envJson", "ej", /"API_URL": "https:\/\/api\.example\.com"[\s\S]*"GREETING": "hello world"/],
  ["pemJwk", "pj", /"kty": "OKP"[\s\S]*"crv": "Ed25519"/],
  ["curlConverter", "curl", /fetch\(['"]https:\/\/api\.example\.com\/v1\/users/],
  ["dockerCompose", "dc", /services:[\s\S]*8080:80[\s\S]*image: nginx:1\.27/],
  ["chmod", "chmod", /rwxr-xr-x/],
  ["dataSize", "dsz", /MiB +1,536/],
  ["timezone", "tz", /2024-06-01T13:00:00\.000Z/],
  ["jsonPath", "jp", /"Dune"/],
  ["passwordStrength", "pws", /Score: +\d\/4/],
  ["passwordHash", "pwh", /^\$2[aby]\$10\$/],
  ["pipeline", "chain", /"user": "ada"/],
  ["jwtSign", "jws", /^eyJ[\w-]+\.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ\.[\w-]+$/],
  ["keyPair", "kp", /^ssh-ed25519 \S+ me@laptop$/, "kp-ssh"],
  ["fakeData", "fake", /"fullName": "[A-Z][a-z]+ [A-Z][\s\S]*"company": "/],
  ["cronBuilder", "cronb", /^30 9 \* \* 1-5$/],
  ["gitignore", "gi", /# Node\nnode_modules\//],
  ["jsonDiff", "jd", /~ \$\.version: 1 → 2/],
];

for (const [id, p, re, out] of CASES) {
  test(`${id}: Sample produces the expected output`, async () => {
    await open(id);
    await window.click(`#${p}-sample`);
    await expect.poll(async () => window.locator(`#${out ?? `${p}-output`}`).inputValue(), { timeout: 15000 }).toMatch(re);
    await expect(window.locator("#statusBar")).not.toHaveClass(/is-error/);
  });
}

test("HTTP status reference: search filters a grouped table and rows copy", async () => {
  await open("httpStatus");
  await window.fill("#http-input", "gateway");
  await expect(window.locator("#http-output tr")).toHaveCount(2);
  await expect(window.locator("#http-output")).toContainText("502");
  await expect(window.locator("#http-output .ref-group")).toHaveText(["5xx Server error"]);
  await expect(window.locator("#http-output .ref-copy").first()).toHaveAttribute("data-copy-text", "502 Bad Gateway");
});

test("cheat sheets: search spans all sheets, sheet picker narrows", async () => {
  await open("cheatSheets");
  await window.fill("#cheat-input", "stash");
  await expect(window.locator("#cheat-output .ref-group")).toHaveText(["Git"]);
  await window.click("#cheat-sample");
  await expect(window.locator("#cheat-output")).toContainText("git rebase -i");
  await expect(window.locator("#cheat-output .ref-group")).toHaveCount(1);
});

test("key pair: comment edits never regenerate; type change clears", async () => {
  await open("keyPair");
  await expect(window.locator("#kp-private")).toHaveValue("");
  await window.click("#kp-sample");
  await expect.poll(async () => window.locator("#kp-private").inputValue(), { timeout: 15000 }).toMatch(/BEGIN PRIVATE KEY/);
  const priv = await window.locator("#kp-private").inputValue();
  await window.fill("#kp-input", "ci@build");
  await expect(window.locator("#kp-ssh")).toHaveValue(/ ci@build$/);
  await expect(window.locator("#kp-private")).toHaveValue(priv);
  await window.selectOption("#kp-type", "ec-p256");
  await expect(window.locator("#kp-private")).toHaveValue("");
});

test("cron builder: shows only relevant fields and rejects bad values", async () => {
  await open("cronBuilder");
  await window.selectOption("#cronb-freq", "minute");
  await expect(window.locator("#cronb-time")).toBeHidden();
  await expect(window.locator("#cronb-output")).toHaveValue("* * * * *");
  await window.selectOption("#cronb-freq", "interval-minutes");
  await expect(window.locator("#cronb-every")).toBeVisible();
  await window.fill("#cronb-every", "90");
  await expect(window.locator("#cronb-every")).toHaveAttribute("aria-invalid", "true");
  await expect(window.locator("#cronb-output")).toHaveValue("");
  await window.fill("#cronb-every", "10");
  await expect(window.locator("#cronb-output")).toHaveValue("*/10 * * * *");
  await expect(window.locator("#cronb-next li")).toHaveCount(3);
});

test("fake data: chips pick fields; table name only for SQL", async () => {
  await open("fakeData");
  await expect(window.locator("#fake-table-wrap")).toBeHidden();
  await window.click("#fake-none");
  await window.click("label:has(#fake-f-email)");
  await window.selectOption("#fake-fmt", "sql");
  await expect(window.locator("#fake-table-wrap")).toBeVisible();
  await expect.poll(async () => window.locator("#fake-output").inputValue()).toMatch(/^INSERT INTO users \(email\) VALUES/);
});

test("pipeline: recipe replaces steps; failing step is marked", async () => {
  await open("pipeline");
  await window.selectOption("#chain-recipe", { label: "JSON → minify → Base64" });
  await expect(window.locator("#chain-steps .step-label")).toHaveText(["JSON minify", "Base64 encode"]);
  await window.fill("#chain-input", "not json");
  await expect(window.locator("#chain-steps .step-row.is-error")).toHaveCount(1);
  await expect(window.locator("#chain-warn")).toBeVisible();
  await expect(window.locator("#chain-steps .step-error")).toHaveCount(1);
  await window.fill("#chain-input", '{ "a": 1 }');
  await expect.poll(async () => window.locator("#chain-output").inputValue()).toBe("eyJhIjoxfQ==");
  await window.click('[data-step-remove="1"]');
  await expect.poll(async () => window.locator("#chain-output").inputValue()).toBe('{"a":1}');
});

test("password inputs are masked with a reveal toggle", async () => {
  await open("passwordStrength");
  await expect(window.locator("#pws-input")).toHaveAttribute("type", "password");
  await window.click("#pws-reveal");
  await expect(window.locator("#pws-input")).toHaveAttribute("type", "text");
});

test("JS minify (terser, lazy-loaded) works in the packaged renderer", async () => {
  await open("cssJsFormat");
  await window.selectOption("#cjs-lang", "js");
  await window.selectOption("#cjs-mode", "min");
  await window.fill("#cjs-input", "function add(first, second) {\n  return first + second;\n}\nconsole.log(add(1, 2));");
  await expect.poll(async () => window.locator("#cjs-output").inputValue(), { timeout: 15000 }).toMatch(/^console\.log\(3\)|function add\(\w,\w\)/);
});

test("Argon2 (WASM) hashes and verifies", async () => {
  await open("passwordHash");
  await window.selectOption("#pwh-algo", "argon2id");
  await window.selectOption("#pwh-cost", "low");
  await window.fill("#pwh-input", "hunter2");
  await expect.poll(async () => window.locator("#pwh-output").inputValue(), { timeout: 15000 }).toMatch(/^\$argon2id\$v=19\$/);
  const hash = await window.locator("#pwh-output").inputValue();
  await window.fill("#pwh-hash", hash);
  await expect.poll(async () => window.locator("#pwh-output").inputValue(), { timeout: 15000 }).toMatch(/MATCH ✓/);
});

test("invalid input is reported, not thrown", async () => {
  await open("jsonYaml");
  await window.fill("#jy-input", "{bad json");
  await expect(window.locator("#jy-input")).toHaveAttribute("aria-invalid", "true", { timeout: 5000 });
});

test("favicon renders previews and the HTML snippet", async () => {
  await open("favicon");
  await window.click("#fav-sample");
  await expect(window.locator("#fav-preview canvas")).toHaveCount(4);
  await expect(window.locator("#fav-output")).toHaveValue(/favicon\.ico/);
});

test("pasting a cURL command on Home hands it to the cURL tool", async () => {
  const cmd = "curl -X POST https://api.example.com/v1 -H 'Content-Type: application/json' -d '{\"a\":1}'";
  await window.click("#homeLogo");
  await window.fill("#homeSearch", cmd);
  await expect(window.locator("#homeDetect .btn-primary")).toContainText("cURL");
  await window.press("#homeSearch", "Enter");
  await expect(window.locator("#curl-input")).toHaveValue(cmd, { timeout: 10000 });
  await expect.poll(async () => window.locator("#curl-output").inputValue(), { timeout: 10000 }).toContain("api.example.com/v1");
});

test("opt-in history: live toggle, restore, hidden on Home, never records secrets", async () => {
  const stored = tool => window.evaluate(t => JSON.parse(localStorage.getItem(`tool-history:${t}`) || "null"), tool);
  const setHistory = on => window.evaluate(v => { const c = document.getElementById("setting-history"); c.checked = v; c.dispatchEvent(new Event("change")); }, on);
  await open("chmod");
  await expect(window.locator("#toolHistory")).toBeHidden();
  await setHistory(true);
  try {
    await expect(window.locator("#toolHistory")).toBeVisible(); // no reopen needed
    await window.fill("#chmod-input", "644");
    await expect.poll(async () => window.evaluate(() => localStorage.getItem("tool-history:chmod")), { timeout: 5000 }).toContain("644");
    await expect(window.locator("#toolHistory option")).toHaveCount(2);
    // Picking an older entry restores it and moves it to the top
    await window.fill("#chmod-input", "755");
    await expect.poll(() => stored("chmod"), { timeout: 5000 }).toEqual(["755", "644"]);
    await window.selectOption("#toolHistory", "1");
    await expect(window.locator("#chmod-input")).toHaveValue("644");
    await expect.poll(() => stored("chmod")).toEqual(["644", "755"]);
    // An edit is flushed to its own tool when switching away before the debounce fires
    await window.fill("#chmod-input", "600");
    await open("pipeline");
    expect((await stored("chmod"))[0]).toBe("600");
    // Secret-looking input is never stored, even in tools that allow history
    await open("chmod");
    await window.fill("#chmod-input", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl");
    await window.click("#homeLogo"); // flushes the pending entry
    expect(await stored("chmod")).not.toContainEqual(expect.stringContaining("eyJ"));
    // Hidden on Home
    await window.click("#homeLogo");
    await expect(window.locator("#toolHistory")).toBeHidden();
    // Secret-bearing tools never show or store history
    await open("hmac");
    await expect(window.locator("#toolHistory")).toBeHidden();
    await window.fill("#hmac-input", "secret body");
    await open("pipeline"); // switching flushes any pending entry
    await expect(window.locator("#toolHistory")).toBeHidden();
    await window.fill("#chain-input", "token-abc");
    await window.click("#homeLogo");
    expect(await stored("hmac")).toBeNull();
    expect(await stored("pipeline")).toBeNull();
  } finally {
    await setHistory(false);
  }
  expect(await window.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("tool-history:")))).toEqual([]);
});

test("undo is dropped after a tool switch (no stale action on removed DOM)", async () => {
  await open("pipeline");
  await window.click("#chain-sample");
  await window.click('[data-step-remove="0"]');
  await expect(window.locator("#toastContainer .toast-action")).toBeVisible();
  await open("cronBuilder");
  await expect(window.locator("#toastContainer .toast-action")).toHaveCount(0);
  await window.focus("#cronb-sample");
  await window.keyboard.press("Control+z");
  await open("pipeline");
  // The rendered steps and the hidden ops field agree
  const ops = (await window.inputValue("#chain-ops")).split(",").filter(Boolean);
  await expect(window.locator("#chain-steps li")).toHaveCount(ops.length);
});

test("no runtime errors across the new tools", async () => {
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((e) => /Content Security Policy|WebAssembly|wasm/i.test(e))).toEqual([]);
});
