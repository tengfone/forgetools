import { textTool, jsonBytes } from './textTool';
import { decodeProtobuf, decodeMsgpack, encodeMsgpack } from '../lib/convert';
import { parseJsonLabeled } from '../lib/json';
import { bytesToBase64, bytesToHex, hexOrBase64ToBytes } from '../lib/bytes';

export const render = textTool({
  prefix: 'bin',
  inputLabel: 'Bytes (hex or Base64) or JSON',
  outputLabel: 'Decoded',
  options: [
    {
      id: 'fmt',
      label: 'Format',
      choices: [
        ['protobuf', 'Protobuf (schema-less)'],
        ['msgpack', 'MessagePack → JSON'],
        ['tomsgpack', 'JSON → MessagePack'],
      ],
    },
  ],
  sample: { input: '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 c8 01', options: { fmt: 'protobuf' } },
  run: (s, v) => {
    if (v.fmt === 'tomsgpack') {
      const b = encodeMsgpack(parseJsonLabeled(s, 'JSON'));
      return `Hex:\n${bytesToHex(b)}\n\nBase64:\n${bytesToBase64(b)}`;
    }
    const b = hexOrBase64ToBytes(s);
    return jsonBytes(v.fmt === 'msgpack' ? decodeMsgpack(b) : decodeProtobuf(b));
  },
});
