import { describe, it, expect } from 'vitest';
import {
  getHistory,
  pushHistory,
  clearAllHistory,
  HISTORY_FLAG,
  HISTORY_MAX,
  historyLabel,
  looksSecret,
} from '../../src/tools/lib/history';
import { buildIco } from '../../src/tools/lib/favicon';
import { detect } from '../../src/detect';
import { SAMPLE_CSR_EC } from '../../src/tools/lib/samples';

class MemStore {
  m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe('history', () => {
  it('is opt-in, deduplicates, caps and clears', () => {
    const s = new MemStore();
    pushHistory(s, 'jy', 'a');
    expect(getHistory(s, 'jy')).toEqual([]);
    s.setItem(HISTORY_FLAG, 'true');
    pushHistory(s, 'jy', 'a');
    pushHistory(s, 'jy', 'b');
    pushHistory(s, 'jy', 'a');
    expect(getHistory(s, 'jy')).toEqual(['a', 'b']);
    for (let i = 0; i < 20; i++) pushHistory(s, 'jy', `x${i}`);
    expect(getHistory(s, 'jy')).toHaveLength(HISTORY_MAX);
    pushHistory(s, 'other', 'z');
    clearAllHistory(s as unknown as Storage);
    expect(getHistory(s, 'jy')).toEqual([]);
    expect(getHistory(s, 'other')).toEqual([]);
    expect(s.getItem(HISTORY_FLAG)).toBe('true');
    expect(historyLabel('a\n'.repeat(100)).length).toBeLessThanOrEqual(60);
    expect(historyLabel('x'.repeat(70)).endsWith('\u2026')).toBe(true);
  });

  it('trims trailing whitespace when deduplicating', () => {
    const s = new MemStore();
    s.setItem(HISTORY_FLAG, 'true');
    pushHistory(s, 't', 'abc');
    pushHistory(s, 't', 'abc\n');
    expect(getHistory(s, 't')).toEqual(['abc']);
  });

  it('never stores inputs that look like credentials', () => {
    const s = new MemStore();
    s.setItem(HISTORY_FLAG, 'true');
    for (const secret of [
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghij',
      '-----BEGIN PRIVATE KEY-----\nMIIE',
      "curl -H 'Authorization: Bearer abcdefghijkl' https://x",
      'DB_PASSWORD=hunter2',
      '{"api_key": "x"}',
      'https://x.test/cb?code=abc&state=1',
      'AKIAABCDEFGHIJKLMNOP',
      'https://user:pass@host.example',
    ])
      pushHistory(s, 's', secret);
    expect(getHistory(s, 's')).toEqual([]);
    expect(looksSecret('{"name":"forge"}')).toBe(false);
    // Known over-match, accepted by design: any ?code= query is treated as an OAuth code
    expect(looksSecret('https://docs.example/page?code=sample')).toBe(true);
  });

  it('survives a full storage quota', () => {
    const s = new MemStore();
    s.setItem(HISTORY_FLAG, 'true');
    s.setItem = (k: string, v: string) => {
      if (k.startsWith('tool-history:') && v.length > 30) throw new Error('QuotaExceededError');
      MemStore.prototype.setItem.call(s, k, v);
    };
    expect(() => pushHistory(s, 'q', 'one long-ish entry')).not.toThrow();
  });
});

describe('ico packer', () => {
  it('writes a valid header and directory', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const ico = buildIco([
      { size: 16, png },
      { size: 256, png },
    ]);
    const dv = new DataView(ico.buffer);
    expect(dv.getUint16(2, true)).toBe(1);
    expect(dv.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico[22]).toBe(0); // 256 encoded as 0
    expect(dv.getUint32(6 + 12, true)).toBe(6 + 32);
    expect(dv.getUint32(22 + 12, true)).toBe(6 + 32 + png.length);
    expect(ico.length).toBe(6 + 32 + 2 * png.length);
    expect(() => buildIco([])).toThrow();
    expect(() => buildIco([{ size: 512, png }])).toThrow(/1-256/);
    expect(() => buildIco([{ size: 0, png }])).toThrow(/1-256/);
  });
});

describe('paste detection', () => {
  const top = (s: string): string | undefined => detect(s)[0]?.toolId;
  it.each([
    ['curl -X POST https://x.dev -d a=1', 'curlConverter'],
    ['docker run -d -p 80:80 nginx', 'dockerCompose'],
    [SAMPLE_CSR_EC, 'csrDecoder'],
    [
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----',
      'pemJwk',
    ],
    ['10.0.0.0/8', 'cidr'],
    ['2001:db8::/32', 'cidr'],
    ['https://idp.example.com/sso?SAMLRequest=fZJNT8Mw', 'samlDecoder'],
    ['H4sIAAAAAAAACvNIzcnJVyjPL8pJAQBSntaLCwAAAA==', 'decompress'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'userAgent'],
    ['FROM node:20\nRUN npm ci\nCMD ["node","."]', 'dockerfileLint'],
    ['[server]\nport = 8080\nhost = "x"', 'tomlJson'],
    ['DB_HOST=localhost\nDB_PORT=5432', 'envJson'],
    ['rwxr-xr-x', 'chmod'],
    ['query { user(id: 1) { name } }', 'graphqlFormat'],
    ['1.5 GiB', 'dataSize'],
    ['{"kty":"OKP","crv":"Ed25519","x":"abc"}', 'pemJwk'],
  ])('%s -> %s', (input, tool) => {
    expect(top(input)).toBe(tool);
  });
  it('existing detections still win', () => {
    expect(top('{"a":1}')).toBe('json');
    expect(top('550e8400-e29b-41d4-a716-446655440000')).toBe('uuid');
    expect(top('*/5 * * * *')).toBe('cronParser');
    expect(detect('https://example.com/a?b=1').map((c) => c.toolId)).toContain('urlParser');
    // zlib prefixes only count for a single Base64-shaped token
    expect(top('eJzLSM3JyVcozy/KSQEAGgQEXQ==')).toBe('decompress');
    expect(detect('eNough said, this is plain text').map((c) => c.toolId)).not.toContain('decompress');
    expect(detect('a:/12').map((c) => c.toolId)).not.toContain('cidr');
    expect(top('2001:db8::/32')).toBe('cidr');
  });
});
