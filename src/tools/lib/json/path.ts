// JSONPath queries.

type Seg =
  | { t: 'key'; keys: string[] }
  | { t: 'index'; idx: number[] }
  | { t: 'wild' }
  | { t: 'desc' }
  | { t: 'slice'; start?: number; end?: number; step?: number }
  | { t: 'filter'; expr: string };

function parsePath(path: string): Seg[] {
  const p = path.trim();
  if (!p.startsWith('$')) throw new Error('JSONPath must start with $');
  const segs: Seg[] = [];
  let i = 1;
  while (i < p.length) {
    if (p.startsWith('..', i)) {
      segs.push({ t: 'desc' });
      i += 2;
      if (p[i] === '[') continue;
      const m = /^(\*|[A-Za-z_$][\w$-]*)/.exec(p.slice(i));
      if (!m) throw new Error(`Expected a name after .. at position ${i}`);
      segs.push(m[1] === '*' ? { t: 'wild' } : { t: 'key', keys: [m[1]!] });
      i += m[0].length;
    } else if (p[i] === '.') {
      i++;
      const m = /^(\*|[A-Za-z_$][\w$-]*)/.exec(p.slice(i));
      if (!m) throw new Error(`Expected a name after . at position ${i}`);
      segs.push(m[1] === '*' ? { t: 'wild' } : { t: 'key', keys: [m[1]!] });
      i += m[0].length;
    } else if (p[i] === '[') {
      // find matching bracket (respect quotes and nested parens)
      let j = i + 1,
        depth = 0,
        q = '';
      for (; j < p.length; j++) {
        const c = p[j]!;
        if (q) {
          if (c === '\\') j++;
          else if (c === q) q = '';
          continue;
        }
        if (c === '"' || c === "'") q = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ']' && depth === 0) break;
      }
      if (j >= p.length) throw new Error('Unclosed [ in JSONPath');
      const body = p.slice(i + 1, j).trim();
      i = j + 1;
      if (body === '*') segs.push({ t: 'wild' });
      else if (body.startsWith('?')) {
        const m = /^\?\s*\(([\s\S]*)\)$/.exec(body);
        if (!m) throw new Error('Filter must look like [?(@.price < 10)]');
        segs.push({ t: 'filter', expr: m[1]!.trim() });
      } else if (/^-?\d*\s*:\s*-?\d*(\s*:\s*-?\d*)?$/.test(body)) {
        const [a, b, c] = body.split(':').map((s) => s.trim());
        segs.push({ t: 'slice', start: a ? +a : undefined, end: b ? +b : undefined, step: c ? +c : undefined });
      } else if (/^-?\d+(\s*,\s*-?\d+)*$/.test(body)) {
        segs.push({ t: 'index', idx: body.split(',').map((s) => +s.trim()) });
      } else {
        const keys: string[] = [];
        const re = /\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*(,|$)/y;
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while (re.lastIndex < body.length && (m = re.exec(body))) keys.push((m[1] ?? m[2]!).replace(/\\(.)/g, '$1'));
        if (!keys.length) throw new Error(`Unsupported bracket expression [${body}]`);
        segs.push({ t: 'key', keys });
      }
    } else throw new Error(`Unexpected "${p[i]}" at position ${i}`);
  }
  return segs;
}

function getRel(v: unknown, path: string): { ok: boolean; value: unknown } {
  // @.a.b[0] or @['a'] or @
  const segs = parsePath('$' + path.slice(1));
  let cur: unknown[] = [v];
  for (const s of segs) cur = step(cur, s);
  return cur.length ? { ok: true, value: cur[0] } : { ok: false, value: undefined };
}

function literal(s: string): unknown {
  const t = s.trim();
  if (/^'.*'$/.test(t)) return t.slice(1, -1);
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`Bad literal in filter: ${t}`);
  }
}

function evalFilter(expr: string, item: unknown): boolean {
  const ors = splitTop(expr, '||');
  if (ors.length > 1) return ors.some((e) => evalFilter(e, item));
  const ands = splitTop(expr, '&&');
  if (ands.length > 1) return ands.every((e) => evalFilter(e, item));
  let e = expr.trim();
  let neg = false;
  if (e.startsWith('!')) {
    neg = true;
    e = e.slice(1).trim();
  }
  if (e.startsWith('(') && e.endsWith(')')) return neg !== evalFilter(e.slice(1, -1), item);
  const m = /^(@[^=!<>~]*?)\s*(==|!=|<=|>=|<|>|=~)\s*([\s\S]+)$/.exec(e);
  if (!m) {
    if (!e.startsWith('@')) throw new Error(`Filter operand must start with @: ${e}`);
    const r = getRel(item, e);
    return neg !== (r.ok && r.value !== undefined && r.value !== null && r.value !== false);
  }
  const left = getRel(item, m[1]!.trim());
  if (!left.ok) return neg;
  const op = m[2]!;
  let res: boolean;
  if (op === '=~') {
    const rm = /^\/(.*)\/([a-z]*)$/.exec(m[3]!.trim());
    if (!rm) throw new Error('=~ expects a /regex/');
    res = typeof left.value === 'string' && new RegExp(rm[1]!, rm[2]).test(left.value);
  } else {
    const rhs = m[3]!.trim().startsWith('@') ? getRel(item, m[3]!.trim()).value : literal(m[3]!);
    const l = left.value as number,
      r = rhs as number;
    res =
      op === '=='
        ? JSON.stringify(l) === JSON.stringify(r)
        : op === '!='
          ? JSON.stringify(l) !== JSON.stringify(r)
          : op === '<'
            ? l < r
            : op === '<='
              ? l <= r
              : op === '>'
                ? l > r
                : l >= r;
  }
  return neg !== res;
}

function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0,
    q = '',
    last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = '';
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && s.startsWith(sep, i)) {
      parts.push(s.slice(last, i));
      i += sep.length - 1;
      last = i + 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

const children = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

function descendants(v: unknown, out: unknown[] = []): unknown[] {
  out.push(v);
  for (const c of children(v)) descendants(c, out);
  return out;
}

function step(cur: unknown[], s: Seg): unknown[] {
  const out: unknown[] = [];
  for (const v of cur) {
    switch (s.t) {
      case 'key':
        if (v && typeof v === 'object' && !Array.isArray(v))
          for (const k of s.keys) {
            if (Object.prototype.hasOwnProperty.call(v, k)) out.push((v as Record<string, unknown>)[k]);
          }
        else if (Array.isArray(v) && s.keys.length === 1 && s.keys[0] === 'length') out.push(v.length);
        break;
      case 'index':
        if (Array.isArray(v))
          for (const i of s.idx) {
            const j = i < 0 ? v.length + i : i;
            if (j >= 0 && j < v.length) out.push(v[j]);
          }
        break;
      case 'wild':
        out.push(...children(v));
        break;
      case 'desc':
        out.push(...descendants(v));
        break;
      case 'slice': {
        if (!Array.isArray(v)) break;
        const n = v.length,
          st = s.step ?? 1;
        if (st === 0) throw new Error('Slice step cannot be 0');
        const norm = (x: number | undefined, d: number): number =>
          x === undefined ? d : x < 0 ? Math.max(0, n + x) : Math.min(n, x);
        if (st > 0) for (let i = norm(s.start, 0); i < norm(s.end, n); i += st) out.push(v[i]);
        else {
          // RFC 9535: for a negative step, clamp both bounds to [-1, n - 1] (never past the last element).
          const clampRev = (x: number | undefined, d: number): number =>
            x === undefined ? d : Math.min(Math.max(x < 0 ? n + x : x, -1), n - 1);
          for (let i = clampRev(s.start, n - 1); i > clampRev(s.end, -1); i += st) out.push(v[i]);
        }
        break;
      }
      case 'filter':
        for (const c of children(v)) if (evalFilter(s.expr, c)) out.push(c);
        break;
    }
  }
  return out;
}

export function jsonPath(data: unknown, path: string): unknown[] {
  let cur: unknown[] = [data];
  for (const s of parsePath(path)) cur = step(cur, s);
  return cur;
}
