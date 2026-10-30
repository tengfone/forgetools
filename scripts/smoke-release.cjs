// Release smoke test for the shipped (non-wdio) binary.
// Usage: node scripts/smoke-release.cjs [path-to-exe]
// Checks: process starts and stays alive; the embedded WebDriver server is NOT present
// (TAURI_WEBDRIVER_PORT, the port env var read by tauri-plugin-wdio-webdriver, is ignored); no wdio plugin code in the binary or frontend dist.
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const root = path.join(__dirname, '..');
const exe =
  process.argv[2] ||
  path.join(root, 'src-tauri', 'target', 'release', process.platform === 'win32' ? 'forgetools.exe' : 'forgetools');
const PORT = 4499;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
  });

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failed++;
};

(async () => {
  check(fs.existsSync(exe), `binary exists: ${exe}`);
  if (failed) process.exit(1);
  const bin = fs.readFileSync(exe);
  console.log(`size  ${bin.length} B (${(bin.length / 1048576).toFixed(2)} MiB)`);
  check(!bin.includes('tauri-plugin-wdio') && !bin.includes('plugin:wdio'), 'no wdio plugin in binary');

  const dist = path.join(root, 'out');
  const leaks = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.js$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('wdioTauri')) leaks.push(p);
    }
  };
  if (fs.existsSync(dist)) walk(dist);
  check(leaks.length === 0, `no @wdio/tauri-plugin in out/ ${leaks.join(', ')}`);

  const child = spawn(exe, [], { env: { ...process.env, TAURI_WEBDRIVER_PORT: String(PORT) }, stdio: 'ignore' });
  // Track the exit itself: a signal-killed process (SIGSEGV, SIGABRT) also has code null.
  let exit = null;
  child.on('exit', (code, signal) => {
    exit = { code, signal };
  });
  try {
    await sleep(5000);
    check(
      exit === null,
      `app still running after 5 s${exit ? ` (exited: ${exit.signal ?? `code ${exit.code}`})` : ''}`,
    );
    check(!(await portOpen(PORT)), `no WebDriver server on :${PORT}`);
  } finally {
    child.kill();
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
