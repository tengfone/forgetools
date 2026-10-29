// Golden parity: webview implementations must reproduce the v0.2.1 main-process outputs.
import { describe, it, expect } from 'vitest';
import golden from '../fixtures/golden-v0.2.1.json';
import { hashText, decodeX509, generateQr, generateBarcode, optimizeSvg, type HashAlgo } from '../../src/renderer/src/tools/lib/media';

type G = {
    hash: Array<Record<'text' | HashAlgo, string>>;
    x509: Record<string, { pem: string; decoded: unknown }>;
    qrcode: Array<{ text: string; options: object; dataUrl: string }>;
    barcode: Array<{ text: string; options: object; svg: string }>;
    svg: Array<{ input: string; output: string }>;
};
const g = golden as unknown as G;

describe('golden parity v0.2.1', () => {
    it('hashes', async () => {
        for (const h of g.hash) for (const a of ['md5', 'sha1', 'sha256', 'sha512'] as const) {
            expect(await hashText(a, h.text)).toBe(h[a]);
        }
    });
    it('x509', async () => {
        for (const [name, c] of Object.entries(g.x509)) {
            expect(await decodeX509(c.pem), name).toEqual(c.decoded);
        }
        await expect(decodeX509('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).rejects.toThrow(/^Invalid certificate: /);
    });
    it('qrcode', async () => {
        for (const q of g.qrcode) expect(await generateQr(q.text, q.options)).toBe(q.dataUrl);
    });
    it('barcode', async () => {
        for (const b of g.barcode) expect(await generateBarcode(b.text, b.options)).toBe(b.svg);
    });
    it('svg', async () => {
        for (const s of g.svg) expect(await optimizeSvg(s.input)).toBe(s.output);
    });
});
