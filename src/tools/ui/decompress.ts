import { textTool } from './textTool';
import { autoDecompress, compress } from '../lib/crypto';
import { bytesToBase64, bytesToHex, hexOrBase64ToBytes, toUtf8, tryUtf8 } from '../lib/bytes';

export const render = textTool({
  prefix: 'gz',
  inputLabel: 'Input',
  outputLabel: 'Output',
  options: [
    {
      id: 'dir',
      label: 'Mode',
      choices: [
        ['de', 'Decompress (Base64/hex in)'],
        ['gzip', 'Gzip → Base64'],
        ['deflate', 'Zlib → Base64'],
        ['deflate-raw', 'Raw deflate → Base64'],
      ],
    },
  ],
  sample: { input: 'H4sIAAAAAAAACvNIzcnJVyjPL8pJAQBSntaLCwAAAA==', options: { dir: 'de' } },
  run: async (s, v) => {
    if (v.dir !== 'de') return bytesToBase64(await compress(toUtf8(s), v.dir as 'gzip'));
    const r = await autoDecompress(hexOrBase64ToBytes(s));
    return tryUtf8(r.data) ?? `(binary, ${r.data.length} bytes, hex)\n${bytesToHex(r.data)}`;
  },
  okMessage: (o, _i, v) => (v.dir === 'de' ? 'Decompressed' : `${o.length} Base64 chars`),
});
