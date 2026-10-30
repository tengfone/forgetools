// Fails if any tracked file mentions the old desktop runtime. Allowlisted: the v0.2.1 baseline
// fixtures (tests/fixtures, provenance for the parity tests) and the README's migration story.
const { spawnSync } = require('child_process');
const r = spawnSync(
  'git',
  [
    'grep',
    '-n',
    '-i',
    '-I',
    '-E',
    'electron|preload|ipcRenderer|contextBridge',
    '--',
    '.',
    ':!package-lock.json',
    ':!tests/fixtures',
    ':!README.md',
    ':!scripts/grep-gate.cjs',
  ],
  { encoding: 'utf8' },
);
if (r.status === 0) {
  process.stdout.write(r.stdout);
  console.error('grep gate: FAILED');
  process.exit(1);
}
if (r.status !== 1) {
  console.error(r.stderr);
  process.exit(2);
}
console.log('grep gate: clean');
