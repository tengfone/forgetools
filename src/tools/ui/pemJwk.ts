import { textTool, dir, jsonBytes } from './textTool';
import { pemToJwk, jwkToPem } from '../lib/crypto';
import { parseJsonLabeled } from '../lib/json';

export const render = textTool({
  prefix: 'pj',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [{ id: 'dir', label: 'Direction', choices: dir('PEM → JWK', 'JWK → PEM') }],
  sample: {
    input:
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----',
    options: { dir: 'a' },
  },
  run: async (s, v) => (v.dir === 'a' ? jsonBytes(pemToJwk(s)) : jwkToPem(parseJsonLabeled(s, 'JWK') as JsonWebKey)),
});
