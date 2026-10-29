// Byte/encoding helpers shared by the tool libraries. Pure: no DOM, runs in Node for unit tests.

export const utf8 = new TextEncoder();
const utf8Dec = new TextDecoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

export const toUtf8 = (s: string): Uint8Array => utf8.encode(s);
export const fromUtf8 = (b: Uint8Array): string => utf8Dec.decode(b);
/** Strict UTF-8 decode; returns null for invalid sequences. */
export const tryUtf8 = (b: Uint8Array): string | null => {
    try { return utf8Strict.decode(b); } catch { return null; }
};

export function bytesToHex(b: Uint8Array): string {
    let s = '';
    for (const x of b) s += x.toString(16).padStart(2, '0');
    return s;
}

export function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
    if (!/^[0-9a-f]*$/i.test(clean)) throw new Error('Invalid hex: only 0-9 and a-f are allowed');
    if (clean.length % 2) throw new Error('Invalid hex: odd number of digits');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export function bytesToBase64(b: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin);
}

export const bytesToBase64Url = (b: Uint8Array): string =>
    bytesToBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Standard or URL-safe base64, padding optional, whitespace ignored. */
export function base64ToBytes(str: string): Uint8Array {
    let s = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Invalid Base64 characters');
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) throw new Error('Invalid Base64 length');
    s += '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** Decode hex or base64 input (auto-detected) into bytes. */
export function hexOrBase64ToBytes(input: string, mode: 'auto' | 'hex' | 'base64' = 'auto'): Uint8Array {
    const t = input.trim();
    if (mode === 'hex') return hexToBytes(t);
    if (mode === 'base64') return base64ToBytes(t);
    const compact = t.replace(/0x/gi, '').replace(/[\s,:]/g, '');
    if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) return hexToBytes(compact);
    return base64ToBytes(t);
}

export function pemToDer(pem: string, label?: string): { label: string; der: Uint8Array } {
    const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
    if (!m) throw new Error(`Expected a PEM block (-----BEGIN ${label ?? '...'}-----)`);
    if (label && m[1] !== label) throw new Error(`Expected "${label}" PEM but found "${m[1]}"`);
    return { label: m[1]!, der: base64ToBytes(m[2]!) };
}

export function derToPem(der: Uint8Array, label: string): string {
    const b64 = bytesToBase64(der).match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${b64.join('\n')}\n-----END ${label}-----`;
}

export const isPrintable = (s: string): boolean => {
    for (const ch of s) {
        const c = ch.codePointAt(0)!;
        if (!(c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127 && !(c >= 0x80 && c < 0xa0)))) return false;
    }
    return true;
};
