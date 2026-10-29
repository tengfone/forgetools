// npm "version" lifecycle hook: copy package.json's version into src-tauri/Cargo.toml and
// Cargo.lock, and stage them so `npm version` puts them in the same release commit.
// package.json stays the single source of truth (tauri.conf.json reads it directly).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const toml = path.join(root, 'src-tauri', 'Cargo.toml');
const lock = path.join(root, 'src-tauri', 'Cargo.lock');

const sub = (file, re, label) => {
  const src = fs.readFileSync(file, 'utf8');
  if (!re.test(src)) throw new Error(`version field not found in ${label}`);
  fs.writeFileSync(file, src.replace(re, `$1${version}$2`));
};
sub(toml, /(\[package\][^[]*?\r?\nversion = ")[^"]+(")/, 'Cargo.toml');
sub(lock, /(\r?\nname = "forgetools"\r?\nversion = ")[^"]+(")/, 'Cargo.lock');
if (process.env.npm_lifecycle_event === 'version') execFileSync('git', ['add', toml, lock], { stdio: 'inherit' });
console.log(`Cargo version -> ${version}`);
