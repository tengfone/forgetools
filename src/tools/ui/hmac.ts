import { textTool } from './textTool';
import { hmacAll, hmacVerify, decodeKey, type HmacAlgo } from '../lib/crypto';

export const render = textTool({
  prefix: 'hmac',
  inputLabel: 'Message',
  outputLabel: 'HMAC',
  options: [
    {
      id: 'algo',
      label: 'Algorithm',
      choices: [
        ['sha256', 'SHA-256'],
        ['sha384', 'SHA-384'],
        ['sha512', 'SHA-512'],
        ['sha1', 'SHA-1'],
        ['md5', 'MD5'],
        ['sha3-256', 'SHA3-256'],
      ],
    },
    {
      id: 'enc',
      label: 'Key encoding',
      choices: [
        ['utf8', 'Text'],
        ['hex', 'Hex'],
        ['base64', 'Base64'],
      ],
    },
  ],
  fields: [
    { id: 'key', label: 'Secret key', default: '' },
    { id: 'verify', label: 'Signature to verify (optional)', placeholder: 'hex, base64 or sha256=…' },
  ],
  sample: { input: 'what do ya want for nothing?', fields: { key: 'Jefe' } },
  run: async (s, v) => {
    const key = decodeKey(v.key ?? '', v.enc as 'utf8');
    const r = await hmacAll(s, key, v.algo as HmacAlgo);
    let out = `Hex:        ${r.hex}\nBase64:     ${r.base64}\nBase64url:  ${r.base64url}`;
    if (v.verify?.trim())
      out += `\n\nVerify:     ${(await hmacVerify(s, key, v.algo as HmacAlgo, v.verify)) ? 'MATCH ✓' : 'MISMATCH ✗'}`;
    return out;
  },
});
