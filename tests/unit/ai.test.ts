import { describe, it, expect } from 'vitest';
import { estimateTokens, fillTemplate, parseVars, templateVars } from '../../src/tools/lib/ai';
import { inferSchema, validate } from '../../src/tools/lib/json/schema';

describe('token estimate', () => {
  it('is zero for empty text and roughly words + punctuation for prose', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('Hello, world!')).toBe(4);
    const n = estimateTokens('The quick brown fox jumps over the lazy dog.');
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(12);
  });
  it('splits long words and counts CJK per character', () => {
    expect(estimateTokens('internationalization')).toBe(4);
    expect(estimateTokens('你好世界')).toBe(4);
  });
});

describe('prompt template', () => {
  it('finds, parses and fills variables', () => {
    expect(templateVars('Hi {{ name }}, {{x}} and {{name}}')).toEqual(['name', 'x']);
    expect(parseVars('a=1\nb: two\\nlines')).toEqual({ a: '1', b: 'two\nlines' });
    expect(parseVars('{"a":1,"b":"x"}')).toEqual({ a: '1', b: 'x' });
    expect(fillTemplate('{{a}}-{{b}}-{{c}}', { a: '1', b: '$&' })).toEqual({ text: '1-$&-{{c}}', missing: ['c'] });
  });
  it('rejects non-object JSON variables', () => {
    expect(() => parseVars('[1]')).toThrow();
  });
});

describe('json schema', () => {
  it('infers a schema that validates its own sample', () => {
    const sample = { id: 1, name: 'a', tags: ['x'], nested: [{ a: 1 }, { a: 2.5, b: null }] };
    const schema = inferSchema(sample);
    expect(schema.type).toBe('object');
    expect(validate(sample, schema)).toEqual([]);
    const items = (schema.properties as Record<string, { items: Record<string, unknown> }>).nested!.items;
    expect(items.required).toEqual(['a']);
    expect((items.properties as Record<string, unknown>).a).toEqual({ type: 'number' });
  });
  it('reports errors with paths', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' }, tags: { type: 'array', items: { $ref: '#/$defs/tag' } } },
      additionalProperties: false,
      $defs: { tag: { type: 'string', enum: ['a', 'b'] } },
    };
    const errs = validate({ tags: ['a', 'z'], extra: 1 }, schema);
    expect(errs.map((e) => e.path)).toEqual(['$', '$.tags[1]', '$.extra']);
    expect(validate({ id: 1.5 }, schema)[0]!.message).toMatch(/integer/);
  });
  it('anyOf / oneOf / not', () => {
    expect(validate(1, { anyOf: [{ type: 'string' }, { type: 'number' }] })).toEqual([]);
    expect(validate(1, { oneOf: [{ type: 'integer' }, { type: 'number' }] })).toHaveLength(1);
    expect(validate('x', { not: { type: 'string' } })).toHaveLength(1);
  });
});
