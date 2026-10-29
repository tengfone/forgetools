// Minimal DER/ASN.1 reader, enough for CSRs, SubjectPublicKeyInfo and PKCS#8 keys.
import { bytesToHex } from './bytes';

export interface Asn1 {
    tag: number;          // full first identifier byte
    cls: number;          // 0 universal, 1 application, 2 context, 3 private
    constructed: boolean;
    num: number;          // tag number
    start: number;        // header start
    hdr: number;          // header length
    len: number;          // content length
    bytes: Uint8Array;    // whole TLV
    content: Uint8Array;
    children?: Asn1[];
}

export function parseDer(buf: Uint8Array, offset = 0, end = buf.length): Asn1 {
    if (offset + 2 > end) throw new Error('DER: truncated header');
    const tag = buf[offset]!;
    let p = offset + 1;
    let num = tag & 0x1f;
    if (num === 0x1f) { num = 0; let b; do { b = buf[p++]!; num = (num << 7) | (b & 0x7f); } while (b & 0x80); }
    let len = buf[p++]!;
    if (len & 0x80) {
        const n = len & 0x7f;
        if (n === 0 || n > 4) throw new Error('DER: unsupported length encoding');
        len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + buf[p++]!;
    }
    const hdr = p - offset;
    if (p + len > end) throw new Error('DER: content runs past end of data');
    const node: Asn1 = {
        tag, cls: tag >> 6, constructed: !!(tag & 0x20), num, start: offset, hdr, len,
        bytes: buf.subarray(offset, p + len), content: buf.subarray(p, p + len),
    };
    if (node.constructed) {
        node.children = [];
        let q = p;
        while (q < p + len) { const c = parseDer(buf, q, p + len); node.children.push(c); q = c.start + c.hdr + c.len; }
    }
    return node;
}

export function readOid(c: Uint8Array): string {
    const parts: number[] = [Math.floor(c[0]! / 40), c[0]! % 40];
    let v = 0;
    for (let i = 1; i < c.length; i++) { v = v * 128 + (c[i]! & 0x7f); if (!(c[i]! & 0x80)) { parts.push(v); v = 0; } }
    return parts.join('.');
}

export const OIDS: Record<string, string> = {
    '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU',
    '2.5.4.5': 'serialNumber', '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC',
    '1.2.840.113549.1.1.1': 'rsaEncryption', '1.2.840.10045.2.1': 'ecPublicKey', '1.3.101.112': 'Ed25519', '1.3.101.110': 'X25519',
    '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
    '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
    '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
    '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
    '1.2.840.113549.1.9.14': 'extensionRequest', '2.5.29.17': 'subjectAltName', '2.5.29.15': 'keyUsage', '2.5.29.37': 'extKeyUsage',
    '2.5.29.19': 'basicConstraints',
};

export const oidName = (oid: string): string => OIDS[oid] ?? oid;

export function readString(n: Asn1): string {
    // BMPString (30) is UTF-16BE
    if (n.num === 30) { let s = ''; for (let i = 0; i + 1 < n.content.length; i += 2) s += String.fromCharCode((n.content[i]! << 8) | n.content[i + 1]!); return s; }
    return new TextDecoder().decode(n.content);
}

export function readName(seq: Asn1): string {
    const parts: string[] = [];
    for (const rdn of seq.children ?? []) for (const atv of rdn.children ?? []) {
        const [oid, val] = atv.children ?? [];
        if (oid && val) parts.push(`${oidName(readOid(oid.content))}=${readString(val)}`);
    }
    return parts.join(', ');
}

/** Unsigned big-endian integer bytes with any leading 0x00 sign byte stripped. */
export const intBytes = (n: Asn1): Uint8Array => {
    let c = n.content;
    while (c.length > 1 && c[0] === 0) c = c.subarray(1);
    return c;
};

export const intHex = (n: Asn1): string => bytesToHex(intBytes(n));

export function readSan(ext: Uint8Array): string[] {
    const seq = parseDer(ext);
    return (seq.children ?? []).map(g => {
        if (g.num === 2) return 'DNS:' + new TextDecoder().decode(g.content);
        if (g.num === 1) return 'email:' + new TextDecoder().decode(g.content);
        if (g.num === 6) return 'URI:' + new TextDecoder().decode(g.content);
        if (g.num === 7) return 'IP:' + (g.content.length === 4 ? [...g.content].join('.') : bytesToHex(g.content).replace(/(.{4})(?!$)/g, '$1:'));
        return `[${g.num}]`;
    });
}
