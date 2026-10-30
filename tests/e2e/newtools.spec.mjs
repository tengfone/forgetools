import { expect } from "@wdio/globals";
import { waitForAppReady, pageErrors, consoleErrors } from "./helpers/tauriApp.mjs";
import { selectOption, typeText } from "./helpers/input.mjs";

// Every new tool: open it, click Sample, and assert the real output.

before(async () => {
  await waitForAppReady();
  await $("#toolsNav [data-tool-id]").waitForDisplayed({ timeout: 20000 });
});

async function open(id) {
  await $(`#toolsNav [data-tool-id="${id}"]`).click();
  await expect($(`#toolsNav [data-tool-id="${id}"]`)).toHaveAttribute("aria-current", "page");
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
  it(`${id}: Sample produces the expected output`, async () => {
    await open(id);
    await $(`#${p}-sample`).click();
    await expect($(`#${out ?? `${p}-output`}`)).toHaveValue(re, { wait: 15000 });
    await expect($("#statusBar")).not.toHaveElementClass("is-error");
  });
}

it("HTTP status reference: search filters a grouped table and rows copy", async () => {
  await open("httpStatus");
  await $("#http-input").setValue("gateway");
  await expect($$("#http-output tr")).toBeElementsArrayOfSize(2);
  await expect($("#http-output")).toHaveText(expect.stringContaining("502"));
  await expect($$("#http-output .ref-group")).toBeElementsArrayOfSize(1);
  await expect($("#http-output .ref-group")).toHaveText("5xx Server error");
  await expect($("#http-output .ref-copy")).toHaveAttribute("data-copy-text", "502 Bad Gateway");
});

it("cheat sheets: search spans all sheets, sheet picker narrows", async () => {
  await open("cheatSheets");
  await $("#cheat-input").setValue("stash");
  await expect($$("#cheat-output .ref-group")).toBeElementsArrayOfSize(1);
  await expect($("#cheat-output .ref-group")).toHaveText("Git");
  await $("#cheat-sample").click();
  await expect($("#cheat-output")).toHaveText(expect.stringContaining("git rebase -i"));
  await expect($$("#cheat-output .ref-group")).toBeElementsArrayOfSize(1);
});

it("key pair: comment edits never regenerate; type change clears", async () => {
  await open("keyPair");
  await expect($("#kp-private")).toHaveValue("");
  await $("#kp-sample").click();
  await expect($("#kp-private")).toHaveValue(/BEGIN PRIVATE KEY/, { wait: 15000 });
  const priv = await $("#kp-private").getValue();
  await $("#kp-input").setValue("ci@build");
  await expect($("#kp-ssh")).toHaveValue(/ ci@build$/);
  await expect($("#kp-private")).toHaveValue(priv);
  await selectOption("#kp-type", { value: "ec-p256" });
  await expect($("#kp-private")).toHaveValue("");
});

it("cron builder: shows only relevant fields and rejects bad values", async () => {
  await open("cronBuilder");
  await selectOption("#cronb-freq", { value: "minute" });
  await expect($("#cronb-time")).not.toBeDisplayed();
  await expect($("#cronb-output")).toHaveValue("* * * * *");
  await selectOption("#cronb-freq", { value: "interval-minutes" });
  await expect($("#cronb-every")).toBeDisplayed();
  await $("#cronb-every").setValue("90");
  await expect($("#cronb-every")).toHaveAttribute("aria-invalid", "true");
  await expect($("#cronb-output")).toHaveValue("");
  await $("#cronb-every").setValue("10");
  await expect($("#cronb-output")).toHaveValue("*/10 * * * *");
  await expect($$("#cronb-next li")).toBeElementsArrayOfSize(3);
});

it("fake data: chips pick fields; table name only for SQL", async () => {
  await open("fakeData");
  await expect($("#fake-table-wrap")).not.toBeDisplayed();
  await $("#fake-none").click();
  await expect($("#fake-f-email")).not.toBeSelected();
  await $("#fake-f-email").$("..").click(); // the chip label wrapping the checkbox
  await expect($("#fake-f-email")).toBeSelected();
  await selectOption("#fake-fmt", { value: "sql" });
  await expect($("#fake-table-wrap")).toBeDisplayed();
  await expect($("#fake-output")).toHaveValue(/^INSERT INTO users \(email\) VALUES/);
});

it("pipeline: recipe replaces steps; failing step is marked", async () => {
  await open("pipeline");
  await selectOption("#chain-recipe", { label: "JSON → minify → Base64" });
  await expect($$("#chain-steps .step-label")).toBeElementsArrayOfSize(2);
  await expect($$("#chain-steps .step-label")).toHaveText(["JSON minify", "Base64 encode"],
    { featureFlags: { useToHaveTextStrictMultiElementsCompareStrategy: true } }); // element-wise, not "any of"
  await $("#chain-input").setValue("not json");
  await expect($$("#chain-steps .step-row.is-error")).toBeElementsArrayOfSize(1);
  await expect($("#chain-warn")).toBeDisplayed();
  await expect($$("#chain-steps .step-error")).toBeElementsArrayOfSize(1);
  await $("#chain-input").setValue('{ "a": 1 }');
  await expect($("#chain-output")).toHaveValue("eyJhIjoxfQ==");
  await $('[data-step-remove="1"]').click();
  await expect($("#chain-output")).toHaveValue('{"a":1}');
});

it("password inputs are masked with a reveal toggle", async () => {
  await open("passwordStrength");
  await expect($("#pws-input")).toHaveAttribute("type", "password");
  await $("#pws-reveal").click();
  await expect($("#pws-input")).toHaveAttribute("type", "text");
});

it("JS minify (terser, lazy-loaded) works in the packaged renderer", async () => {
  await open("cssJsFormat");
  await selectOption("#cjs-lang", { value: "js" });
  await selectOption("#cjs-mode", { value: "min" });
  await $("#cjs-input").setValue("function add(first, second) {\n  return first + second;\n}\nconsole.log(add(1, 2));");
  await expect($("#cjs-output")).toHaveValue(/^console\.log\(3\)|function add\(\w,\w\)/, { wait: 15000 });
});

it("Argon2 (WASM) hashes and verifies", async () => {
  await open("passwordHash");
  await selectOption("#pwh-algo", { value: "argon2id" });
  await selectOption("#pwh-cost", { value: "low" });
  await $("#pwh-input").setValue("hunter2");
  await expect($("#pwh-output")).toHaveValue(/^\$argon2id\$v=19\$/, { wait: 15000 });
  const hash = await $("#pwh-output").getValue();
  await $("#pwh-hash").setValue(hash);
  await expect($("#pwh-output")).toHaveValue(/MATCH ✓/, { wait: 15000 });
});

it("invalid input is reported, not thrown", async () => {
  await open("jsonYaml");
  await $("#jy-input").setValue("{bad json");
  await expect($("#jy-input")).toHaveAttribute("aria-invalid", "true", { wait: 5000 });
});

it("favicon renders previews and the HTML snippet", async () => {
  await open("favicon");
  await $("#fav-sample").click();
  await expect($$("#fav-preview canvas")).toBeElementsArrayOfSize(4);
  await expect($("#fav-output")).toHaveValue(/favicon\.ico/);
});

it("pasting a cURL command on Home hands it to the cURL tool", async () => {
  const cmd = "curl -X POST https://api.example.com/v1 -H 'Content-Type: application/json' -d '{\"a\":1}'";
  await $("#homeLogo").click();
  await $("#homeSearch").setValue(cmd);
  await expect($("#homeDetect .btn-primary")).toHaveText(expect.stringContaining("cURL"));
  await browser.keys("Enter"); // focus is still in #homeSearch
  await expect($("#curl-input")).toHaveValue(cmd);
  await expect($("#curl-output")).toHaveValue(expect.stringContaining("api.example.com/v1"));
});

it("opt-in history: live toggle, restore, hidden on Home, never records secrets", async () => {
  // localStorage contents are app state with no WebDriver equivalent.
  const stored = tool => browser.execute(t => JSON.parse(localStorage.getItem(`tool-history:${t}`) || "null"), tool);
  const storedIs = async (tool, want) => browser.waitUntil(async () => JSON.stringify(await stored(tool)) === JSON.stringify(want),
    { timeout: 5000, timeoutMsg: `tool-history:${tool} never became ${JSON.stringify(want)}` });
  // Toggle the setting through the Settings dialog, like a user.
  const setHistory = async on => {
    await $('button[aria-label="Settings"]').click();
    await expect($("#settingsOverlay")).toHaveElementClass("visible");
    await $("#stab-privacy").click();
    await expect($("#spane-privacy")).toBeDisplayed();
    const box = $("#setting-history");
    if ((await box.isSelected()) !== on) await $('label[for="setting-history"]').click();
    await expect(box).toHaveElementProperty("checked", on);
    await browser.keys("Escape");
    await expect($("#settingsOverlay")).not.toHaveElementClass("visible");
  };
  await open("chmod");
  await expect($("#toolHistory")).not.toBeDisplayed();
  await setHistory(true);
  try {
    await expect($("#toolHistory")).toBeDisplayed(); // no reopen needed
    await typeText("#chmod-input", "644");
    await storedIs("chmod", ["644"]);
    await expect($$("#toolHistory option")).toBeElementsArrayOfSize(2);
    // Picking an older entry restores it and moves it to the top
    await typeText("#chmod-input", "755");
    await storedIs("chmod", ["755", "644"]);
    await selectOption("#toolHistory", { value: "1" });
    await expect($("#chmod-input")).toHaveValue("644");
    await storedIs("chmod", ["644", "755"]);
    // An edit is flushed to its own tool when switching away before the debounce fires
    await typeText("#chmod-input", "600");
    await open("pipeline");
    expect((await stored("chmod"))[0]).toBe("600");
    // Secret-looking input is never stored, even in tools that allow history
    await open("chmod");
    await typeText("#chmod-input", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl");
    await $("#homeLogo").click(); // flushes the pending entry
    expect(await stored("chmod")).not.toContainEqual(expect.stringContaining("eyJ"));
    // Hidden on Home
    await $("#homeLogo").click();
    await expect($("#toolHistory")).not.toBeDisplayed();
    // Secret-bearing tools never show or store history
    await open("hmac");
    await expect($("#toolHistory")).not.toBeDisplayed();
    await typeText("#hmac-input", "secret body");
    await open("pipeline"); // switching flushes any pending entry
    await expect($("#toolHistory")).not.toBeDisplayed();
    await typeText("#chain-input", "token-abc");
    await $("#homeLogo").click();
    expect(await stored("hmac")).toBeNull();
    expect(await stored("pipeline")).toBeNull();
  } finally {
    await setHistory(false);
  }
  expect(await browser.execute(() => Object.keys(localStorage).filter(k => k.startsWith("tool-history:")))).toEqual([]);
});

it("undo is dropped after a tool switch (no stale action on removed DOM)", async () => {
  await open("pipeline");
  await $("#chain-sample").click();
  await $('[data-step-remove="0"]').click();
  await expect($("#toastContainer .toast-action")).toBeDisplayed();
  await open("cronBuilder");
  await expect($$("#toastContainer .toast-action")).toBeElementsArrayOfSize(0);
  // Focus a non-text control without activating it (WebDriver has no focus command).
  await browser.execute(el => el.focus(), await $("#cronb-sample"));
  await expect($("#cronb-sample")).toBeFocused();
  await browser.keys(["Control", "z"]);
  await open("pipeline");
  // The rendered steps and the hidden ops field agree
  const ops = (await $("#chain-ops").getValue()).split(",").filter(Boolean);
  await expect($$("#chain-steps li")).toBeElementsArrayOfSize(ops.length);
});

it("no runtime errors across the new tools", async () => {
  expect(await pageErrors()).toEqual([]);
  expect((await consoleErrors()).filter((e) => /Content Security Policy|WebAssembly|wasm/i.test(e))).toEqual([]);
});
