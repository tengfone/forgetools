// Minimal JSON Schema support (no dependencies): infer a schema from sample JSON and
// validate a document against the commonly used draft-07 / 2020-12 keywords.

export type Schema = { [k: string]: unknown };

const typeOf = (v: unknown): string =>
  v === null
    ? 'null'
    : Array.isArray(v)
      ? 'array'
      : typeof v === 'number' && Number.isInteger(v)
        ? 'integer'
        : typeof v;

/** Merge two inferred schemas (used for array items with mixed shapes). */
function merge(a: Schema, b: Schema): Schema {
  if (a.type === b.type && a.type === 'object') {
    const pa = (a.properties ?? {}) as Record<string, Schema>;
    const pb = (b.properties ?? {}) as Record<string, Schema>;
    const props: Record<string, Schema> = { ...pa };
    for (const [k, v] of Object.entries(pb)) props[k] = pa[k] ? merge(pa[k], v) : v;
    const ra = new Set((a.required ?? []) as string[]);
    const required = ((b.required ?? []) as string[]).filter((k) => ra.has(k));
    return { type: 'object', properties: props, ...(required.length ? { required } : {}) };
  }
  if (a.type === b.type && a.type === 'array')
    return { type: 'array', items: merge(a.items as Schema, b.items as Schema) };
  if (a.type === b.type) return a;
  const ints = new Set([a.type, b.type]);
  if (ints.has('integer') && ints.has('number')) return { type: 'number' };
  const types = [...new Set([a.type, b.type].flat())] as string[];
  return { type: types };
}

export function inferSchema(value: unknown, root = true): Schema {
  const t = typeOf(value);
  let s: Schema;
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const properties = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, inferSchema(v, false)]));
    const keys = Object.keys(obj);
    s = { type: 'object', properties, ...(keys.length ? { required: keys } : {}) };
  } else if (t === 'array') {
    const arr = value as unknown[];
    s = { type: 'array' };
    if (arr.length) s.items = arr.map((v) => inferSchema(v, false)).reduce(merge);
  } else s = { type: t };
  return root ? { $schema: 'https://json-schema.org/draft/2020-12/schema', ...s } : s;
}

export interface SchemaError {
  path: string;
  message: string;
}

const matchesType = (v: unknown, t: string): boolean => {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
};

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function validate(value: unknown, schema: unknown, path = '$', root: unknown = schema): SchemaError[] {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [{ path, message: 'not allowed (schema is false)' }];
  if (!schema || typeof schema !== 'object') return [];
  const s = schema as Schema;
  const errs: SchemaError[] = [];
  const err = (message: string): number => errs.push({ path, message });

  if (typeof s.$ref === 'string') {
    const ref = s.$ref;
    if (!ref.startsWith('#')) return [{ path, message: `external $ref not supported: ${ref}` }];
    let target: unknown = root;
    for (const part of ref.slice(1).split('/').filter(Boolean)) {
      target = (target as Record<string, unknown> | undefined)?.[
        decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~')
      ];
    }
    if (target === undefined) return [{ path, message: `unresolved $ref ${ref}` }];
    errs.push(...validate(value, target, path, root));
  }

  if (s.type !== undefined) {
    const types = (Array.isArray(s.type) ? s.type : [s.type]) as string[];
    if (!types.some((t) => matchesType(value, t))) {
      err(`expected ${types.join(' | ')}, got ${typeOf(value)}`);
      return errs;
    }
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, value)))
    err(`must be one of ${JSON.stringify(s.enum)}`);
  if ('const' in s && !deepEqual(s.const, value)) err(`must equal ${JSON.stringify(s.const)}`);

  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) err(`must be >= ${s.minimum}`);
    if (typeof s.maximum === 'number' && value > s.maximum) err(`must be <= ${s.maximum}`);
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) err(`must be > ${s.exclusiveMinimum}`);
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) err(`must be < ${s.exclusiveMaximum}`);
    if (typeof s.multipleOf === 'number' && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9)
      err(`must be a multiple of ${s.multipleOf}`);
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (typeof s.minLength === 'number' && len < s.minLength) err(`length must be >= ${s.minLength}`);
    if (typeof s.maxLength === 'number' && len > s.maxLength) err(`length must be <= ${s.maxLength}`);
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(value)) err(`must match /${s.pattern}/`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) err(`must have >= ${s.minItems} items`);
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) err(`must have <= ${s.maxItems} items`);
    if (s.uniqueItems === true && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
      err('items must be unique');
    const prefix: unknown[] = Array.isArray(s.prefixItems) ? s.prefixItems : [];
    value.forEach((v: unknown, i) => {
      const sub: unknown = i < prefix.length ? prefix[i] : s.items;
      errs.push(...validate(v, sub, `${path}[${i}]`, root));
    });
  }
  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const k of (s.required ?? []) as string[]) if (!(k in obj)) err(`missing required property "${k}"`);
    const keys = Object.keys(obj);
    if (typeof s.minProperties === 'number' && keys.length < s.minProperties)
      err(`must have >= ${s.minProperties} properties`);
    if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties)
      err(`must have <= ${s.maxProperties} properties`);
    for (const k of keys) {
      const sub = `${path}.${k}`;
      if (k in props) errs.push(...validate(obj[k], props[k], sub, root));
      else if (s.additionalProperties === false) errs.push({ path: sub, message: 'additional property not allowed' });
      else if (s.additionalProperties && typeof s.additionalProperties === 'object')
        errs.push(...validate(obj[k], s.additionalProperties, sub, root));
    }
  }
  if (Array.isArray(s.allOf)) for (const sub of s.allOf) errs.push(...validate(value, sub, path, root));
  if (Array.isArray(s.anyOf) && !s.anyOf.some((sub) => !validate(value, sub, path, root).length))
    err('must match at least one schema in anyOf');
  if (Array.isArray(s.oneOf)) {
    const n = s.oneOf.filter((sub) => !validate(value, sub, path, root).length).length;
    if (n !== 1) err(`must match exactly one schema in oneOf (matched ${n})`);
  }
  if (s.not !== undefined && !validate(value, s.not, path, root).length) err('must not match "not" schema');
  return errs;
}
