// Hash, X.509, QR code, barcode and SVG helpers. All run in the webview; the heavy
// libraries (qrcode, jsbarcode + xmldom, svgo) are loaded on first use.
import { createMD5, createSHA1, createSHA256, createSHA512 } from 'hash-wasm';
import { pemToDer } from './bytes';
import { intHex, parseDer, readOid, readString, type Asn1 } from './asn1';

const MAX_TEXT = 10 * 1024 * 1024; // generic tool input cap
const requireString = (v: unknown, name: string, max = MAX_TEXT): string => {
    if (typeof v !== 'string') throw new Error(`${name} must be a string`);
    if (v.length > max) throw new Error(`${name} is too large`);
    return v;
};
const clampNum = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (v: unknown): string | undefined => (typeof v === 'string' && COLOR_RE.test(v) ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(v as T) ? (v as T) : undefined;
/** Drop undefined keys so library defaults apply. */
const defined = <T extends Record<string, unknown>>(o: T): Partial<T> =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ── Hashes ──────────────────────────────────────────────────────────────────
export type HashAlgo = 'md5' | 'sha1' | 'sha256' | 'sha512';
const HASHERS = { md5: createMD5, sha1: createSHA1, sha256: createSHA256, sha512: createSHA512 } as const;

async function digest(algo: HashAlgo, data: string | Uint8Array): Promise<string> {
    const make = HASHERS[algo];
    if (!make) throw new Error('Unsupported hash algorithm');
    const h = await make();
    h.init();
    h.update(data);
    return h.digest('hex');
}

/** Hex digest of the UTF-8 encoding of `text`. */
export const hashText = (algo: HashAlgo, text: string): Promise<string> =>
    digest(algo, requireString(text, 'Hash input'));

// ── X.509 ───────────────────────────────────────────────────────────────────
export interface X509Decoded {
    subject: string;
    issuer: string;
    notBefore: string;
    notAfter: string;
    serialNumber: string;
    signatureAlgorithm: string;
    fingerprint: { sha1: string; sha256: string };
}

// Short names as printed by OpenSSL (what v0.2.1 showed via Node's X509Certificate).
const DN_NAMES: Record<string, string> = {
    '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.9': 'street', '2.5.4.10': 'O', '2.5.4.11': 'OU',
    '2.5.4.5': 'serialNumber', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.12': 'title', '2.5.4.17': 'postalCode',
    '2.5.4.46': 'dnQualifier', '2.5.4.65': 'pseudonym', '2.5.4.97': 'organizationIdentifier',
    '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC', '0.9.2342.19200300.100.1.1': 'UID',
    '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC', '2.5.4.15': 'businessCategory',
};

/** RFC 2253-style value escaping, as OpenSSL does for Node's subject strings. */
function escapeDnValue(v: string): string {
    let s = v.replace(/[\\,+"<>;]/g, '\\$&');
    if (/^[ #]/.test(s)) s = '\\' + s;
    if (s.endsWith(' ') && s.length > 1) s = s.slice(0, -1) + '\\ ';
    return s;
}

function formatName(seq: Asn1): string {
    const rdns: string[] = [];
    for (const rdn of seq.children ?? []) {
        const atvs: string[] = [];
        for (const atv of rdn.children ?? []) {
            const [oid, val] = atv.children ?? [];
            if (!oid || !val) continue;
            const o = readOid(oid.content);
            atvs.push(`${DN_NAMES[o] ?? o}=${escapeDnValue(readString(val))}`);
        }
        if (atvs.length) rdns.push(atvs.join(' + '));
    }
    return rdns.join(', ');
}

function readTime(n: Asn1): string {
    const s = new TextDecoder().decode(n.content);
    const m = n.num === 23
        ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s)
        : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s);
    if (!m) throw new Error('Unsupported time format');
    let year = Number(m[1]);
    if (n.num === 23) year += year >= 50 ? 1900 : 2000;
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))).toISOString();
}

export async function decodeX509(cert: string): Promise<X509Decoded> {
    const pem = requireString(cert, 'Certificate', 1024 * 1024);
    try {
        const { der } = pemToDer(pem, 'CERTIFICATE');
        const root = parseDer(der);
        if (root.bytes.length !== der.length) throw new Error('Trailing data after certificate');
        const [tbs, sigAlg] = root.children ?? [];
        if (!tbs?.children || !sigAlg?.children?.[0]) throw new Error('Not an X.509 certificate');
        let i = tbs.children[0]?.cls === 2 && tbs.children[0].num === 0 ? 1 : 0; // optional [0] version
        const serial = tbs.children[i++];
        i++; // signature
        const issuer = tbs.children[i++];
        const validity = tbs.children[i++];
        const subject = tbs.children[i++];
        const [nb, na] = validity?.children ?? [];
        if (!serial || serial.num !== 2 || !issuer || !subject || !nb || !na) throw new Error('Not an X.509 certificate');
        const [sha1, sha256] = await Promise.all([digest('sha1', der), digest('sha256', der)]);
        return {
            subject: formatName(subject),
            issuer: formatName(issuer),
            notBefore: readTime(nb),
            notAfter: readTime(na),
            serialNumber: intHex(serial).toLowerCase(),
            signatureAlgorithm: readOid(sigAlg.children[0].content),
            fingerprint: { sha1, sha256 },
        };
    } catch (e) {
        throw new Error('Invalid certificate: ' + (e instanceof Error ? e.message : String(e)));
    }
}

// ── QR code ─────────────────────────────────────────────────────────────────
export interface QRCodeGenerateOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
    width?: number;
    color?: { dark?: string; light?: string };
}

const QR_MAX_TEXT = 4296; // max alphanumeric capacity of a version-40 QR code
export async function generateQr(text: string, options: QRCodeGenerateOptions = {}): Promise<string> {
    const t = requireString(text, 'QR text', QR_MAX_TEXT);
    const o = (options ?? {}) as Record<string, unknown>;
    const c = (o.color && typeof o.color === 'object' ? o.color : {}) as Record<string, unknown>;
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(t, {
        errorCorrectionLevel: oneOf(o.errorCorrectionLevel, ['L', 'M', 'Q', 'H'] as const) ?? 'M',
        margin: clampNum(o.margin, 0, 16) ?? 4,
        ...defined({ scale: clampNum(o.scale, 1, 32), width: clampNum(o.width, 32, 2048) }),
        color: defined({ dark: color(c.dark), light: color(c.light) }),
    });
}

// ── Barcode ─────────────────────────────────────────────────────────────────
export interface BarcodeGenerateOptions {
    format?: string; width?: number; height?: number; displayValue?: boolean; fontSize?: number;
    textAlign?: 'left' | 'center' | 'right'; textPosition?: 'bottom' | 'top'; textMargin?: number;
    background?: string; lineColor?: string; margin?: number;
    marginTop?: number; marginBottom?: number; marginLeft?: number; marginRight?: number;
}

const BARCODE_FORMATS = [
    'CODE128', 'CODE128A', 'CODE128B', 'CODE128C', 'EAN13', 'EAN8', 'EAN5', 'EAN2', 'UPC', 'UPCE',
    'CODE39', 'ITF', 'ITF14', 'MSI', 'MSI10', 'MSI11', 'MSI1010', 'MSI1110', 'pharmacode', 'codabar',
] as const;

/** Barcode as an SVG string. Uses an XML document (not the page DOM) so output is deterministic. */
export async function generateBarcode(text: string, options: BarcodeGenerateOptions = {}): Promise<string> {
    const t = requireString(text, 'Barcode text', 512);
    const o = (options ?? {}) as Record<string, unknown>;
    const [{ default: JsBarcode }, { DOMImplementation, XMLSerializer }] = await Promise.all([import('jsbarcode'), import('@xmldom/xmldom')]);
    try {
        const doc = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
        const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svgNode, t, {
            xmlDocument: doc,
            ...defined({
                format: oneOf(o.format, BARCODE_FORMATS),
                width: clampNum(o.width, 1, 10),
                height: clampNum(o.height, 10, 500),
                displayValue: typeof o.displayValue === 'boolean' ? o.displayValue : undefined,
                fontSize: clampNum(o.fontSize, 6, 72),
                textAlign: oneOf(o.textAlign, ['left', 'center', 'right'] as const),
                textPosition: oneOf(o.textPosition, ['bottom', 'top'] as const),
                textMargin: clampNum(o.textMargin, 0, 50),
                background: color(o.background),
                lineColor: color(o.lineColor),
                margin: clampNum(o.margin, 0, 100),
                marginTop: clampNum(o.marginTop, 0, 100),
                marginBottom: clampNum(o.marginBottom, 0, 100),
                marginLeft: clampNum(o.marginLeft, 0, 100),
                marginRight: clampNum(o.marginRight, 0, 100),
            }),
        } as unknown as Parameters<typeof JsBarcode>[2]);
        return new XMLSerializer().serializeToString(svgNode);
    } catch (error) {
        throw new Error(`Failed to generate barcode: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// ── SVG ─────────────────────────────────────────────────────────────────────
export async function optimizeSvg(svg: string): Promise<string> {
    const input = requireString(svg, 'SVG', 20 * 1024 * 1024);
    const { optimize } = await import('svgo/dist/svgo.browser.js');
    return optimize(input).data;
}

