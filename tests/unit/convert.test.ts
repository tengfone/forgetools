import { describe, it, expect } from 'vitest';
import {
  tomlToJson,
  jsonToToml,
  parseEnv,
  envToJson,
  jsonToEnv,
  shellSplit,
  parseCurl,
  curlToCode,
  parseChmod,
  chmodFromBits,
  parseSize,
  convertSize,
  parseInZone,
  inZones,
  validateZone,
  decodeProtobuf,
  decodeMsgpack,
  encodeMsgpack,
} from '../../src/tools/lib/convert';
import { hexToBytes } from '../../src/tools/lib/bytes';

describe('TOML <-> JSON', () => {
  it('round-trips', () => {
    const t = 'title = "x"\n[owner]\nname = "me"\nports = [80, 443]\n';
    const j: unknown = JSON.parse(tomlToJson(t));
    expect(j).toEqual({ title: 'x', owner: { name: 'me', ports: [80, 443] } });
    expect(JSON.parse(tomlToJson(jsonToToml(JSON.stringify(j))))).toEqual(j);
  });
  it('errors', () => {
    expect(() => tomlToJson('a = ')).toThrow();
  });
});

describe('.env <-> JSON', () => {
  it('parses quotes, comments, export', () => {
    expect(parseEnv('# c\nA=1\nexport B="two words"\nC=\'x#y\'\nD=v # trailing\n')).toEqual({
      A: '1',
      B: 'two words',
      C: 'x#y',
      D: 'v',
    });
    expect(JSON.parse(envToJson('A=1'))).toEqual({ A: '1' });
  });
  it('json to env round-trips', () => {
    const env = jsonToEnv('{"A":"1","B":"has space"}');
    expect(parseEnv(env)).toEqual({ A: '1', B: 'has space' });
  });
});

describe('cURL', () => {
  const cmd = `curl -X POST 'https://api.example.com/v1/items?x=1' -H 'Content-Type: application/json' -H "Authorization: Bearer t" -d '{"a":1}'`;
  it('splits shell words', () => {
    expect(shellSplit(`a 'b c' "d \\"e\\"" f\\ g`)).toEqual(['a', 'b c', 'd "e"', 'f g']);
  });
  it('parses', () => {
    const r = parseCurl(cmd);
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.example.com/v1/items?x=1');
    expect(r.headers).toContainEqual(['Content-Type', 'application/json']);
    expect(r.body).toBe('{"a":1}');
    expect(parseCurl('curl https://x.dev -d a=1').method).toBe('POST');
  });
  it.each(['fetch', 'axios', 'python', 'go', 'node-http', 'php', 'rust'] as const)('generates %s', (t) => {
    const code = curlToCode(cmd, t);
    expect(code).toContain('api.example.com');
    expect(code).toMatch(/Bearer t/);
  });
  it('rejects non-curl', () => {
    expect(() => parseCurl('wget x')).toThrow();
  });
});

describe('chmod', () => {
  it('octal and symbolic', () => {
    expect(parseChmod('755').symbolic).toBe('rwxr-xr-x');
    expect(parseChmod('-rw-r--r--').octal).toBe('644');
    expect(parseChmod('4755').symbolic).toBe('rwsr-xr-x');
    expect(parseChmod('rwxrwxrwt').octal).toBe('1777');
    expect(chmodFromBits(0o600).description[1]).toBe('Group: no access');
    expect(() => parseChmod('999')).toThrow();
  });
});

describe('data sizes', () => {
  it('parses and converts', () => {
    expect(parseSize('1 KiB')).toBe(1024);
    expect(parseSize('1.5GB')).toBe(1.5e9);
    expect(parseSize('8 bit')).toBe(1);
    expect(parseSize('2k')).toBe(2000);
    expect(Object.fromEntries(convertSize('1 GiB')).MiB).toBe('1,024');
    expect(() => parseSize('1 zz')).toThrow(/Unknown unit/);
  });
});

describe('time zones', () => {
  it('interprets wall time in a zone, including DST', () => {
    expect(parseInZone('2024-01-15 09:00', 'America/New_York').toISOString()).toBe('2024-01-15T14:00:00.000Z');
    expect(parseInZone('2024-07-15 09:00', 'America/New_York').toISOString()).toBe('2024-07-15T13:00:00.000Z');
    expect(parseInZone('2024-07-15 09:00', 'Asia/Kolkata').toISOString()).toBe('2024-07-15T03:30:00.000Z');
    expect(parseInZone('1700000000', 'UTC').getTime()).toBe(1700000000000);
  });
  it('formats in zones', () => {
    const r = inZones(new Date('2024-01-15T14:00:00Z'), ['UTC', 'Asia/Tokyo']);
    expect(r[0]!.offset).toBe('UTC+00:00');
    expect(r[1]!.offset).toBe('UTC+09:00');
    expect(r[1]!.time).toContain('23:00');
    expect(() => validateZone('Mars/Base')).toThrow(/Unknown/);
  });
});

describe('protobuf / msgpack', () => {
  it('decodes protobuf without schema', () => {
    // field 1 varint 150, field 2 string "testing"
    const f = decodeProtobuf(hexToBytes('089601120774657374696e67'));
    expect(f[0]!.field).toBe(1);
    expect(String(f[0]!.value)).toContain('150');
    expect(f[1]!.field).toBe(2);
    expect(JSON.stringify(f[1]!.value)).toContain('testing');
  });
  it('msgpack round-trips', () => {
    const v = { a: 1, b: [true, null, 'x'], c: -5, d: 1.5, e: { f: 'long string value here' } };
    expect(decodeMsgpack(encodeMsgpack(v))).toEqual(v);
    expect(decodeMsgpack(hexToBytes('82a161 01a162 c3'.replace(/ /g, '')))).toEqual({ a: 1, b: true });
  });
});
