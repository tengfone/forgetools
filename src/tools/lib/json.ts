// JSON-centric tools: JSON <-> YAML, JSON -> types, JSONPath queries, structural diff.
import yaml from 'js-yaml';

// ── JSON <-> YAML ──────────────────────────────────────────────────────────

export function jsonToYaml(json: string, indent = 2): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  return yaml.dump(data, { indent, lineWidth: -1, noRefs: true });
}

export function yamlToJson(src: string, indent = 2): string {
  const docs = yaml.loadAll(src);
  const data = docs.length === 1 ? docs[0] : docs;
  return JSON.stringify(data ?? null, null, indent);
}

// ── JSON -> types ──────────────────────────────────────────────────────────

type Shape =
  | { k: 'null' }
  | { k: 'bool' }
  | { k: 'int' }
  | { k: 'float' }
  | { k: 'string' }
  | { k: 'any' }
  | { k: 'array'; of: Shape | null }
  | { k: 'object'; fields: Map<string, { shape: Shape; optional: boolean }> };

function infer(v: unknown): Shape {
  if (v === null) return { k: 'null' };
  if (typeof v === 'boolean') return { k: 'bool' };
  if (typeof v === 'number') return Number.isInteger(v) ? { k: 'int' } : { k: 'float' };
  if (typeof v === 'string') return { k: 'string' };
  if (Array.isArray(v))
    return { k: 'array', of: v.reduce<Shape | null>((acc, x) => (acc ? merge(acc, infer(x)) : infer(x)), null) };
  const fields = new Map<string, { shape: Shape; optional: boolean }>();
  for (const [key, val] of Object.entries(v as Record<string, unknown>))
    fields.set(key, { shape: infer(val), optional: false });
  return { k: 'object', fields };
}

/** Nullable wrapper is modelled as a union with null via a flag on merge. */
const NULLABLE = new WeakSet<Shape>();

function merge(a: Shape, b: Shape): Shape {
  if (a.k === 'null' && b.k === 'null') return a;
  if (a.k === 'null') return nullable(b);
  if (b.k === 'null') return nullable(a);
  const isNull = NULLABLE.has(a) || NULLABLE.has(b);
  let out: Shape;
  if (a.k === b.k && a.k !== 'array' && a.k !== 'object') out = { ...a };
  else if ((a.k === 'int' && b.k === 'float') || (a.k === 'float' && b.k === 'int')) out = { k: 'float' };
  else if (a.k === 'array' && b.k === 'array')
    out = { k: 'array', of: a.of && b.of ? merge(a.of, b.of) : (a.of ?? b.of) };
  else if (a.k === 'object' && b.k === 'object') {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [key, fa] of a.fields) {
      const fb = b.fields.get(key);
      fields.set(
        key,
        fb ? { shape: merge(fa.shape, fb.shape), optional: fa.optional || fb.optional } : { ...fa, optional: true },
      );
    }
    for (const [key, fb] of b.fields) if (!a.fields.has(key)) fields.set(key, { ...fb, optional: true });
    out = { k: 'object', fields };
  } else out = { k: 'any' };
  return isNull ? nullable(out) : out;
}

function nullable(s: Shape): Shape {
  const c = s.k === 'object' ? { k: 'object' as const, fields: s.fields } : ({ ...s } as Shape);
  NULLABLE.add(c);
  return c;
}

const words = (s: string): string[] =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
export const pascal = (s: string): string => {
  const w = words(s).map((x) => x[0]!.toUpperCase() + x.slice(1));
  const r = w.join('') || 'Field';
  return /^\d/.test(r) ? '_' + r : r;
};
const snake = (s: string): string => {
  const r =
    words(s)
      .map((x) => x.toLowerCase())
      .join('_') || 'field';
  return /^\d/.test(r) ? '_' + r : r;
};
const singular = (s: string): string =>
  /ies$/i.test(s)
    ? s.slice(0, -3) + 'y'
    : /(ss|us)$/i.test(s)
      ? s
      : /s$/i.test(s) && s.length > 1
        ? s.slice(0, -1)
        : s + 'Item';

export type TypeLang = 'typescript' | 'go' | 'rust' | 'csharp' | 'python';

interface Named {
  name: string;
  shape: Extract<Shape, { k: 'object' }>;
}

/** Assign unique type names to every object shape, children before parents. */
function collect(root: Shape, rootName: string): { order: Named[]; names: Map<Shape, string> } {
  const names = new Map<Shape, string>();
  const used = new Set<string>();
  const order: Named[] = [];
  const visit = (s: Shape | null, hint: string): void => {
    if (!s) return;
    if (s.k === 'array') {
      visit(s.of, singular(hint));
      return;
    }
    if (s.k !== 'object') return;
    let name = pascal(hint);
    for (let i = 2; used.has(name); i++) name = pascal(hint) + i;
    used.add(name);
    names.set(s, name);
    for (const [key, f] of s.fields) visit(f.shape, key);
    order.push({ name, shape: s });
  };
  visit(root, rootName);
  return { order, names };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

const PY_KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(
    ' ',
  ),
);
const RUST_KEYWORDS = new Set(
  'as async await break const continue crate dyn else enum extern false fn for gen if impl in let loop match mod move mut pub ref return self static struct super trait true try type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield'.split(
    ' ',
  ),
);
/** Rust keywords that cannot be raw identifiers (`r#self` is invalid). */
const RUST_NO_RAW = new Set(['crate', 'self', 'super']);

/**
 * One identifier per JSON key within a struct: convert, de-duplicate (`a-b` and `a_b` both convert
 * to `a_b`, so the second becomes `a_b2`), then escape keywords. `taken` holds names already in use.
 */
function fieldIdents(
  keys: Iterable<string>,
  conv: (k: string) => string,
  escape: (id: string) => string = (id) => id,
  taken: string[] = [],
): (key: string) => string {
  const used = new Set(taken);
  const out = new Map<string, string>();
  for (const k of keys) {
    const base = conv(k);
    let id = base;
    for (let i = 2; used.has(id); i++) id = base + i;
    used.add(id);
    out.set(k, escape(id));
  }
  return (k) => out.get(k) ?? k;
}

/** Rust string literal (JSON's \u0001 form is not valid Rust). */
const rustStr = (s: string): string => {
  const body = [...s].map((c) => {
    const n = c.charCodeAt(0);
    return c === '\\' || c === '"' ? '\\' + c : n < 0x20 || n === 0x7f ? `\\u{${n.toString(16)}}` : c;
  });
  return `"${body.join('')}"`;
};

/** Go struct tag; a key containing a backtick needs an interpreted string literal instead of a raw one. */
const goTag = (key: string, omit: boolean): string => {
  const name = key === '-' && !omit ? '-,' : key; // a bare "-" means "skip this field" to encoding/json
  const tag = `json:${JSON.stringify(name + (omit ? ',omitempty' : ''))}`;
  return tag.includes('`') ? JSON.stringify(tag) : `\`${tag}\``;
};

export function jsonToTypes(json: string, lang: TypeLang, rootName = 'Root'): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  const root = infer(data);
  const { order, names } = collect(root, rootName);

  const ref = (s: Shape | null, l: TypeLang): string => {
    if (!s) return { typescript: 'unknown', go: 'any', rust: 'serde_json::Value', csharp: 'object', python: 'Any' }[l];
    const n = NULLABLE.has(s);
    const base = ((): string => {
      switch (s.k) {
        case 'null':
        case 'any':
          return {
            typescript: n || s.k === 'null' ? 'unknown' : 'unknown',
            go: 'any',
            rust: 'serde_json::Value',
            csharp: 'object',
            python: 'Any',
          }[l];
        case 'bool':
          return { typescript: 'boolean', go: 'bool', rust: 'bool', csharp: 'bool', python: 'bool' }[l];
        case 'int':
          return { typescript: 'number', go: 'int64', rust: 'i64', csharp: 'long', python: 'int' }[l];
        case 'float':
          return { typescript: 'number', go: 'float64', rust: 'f64', csharp: 'double', python: 'float' }[l];
        case 'string':
          return { typescript: 'string', go: 'string', rust: 'String', csharp: 'string', python: 'str' }[l];
        case 'object':
          return names.get(s)!;
        case 'array': {
          const inner = ref(s.of, l);
          return {
            typescript: /[ |]/.test(inner) ? `(${inner})[]` : `${inner}[]`,
            go: `[]${inner}`,
            rust: `Vec<${inner}>`,
            csharp: `List<${inner}>`,
            python: `list[${inner}]`,
          }[l];
        }
      }
    })();
    if (!n || s.k === 'null' || s.k === 'any') return base;
    return {
      typescript: `${base} | null`,
      go: s.k === 'object' ? `*${base}` : `*${base}`,
      rust: `Option<${base}>`,
      csharp: `${base}?`,
      python: `Optional[${base}]`,
    }[l];
  };

  if (!order.length) return `// Root value is not an object: ${ref(root, lang)}`;

  const out: string[] = [];
  if (lang === 'typescript') {
    for (const { name, shape } of order) {
      out.push(`export interface ${name} {`);
      for (const [key, f] of shape.fields)
        out.push(`  ${IDENT.test(key) ? key : JSON.stringify(key)}${f.optional ? '?' : ''}: ${ref(f.shape, lang)};`);
      out.push('}', '');
    }
  } else if (lang === 'go') {
    for (const { name, shape } of order) {
      out.push(`type ${name} struct {`);
      const id = fieldIdents(shape.fields.keys(), pascal);
      for (const [key, f] of shape.fields) {
        let t = ref(f.shape, lang);
        if (f.optional && f.shape.k === 'object' && !t.startsWith('*')) t = '*' + t;
        out.push(`\t${id(key)} ${t} ${goTag(key, f.optional)}`);
      }
      out.push('}', '');
    }
  } else if (lang === 'rust') {
    out.push('use serde::{Deserialize, Serialize};', '');
    for (const { name, shape } of order) {
      out.push('#[derive(Debug, Clone, Serialize, Deserialize)]', `pub struct ${name} {`);
      const id = fieldIdents(shape.fields.keys(), snake, (id) =>
        RUST_NO_RAW.has(id) ? id + '_' : RUST_KEYWORDS.has(id) ? 'r#' + id : id,
      );
      for (const [key, f] of shape.fields) {
        const field = id(key);
        // serde strips the r# prefix itself, so only a changed name needs a rename.
        if (field.replace(/^r#/, '') !== key) out.push(`    #[serde(rename = ${rustStr(key)})]`);
        let t = ref(f.shape, lang);
        if (f.optional && !t.startsWith('Option<')) {
          t = `Option<${t}>`;
          out.push('    #[serde(default, skip_serializing_if = "Option::is_none")]');
        }
        out.push(`    pub ${field}: ${t},`);
      }
      out.push('}', '');
    }
  } else if (lang === 'csharp') {
    out.push('using System.Collections.Generic;', 'using System.Text.Json.Serialization;', '');
    for (const { name, shape } of order) {
      out.push(`public class ${name}`, '{');
      // A member may not share its class's name (CS0542), so the class name counts as taken.
      const id = fieldIdents(shape.fields.keys(), pascal, undefined, [name]);
      for (const [key, f] of shape.fields) {
        let t = ref(f.shape, lang);
        if (f.optional && !t.endsWith('?')) t += '?';
        out.push(`    [JsonPropertyName(${JSON.stringify(key)})]`, `    public ${t} ${id(key)} { get; set; }`, '');
      }
      if (out[out.length - 1] === '') out.pop();
      out.push('}', '');
    }
  } else {
    out.push(
      'from __future__ import annotations',
      '',
      'from dataclasses import dataclass',
      'from typing import Any, Optional',
      '',
    );
    for (const { name, shape } of order) {
      out.push('@dataclass', `class ${name}:`);
      const id = fieldIdents(shape.fields.keys(), snake, (id) => (PY_KEYWORDS.has(id) ? id + '_' : id));
      const req = [...shape.fields].filter(([, f]) => !f.optional);
      const opt = [...shape.fields].filter(([, f]) => f.optional);
      for (const [key, f] of req) out.push(`    ${id(key)}: ${ref(f.shape, lang)}`);
      for (const [key, f] of opt) {
        const t = ref(f.shape, lang);
        out.push(`    ${id(key)}: ${t.startsWith('Optional[') ? t : `Optional[${t}]`} = None`);
      }
      if (!shape.fields.size) out.push('    pass');
      out.push('', '');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}

// ── JSONPath ───────────────────────────────────────────────────────────────

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

// ── Structural diff ────────────────────────────────────────────────────────

export interface DiffEntry {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  from?: unknown;
  to?: unknown;
}

const keyPath = (base: string, k: string | number): string =>
  typeof k === 'number' ? `${base}[${k}]` : IDENT.test(k) ? `${base}.${k}` : `${base}[${JSON.stringify(k)}]`;

export function jsonDiff(a: unknown, b: unknown, path = '$', out: DiffEntry[] = []): DiffEntry[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length) out.push({ path: keyPath(path, i), kind: 'added', to: b[i] });
      else if (i >= b.length) out.push({ path: keyPath(path, i), kind: 'removed', from: a[i] });
      else jsonDiff(a[i], b[i], keyPath(path, i), out);
    }
  } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>,
      bo = b as Record<string, unknown>;
    for (const k of Object.keys(ao)) {
      if (!(k in bo)) out.push({ path: keyPath(path, k), kind: 'removed', from: ao[k] });
      else jsonDiff(ao[k], bo[k], keyPath(path, k), out);
    }
    for (const k of Object.keys(bo)) if (!(k in ao)) out.push({ path: keyPath(path, k), kind: 'added', to: bo[k] });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, kind: 'changed', from: a, to: b });
  }
  return out;
}

export function formatJsonDiff(entries: DiffEntry[]): string {
  if (!entries.length) return 'No differences: the documents are structurally equal.';
  const j = (v: unknown): string => JSON.stringify(v);
  return entries
    .map((e) =>
      e.kind === 'added'
        ? `+ ${e.path}: ${j(e.to)}`
        : e.kind === 'removed'
          ? `- ${e.path}: ${j(e.from)}`
          : `~ ${e.path}: ${j(e.from)} → ${j(e.to)}`,
    )
    .join('\n');
}

export function parseJsonLabeled(s: string, label: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${(e as Error).message})`);
  }
}
