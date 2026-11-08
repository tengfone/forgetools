// Tool / function definitions: one input (JSON Schema, sample JSON, or an existing tool definition
// from any provider) rendered for OpenAI, Anthropic, Gemini and MCP, with each provider's limits checked.
import { inferSchema, type Schema } from './json/schema';

export type ToolTarget = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'mcp';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Schema;
}

type O = Record<string, unknown>;
const strOf = (x: unknown): string => (typeof x === 'string' ? x : '');
const isObj = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v);

const looksLikeSchema = (v: O): boolean =>
  typeof v.type === 'string' ||
  isObj(v.properties) ||
  '$schema' in v ||
  Array.isArray(v.anyOf) ||
  Array.isArray(v.oneOf);

/** Read a definition from any provider format, a bare JSON Schema, or sample data. */
export function readToolDef(v: unknown, fallbackName = 'my_tool', fallbackDesc = ''): { def: ToolDef; from: string } {
  if (Array.isArray(v) && v.length === 1) v = v[0];
  if (isObj(v)) {
    if (isObj(v.function) && typeof v.function.name === 'string') {
      const f = v.function;
      return {
        def: {
          name: f.name as string,
          description: strOf(f.description),
          parameters: (f.parameters as Schema) ?? emptyParams(),
        },
        from: 'OpenAI Chat tool',
      };
    }
    if (typeof v.name === 'string' && isObj(v.input_schema))
      return {
        def: { name: v.name, description: strOf(v.description), parameters: v.input_schema },
        from: 'Anthropic tool',
      };
    if (typeof v.name === 'string' && isObj(v.inputSchema))
      return {
        def: { name: v.name, description: strOf(v.description), parameters: v.inputSchema },
        from: 'MCP tool',
      };
    if (Array.isArray(v.functionDeclarations) && isObj(v.functionDeclarations[0])) v = v.functionDeclarations[0];
    if (isObj(v) && typeof v.name === 'string' && (isObj(v.parameters) || v.type === 'function')) {
      return {
        def: {
          name: v.name,
          description: strOf(v.description),
          parameters: (v.parameters as Schema) ?? emptyParams(),
        },
        from: v.type === 'function' ? 'OpenAI Responses tool' : 'Gemini function declaration',
      };
    }
    if (isObj(v) && looksLikeSchema(v)) {
      const { $schema: _drop, title, description, ...rest } = v;
      return {
        def: {
          name: typeof title === 'string' ? toName(title) : fallbackName,
          description: typeof description === 'string' ? description : fallbackDesc,
          parameters: rest,
        },
        from: 'JSON Schema',
      };
    }
  }
  if (!isObj(v)) throw new Error('Parameters must be an object (tool arguments are always a JSON object)');
  const { $schema: _s, ...inferred } = inferSchema(v);
  return {
    def: { name: fallbackName, description: fallbackDesc, parameters: inferred },
    from: 'sample JSON (schema inferred)',
  };
}

const emptyParams = (): Schema => ({ type: 'object', properties: {} });
const toName = (s: string): string =>
  s
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'my_tool';

/** Gemini accepts an OpenAPI 3.0 subset: drop keywords it rejects. */
function geminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!isObj(s)) return s;
  const out: O = {};
  for (const [k, v] of Object.entries(s)) {
    if (
      [
        '$schema',
        '$id',
        '$defs',
        'definitions',
        'additionalProperties',
        'const',
        'examples',
        'default',
        'title',
        '$comment',
        'patternProperties',
      ].includes(k)
    )
      continue;
    if (k === 'type' && Array.isArray(v)) {
      const types = v.filter((t) => t !== 'null');
      out.type = types[0];
      if (types.length !== v.length) out.nullable = true;
      continue;
    }
    out[k] = isObj(v) || Array.isArray(v) ? geminiSchema(v) : v;
  }
  return out;
}

/** OpenAI strict mode: every property required, no additional properties, optional = nullable. */
function strictSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(strictSchema);
  if (!isObj(s)) return s;
  const out: O = {};
  for (const [k, v] of Object.entries(s)) out[k] = isObj(v) || Array.isArray(v) ? strictSchema(v) : v;
  if (out.type === 'object' || isObj(out.properties)) {
    const props = (out.properties ?? {}) as Record<string, O>;
    const req = new Set(Array.isArray(out.required) ? (out.required as string[]) : []);
    for (const [k, p] of Object.entries(props)) {
      if (!req.has(k) && isObj(p) && p.type !== undefined) {
        const t = p.type;
        props[k] = { ...p, type: Array.isArray(t) ? [...new Set([...(t as unknown[]), 'null'])] : [t, 'null'] };
      }
    }
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

export function renderTool(def: ToolDef, target: ToolTarget, opts: { strict?: boolean } = {}): unknown {
  const params =
    opts.strict && (target === 'openai' || target === 'openai-responses')
      ? strictSchema(def.parameters)
      : def.parameters;
  switch (target) {
    case 'openai':
      return {
        type: 'function',
        function: {
          name: def.name,
          description: def.description,
          parameters: params,
          ...(opts.strict ? { strict: true } : {}),
        },
      };
    case 'openai-responses':
      return {
        type: 'function',
        name: def.name,
        description: def.description,
        parameters: params,
        ...(opts.strict ? { strict: true } : {}),
      };
    case 'anthropic':
      return { name: def.name, description: def.description, input_schema: params };
    case 'gemini':
      return {
        functionDeclarations: [{ name: def.name, description: def.description, parameters: geminiSchema(params) }],
      };
    case 'mcp':
      return { name: def.name, description: def.description, inputSchema: params };
  }
}

/** Provider rule violations (empty = OK). */
export function checkTool(def: ToolDef, target: ToolTarget, opts: { strict?: boolean } = {}): string[] {
  const w: string[] = [];
  const nameRe = target === 'gemini' ? /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/ : /^[A-Za-z0-9_-]{1,64}$/;
  if (!nameRe.test(def.name))
    w.push(
      target === 'gemini'
        ? 'Name must start with a letter or _, then letters, digits, _ . - (max 64)'
        : 'Name must be 1-64 chars of letters, digits, _ or -',
    );
  if (!def.description.trim()) w.push('Add a description: models pick tools based on it');
  const p = def.parameters;
  if (p.type !== 'object') w.push('Top-level parameters must be { "type": "object" }');
  if (target === 'gemini') {
    const flat = JSON.stringify(p);
    if (/"\$ref"/.test(flat)) w.push('Gemini does not resolve $ref; inline the referenced schemas');
    if (/"(oneOf|allOf|not)"/.test(flat)) w.push('Gemini supports anyOf but not oneOf / allOf / not');
  }
  if (opts.strict && (target === 'openai' || target === 'openai-responses')) {
    const flat = JSON.stringify(p);
    for (const k of ['minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'format', 'minItems', 'maxItems'])
      if (flat.includes(`"${k}"`)) {
        w.push(`Strict mode may reject "${k}" on some models; validate after parsing instead`);
        break;
      }
  }
  return w;
}

/** Parse a TypeScript-ish interface into a JSON Schema (common cases only). */
export function tsToSchema(src: string): Schema {
  const body = /\{([\s\S]*)\}/.exec(src)?.[1];
  if (body === undefined) throw new Error('Expected an interface or type literal: { name: string; ... }');
  return objectFromBody(body);
}

function objectFromBody(body: string): Schema {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  let i = 0;
  let pendingDoc = '';
  while (i < body.length) {
    const doc = /^\s*\/\*\*([\s\S]*?)\*\//.exec(body.slice(i));
    if (doc) {
      pendingDoc = doc[1]!.replace(/^\s*\*\s?/gm, '').trim();
      i += doc[0].length;
      continue;
    }
    const line = /^\s*\/\/[^\n]*\n?/.exec(body.slice(i));
    if (line) {
      pendingDoc = line[0].replace(/^\s*\/\/\s?/, '').trim();
      i += line[0].length;
      continue;
    }
    const m = /^\s*(?:readonly\s+)?["']?([\w$]+)["']?(\?)?\s*:\s*/.exec(body.slice(i));
    if (!m) break;
    i += m[0].length;
    // read type until ; , or newline at depth 0
    let depth = 0;
    let j = i;
    for (; j < body.length; j++) {
      const c = body[j];
      if (c === '{' || c === '[' || c === '(' || c === '<') depth++;
      else if (c === '}' || c === ']' || c === ')' || c === '>') depth--;
      else if (depth === 0 && (c === ';' || c === ',' || c === '\n')) break;
    }
    const type = body.slice(i, j).trim();
    i = j + 1;
    const schema = typeToSchema(type);
    if (pendingDoc) schema.description = pendingDoc;
    pendingDoc = '';
    properties[m[1]!] = schema;
    if (!m[2]) required.push(m[1]!);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function typeToSchema(t: string): Schema {
  t = t.trim();
  if (t.endsWith('[]')) return { type: 'array', items: typeToSchema(t.slice(0, -2)) };
  const arrM = /^(?:Array|ReadonlyArray)<([\s\S]+)>$/.exec(t);
  if (arrM) return { type: 'array', items: typeToSchema(arrM[1]!) };
  if (t.startsWith('{')) return objectFromBody(t.slice(1, -1));
  if (t.startsWith('(') && t.endsWith(')')) return typeToSchema(t.slice(1, -1));
  const parts = splitTop(t, '|');
  if (parts.length > 1) {
    const lits = parts.map((p) => /^(['"])(.*)\1$/.exec(p)?.[2]);
    if (lits.every((x) => x !== undefined)) return { type: 'string', enum: lits };
    const nonNull = parts.filter((p) => p !== 'null' && p !== 'undefined');
    if (nonNull.length === 1) {
      const s = typeToSchema(nonNull[0]!);
      return typeof s.type === 'string' ? { ...s, type: [s.type, 'null'] } : s;
    }
    return { anyOf: parts.map(typeToSchema) };
  }
  const lit = /^(['"])(.*)\1$/.exec(t);
  if (lit) return { type: 'string', const: lit[2] };
  switch (t) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'bigint':
      return { type: 'integer' };
    case 'boolean':
    case 'true':
    case 'false':
      return { type: 'boolean' };
    case 'null':
      return { type: 'null' };
    case 'Date':
      return { type: 'string', format: 'date-time' };
    default:
      if (/^Record<\s*string\s*,/.test(t))
        return { type: 'object', additionalProperties: typeToSchema(t.replace(/^Record<\s*string\s*,|>$/g, '')) };
      return {};
  }
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if ('{[(<'.includes(c)) depth++;
    else if ('}])>'.includes(c)) depth--;
    if (c === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}
