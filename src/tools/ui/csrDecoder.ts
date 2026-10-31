import { textTool, jsonBytes } from './textTool';
import { decodeCsr } from '../lib/crypto';
import { SAMPLE_CSR_EC } from '../lib/samples';

export const render = textTool({
  prefix: 'csr',
  inputLabel: 'CSR (PEM)',
  outputLabel: 'Decoded',
  sample: { input: SAMPLE_CSR_EC },
  run: (s) => {
    const c = decodeCsr(s);
    return `Subject:     ${c.subject}\nKey:         ${c.keyAlgorithm}${c.keySize ? ` ${c.keySize}-bit` : ''}${c.curve ? ` (${c.curve})` : ''}\nSignature:   ${c.signatureAlgorithm}\nSANs:        ${c.san.length ? c.san.join(', ') : '(none)'}\n\nPublic key (JWK):\n${jsonBytes(c.publicKeyJwk)}`;
  },
});
