// cURL command -> code in several languages.

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
