// WebdriverIO config for the Tauri E2E suite.
// The app under test is the `--features wdio` build (npm run build:e2e), which embeds
// the W3C WebDriver server (tauri-plugin-wdio-webdriver) — no tauri-driver/msedgedriver.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appBinaryPath = path.join(
  root, 'src-tauri', 'target', 'wdio', 'release',
  process.platform === 'win32' ? 'forgetools.exe' : 'forgetools',
);

export const config = {
  runner: 'local',
  specs: ['./tests/e2e/**/*.spec.mjs'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'tauri',
    'tauri:options': { application: appBinaryPath },
  }],
  services: [['@wdio/tauri-service', {
    appBinaryPath,
    driverProvider: 'embedded',
    // FORGE_E2E=1: no tray, no close-to-tray,
    // no single-instance lock, no automatic update check.
    env: { FORGE_E2E: '1' },
    captureFrontendLogs: true,
    frontendLogLevel: 'error',
  }]],
  // Playwright's waitForSelector/$$eval resolved the first match; keep that for 1:1 ports.
  strictSelectors: false,
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 2,
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 60000 },
  reporters: ['spec'],
};
