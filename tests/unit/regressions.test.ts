// Exact-data regressions: each case is a reproduction from the v1.0.0 code review.
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { minifyCss, minifyGraphql, dockerRunToCompose, composeToDockerRun } from '../../src/tools/lib/format';
import { curlToCode, envToJson, jsonToEnv, decodeMsgpack, encodeMsgpack } from '../../src/tools/lib/convert';
import { jsonPath, jsonToTypes } from '../../src/tools/lib/json';
import { hexToBytes } from '../../src/tools/lib/bytes';
import tools from '../../src/tools';

describe('data is preserved exactly', () => {
  it('CSS minify keeps calc() operators and strings', () => {
    expect(minifyCss('a{width:calc(100% + 1px)}')).toBe('a{width:calc(100% + 1px)}');
    expect(minifyCss('a{content: "x;}y";}')).toBe('a{content:"x;}y"}');
  });

  it('GraphQL minify keeps string literals', () => {
    expect(minifyGraphql('{search(q: "a : b") {id}}')).toBe('{search(q:"a : b"){id}}');
  });

  it('cURL: custom methods are valid Python; multipart bodies are kept or rejected', () => {
    expect(curlToCode('curl -X PROPFIND https://example.com', 'python')).toContain(
      'response = requests.request("PROPFIND", "https://example.com")',
    );
    const form = 'curl https://example.com -F name=hello';
    expect(curlToCode(form, 'axios')).toMatch(/form\.append\("name", "hello"\)[\s\S]*data: form,/);
    expect(curlToCode(form, 'go')).toContain('mw.WriteField("name", "hello")');
    expect(curlToCode(form, 'php')).toContain("'name' => 'hello',");
    expect(curlToCode(form, 'rust')).toContain('.text("name", "hello")');
    expect(() => curlToCode(form, 'node-http')).toThrow(/not supported/);
  });

  it('.env round-trips backslashes', () => {
    const data = { P: 'C:\\new\\test', Q: 'C:\\', R: 'next' };
    expect(JSON.parse(envToJson(jsonToEnv(JSON.stringify(data))))).toEqual(data);
  });

  it('MessagePack: exact negative int64, large strings', () => {
    expect(decodeMsgpack(hexToBytes('d38000000000000001'))).toBe('-9223372036854775807');
    expect(encodeMsgpack('x'.repeat(200_000))).toHaveLength(200_005);
  });

  it('docker --mount maps to Compose long syntax and back', () => {
    const out = dockerRunToCompose('docker run --mount type=bind,source=/tmp,target=/data,readonly alpine');
    const svc = (yaml.load(out) as { services: Record<string, { volumes: unknown[] }> }).services.alpine!;
    expect(svc.volumes).toEqual([{ type: 'bind', source: '/tmp', target: '/data', read_only: true }]);
    expect(composeToDockerRun(out)).toContain('--mount type=bind,source=/tmp,target=/data,readonly');
  });

  it('JSONPath reverse slices stay in bounds', () => {
    expect(jsonPath([0, 1, 2], '$[3::-1]')).toEqual([2, 1, 0]);
  });

  it('type generation escapes keywords, quotes and colliding names', () => {
    const py = jsonToTypes('{"class":1,"a-b":2,"a_b":3}', 'python');
    expect(py).toContain('    class_: int\n    a_b: int\n    a_b2: int');
    expect(jsonToTypes('{"a\\"b":1}', 'rust')).toContain('#[serde(rename = "a\\"b")]');
    expect(jsonToTypes('{"a\\"b":1}', 'csharp')).toContain('[JsonPropertyName("a\\"b")]');
    expect(jsonToTypes('{"root":1}', 'csharp')).toContain('public long Root2 { get; set; }');
  });

  it('tab indentation comes from the formatter, not a rewrite of the output', async () => {
    expect(await tools.json?.format?.('{"a":{"b":1}}', '\t')).toBe('{\n\t"a": {\n\t\t"b": 1\n\t}\n}');
  });
});

describe('tool order', () => {
  it('every tool list follows CATEGORY_ORDER, keeping declaration order within a category', async () => {
    const { CATEGORY_ORDER } = await import('../../src/tools');
    const { allTools } = await import('../../src/app/state');
    const list = allTools();
    expect(CATEGORY_ORDER[0]).toBe('Format');
    expect(list.map((t) => t.category)).toEqual(
      [...list.map((t) => t.category)].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)),
    );
    expect(new Set(list.map((t) => t.category))).toEqual(new Set(CATEGORY_ORDER));
    const declared = Object.values(tools)
      .filter((t) => t.category === 'Format')
      .map((t) => t.id);
    expect(list.filter((t) => t.category === 'Format').map((t) => t.id)).toEqual(declared);
  });
});
