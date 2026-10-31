// .env <-> JSON.

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
