import { describe, it, expect } from 'vitest';
import { jsonToYaml, yamlToJson, jsonToTypes, jsonPath, jsonDiff, formatJsonDiff } from '../../src/tools/lib/json';

describe('JSON <-> YAML', () => {
  it('round-trips', () => {
    const json = '{"name":"forge","tags":["a","b"],"nested":{"n":1,"ok":true,"none":null}}';
    const y = jsonToYaml(json);
    expect(y).toContain('name: forge');
    expect(y).toContain('- a');
    expect(JSON.parse(yamlToJson(y))).toEqual(JSON.parse(json));
  });
  it('multi-document YAML becomes an array', () => {
    expect(JSON.parse(yamlToJson('a: 1\n---\nb: 2'))).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('reports invalid input', () => {
    expect(() => jsonToYaml('{bad')).toThrow(/Invalid JSON/);
    expect(() => yamlToJson('a: [1, 2')).toThrow();
  });
});

describe('JSON -> types', () => {
  const sample = JSON.stringify({
    id: 1,
    name: 'x',
    price: 9.5,
    tags: ['a'],
    owner: { login: 'me' },
    items: [{ sku: 'a', qty: 1 }, { sku: 'b' }],
    note: null,
  });
  it('TypeScript', () => {
    const ts = jsonToTypes(sample, 'typescript');
    expect(ts).toContain('export interface Root {');
    expect(ts).toContain('id: number;');
    expect(ts).toContain('tags: string[];');
    expect(ts).toContain('owner: Owner;');
    expect(ts).toContain('items: Item[];');
    expect(ts).toContain('qty?: number;');
    expect(ts).toMatch(/export interface Owner \{\n {2}login: string;/);
  });
  it('Go', () => {
    const go = jsonToTypes(sample, 'go');
    expect(go).toContain('type Root struct {');
    expect(go).toContain('\tId int64 `json:"id"`');
    expect(go).toContain('Price float64 `json:"price"`');
    expect(go).toContain('Qty int64 `json:"qty,omitempty"`');
  });
  it('Rust', () => {
    const rs = jsonToTypes(JSON.stringify({ userName: 'a', type: 'x' }), 'rust');
    expect(rs).toContain('pub struct Root {');
    expect(rs).toContain('#[serde(rename = "userName")]');
    expect(rs).toContain('pub user_name: String,');
    expect(rs).toContain('pub r#type: String,');
  });
  it('C# and Python', () => {
    expect(jsonToTypes(sample, 'csharp')).toContain('public long Id { get; set; }');
    const py = jsonToTypes(sample, 'python');
    expect(py).toContain('@dataclass');
    expect(py).toContain('class Root:');
    expect(py).toContain('qty: Optional[int] = None');
  });
  it('rejects bad JSON', () => {
    expect(() => jsonToTypes('nope', 'typescript')).toThrow(/Invalid JSON/);
  });
});

describe('JSONPath', () => {
  const store = {
    store: {
      book: [
        { title: 'A', price: 8, author: 'X' },
        { title: 'B', price: 12, author: 'Y' },
        { title: 'C', price: 22, isbn: '1' },
      ],
      bicycle: { price: 19 },
    },
  };
  it('dot and index', () => {
    expect(jsonPath(store, '$.store.book[0].title')).toEqual(['A']);
    expect(jsonPath(store, '$.store.book[-1].title')).toEqual(['C']);
  });
  it('wildcards and recursive descent', () => {
    expect(jsonPath(store, '$.store.book[*].title')).toEqual(['A', 'B', 'C']);
    expect(jsonPath(store, '$..price')).toEqual([8, 12, 22, 19]);
  });
  it('slices and unions', () => {
    expect(jsonPath(store, '$.store.book[0:2].title')).toEqual(['A', 'B']);
    expect(jsonPath(store, "$.store.book[0]['title','price']")).toEqual(['A', 8]);
  });
  it('filters', () => {
    expect(jsonPath(store, '$.store.book[?(@.price < 10)].title')).toEqual(['A']);
    expect(jsonPath(store, '$.store.book[?(@.isbn)].title')).toEqual(['C']);
    expect(jsonPath(store, "$.store.book[?(@.author == 'Y' || @.price > 20)].title")).toEqual(['B', 'C']);
    expect(jsonPath(store, '$.store.book[?(@.title =~ /^[AB]$/)].price')).toEqual([8, 12]);
  });
  it('errors on bad paths', () => {
    expect(() => jsonPath(store, 'store')).toThrow(/must start with \$/);
    expect(() => jsonPath(store, '$.store[')).toThrow(/Unclosed/);
  });
});

describe('JSON structural diff', () => {
  it('ignores key order and reports changes', () => {
    expect(jsonDiff({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
    const d = jsonDiff({ a: 1, b: { c: [1, 2] }, gone: true }, { a: 2, b: { c: [1, 2, 3] }, added: 'x' });
    expect(d).toEqual([
      { path: '$.a', kind: 'changed', from: 1, to: 2 },
      { path: '$.b.c[2]', kind: 'added', to: 3 },
      { path: '$.gone', kind: 'removed', from: true },
      { path: '$.added', kind: 'added', to: 'x' },
    ]);
    expect(formatJsonDiff(d)).toContain('~ $.a: 1 → 2');
    expect(formatJsonDiff([])).toMatch(/No differences/);
  });
  it('quotes odd keys', () => {
    expect(jsonDiff({ 'a-b': 1 }, { 'a-b': 2 })[0]!.path).toBe('$["a-b"]');
  });
});
