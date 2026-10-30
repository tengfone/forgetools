// Converters: TOML/.env <-> JSON, cURL -> code, chmod, data sizes, time zones, protobuf, MessagePack.
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { bytesToHex, fromUtf8, tryUtf8, isPrintable } from './bytes';

// ── TOML ───────────────────────────────────────────────────────────────────

export function tomlToJson(src: string, indent = 2): string {
  try {
    return JSON.stringify(
      parseToml(src),
      (_k, v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v),
      indent,
    );
  } catch (e) {
    throw new Error('Invalid TOML: ' + (e as Error).message.split('\n')[0]);
  }
}

export function jsonToToml(json: string): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('TOML needs a top-level JSON object');
  if (containsNull(data)) throw new Error('TOML has no null: remove null values first');
  return stringifyToml(data);
}

const containsNull = (v: unknown): boolean =>
  v === null || (typeof v === 'object' && Object.values(v).some(containsNull));

// ── .env ───────────────────────────────────────────────────────────────────

/** Index of the quote that closes `s`, or -1. Single quotes are literal; the others honour `\`. */
function closingQuote(s: string, q: string): number {
  for (let j = 0; j < s.length; j++) {
    if (q !== "'" && s[j] === '\\') j++;
    else if (s[j] === q) return j;
  }
  return -1;
}

const ENV_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\' };

/** Decode a double-quoted value in one pass, so `\\n` stays a backslash followed by `n`. */
const unescapeDouble = (s: string): string =>
  s.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (m, c: string) =>
    c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : (ENV_ESCAPES[c] ?? m),
  );

export function parseEnv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Line ${i + 1}: expected KEY=value`);
    let v = m[2]!;
    const q = v[0];
    if (q === '"' || q === "'" || q === '`') {
      // multi-line quoted values
      let body = v.slice(1);
      let end = closingQuote(body, q);
      while (end === -1 && i + 1 < lines.length) {
        body += '\n' + lines[++i];
        end = closingQuote(body, q);
      }
      if (end === -1) throw new Error(`Line ${i + 1}: unterminated ${q} quote`);
      v = body.slice(0, end);
      if (q === '"') v = unescapeDouble(v);
    } else {
      v = v.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]!] = v;
  }
  return out;
}

export const envToJson = (src: string, indent = 2): string => JSON.stringify(parseEnv(src), null, indent);

export function jsonToEnv(json: string): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('.env needs a flat JSON object');
  const lines: string[] = [];
  const walk = (o: Record<string, unknown>, prefix: string): void => {
    for (const [k, v] of Object.entries(o)) {
      const key = (prefix ? `${prefix}_${k}` : k).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
        continue;
      }
      // JSON scalars: strings verbatim; numbers/booleans/arrays stringify identically via JSON
      const s = v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      lines.push(`${key}=${/^[\w./:@+-]*$/.test(s) ? s : JSON.stringify(s)}`);
    }
  };
  walk(data as Record<string, unknown>, '');
  return lines.join('\n');
}

// ── cURL -> code ───────────────────────────────────────────────────────────

export interface CurlRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: string;
  form?: Array<[string, string]>;
  user?: string;
  insecure: boolean;
  compressed: boolean;
}

/** POSIX-ish shell word splitting with quotes, backslash and line continuations. */
export function shellSplit(cmd: string): string[] {
  const out: string[] = [];
  let cur = '',
    inWord = false,
    i = 0;
  const s = cmd.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      if (inWord) {
        out.push(cur);
        cur = '';
        inWord = false;
      }
      i++;
      continue;
    }
    inWord = true;
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j === -1) throw new Error('Unterminated single quote');
      cur += s.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === '$' && s[i + 1] === "'") {
      let j = i + 2;
      while (j < s.length && s[j] !== "'") {
        if (s[j] === '\\') j++;
        j++;
      }
      cur += s
        .slice(i + 2, j)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\(.)/g, '$1');
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\' && /["\\$`]/.test(s[j + 1] ?? '')) {
          cur += s[j + 1];
          j += 2;
          continue;
        }
        cur += s[j];
        j++;
      }
      if (j >= s.length) throw new Error('Unterminated double quote');
      i = j + 1;
      continue;
    }
    if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
      continue;
    }
    cur += c;
    i++;
  }
  if (inWord) out.push(cur);
  return out;
}

export function parseCurl(cmd: string): CurlRequest {
  const args = shellSplit(cmd.trim());
  if (args[0] !== 'curl' && !/curl(\.exe)?$/.test(args[0] ?? '')) throw new Error('Command must start with curl');
  const req: CurlRequest = { method: '', url: '', headers: [], insecure: false, compressed: false };
  const data: string[] = [];
  let get = false;
  for (let i = 1; i < args.length; i++) {
    let a = args[i]!;
    let val: string | undefined;
    const eq = /^(--[\w-]+)=(.*)$/s.exec(a);
    if (eq) {
      a = eq[1]!;
      val = eq[2];
    }
    const next = (): string => {
      if (val !== undefined) return val;
      const v = args[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '-X':
      case '--request':
        req.method = next().toUpperCase();
        break;
      case '-H':
      case '--header': {
        const h = next();
        const k = h.indexOf(':');
        if (k > 0) req.headers.push([h.slice(0, k).trim(), h.slice(k + 1).trim()]);
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        data.push(next());
        break;
      case '--data-urlencode': {
        const v = next();
        const k = v.indexOf('=');
        data.push(k > 0 ? `${v.slice(0, k)}=${encodeURIComponent(v.slice(k + 1))}` : encodeURIComponent(v));
        break;
      }
      case '--json':
        data.push(next());
        req.headers.push(['Content-Type', 'application/json'], ['Accept', 'application/json']);
        break;
      case '-F':
      case '--form': {
        const v = next();
        const k = v.indexOf('=');
        (req.form ??= []).push([v.slice(0, k), v.slice(k + 1)]);
        break;
      }
      case '-u':
      case '--user':
        req.user = next();
        break;
      case '-A':
      case '--user-agent':
        req.headers.push(['User-Agent', next()]);
        break;
      case '-e':
      case '--referer':
        req.headers.push(['Referer', next()]);
        break;
      case '-b':
      case '--cookie':
        req.headers.push(['Cookie', next()]);
        break;
      case '-k':
      case '--insecure':
        req.insecure = true;
        break;
      case '--compressed':
        req.compressed = true;
        break;
      case '-G':
      case '--get':
        get = true;
        break;
      case '-I':
      case '--head':
        req.method = 'HEAD';
        break;
      case '--url':
        req.url = next();
        break;
      case '-o':
      case '--output':
      case '-m':
      case '--max-time':
      case '--connect-timeout':
      case '-w':
      case '--write-out':
      case '--retry':
        next();
        break;
      default:
        if (a.startsWith('-')) {
          // combined short flags like -sSL or -XPOST
          if (/^-X./.test(a)) req.method = a.slice(2).toUpperCase();
          else if (/^-H./.test(a)) {
            const h = a.slice(2);
            const k = h.indexOf(':');
            if (k > 0) req.headers.push([h.slice(0, k).trim(), h.slice(k + 1).trim()]);
          } else if (/^-d./.test(a)) data.push(a.slice(2));
          else if (/^-[a-zA-Z]+$/.test(a) && a.includes('k')) req.insecure = true;
        } else if (!req.url) req.url = a;
    }
  }
  if (!req.url) throw new Error('No URL found in the curl command');
  if (!/^[a-z]+:\/\//i.test(req.url)) req.url = 'http://' + req.url;
  if (data.length) {
    if (get) req.url += (req.url.includes('?') ? '&' : '?') + data.join('&');
    else {
      req.body = data.join('&');
      if (!req.headers.some(([k]) => k.toLowerCase() === 'content-type'))
        req.headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    }
  }
  req.method ||= req.body !== undefined || req.form ? 'POST' : 'GET';
  return req;
}

export type CurlTarget = 'fetch' | 'axios' | 'python' | 'go' | 'node-http' | 'php' | 'rust';

const jsStr = (s: string): string => JSON.stringify(s);
const pyStr = (s: string): string => JSON.stringify(s);
const isJsonBody = (r: CurlRequest): boolean => {
  if (r.body === undefined) return false;
  const ct = r.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  if (!/json/i.test(ct)) return false;
  try {
    JSON.parse(r.body);
    return true;
  } catch {
    return false;
  }
};
const btoaUser = (u: string): string => btoa(u);

export function curlToCode(cmd: string, target: CurlTarget): string {
  const r = parseCurl(cmd);
  const headers = [...r.headers];
  if (r.user) headers.push(['Authorization', `Basic ${btoaUser(r.user)}`]);
  const json = isJsonBody(r);
  switch (target) {
    case 'fetch': {
      const opts: string[] = [`  method: ${jsStr(r.method)},`];
      if (headers.length)
        opts.push(`  headers: {\n${headers.map(([k, v]) => `    ${jsStr(k)}: ${jsStr(v)},`).join('\n')}\n  },`);
      if (r.form) opts.push('  body: form,');
      else if (r.body !== undefined)
        opts.push(
          json
            ? `  body: JSON.stringify(${JSON.stringify(JSON.parse(r.body), null, 2).replace(/\n/g, '\n  ')}),`
            : `  body: ${jsStr(r.body)},`,
        );
      const pre = r.form
        ? `const form = new FormData();\n${r.form.map(([k, v]) => `form.append(${jsStr(k)}, ${jsStr(v)});`).join('\n')}\n\n`
        : '';
      return `${pre}const response = await fetch(${jsStr(r.url)}, {\n${opts.join('\n')}\n});\n\nconst data = await response.${json || /json/i.test(headers.find(([k]) => /^accept$/i.test(k))?.[1] ?? '') ? 'json' : 'text'}();\nconsole.log(data);\n`;
    }
    case 'axios': {
      const cfg: string[] = [`  method: ${jsStr(r.method.toLowerCase())},`, `  url: ${jsStr(r.url)},`];
      if (headers.length)
        cfg.push(`  headers: {\n${headers.map(([k, v]) => `    ${jsStr(k)}: ${jsStr(v)},`).join('\n')}\n  },`);
      if (r.form) cfg.push('  data: form,');
      else if (r.body !== undefined)
        cfg.push(
          json
            ? `  data: ${JSON.stringify(JSON.parse(r.body), null, 2).replace(/\n/g, '\n  ')},`
            : `  data: ${jsStr(r.body)},`,
        );
      const pre = r.form
        ? `const form = new FormData();\n${r.form.map(([k, v]) => `form.append(${jsStr(k)}, ${jsStr(v)});`).join('\n')}\n\n`
        : '';
      return `import axios from 'axios';\n\n${pre}const response = await axios({\n${cfg.join('\n')}\n});\n\nconsole.log(response.data);\n`;
    }
    case 'python': {
      const lines = ['import requests', ''];
      if (headers.length)
        lines.push(`headers = {\n${headers.map(([k, v]) => `    ${pyStr(k)}: ${pyStr(v)},`).join('\n')}\n}`, '');
      const args = [pyStr(r.url)];
      if (headers.length) args.push('headers=headers');
      if (r.form) {
        lines.push(`files = {\n${r.form.map(([k, v]) => `    ${pyStr(k)}: (None, ${pyStr(v)}),`).join('\n')}\n}`, '');
        args.push('files=files');
      } else if (r.body !== undefined) {
        if (json) {
          lines.push(`json_data = ${toPython(JSON.parse(r.body))}`, '');
          args.push('json=json_data');
        } else {
          lines.push(`data = ${pyStr(r.body)}`, '');
          args.push('data=data');
        }
      }
      if (r.insecure) args.push('verify=False');
      lines.push(
        PY_METHODS.has(r.method)
          ? `response = requests.${r.method.toLowerCase()}(${args.join(', ')})`
          : `response = requests.request(${[pyStr(r.method), ...args].join(', ')})`,
      );
      lines.push('print(response.status_code)', 'print(response.text)');
      return lines.join('\n') + '\n';
    }
    case 'go': {
      const body = r.form ? '&buf' : r.body !== undefined ? `strings.NewReader(${goStr(r.body)})` : 'nil';
      const lines = ['package main', '', 'import ('];
      if (r.form) lines.push('\t"bytes"');
      lines.push('\t"fmt"', '\t"io"');
      if (r.form) lines.push('\t"mime/multipart"');
      lines.push('\t"net/http"');
      if (!r.form && r.body !== undefined) lines.push('\t"strings"');
      lines.push(')', '', 'func main() {');
      if (r.form)
        lines.push(
          '\tvar buf bytes.Buffer',
          '\tmw := multipart.NewWriter(&buf)',
          ...r.form.map(([k, v]) => `\tmw.WriteField(${goStr(k)}, ${goStr(v)})`),
          '\tmw.Close()',
          '',
        );
      lines.push(
        `\treq, err := http.NewRequest(${goStr(r.method)}, ${goStr(r.url)}, ${body})`,
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
      );
      if (r.form) lines.push('\treq.Header.Set("Content-Type", mw.FormDataContentType())');
      for (const [k, v] of headers) lines.push(`\treq.Header.Set(${goStr(k)}, ${goStr(v)})`);
      lines.push(
        '',
        '\tresp, err := http.DefaultClient.Do(req)',
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        '\tdefer resp.Body.Close()',
        '',
        '\tbody, err := io.ReadAll(resp.Body)',
        '\tif err != nil {',
        '\t\tpanic(err)',
        '\t}',
        '\tfmt.Println(resp.Status)',
        '\tfmt.Println(string(body))',
        '}',
      );
      return lines.join('\n') + '\n';
    }
    case 'node-http': {
      if (r.form) throw new Error('Multipart forms (-F) are not supported for Node http; use fetch or axios');
      const u = new URL(r.url);
      const mod = u.protocol === 'https:' ? 'https' : 'http';
      const opts = [`  method: ${jsStr(r.method)},`, `  hostname: ${jsStr(u.hostname)},`];
      if (u.port) opts.push(`  port: ${u.port},`);
      opts.push(`  path: ${jsStr(u.pathname + u.search)},`);
      if (headers.length)
        opts.push(`  headers: {\n${headers.map(([k, v]) => `    ${jsStr(k)}: ${jsStr(v)},`).join('\n')}\n  },`);
      if (r.insecure) opts.push('  rejectUnauthorized: false,');
      return `const ${mod} = require('${mod}');\n\nconst req = ${mod}.request({\n${opts.join('\n')}\n}, (res) => {\n  let data = '';\n  res.on('data', (chunk) => { data += chunk; });\n  res.on('end', () => console.log(res.statusCode, data));\n});\n\nreq.on('error', console.error);\n${r.body !== undefined ? `req.write(${jsStr(r.body)});\n` : ''}req.end();\n`;
    }
    case 'php': {
      const lines = [
        '<?php',
        '',
        '$ch = curl_init();',
        `curl_setopt($ch, CURLOPT_URL, ${phpStr(r.url)});`,
        'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
        `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpStr(r.method)});`,
      ];
      if (headers.length)
        lines.push(
          `curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${headers.map(([k, v]) => `    ${phpStr(`${k}: ${v}`)},`).join('\n')}\n]);`,
        );
      // An array for POSTFIELDS makes curl send multipart/form-data.
      if (r.form)
        lines.push(
          `curl_setopt($ch, CURLOPT_POSTFIELDS, [\n${r.form.map(([k, v]) => `    ${phpStr(k)} => ${phpStr(v)},`).join('\n')}\n]);`,
        );
      else if (r.body !== undefined) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpStr(r.body)});`);
      if (r.insecure) lines.push('curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);');
      lines.push('', '$response = curl_exec($ch);', 'curl_close($ch);', '', 'echo $response;');
      return lines.join('\n') + '\n';
    }
    case 'rust': {
      const lines = [
        `// Cargo.toml: reqwest = { version = "0.12", features = ["blocking"${r.form ? ', "multipart"' : ''}] }`,
        '',
        'fn main() -> Result<(), Box<dyn std::error::Error>> {',
      ];
      lines.push(
        `    let client = reqwest::blocking::Client::builder()${r.insecure ? '\n        .danger_accept_invalid_certs(true)' : ''}\n        .build()?;`,
      );
      const chain = [
        `    let res = client\n        .request(reqwest::Method::from_bytes(b${goStr(r.method)})?, ${goStr(r.url)})`,
      ];
      for (const [k, v] of headers) chain.push(`        .header(${goStr(k)}, ${goStr(v)})`);
      if (r.form)
        chain.push(
          `        .multipart(\n            reqwest::blocking::multipart::Form::new()${r.form.map(([k, v]) => `\n                .text(${goStr(k)}, ${goStr(v)})`).join('')},\n        )`,
        );
      else if (r.body !== undefined) chain.push(`        .body(${rustRaw(r.body)})`);
      chain.push('        .send()?;');
      lines.push(
        chain.join('\n'),
        '',
        '    println!("{}", res.status());',
        '    println!("{}", res.text()?);',
        '    Ok(())',
        '}',
      );
      return lines.join('\n') + '\n';
    }
  }
}

const PY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const goStr = (s: string): string => JSON.stringify(s);
const phpStr = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const rustRaw = (s: string): string => (s.includes('"#') ? JSON.stringify(s) : `r#"${s}"#`);

export function toPython(v: unknown, indent = 0): string {
  const pad = '    '.repeat(indent + 1),
    end = '    '.repeat(indent);
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v))
    return v.length ? `[\n${v.map((x) => pad + toPython(x, indent + 1)).join(',\n')},\n${end}]` : '[]';
  const e = Object.entries(v as object);
  return e.length
    ? `{\n${e.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${toPython(x, indent + 1)}`).join(',\n')},\n${end}}`
    : '{}';
}

// ── chmod ──────────────────────────────────────────────────────────────────

export interface ChmodInfo {
  octal: string;
  symbolic: string;
  command: string;
  description: string[];
}

const WHO = ['Owner', 'Group', 'Others'];

export function parseChmod(input: string): ChmodInfo {
  const s = input.trim();
  let bits: number;
  if (/^[0-7]{3,4}$/.test(s)) bits = parseInt(s, 8);
  else {
    const sym = s.replace(/^[-dlcbps]/, (m) => (s.length === 10 ? '' : m));
    if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(sym))
      throw new Error('Use octal (755, 0644) or symbolic (rwxr-xr-x, -rw-r--r--)');
    bits = 0;
    for (let i = 0; i < 9; i++) {
      const c = sym[i]!;
      if (c !== '-' && c !== 'S' && c !== 'T') bits |= 1 << (8 - i);
    }
    if (/[sS]/.test(sym[2]!)) bits |= 0o4000;
    if (/[sS]/.test(sym[5]!)) bits |= 0o2000;
    if (/[tT]/.test(sym[8]!)) bits |= 0o1000;
  }
  return chmodFromBits(bits);
}

export function chmodFromBits(bits: number): ChmodInfo {
  const special = (bits >> 9) & 7;
  let sym = '';
  for (let w = 0; w < 3; w++) {
    const p = (bits >> (6 - w * 3)) & 7;
    sym += p & 4 ? 'r' : '-';
    sym += p & 2 ? 'w' : '-';
    const x = !!(p & 1);
    const sp = w === 0 ? special & 4 : w === 1 ? special & 2 : special & 1;
    sym += sp ? (w === 2 ? (x ? 't' : 'T') : x ? 's' : 'S') : x ? 'x' : '-';
  }
  const octal = (special ? special.toString() : '') + (bits & 0o777).toString(8).padStart(3, '0');
  const description = WHO.map((who, w) => {
    const p = (bits >> (6 - w * 3)) & 7;
    const names = [p & 4 && 'read', p & 2 && 'write', p & 1 && 'execute'].filter(Boolean);
    return `${who}: ${names.length ? names.join(', ') : 'no access'}`;
  });
  if (special & 4) description.push('setuid: runs as the file owner');
  if (special & 2) description.push('setgid: runs as the group / new files inherit group');
  if (special & 1) description.push('sticky: only owners can delete files in this directory');
  return { octal, symbolic: sym, command: `chmod ${octal} <file>`, description };
}

// ── Data sizes ─────────────────────────────────────────────────────────────

export const SIZE_UNITS: Array<[string, number]> = [
  ['B', 1],
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
  ['PB', 1e15],
  ['KiB', 1024],
  ['MiB', 1024 ** 2],
  ['GiB', 1024 ** 3],
  ['TiB', 1024 ** 4],
  ['PiB', 1024 ** 5],
  ['bit', 1 / 8],
  ['Kbit', 1e3 / 8],
  ['Mbit', 1e6 / 8],
  ['Gbit', 1e9 / 8],
];

export function parseSize(input: string): number {
  const m = /^\s*([\d.,_]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(input);
  if (!m) throw new Error('Enter a size like 1.5 GB, 512MiB or 1024');
  const n = parseFloat(m[1]!.replace(/[,_]/g, ''));
  if (!Number.isFinite(n)) throw new Error('Not a number');
  const u = m[2]!;
  if (!u) return n;
  const unit =
    SIZE_UNITS.find(([k]) => k === u) ??
    SIZE_UNITS.find(([k]) => k.toLowerCase() === u.toLowerCase()) ??
    (/^[kmgtp]$/i.test(u) ? SIZE_UNITS.find(([k]) => k === u.toUpperCase() + 'B') : undefined);
  if (!unit) throw new Error(`Unknown unit "${u}"`);
  return n * unit[1];
}

export function formatSizeNum(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6) return n.toExponential(4);
  return parseFloat(n.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function convertSize(input: string): Array<[string, string]> {
  const bytes = parseSize(input);
  return SIZE_UNITS.map(([u, f]) => [u, formatSizeNum(bytes / f)]);
}

// ── Time zones ─────────────────────────────────────────────────────────────

export const DEFAULT_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function zoneOffset(date: Date, zone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

const fmtOffset = (m: number): string =>
  `UTC${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

/** Interpret a wall-clock "YYYY-MM-DD HH:mm[:ss]" in `zone`, or an ISO string with offset / "now". */
export function parseInZone(input: string, zone: string): Date {
  const s = input.trim();
  if (!s || /^now$/i.test(s)) return new Date();
  if (/^\d{10}$/.test(s)) return new Date(+s * 1000);
  if (/^\d{13}$/.test(s)) return new Date(+s);
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    if (!isNaN(+d)) return d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) throw new Error('Use YYYY-MM-DD HH:mm, an ISO date with offset, a Unix timestamp, or "now"');
  validateZone(zone);
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  let t = guess - zoneOffset(new Date(guess), zone) * 60000;
  t = guess - zoneOffset(new Date(t), zone) * 60000; // second pass settles DST edges
  return new Date(t);
}

export function validateZone(zone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new Error(`Unknown time zone "${zone}"`);
  }
}

export function inZones(date: Date, zones: string[]): Array<{ zone: string; time: string; offset: string }> {
  return zones.map((zone) => {
    validateZone(zone);
    const time = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    }).format(date);
    return { zone, time, offset: fmtOffset(zoneOffset(date, zone)) };
  });
}

// ── Protobuf (schema-less) ─────────────────────────────────────────────────

export interface PbField {
  field: number;
  wire: string;
  value: unknown;
}

function readVarint(b: Uint8Array, p: { i: number }): bigint {
  let r = 0n,
    shift = 0n;
  for (;;) {
    if (p.i >= b.length) throw new Error('Truncated varint');
    const x = b[p.i++]!;
    r |= BigInt(x & 0x7f) << shift;
    if (!(x & 0x80)) return r;
    shift += 7n;
    if (shift > 63n) throw new Error('Varint too long');
  }
}

/** Exact JS number when it fits, otherwise the decimal string (never a rounded number). */
const vnum = (v: bigint): number | string =>
  v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();

export function decodeProtobuf(b: Uint8Array, depth = 0): PbField[] {
  const out: PbField[] = [];
  const p = { i: 0 };
  while (p.i < b.length) {
    const key = readVarint(b, p);
    const field = Number(key >> 3n),
      wt = Number(key & 7n);
    if (field === 0) throw new Error(`Invalid field number 0 at byte ${p.i}`);
    if (wt === 0) {
      const v = readVarint(b, p);
      const signed = BigInt.asIntN(64, v);
      out.push({
        field,
        wire: 'varint',
        value: signed < 0n ? { uint: v.toString(), int: signed.toString() } : vnum(v),
      });
    } else if (wt === 1) {
      if (p.i + 8 > b.length) throw new Error('Truncated fixed64');
      const dv = new DataView(b.buffer, b.byteOffset + p.i, 8);
      out.push({
        field,
        wire: 'fixed64',
        value: { uint: dv.getBigUint64(0, true).toString(), double: dv.getFloat64(0, true) },
      });
      p.i += 8;
    } else if (wt === 5) {
      if (p.i + 4 > b.length) throw new Error('Truncated fixed32');
      const dv = new DataView(b.buffer, b.byteOffset + p.i, 4);
      out.push({
        field,
        wire: 'fixed32',
        value: { uint: dv.getUint32(0, true), float: Math.fround(dv.getFloat32(0, true)) },
      });
      p.i += 4;
    } else if (wt === 2) {
      const len = Number(readVarint(b, p));
      if (p.i + len > b.length) throw new Error(`Length ${len} at byte ${p.i} runs past the end`);
      const chunk = b.subarray(p.i, p.i + len);
      p.i += len;
      let value: unknown;
      if (depth < 16 && len > 0) {
        try {
          const sub = decodeProtobuf(chunk, depth + 1);
          value = sub.length ? sub : undefined;
        } catch {
          value = undefined;
        }
      }
      if (value === undefined) {
        const s = tryUtf8(chunk);
        value = s !== null && isPrintable(s) ? s : { bytes: bytesToHex(chunk) };
      } else {
        const s = tryUtf8(chunk);
        if (s !== null && isPrintable(s) && /^[\x20-\x7e]+$/.test(s)) value = { string: s, message: value };
      }
      out.push({ field, wire: 'len', value });
    } else throw new Error(`Unsupported wire type ${wt} at byte ${p.i}`);
  }
  return out;
}

// ── MessagePack ────────────────────────────────────────────────────────────

export function decodeMsgpack(b: Uint8Array): unknown {
  const p = { i: 0 };
  const v = readMp(b, p);
  if (p.i !== b.length) {
    const rest: unknown[] = [v];
    while (p.i < b.length) rest.push(readMp(b, p));
    return rest;
  }
  return v;
}

function readMp(b: Uint8Array, p: { i: number }): unknown {
  if (p.i >= b.length) throw new Error('Unexpected end of MessagePack data');
  const t = b[p.i++]!;
  const dv = new DataView(b.buffer, b.byteOffset);
  const need = (n: number): void => {
    if (p.i + n > b.length) throw new Error('Unexpected end of MessagePack data');
  };
  const u = (n: 1 | 2 | 4 | 8): number | string => {
    need(n);
    const at = p.i;
    p.i += n;
    return n === 1
      ? dv.getUint8(at)
      : n === 2
        ? dv.getUint16(at)
        : n === 4
          ? dv.getUint32(at)
          : vnum(dv.getBigUint64(at));
  };
  const i = (n: 1 | 2 | 4 | 8): number | string => {
    need(n);
    const at = p.i;
    p.i += n;
    return n === 1 ? dv.getInt8(at) : n === 2 ? dv.getInt16(at) : n === 4 ? dv.getInt32(at) : vnum(dv.getBigInt64(at));
  };
  const str = (n: number): string => {
    need(n);
    const s = fromUtf8(b.subarray(p.i, p.i + n));
    p.i += n;
    return s;
  };
  const bin = (n: number): { bin: string } => {
    need(n);
    const s = bytesToHex(b.subarray(p.i, p.i + n));
    p.i += n;
    return { bin: s };
  };
  const arr = (n: number): unknown[] => Array.from({ length: n }, () => readMp(b, p));
  const map = (n: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (let k = 0; k < n; k++) {
      const key = readMp(b, p);
      o[typeof key === 'string' ? key : JSON.stringify(key)] = readMp(b, p);
    }
    return o;
  };
  const ext = (n: number): { ext: number; data: string } => {
    need(1 + n);
    const type = dv.getInt8(p.i++);
    const data = bytesToHex(b.subarray(p.i, p.i + n));
    p.i += n;
    return { ext: type, data };
  };
  if (t <= 0x7f) return t;
  if (t >= 0xe0) return t - 256;
  if ((t & 0xf0) === 0x80) return map(t & 0x0f);
  if ((t & 0xf0) === 0x90) return arr(t & 0x0f);
  if ((t & 0xe0) === 0xa0) return str(t & 0x1f);
  switch (t) {
    case 0xc0:
      return null;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xc4:
      return bin(u(1) as number);
    case 0xc5:
      return bin(u(2) as number);
    case 0xc6:
      return bin(u(4) as number);
    case 0xc7:
      return ext(u(1) as number);
    case 0xc8:
      return ext(u(2) as number);
    case 0xc9:
      return ext(u(4) as number);
    case 0xca: {
      need(4);
      const v = dv.getFloat32(p.i);
      p.i += 4;
      return v;
    }
    case 0xcb: {
      need(8);
      const v = dv.getFloat64(p.i);
      p.i += 8;
      return v;
    }
    case 0xcc:
      return u(1);
    case 0xcd:
      return u(2);
    case 0xce:
      return u(4);
    case 0xcf:
      return u(8);
    case 0xd0:
      return i(1);
    case 0xd1:
      return i(2);
    case 0xd2:
      return i(4);
    case 0xd3:
      return i(8);
    case 0xd4:
      return ext(1);
    case 0xd5:
      return ext(2);
    case 0xd6:
      return ext(4);
    case 0xd7:
      return ext(8);
    case 0xd8:
      return ext(16);
    case 0xd9:
      return str(u(1) as number);
    case 0xda:
      return str(u(2) as number);
    case 0xdb:
      return str(u(4) as number);
    case 0xdc:
      return arr(u(2) as number);
    case 0xdd:
      return arr(u(4) as number);
    case 0xde:
      return map(u(2) as number);
    case 0xdf:
      return map(u(4) as number);
  }
  throw new Error(`Invalid MessagePack type byte 0x${t.toString(16)} at ${p.i - 1}`);
}

export function encodeMsgpack(v: unknown): Uint8Array {
  const out: number[] = [];
  const w16 = (n: number): void => {
    out.push(n >> 8, n & 255);
  };
  const w32 = (n: number): void => {
    out.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  };
  const enc = (x: unknown): void => {
    if (x === null || x === undefined) out.push(0xc0);
    else if (x === false) out.push(0xc2);
    else if (x === true) out.push(0xc3);
    else if (typeof x === 'number') {
      if (Number.isInteger(x) && x >= 0 && x < 128) out.push(x);
      else if (Number.isInteger(x) && x < 0 && x >= -32) out.push(x & 0xff);
      else if (Number.isInteger(x) && x >= 0 && x <= 0xffffffff) {
        if (x < 256) out.push(0xcc, x);
        else if (x < 65536) {
          out.push(0xcd);
          w16(x);
        } else {
          out.push(0xce);
          w32(x);
        }
      } else if (Number.isInteger(x) && x >= -0x80000000 && x < 0) {
        out.push(0xd2);
        w32(x >>> 0);
      } else {
        const b = new DataView(new ArrayBuffer(8));
        b.setFloat64(0, x);
        out.push(0xcb, ...new Uint8Array(b.buffer));
      }
    } else if (typeof x === 'string') {
      const b = new TextEncoder().encode(x);
      if (b.length < 32) out.push(0xa0 | b.length);
      else if (b.length < 256) out.push(0xd9, b.length);
      else if (b.length < 65536) {
        out.push(0xda);
        w16(b.length);
      } else {
        out.push(0xdb);
        w32(b.length);
      }
      for (const byte of b) out.push(byte); // a spread push overflows the call stack on large strings
    } else if (Array.isArray(x)) {
      if (x.length < 16) out.push(0x90 | x.length);
      else if (x.length < 65536) {
        out.push(0xdc);
        w16(x.length);
      } else {
        out.push(0xdd);
        w32(x.length);
      }
      x.forEach(enc);
    } else if (typeof x === 'object') {
      const e = Object.entries(x);
      if (e.length < 16) out.push(0x80 | e.length);
      else if (e.length < 65536) {
        out.push(0xde);
        w16(e.length);
      } else {
        out.push(0xdf);
        w32(e.length);
      }
      for (const [k, val] of e) {
        enc(k);
        enc(val);
      }
    } else throw new Error(`Cannot encode ${typeof x}`);
  };
  enc(v);
  return Uint8Array.from(out);
}
