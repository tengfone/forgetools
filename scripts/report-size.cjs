// Prints app binary, installer and frontend sizes. Informational only: always exits 0.
//   node scripts/report-size.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rel = path.join(root, 'src-tauri', 'target', 'release');
const mb = (n) => (n / 1e6).toFixed(2) + ' MB';
const walk = (d) =>
  fs.existsSync(d)
    ? fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
    : [];
const size = (f) => fs.statSync(f).size;

const rows = [];
for (const name of ['forgetools.exe', 'forgetools']) {
  const f = path.join(rel, name);
  if (fs.existsSync(f)) rows.push(['binary', name, size(f)]);
}
for (const f of walk(path.join(rel, 'bundle')).filter((f) => /\.(exe|msi|dmg|AppImage|deb|rpm)$/.test(f))) {
  rows.push(['installer', path.relative(rel, f), size(f)]);
}
const front = walk(path.join(root, 'out'));
if (front.length) {
  rows.push(['frontend', 'out/ (total)', front.reduce((s, f) => s + size(f), 0)]);
  const entry = front.filter((f) => /assets[\\/]index-.*\.js$/.test(f));
  for (const f of entry) rows.push(['frontend', 'startup entry ' + path.basename(f), size(f)]);
}
if (!rows.length) console.log('report-size: nothing built yet');
for (const [kind, name, n] of rows) console.log(`${kind.padEnd(10)} ${mb(n).padStart(10)}  ${name}`);
console.log(
  '(baseline v0.2.1, see tests/fixtures/BASELINE.md: Win 103.9 MB, mac arm64 119.3 MB, mac x64 123.1 MB, AppImage 100.8 MB)',
);
