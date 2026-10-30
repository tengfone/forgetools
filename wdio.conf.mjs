// WebdriverIO config for the Tauri E2E suite.
// The app under test is the `--features wdio` build (npm run build:e2e), which embeds
// the W3C WebDriver server (tauri-plugin-wdio-webdriver), so no tauri-driver/msedgedriver.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectNoPageErrors } from './tests/e2e/helpers/tauriApp.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const appBinaryPath = path.join(
  root,
  'src-tauri',
  'target',
  'wdio',
  'release',
  process.platform === 'win32' ? 'forgetools.exe' : 'forgetools',
);

export const config = {
  runner: 'local',
  specs: ['./tests/e2e/**/*.spec.mjs'],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': { application: appBinaryPath },
    },
  ],
  services: [
    [
      '@wdio/tauri-service',
      {
        appBinaryPath,
        driverProvider: 'embedded',
        // FORGE_E2E=1: no tray, no close-to-tray,
        // no single-instance lock, no automatic update check.
        env: { FORGE_E2E: '1' },
        captureFrontendLogs: true,
        frontendLogLevel: 'error',
      },
    ],
  ],
  // `$` resolves the first match when a selector matches several elements.
  strictSelectors: false,
  logLevel: 'warn',
  bail: 0,
  // Also the default `wait` of expect-webdriverio matchers (set by the runner).
  waitforTimeout: 10000,
  waitforInterval: 100,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 2,
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 60000 },
  reporters: ['spec'],
  outputDir: path.join(root, 'test-results', 'logs'),
  // Every passing test must also leave no uncaught page errors (this fails the test);
  // on failure, keep a screenshot for the CI artifact (test-results/).
  afterTest: async (test, _context, { passed }) => {
    if (passed) {
      await expectNoPageErrors();
      return;
    }
    const dir = path.join(root, 'test-results', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const name = `${test.parent} ${test.title}`.replace(/[^\w.-]+/g, '_').slice(0, 150);
    await browser
      .saveScreenshot(path.join(dir, `${name}.png`))
      .catch((e) => console.warn('screenshot failed:', e.message));
  },
};
