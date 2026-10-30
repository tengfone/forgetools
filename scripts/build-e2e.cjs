// Builds the E2E binary: `--features wdio` + tauri.wdio.conf.json (withGlobalTauri,
// wdio capability, frontend built with VITE_WDIO=1). Uses a separate cargo target dir
// so the shipped release binary in src-tauri/target/release is never the test build.
// The test binary only needs to be correct, not small or fast: override the release profile
// (LTO, 1 codegen unit, opt-level 3) via env so incremental rebuilds after a src change are quick.
const { spawnSync } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  CARGO_TARGET_DIR: path.join(__dirname, '..', 'src-tauri', 'target', 'wdio'),
  CARGO_PROFILE_RELEASE_LTO: 'false',
  CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '256',
  CARGO_PROFILE_RELEASE_OPT_LEVEL: '1',
  CARGO_PROFILE_RELEASE_INCREMENTAL: 'true',
  CARGO_PROFILE_RELEASE_DEBUG: 'false',
  CARGO_PROFILE_RELEASE_STRIP: 'false',
};
const r = spawnSync(
  'npx',
  ['tauri', 'build', '--no-bundle', '--features', 'wdio', '--config', 'src-tauri/tauri.wdio.conf.json'],
  { stdio: 'inherit', env, shell: true, cwd: path.join(__dirname, '..') },
);
process.exit(r.status ?? 1);
