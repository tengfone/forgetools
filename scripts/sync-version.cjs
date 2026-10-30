// npm "version" lifecycle hook: copy package.json's version into src-tauri/Cargo.toml and
// Cargo.lock, and stage them so `npm version` puts them in the same release commit.
// package.json stays the single source of truth (tauri.conf.json reads it directly).
//   node scripts/sync-version.cjs [--dry-run] [version]
// --dry-run (or SYNC_VERSION_DRY_RUN=1) prints the planned changes and writes nothing.
// Fails loudly if the forgetools version line cannot be found exactly once.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.SYNC_VERSION_DRY_RUN === '1';
const root = path.join(__dirname, '..');
const version = args.find((a) => !a.startsWith('--')) || require(path.join(root, 'package.json')).version;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`not a semver version: ${version}`);
const toml = path.join(root, 'src-tauri', 'Cargo.toml');
const lock = path.join(root, 'src-tauri', 'Cargo.lock');

/** Splits TOML text into tables: { header, start, end } line ranges (header null for the preamble). */
function tables(lines) {
  const out = [{ header: null, start: 0, end: lines.length }];
  lines.forEach((l, i) => {
    const m = /^\s*(\[\[?[^\]]+\]\]?)\s*(#.*)?$/.exec(l);
    if (m) {
      out[out.length - 1].end = i;
      out.push({ header: m[1].replace(/\s+/g, ''), start: i + 1, end: lines.length });
    }
  });
  return out;
}
const keyRe = (key) => new RegExp(`^(\\s*${key}\\s*=\\s*")([^"]*)(".*)$`);
const findKey = (lines, t, key) => {
  for (let i = t.start; i < t.end; i++) {
    const m = keyRe(key).exec(lines[i]);
    if (m) return { i, m };
  }
  return null;
};

/** Sets `version` in the single table that matches `pick`; throws on zero or multiple matches. */
function update(file, label, pick) {
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(/\r?\n/);
  const hits = tables(lines).filter((t) => pick(lines, t));
  if (hits.length !== 1)
    throw new Error(`${label}: expected exactly one forgetools package table, found ${hits.length}`);
  const v = findKey(lines, hits[0], 'version');
  if (!v) throw new Error(`${label}: version key not found in the forgetools package table`);
  const [, pre, old, post] = v.m;
  console.log(`${label}: ${old} -> ${version}${dryRun ? ' (dry run)' : ''}`);
  if (old === version || dryRun) return;
  lines[v.i] = pre + version + post;
  fs.writeFileSync(file, lines.join(eol));
}

const isForgetools = (lines, t) => findKey(lines, t, 'name')?.m[2] === 'forgetools';
update(toml, 'Cargo.toml', (lines, t) => t.header === '[package]' && isForgetools(lines, t));
update(lock, 'Cargo.lock', (lines, t) => t.header === '[[package]]' && isForgetools(lines, t));
if (!dryRun && process.env.npm_lifecycle_event === 'version')
  execFileSync('git', ['add', toml, lock], { stdio: 'inherit' });
