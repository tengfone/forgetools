// JSON -> type definitions (TypeScript, Go, Rust, C#, Python).
import { IDENT } from './shared';

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
