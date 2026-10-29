// Inspect & decode helpers: URL parsing, User-Agent parsing, IPv4/IPv6 CIDR maths,
// Unicode inspection, HTTP status reference.

// ── URL ────────────────────────────────────────────────────────────────────

export interface ParsedUrl {
    protocol: string; username: string; password: string; hostname: string; port: string;
    pathname: string; search: string; hash: string; origin: string;
    params: Array<[string, string]>; pathSegments: string[];
}

export function parseUrl(input: string): ParsedUrl {
    const s = input.trim();
    if (!s) throw new Error('Enter a URL');
    let u: URL;
    try { u = new URL(s); } catch {
        try { u = new URL('http://' + s); } catch { throw new Error('Not a valid URL'); }
        if (!/^[\w.-]+(:\d+)?([/?#]|$)/.test(s)) throw new Error('Not a valid URL');
    }
    return {
        protocol: u.protocol.replace(/:$/, ''), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
        hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin,
        params: [...u.searchParams.entries()],
        pathSegments: u.pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } }),
    };
}

export function buildUrl(base: string, params: Array<[string, string]>): string {
    const u = new URL(base);
    u.search = '';
    for (const [k, v] of params) if (k) u.searchParams.append(k, v);
    return u.toString();
}

// ── User-Agent ─────────────────────────────────────────────────────────────

export interface UaInfo { browser: string; browserVersion: string; engine: string; os: string; osVersion: string; device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'tv' | 'console'; vendor?: string; bot?: string }

export function parseUserAgent(ua: string): UaInfo {
    const s = ua.trim();
    if (!s) throw new Error('Enter a User-Agent string');
    const pick = (re: RegExp): string | undefined => re.exec(s)?.[1];
    const info: UaInfo = { browser: 'Unknown', browserVersion: '', engine: 'Unknown', os: 'Unknown', osVersion: '', device: 'desktop' };

    const bot = /(googlebot|bingbot|duckduckbot|baiduspider|yandex(?:bot)?|slurp|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|applebot|gptbot|claudebot|ahrefsbot|semrushbot|petalbot|bytespider|[a-z]*bot\b|crawler|spider)/i.exec(s);
    if (bot) { info.device = 'bot'; info.bot = bot[1]; }

    // Browser (order matters: most specific first)
    const browsers: Array<[RegExp, string]> = [
        [/EdgA?\/([\d.]+)/, 'Edge'], [/Edg(?:iOS)?\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Opera\/.*Version\/([\d.]+)/, 'Opera'],
        [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'], [/YaBrowser\/([\d.]+)/, 'Yandex'], [/Vivaldi\/([\d.]+)/, 'Vivaldi'],
        [/Brave\/([\d.]+)/, 'Brave'], [/UCBrowser\/([\d.]+)/, 'UC Browser'], [/FxiOS\/([\d.]+)/, 'Firefox'], [/CriOS\/([\d.]+)/, 'Chrome'],
        [/Electron\/([\d.]+)/, 'Electron'], [/Firefox\/([\d.]+)/, 'Firefox'], [/Chrome\/([\d.]+)/, 'Chrome'],
        [/Version\/([\d.]+).*Safari\//, 'Safari'], [/MSIE ([\d.]+)/, 'Internet Explorer'], [/Trident\/.*rv:([\d.]+)/, 'Internet Explorer'],
        [/curl\/([\d.]+)/, 'curl'], [/Wget\/([\d.]+)/, 'Wget'], [/PostmanRuntime\/([\d.]+)/, 'Postman'], [/python-requests\/([\d.]+)/, 'Python Requests'],
        [/okhttp\/([\d.]+)/, 'OkHttp'], [/Go-http-client\/([\d.]+)/, 'Go HTTP client'], [/axios\/([\d.]+)/, 'axios'], [/node-fetch\/([\d.]+)/, 'node-fetch'],
    ];
    for (const [re, name] of browsers) { const v = pick(re); if (v) { info.browser = name; info.browserVersion = v; break; } }

    info.engine = /Gecko\/\d/.test(s) && /Firefox/.test(s) ? 'Gecko' : /AppleWebKit/.test(s) ? (/Chrome|CriOS|Edg|OPR|Chromium/.test(s) && !/iPhone|iPad|iPod/.test(s) ? 'Blink' : 'WebKit') : /Trident/.test(s) ? 'Trident' : /Presto/.test(s) ? 'Presto' : 'Unknown';

    // OS
    let v: string | undefined;
    if ((v = pick(/Windows NT ([\d.]+)/))) {
        info.os = 'Windows';
        info.osVersion = ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' } as Record<string, string>)[v] ?? v;
    } else if (/Windows Phone/.test(s)) { info.os = 'Windows Phone'; info.device = 'mobile'; }
    else if ((v = pick(/(?:iPhone|CPU) OS ([\d_]+)/))) { info.os = 'iOS'; info.osVersion = v.replace(/_/g, '.'); }
    else if (/iPad/.test(s)) { info.os = 'iPadOS'; info.osVersion = (pick(/OS ([\d_]+)/) ?? '').replace(/_/g, '.'); }
    else if ((v = pick(/Android ([\d.]+)/)) || /Android/.test(s)) { info.os = 'Android'; info.osVersion = v ?? ''; }
    else if ((v = pick(/CrOS \S+ ([\d.]+)/))) { info.os = 'ChromeOS'; info.osVersion = v; }
    else if ((v = pick(/Mac OS X ([\d_.]+)/))) { info.os = 'macOS'; info.osVersion = v.replace(/_/g, '.'); }
    else if (/Macintosh/.test(s)) info.os = 'macOS';
    else if (/Ubuntu/.test(s)) info.os = 'Ubuntu';
    else if (/Fedora/.test(s)) info.os = 'Fedora';
    else if (/Linux/.test(s)) info.os = 'Linux';
    else if (/PlayStation/.test(s)) { info.os = 'PlayStation'; info.device = 'console'; }
    else if (/Xbox/.test(s)) { info.os = 'Xbox'; info.device = 'console'; }

    if (info.device !== 'bot' && info.device !== 'console') {
        if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/.test(s)) info.device = 'tablet';
        else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/.test(s)) info.device = 'mobile';
        else if (/SmartTV|SMART-TV|Tizen.*TV|Web0S|AppleTV|Android TV|BRAVIA|HbbTV/i.test(s)) info.device = 'tv';
    }
    const vendor = /(Pixel \d\w*|SM-[A-Z0-9]+|Nexus \d+|iPhone|iPad|HUAWEI[\w-]+|Redmi[\w ]+?|Mi \d+|OnePlus\w*)/.exec(s);
    if (vendor) info.vendor = vendor[1]!.trim();
    return info;
}

// ── CIDR / subnet ──────────────────────────────────────────────────────────

export interface Subnet {
    version: 4 | 6; input: string; network: string; prefix: number; mask?: string; wildcard?: string;
    broadcast?: string; firstHost: string; lastHost: string; totalAddresses: string; usableHosts: string;
    ipClass?: string; scope: string; binaryMask?: string;
}

const ip4ToInt = (ip: string): number => {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || +p > 255 || (p.length > 1 && p.startsWith('0')))) throw new Error(`Invalid IPv4 address "${ip}"`);
    return parts.reduce((a, p) => (a << 8) + +p, 0) >>> 0;
};
const intToIp4 = (n: number): string => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.');

function maskToPrefix(mask: string): number {
    const n = ip4ToInt(mask);
    const inv = ~n >>> 0;
    if ((inv & (inv + 1)) !== 0) throw new Error(`"${mask}" is not a contiguous netmask`);
    return 32 - Math.log2(inv + 1);
}

function scope4(n: number): string {
    const inR = (cidr: string): boolean => { const [ip, p] = cidr.split('/'); const m = p === '0' ? 0 : (~0 << (32 - +p!)) >>> 0; return ((n & m) >>> 0) === ((ip4ToInt(ip!) & m) >>> 0); };
    if (inR('10.0.0.0/8') || inR('172.16.0.0/12') || inR('192.168.0.0/16')) return 'Private (RFC 1918)';
    if (inR('127.0.0.0/8')) return 'Loopback';
    if (inR('169.254.0.0/16')) return 'Link-local';
    if (inR('100.64.0.0/10')) return 'Carrier-grade NAT (RFC 6598)';
    if (inR('224.0.0.0/4')) return 'Multicast';
    if (inR('0.0.0.0/8')) return '"This" network';
    if (inR('240.0.0.0/4')) return 'Reserved';
    if (inR('192.0.2.0/24') || inR('198.51.100.0/24') || inR('203.0.113.0/24')) return 'Documentation (TEST-NET)';
    return 'Public';
}

function parseIp6(ip: string): bigint {
    let s = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
    const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (v4) { const n = ip4ToInt(v4[1]!); s = s.slice(0, -v4[1]!.length) + ((n >>> 16).toString(16)) + ':' + ((n & 0xffff).toString(16)); }
    const dbl = s.split('::');
    if (dbl.length > 2) throw new Error('Invalid IPv6: more than one ::');
    const head = dbl[0] ? dbl[0].split(':') : [];
    const tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : [];
    const fill = dbl.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0 || (dbl.length === 1 && head.length !== 8)) throw new Error(`Invalid IPv6 address "${ip}"`);
    const groups = [...head, ...Array(fill).fill('0'), ...tail];
    if (groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) throw new Error(`Invalid IPv6 address "${ip}"`);
    return groups.reduce((a, g) => (a << 16n) + BigInt(parseInt(g, 16)), 0n);
}

export function formatIp6(n: bigint): string {
    const g = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt((7 - i) * 16)) & 0xffffn).toString(16));
    // compress the longest run of zero groups (length >= 2)
    let best = -1, bestLen = 0;
    for (let i = 0; i < 8;) {
        if (g[i] !== '0') { i++; continue; }
        let j = i; while (j < 8 && g[j] === '0') j++;
        if (j - i > bestLen && j - i >= 2) { best = i; bestLen = j - i; }
        i = j;
    }
    if (best === -1) return g.join(':');
    return g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':');
}

function scope6(n: bigint): string {
    if (n === 0n) return 'Unspecified';
    if (n === 1n) return 'Loopback';
    const top = Number(n >> 112n);
    if ((top & 0xffc0) === 0xfe80) return 'Link-local';
    if ((top & 0xfe00) === 0xfc00) return 'Unique local (private)';
    if ((top & 0xff00) === 0xff00) return 'Multicast';
    if (top === 0x2001 && Number((n >> 96n) & 0xffffn) === 0x0db8) return 'Documentation';
    if (n >> 32n === 0xffffn) return 'IPv4-mapped';
    if ((top & 0xe000) === 0x2000) return 'Global unicast';
    return 'Reserved';
}

export function calcSubnet(input: string): Subnet {
    const s = input.trim();
    if (!s) throw new Error('Enter an address like 192.168.1.10/24 or 2001:db8::/32');
    if (s.includes(':')) {
        const [ip, p = '128'] = s.split('/');
        const prefix = +p;
        if (!/^\d+$/.test(p) || prefix > 128) throw new Error('IPv6 prefix must be 0-128');
        const addr = parseIp6(ip!);
        const hostBits = BigInt(128 - prefix);
        const mask = ((1n << 128n) - 1n) ^ ((1n << hostBits) - 1n);
        const net = addr & mask, last = net | ((1n << hostBits) - 1n);
        const total = 1n << hostBits;
        return { version: 6, input: s, network: `${formatIp6(net)}/${prefix}`, prefix, firstHost: formatIp6(net), lastHost: formatIp6(last), totalAddresses: total.toLocaleString('en-US'), usableHosts: total.toLocaleString('en-US'), scope: scope6(addr) };
    }
    const m = /^([\d.]+)(?:\s*\/\s*([\d.]+)|\s+([\d.]+))?$/.exec(s);
    if (!m) throw new Error('Use a.b.c.d/nn or a.b.c.d 255.255.255.0');
    const addr = ip4ToInt(m[1]!);
    const pRaw = m[2] ?? m[3] ?? '32';
    const prefix = pRaw.includes('.') ? maskToPrefix(pRaw) : +pRaw;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error('IPv4 prefix must be 0-32');
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const net = (addr & mask) >>> 0, bc = (net | ~mask) >>> 0;
    const total = 2 ** (32 - prefix);
    const usable = prefix >= 31 ? total : total - 2;
    const first = prefix >= 31 ? net : net + 1, last = prefix >= 31 ? bc : bc - 1;
    const o1 = addr >>> 24;
    return {
        version: 4, input: s, network: `${intToIp4(net)}/${prefix}`, prefix, mask: intToIp4(mask), wildcard: intToIp4(~mask >>> 0),
        broadcast: intToIp4(bc), firstHost: intToIp4(first), lastHost: intToIp4(last),
        totalAddresses: total.toLocaleString('en-US'), usableHosts: usable.toLocaleString('en-US'),
        ipClass: o1 < 128 ? 'A' : o1 < 192 ? 'B' : o1 < 224 ? 'C' : o1 < 240 ? 'D (multicast)' : 'E (reserved)',
        scope: scope4(addr),
        binaryMask: [24, 16, 8, 0].map(sh => ((mask >>> sh) & 255).toString(2).padStart(8, '0')).join('.'),
    };
}

/** Does `ip` fall inside `cidr`? */
export function cidrContains(cidr: string, ip: string): boolean {
    const sub = calcSubnet(cidr);
    if (sub.version === 6) {
        const hostBits = BigInt(128 - sub.prefix);
        return (parseIp6(ip) >> hostBits) === (parseIp6(sub.firstHost) >> hostBits);
    }
    const mask = sub.prefix === 0 ? 0 : (~0 << (32 - sub.prefix)) >>> 0;
    return ((ip4ToInt(ip.trim()) & mask) >>> 0) === ip4ToInt(sub.network.split('/')[0]!);
}

// ── Unicode ────────────────────────────────────────────────────────────────

export interface CharInfo { char: string; codePoint: string; utf8: string; utf16: string; name: string; category: string; invisible: boolean }

const NAMED: Record<number, string> = {
    0x00: 'NULL', 0x09: 'CHARACTER TABULATION', 0x0a: 'LINE FEED', 0x0d: 'CARRIAGE RETURN', 0x20: 'SPACE', 0xa0: 'NO-BREAK SPACE',
    0xad: 'SOFT HYPHEN', 0x34f: 'COMBINING GRAPHEME JOINER', 0x61c: 'ARABIC LETTER MARK', 0x115f: 'HANGUL CHOSEONG FILLER',
    0x180e: 'MONGOLIAN VOWEL SEPARATOR', 0x2000: 'EN QUAD', 0x2001: 'EM QUAD', 0x2002: 'EN SPACE', 0x2003: 'EM SPACE', 0x2009: 'THIN SPACE',
    0x200a: 'HAIR SPACE', 0x200b: 'ZERO WIDTH SPACE', 0x200c: 'ZERO WIDTH NON-JOINER', 0x200d: 'ZERO WIDTH JOINER',
    0x200e: 'LEFT-TO-RIGHT MARK', 0x200f: 'RIGHT-TO-LEFT MARK', 0x2028: 'LINE SEPARATOR', 0x2029: 'PARAGRAPH SEPARATOR',
    0x202a: 'LEFT-TO-RIGHT EMBEDDING', 0x202b: 'RIGHT-TO-LEFT EMBEDDING', 0x202c: 'POP DIRECTIONAL FORMATTING',
    0x202d: 'LEFT-TO-RIGHT OVERRIDE', 0x202e: 'RIGHT-TO-LEFT OVERRIDE', 0x202f: 'NARROW NO-BREAK SPACE', 0x2060: 'WORD JOINER',
    0x2066: 'LEFT-TO-RIGHT ISOLATE', 0x2067: 'RIGHT-TO-LEFT ISOLATE', 0x2068: 'FIRST STRONG ISOLATE', 0x2069: 'POP DIRECTIONAL ISOLATE',
    0x3000: 'IDEOGRAPHIC SPACE', 0x3164: 'HANGUL FILLER', 0xfe0f: 'VARIATION SELECTOR-16', 0xfe0e: 'VARIATION SELECTOR-15',
    0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)', 0xfffd: 'REPLACEMENT CHARACTER',
};

const CATS: Array<[RegExp, string]> = [
    [/\p{Lu}/u, 'Uppercase letter'], [/\p{Ll}/u, 'Lowercase letter'], [/\p{L}/u, 'Letter'], [/\p{Nd}/u, 'Digit'], [/\p{N}/u, 'Number'],
    [/\p{Extended_Pictographic}/u, 'Emoji / pictograph'], [/\p{M}/u, 'Combining mark'], [/\p{P}/u, 'Punctuation'], [/\p{Sm}/u, 'Math symbol'],
    [/\p{Sc}/u, 'Currency symbol'], [/\p{S}/u, 'Symbol'], [/\p{Zs}/u, 'Space separator'], [/\p{Cc}/u, 'Control character'],
    [/\p{Cf}/u, 'Format character (invisible)'], [/\p{Co}/u, 'Private use'], [/\p{Z}/u, 'Separator'],
];

export const isInvisible = (cp: number): boolean =>
    /[\p{Cf}\p{Cc}]/u.test(String.fromCodePoint(cp)) && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d
    || [0xa0, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800, 0x180e, 0x034f].includes(cp) || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x202f || cp === 0x205f || cp === 0x3000
    || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);

export function inspectUnicode(s: string): CharInfo[] {
    return [...s].map(ch => {
        const cp = ch.codePointAt(0)!;
        const u8 = [...new TextEncoder().encode(ch)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        const u16 = Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')).join(' ');
        const cat = CATS.find(([re]) => re.test(ch))?.[1] ?? 'Other';
        return {
            char: ch, codePoint: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), utf8: u8, utf16: u16,
            name: NAMED[cp] ?? (cp >= 0xe0000 && cp <= 0xe007f ? 'TAG CHARACTER' : cp >= 0xfe00 && cp <= 0xfe0f ? `VARIATION SELECTOR-${cp - 0xfe00 + 1}` : ''),
            category: cat, invisible: isInvisible(cp),
        };
    });
}

/** Strip invisible / bidi-control characters (keeps \t \n \r and ZWJ inside emoji sequences). */
export function stripInvisible(s: string): string {
    const chars = [...s];
    return chars.map((ch, i) => {
        const cp = ch.codePointAt(0)!;
        if (!isInvisible(cp)) return ch;
        // Exotic spaces become a normal space; joiners inside emoji sequences are kept.
        if (/\p{Zs}/u.test(ch)) return ' ';
        if ((cp === 0x200d || cp === 0xfe0f) && i > 0 && /\p{Extended_Pictographic}/u.test(chars[i - 1]!)) return ch;
        if (cp === 0xfe0f && i > 0 && /[\d#*]/u.test(chars[i - 1]!)) return ch;
        return '';
    }).join('');
}

export function graphemeCount(s: string): number {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<unknown> } }).Segmenter;
    if (!Seg) return [...s].length;
    let n = 0;
    for (const _ of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
}

// ── HTTP status codes ──────────────────────────────────────────────────────

export const HTTP_STATUS: Array<[number, string, string]> = [
    [100, 'Continue', 'The client should continue with its request body.'],
    [101, 'Switching Protocols', 'Server is switching protocols as requested via Upgrade (e.g. WebSocket).'],
    [102, 'Processing', 'WebDAV: request received, still processing.'],
    [103, 'Early Hints', 'Preload hints sent before the final response.'],
    [200, 'OK', 'The request succeeded.'],
    [201, 'Created', 'A new resource was created; see the Location header.'],
    [202, 'Accepted', 'Accepted for processing, but not completed yet.'],
    [203, 'Non-Authoritative Information', 'Returned metadata comes from a transforming proxy.'],
    [204, 'No Content', 'Success with no response body.'],
    [205, 'Reset Content', 'Client should reset the document view.'],
    [206, 'Partial Content', 'Response to a Range request.'],
    [207, 'Multi-Status', 'WebDAV: multiple independent status codes.'],
    [208, 'Already Reported', 'WebDAV: members already enumerated.'],
    [226, 'IM Used', 'Delta encoding applied to the instance.'],
    [300, 'Multiple Choices', 'Several representations are available.'],
    [301, 'Moved Permanently', 'Resource moved permanently; clients may change POST to GET.'],
    [302, 'Found', 'Temporary redirect; clients may change POST to GET.'],
    [303, 'See Other', 'Redirect to another resource with GET (e.g. after a POST).'],
    [304, 'Not Modified', 'Cached version is still valid (conditional request).'],
    [307, 'Temporary Redirect', 'Temporary redirect; method and body are preserved.'],
    [308, 'Permanent Redirect', 'Permanent redirect; method and body are preserved.'],
    [400, 'Bad Request', 'Malformed syntax or invalid request.'],
    [401, 'Unauthorized', 'Authentication is required or failed (send WWW-Authenticate).'],
    [402, 'Payment Required', 'Reserved; sometimes used for billing limits.'],
    [403, 'Forbidden', 'Authenticated but not allowed to access the resource.'],
    [404, 'Not Found', 'The resource does not exist (or is hidden).'],
    [405, 'Method Not Allowed', 'HTTP method not supported for this resource; send Allow.'],
    [406, 'Not Acceptable', 'No representation matches the Accept headers.'],
    [407, 'Proxy Authentication Required', 'Authenticate with the proxy first.'],
    [408, 'Request Timeout', 'The server timed out waiting for the request.'],
    [409, 'Conflict', 'Request conflicts with the current state (e.g. edit conflict).'],
    [410, 'Gone', 'Resource permanently removed with no forwarding address.'],
    [411, 'Length Required', 'Content-Length header is required.'],
    [412, 'Precondition Failed', 'A conditional header (If-Match...) evaluated false.'],
    [413, 'Content Too Large', 'Request body exceeds server limits.'],
    [414, 'URI Too Long', 'The request URI is longer than the server accepts.'],
    [415, 'Unsupported Media Type', 'Content-Type is not supported.'],
    [416, 'Range Not Satisfiable', 'Requested Range cannot be served.'],
    [417, 'Expectation Failed', 'The Expect header cannot be met.'],
    [418, "I'm a teapot", 'RFC 2324 April Fools joke; sometimes used to refuse bots.'],
    [421, 'Misdirected Request', 'Request sent to a server that cannot produce a response.'],
    [422, 'Unprocessable Content', 'Syntax is fine but the content failed validation.'],
    [423, 'Locked', 'WebDAV: resource is locked.'],
    [424, 'Failed Dependency', 'WebDAV: a previous request failed.'],
    [425, 'Too Early', 'Server refuses to process a request that might be replayed.'],
    [426, 'Upgrade Required', 'Client must switch protocols (see Upgrade).'],
    [428, 'Precondition Required', 'Request must be conditional (prevents lost updates).'],
    [429, 'Too Many Requests', 'Rate limited; see Retry-After.'],
    [431, 'Request Header Fields Too Large', 'Headers are too large.'],
    [451, 'Unavailable For Legal Reasons', 'Blocked for legal reasons.'],
    [500, 'Internal Server Error', 'Generic server error.'],
    [501, 'Not Implemented', 'Server does not support the functionality.'],
    [502, 'Bad Gateway', 'Invalid response from an upstream server.'],
    [503, 'Service Unavailable', 'Overloaded or down for maintenance; see Retry-After.'],
    [504, 'Gateway Timeout', 'Upstream server did not respond in time.'],
    [505, 'HTTP Version Not Supported', 'The HTTP version is not supported.'],
    [506, 'Variant Also Negotiates', 'Content negotiation configuration error.'],
    [507, 'Insufficient Storage', 'WebDAV: server cannot store the representation.'],
    [508, 'Loop Detected', 'WebDAV: infinite loop while processing.'],
    [510, 'Not Extended', 'Further extensions are required.'],
    [511, 'Network Authentication Required', 'Authenticate to gain network access (captive portal).'],
];

export function searchHttpStatus(q: string): Array<[number, string, string]> {
    const s = q.trim().toLowerCase();
    if (!s) return HTTP_STATUS;
    if (/^[1-5](\d|x)?(\d|x)?$/.test(s)) {
        const re = new RegExp('^' + s.replace(/x/g, '\\d'));
        return HTTP_STATUS.filter(([c]) => re.test(String(c)));
    }
    return HTTP_STATUS.filter(([c, n, d]) => `${c} ${n} ${d}`.toLowerCase().includes(s));
}
