import { describe, it, expect } from 'vitest';
import { fakeRecords, formatFake, FAKE_FIELDS, buildCron, buildGitignore, GITIGNORE, CHEATSHEETS } from '../../src/renderer/src/tools/lib/generate';
import { CHAIN_OPS, CHAIN_RECIPES, runChain } from '../../src/renderer/src/tools/lib/chain';
import { bytesToBase64, toUtf8 } from '../../src/renderer/src/tools/lib/bytes';
import { compress } from '../../src/renderer/src/tools/lib/crypto';

describe('fake data', () => {
    it('is deterministic with a seed and has every field', () => {
        const a = fakeRecords(5, [...FAKE_FIELDS], 42);
        expect(a).toEqual(fakeRecords(5, [...FAKE_FIELDS], 42));
        expect(a).toHaveLength(5);
        for (const f of FAKE_FIELDS) expect(a[0]).toHaveProperty(f);
        expect(a[0]!.email).toMatch(/^[\w.]+@[\w.]+$/);
        expect(a[0]!.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(fakeRecords(3, ['id'])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
    it('formats', () => {
        const rows = [{ id: 1, name: "O'Neil, Jr", ok: true }];
        expect(JSON.parse(formatFake(rows, 'json'))).toEqual(rows);
        expect(formatFake(rows, 'csv')).toBe('id,name,ok\n1,"O\'Neil, Jr",true');
        expect(formatFake(rows, 'sql', 'people')).toBe("INSERT INTO people (id, name, ok) VALUES\n  (1, 'O''Neil, Jr', TRUE);");
        expect(formatFake(rows, 'ndjson')).toBe(JSON.stringify(rows[0]));
    });
});

describe('cron builder', () => {
    it('builds expressions', () => {
        expect(buildCron({ freq: 'minute' }).expression).toBe('* * * * *');
        expect(buildCron({ freq: 'interval-minutes', every: 15 }).expression).toBe('*/15 * * * *');
        expect(buildCron({ freq: 'daily', hour: 9, minute: 30 })).toEqual({ expression: '30 9 * * *', description: 'Every day at 09:30' });
        const w = buildCron({ freq: 'weekly', hour: 8, weekdays: [1, 2, 3, 4, 5] });
        expect(w.expression).toBe('0 8 * * 1-5');
        expect(w.description).toContain('weekdays');
        expect(buildCron({ freq: 'monthly', dayOfMonth: 15 }).expression).toBe('0 0 15 * *');
        expect(buildCron({ freq: 'yearly', month: 12, dayOfMonth: 25 }).description).toContain('December 25');
        expect(buildCron({ freq: 'daily', hour: 99 }).expression).toBe('0 23 * * *');
    });
});

describe('.gitignore', () => {
    it('merges templates without duplicates', () => {
        const g = buildGitignore(['Node', 'Vite', 'Electron']);
        expect(g).toContain('# Node\nnode_modules/');
        expect(g.match(/^dist\/$/gm)).toHaveLength(1);
        expect(buildGitignore([])).toBe('');
        expect(() => buildGitignore(['Nope'])).toThrow();
        expect(Object.keys(GITIGNORE).length).toBeGreaterThan(10);
    });
});

describe('cheat sheets', () => {
    it('has content', () => {
        for (const [, rows] of Object.entries(CHEATSHEETS)) expect(rows.length).toBeGreaterThan(5);
    });
});

describe('chain', () => {
    it('runs steps', async () => {
        const r = await runChain(' Hello ', ['trim', 'upper', 'b64enc', 'b64dec', 'reverse']);
        expect(r.output).toBe('OLLEH');
        expect(r.steps).toHaveLength(5);
        expect((await runChain('abc', ['sha256'])).output).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
    it('inflate recipe', async () => {
        const b = bytesToBase64(await compress(toUtf8('{"a":1}'), 'gzip'));
        expect((await runChain(b, CHAIN_RECIPES[0]!.ops)).output).toBe('{\n  "a": 1\n}');
    });
    it('stops on error', async () => {
        const r = await runChain('not json', ['jsonfmt', 'upper']);
        expect(r.steps).toHaveLength(1);
        expect(r.steps[0]!.error).toMatch(/JSON format/);
        expect(r.output).toBe('not json');
    });
    it('every op handles its natural input', async () => {
        expect(CHAIN_OPS.length).toBeGreaterThan(20);
        expect((await runChain('{"a":1}', ['json2yaml', 'yaml2json', 'jsonmin'])).output).toBe('{"a":1}');
        expect((await runChain('a b', ['urlenc', 'urldec', 'hexenc', 'hexdec'])).output).toBe('a b');
    });
});

describe('review follow-ups', () => {
    it('cron: yearly date validation and leap-day note', () => {
        expect(buildCron({ freq: 'yearly', month: 2, dayOfMonth: 30 }).error).toMatch(/February has no day 30/);
        expect(buildCron({ freq: 'yearly', month: 4, dayOfMonth: 31 }).error).toMatch(/April/);
        const leap = buildCron({ freq: 'yearly', month: 2, dayOfMonth: 29, hour: 6 });
        expect(leap.error).toBeUndefined();
        expect(leap.note).toBe('leap years only');
        expect(leap.expression).toBe('0 6 29 2 *');
    });
    it('cron: interval notes only for uneven steps', () => {
        expect(buildCron({ freq: 'interval-minutes', every: 7 }).note).toMatch(/last gap is 4 min/);
        expect(buildCron({ freq: 'interval-minutes', every: 15 }).note).toBeUndefined();
        expect(buildCron({ freq: 'interval-hours', every: 5 }).note).toMatch(/last gap is 4 h/);
        expect(buildCron({ freq: 'monthly', dayOfMonth: 31 }).note).toMatch(/shorter months/);
    });
    it('cron: weekly with all seven days', () => {
        const r = buildCron({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], hour: 9 });
        expect(r.expression).toBe('0 9 * * 0-6');
        expect(r.description).toMatch(/every day/);
    });
    it('fake data: SQL table names with quotes or spaces are quoted', () => {
        const rows = [{ id: 1, name: "O'Neil" }];
        expect(formatFake(rows, 'sql', 'my "users"')).toMatch(/^INSERT INTO "my ""users""" \(id, name\)/);
        expect(formatFake(rows, 'sql', 'users')).toContain("'O''Neil'");
        expect(formatFake([{ a: 'x\ry' }], 'csv')).toBe('a\n"x\ry"');
    });
    it('chain: unknown step stops with an error', async () => {
        const r = await runChain('abc', ['upper', 'nope', 'lower']);
        expect(r.steps.map(s => s.op)).toEqual(['upper', 'nope']);
        expect(r.steps[1]!.error).toMatch(/Unknown step "nope"/);
        expect(r.output).toBe('ABC');
    });
    it('chain: decoding binary data fails instead of corrupting it', async () => {
        const bin = bytesToBase64(new Uint8Array([0xff, 0xfe, 0x00, 0x80]));
        const r = await runChain(bin, ['b64dec', 'b64enc']);
        expect(r.steps[0]!.error).toMatch(/Not UTF-8/);
        expect(r.output).toBe(bin);
        expect((await runChain('ff80', ['hexdec'])).steps[0]!.error).toMatch(/Not UTF-8/);
        expect((await runChain('héllo', ['hexenc', 'hexdec'])).output).toBe('héllo');
    });
    it('chain: reverse keeps emoji and combining marks intact', async () => {
        expect((await runChain('ab👨‍👩‍👧é', ['reverse'])).output).toBe('é👨‍👩‍👧ba');
    });
});
