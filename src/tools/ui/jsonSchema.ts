import { textTool } from './textTool';
import { parseJsonLabeled } from '../lib/json';
import { inferSchema, validate } from '../lib/json/schema';
import { repairJson } from '../lib/json/repair';

const base = textTool({
  prefix: 'jschema',
  inputLabel: 'JSON',
  outputLabel: 'Result',
  options: [
    {
      id: 'mode',
      label: 'Mode',
      choices: [
        ['infer', 'Generate schema from JSON'],
        ['validate', 'Validate JSON against schema'],
        ['repair', 'Repair LLM output (then validate)'],
      ],
    },
  ],
  fields: [
    {
      id: 'schema',
      label: 'Schema (optional in Repair mode)',
      rows: 8,
      placeholder: '{ "type": "object", "required": ["id"] }',
    },
  ],
  sample: {
    input: '{"id":42,"name":"Ada","email":"ada@example.com","tags":["admin","dev"],"active":true}',
    options: { mode: 'validate' },
    fields: {
      schema: JSON.stringify(
        {
          type: 'object',
          required: ['id', 'name', 'email'],
          properties: {
            id: { type: 'integer', minimum: 1 },
            name: { type: 'string', minLength: 1 },
            email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
            tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
            active: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        null,
        2,
      ),
    },
  },
  run: (src, v) => {
    if (v.mode === 'repair') {
      const r = repairJson(src);
      const notes = r.fixes.length ? r.fixes.map((f) => `// fixed: ${f}`).join('\n') : '// already valid JSON';
      let check = '';
      if (v.schema?.trim()) {
        const errors = validate(r.value, parseJsonLabeled(v.schema, 'Schema'));
        check = errors.length
          ? '\n' + errors.map((e) => `// schema: ${e.path}: ${e.message}`).join('\n')
          : '\n// schema: valid';
      }
      return `${r.json}\n\n${notes}${check}`;
    }
    const data = parseJsonLabeled(src, 'JSON');
    if (v.mode !== 'validate') return JSON.stringify(inferSchema(data), null, 2);
    if (!v.schema?.trim()) throw new Error('Paste a schema to validate against');
    const errors = validate(data, parseJsonLabeled(v.schema, 'Schema'));
    if (!errors.length) return 'Valid: the JSON matches the schema.';
    return errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  },
  okMessage: (out, _in, v) =>
    v.mode === 'repair'
      ? /^\/\/ schema: \$/m.test(out)
        ? 'Repaired, but schema errors remain'
        : `Repaired (${(out.match(/^\/\/ fixed:/gm) ?? []).length} fix(es))`
      : v.mode !== 'validate'
        ? 'Schema generated'
        : out.startsWith('Valid')
          ? 'Valid'
          : `${out.split('\n').length} error(s)`,
});

/** Same UI as textTool, but the schema field only shows in Validate mode. */
export function render(container: HTMLElement): void {
  base(container);
  const mode = container.querySelector<HTMLSelectElement>('#jschema-mode');
  const field = container.querySelector('#jschema-schema')?.parentElement;
  if (!mode || !field) return;
  const sync = (): void => {
    field.hidden = mode.value === 'infer';
  };
  mode.addEventListener('change', sync);
  container.querySelector('#jschema-sample')?.addEventListener('click', sync);
  sync();
}
