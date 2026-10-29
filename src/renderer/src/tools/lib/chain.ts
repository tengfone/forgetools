// Tool chaining: a pipeline of text -> text steps run in order.
import { base64ToBytes, bytesToBase64, bytesToHex, fromUtf8, hexToBytes, toUtf8, tryUtf8 } from './bytes';

/** Decoded bytes must be text: lossy U+FFFD replacement would silently corrupt binary data. */
const text = (b: Uint8Array): string => {
    const s = tryUtf8(b);
    if (s === null) throw new Error('Not UTF-8 text (binary data); keep it encoded, e.g. as Base64 or hex');
    return s;
};
import { autoDecompress, compress } from './crypto';
import { jsonToYaml, yamlToJson } from './json';
import { tomlToJson } from './convert';

export interface ChainOp { id: string; label: string; run: (input: string) => string | Promise<string> }

const sha = async (algo: 'SHA-1' | 'SHA-256' | 'SHA-512', s: string): Promise<string> =>
    bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest(algo, toUtf8(s) as BufferSource)));

export const CHAIN_OPS: ChainOp[] = [
    { id: 'b64enc', label: 'Base64 encode', run: s => bytesToBase64(toUtf8(s)) },
    { id: 'b64dec', label: 'Base64 decode', run: s => text(base64ToBytes(s)) },
    { id: 'urlenc', label: 'URL encode', run: s => encodeURIComponent(s) },
    { id: 'urldec', label: 'URL decode', run: s => decodeURIComponent(s.replace(/\+/g, ' ')) },
    { id: 'hexenc', label: 'Text → hex', run: s => bytesToHex(toUtf8(s)) },
    { id: 'hexdec', label: 'Hex → text', run: s => text(hexToBytes(s)) },
    { id: 'inflate', label: 'Base64 → inflate (gzip/zlib/deflate)', run: async s => text((await autoDecompress(base64ToBytes(s))).data) },
    { id: 'gzip', label: 'Gzip → Base64', run: async s => bytesToBase64(await compress(toUtf8(s), 'gzip')) },
    { id: 'jsonfmt', label: 'JSON format', run: s => JSON.stringify(JSON.parse(s), null, 2) },
    { id: 'jsonmin', label: 'JSON minify', run: s => JSON.stringify(JSON.parse(s)) },
    { id: 'jsonstr', label: 'JSON string → value (unescape)', run: s => { const v = JSON.parse(s); return typeof v === 'string' ? v : JSON.stringify(v); } },
    { id: 'tojsonstr', label: 'Value → JSON string (escape)', run: s => JSON.stringify(s) },
    { id: 'json2yaml', label: 'JSON → YAML', run: s => jsonToYaml(s) },
    { id: 'yaml2json', label: 'YAML → JSON', run: s => yamlToJson(s) },
    { id: 'toml2json', label: 'TOML → JSON', run: s => tomlToJson(s) },
    { id: 'jwtpayload', label: 'JWT → payload', run: s => { const p = s.trim().split('.'); if (p.length < 2) throw new Error('Not a JWT'); return JSON.stringify(JSON.parse(fromUtf8(base64ToBytes(p[1]!))), null, 2); } },
    { id: 'trim', label: 'Trim whitespace', run: s => s.trim() },
    { id: 'upper', label: 'UPPER CASE', run: s => s.toUpperCase() },
    { id: 'lower', label: 'lower case', run: s => s.toLowerCase() },
    { id: 'reverse', label: 'Reverse', run: s => Array.from(new Intl.Segmenter().segment(s), g => g.segment).reverse().join('') },
    { id: 'sortlines', label: 'Sort lines', run: s => s.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join('\n') },
    { id: 'uniqlines', label: 'Unique lines', run: s => [...new Set(s.split(/\r?\n/))].join('\n') },
    { id: 'sha1', label: 'SHA-1', run: s => sha('SHA-1', s) },
    { id: 'sha256', label: 'SHA-256', run: s => sha('SHA-256', s) },
    { id: 'sha512', label: 'SHA-512', run: s => sha('SHA-512', s) },
];

export interface ChainStep { op: string; output?: string; error?: string }

export async function runChain(input: string, ops: string[]): Promise<{ steps: ChainStep[]; output: string }> {
    let cur = input;
    const steps: ChainStep[] = [];
    for (const id of ops) {
        const op = CHAIN_OPS.find(o => o.id === id);
        if (!op) { steps.push({ op: id, error: `Unknown step "${id}"` }); break; }
        try {
            cur = await op.run(cur);
            steps.push({ op: id, output: cur });
        } catch (e) {
            steps.push({ op: id, error: `${op.label}: ${(e as Error).message}` });
            return { steps, output: cur };
        }
    }
    return { steps, output: cur };
}

/** Pre-built recipes shown as one-click presets. */
export const CHAIN_RECIPES: Array<{ label: string; ops: string[] }> = [
    { label: 'Base64 → inflate → JSON', ops: ['inflate', 'jsonfmt'] },
    { label: 'URL decode → Base64 decode', ops: ['urldec', 'b64dec'] },
    { label: 'JWT payload → YAML', ops: ['jwtpayload', 'json2yaml'] },
    { label: 'JSON → minify → Base64', ops: ['jsonmin', 'b64enc'] },
];

