// Builds the E2E binary: `--features wdio` + tauri.wdio.conf.json (withGlobalTauri,
// wdio capability, frontend built with VITE_WDIO=1). Uses a separate cargo target dir
// so the shipped release binary in src-tauri/target/release is never the test build.
const { spawnSync } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  CARGO_TARGET_DIR: path.join(__dirname, '..', 'src-tauri', 'target', 'wdio'),
};
const r = spawnSync(
  'npx',
  ['tauri', 'build', '--no-bundle', '--features', 'wdio', '--config', 'src-tauri/tauri.wdio.conf.json'],
  { stdio: 'inherit', env, shell: true, cwd: path.join(__dirname, '..') },
);
process.exit(r.status ?? 1);
