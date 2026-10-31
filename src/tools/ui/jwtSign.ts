import { textTool } from './textTool';
import { signJwt, type JwtAlg } from '../lib/crypto';
import { parseJsonLabeled } from '../lib/json';

export const render = textTool({
  prefix: 'jws',
  inputLabel: 'Payload (JSON)',
  outputLabel: 'Signed JWT',
  outputRows: 8,
  options: [
    {
      id: 'alg',
      label: 'Algorithm',
      choices: ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384', 'EdDSA', 'none'].map(
        (a) => [a, a] as [string, string],
      ),
    },
  ],
  fields: [
    { id: 'secret', label: 'Secret (HS*) or private key PEM', rows: 4 },
    { id: 'header', label: 'Extra header fields (JSON, optional)', placeholder: '{"kid":"key-1"}' },
  ],
  sample: {
    input: '{"sub":"1234567890","name":"John Doe","iat":1516239022}',
    fields: { secret: 'your-256-bit-secret' },
    options: { alg: 'HS256' },
  },
  run: (s, v) =>
    signJwt(
      { typ: 'JWT', ...(v.header?.trim() ? (parseJsonLabeled(v.header, 'Header') as object) : {}) },
      parseJsonLabeled(s, 'Payload'),
      v.alg as JwtAlg,
      v.secret ?? '',
    ),
});
