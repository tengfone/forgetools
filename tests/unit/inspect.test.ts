import { describe, it, expect } from 'vitest';
import {
    parseUrl, buildUrl, parseUserAgent, calcSubnet, cidrContains, inspectUnicode, stripInvisible, isInvisible,
    graphemeCount, HTTP_STATUS, searchHttpStatus,
} from '../../src/renderer/src/tools/lib/inspect';

describe('URL parser', () => {
    it('parses and rebuilds', () => {
        const u = parseUrl('https://user:pw@example.com:8443/a/b?x=1&y=two%20words#frag');
        expect(JSON.stringify(u)).toContain('example.com');
        expect(JSON.stringify(u)).toContain('two words');
        expect(buildUrl('https://e.com/p', [['a', '1'], ['b', 'c d']])).toBe('https://e.com/p?a=1&b=c+d');
        expect(() => parseUrl('not a url')).toThrow();
    });
});

describe('User-Agent parser', () => {
    it('detects common agents', () => {
        const c = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        expect(c.browser).toBe('Chrome');
        expect(c.browserVersion).toMatch(/^124/);
        expect(c.os).toMatch(/Windows/);
        expect(c.device).toBe('desktop');
        const i = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
        expect(i.browser).toBe('Safari');
        expect(i.os).toBe('iOS');
        expect(i.device).toBe('mobile');
        expect(parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').device).toBe('bot');
    });
});

describe('CIDR', () => {
    it('IPv4', () => {
        const s = calcSubnet('192.168.1.77/24');
        expect(s.network).toBe('192.168.1.0/24');
        expect(s.broadcast).toBe('192.168.1.255');
        expect(s.firstHost).toBe('192.168.1.1');
        expect(s.lastHost).toBe('192.168.1.254');
        expect(s.mask).toBe('255.255.255.0');
        expect(s.usableHosts).toBe('254');
        expect(s.scope).toMatch(/Private/);
        expect(calcSubnet('10.0.0.0 255.255.0.0').prefix).toBe(16);
        expect(calcSubnet('10.0.0.5/32').usableHosts).toBe('1');
        expect(() => calcSubnet('300.1.1.1/8')).toThrow();
    });
    it('IPv6', () => {
        const s = calcSubnet('2001:db8::1/64');
        expect(s.version).toBe(6);
        expect(s.network).toBe('2001:db8::/64');
        expect(s.totalAddresses).toBe('18,446,744,073,709,551,616');
    });
    it('contains', () => {
        expect(cidrContains('10.0.0.0/8', '10.2.3.4')).toBe(true);
        expect(cidrContains('10.0.0.0/8', '11.0.0.1')).toBe(false);
    });
});

describe('Unicode inspector', () => {
    it('finds invisible chars', () => {
        const s = 'a\u200Bb\u00A0c';
        const info = inspectUnicode(s);
        expect(info.map(c => c.codePoint)).toEqual(['U+0061', 'U+200B', 'U+0062', 'U+00A0', 'U+0063']);
        expect(info[1]!.invisible).toBe(true);
        expect(isInvisible(0xfeff)).toBe(true);
        expect(stripInvisible(s)).not.toContain('\u200B');
        expect(inspectUnicode('é')[0]!.utf8).toMatch(/C3 ?A9/i);
        expect(graphemeCount('👍🏽e\u0301')).toBe(2);
    });
});

describe('HTTP status', () => {
    it('lookup', () => {
        expect(HTTP_STATUS.find(s => s[0] === 418)?.[1]).toMatch(/teapot/i);
        expect(searchHttpStatus('404')[0]![0]).toBe(404);
        expect(searchHttpStatus('gateway').map(s => s[0])).toContain(502);
    });
});
