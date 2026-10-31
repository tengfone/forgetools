// Schema-less protobuf decoding.
import { bytesToHex, tryUtf8, isPrintable } from '../bytes';
import { vnum } from './shared';

export interface PbField {
  field: number;
  wire: string;
  value: unknown;
}

function readVarint(b: Uint8Array, p: { i: number }): bigint {
  let r = 0n,
    shift = 0n;
  for (;;) {
    if (p.i >= b.length) throw new Error('Truncated varint');
    const x = b[p.i++]!;
    r |= BigInt(x & 0x7f) << shift;
    if (!(x & 0x80)) return r;
    shift += 7n;
    if (shift > 63n) throw new Error('Varint too long');
  }
}

export function decodeProtobuf(b: Uint8Array, depth = 0): PbField[] {
  const out: PbField[] = [];
  const p = { i: 0 };
  while (p.i < b.length) {
    const key = readVarint(b, p);
    const field = Number(key >> 3n),
      wt = Number(key & 7n);
    if (field === 0) throw new Error(`Invalid field number 0 at byte ${p.i}`);
    if (wt === 0) {
      const v = readVarint(b, p);
      const signed = BigInt.asIntN(64, v);
      out.push({
        field,
        wire: 'varint',
        value: signed < 0n ? { uint: v.toString(), int: signed.toString() } : vnum(v),
      });
    } else if (wt === 1) {
      if (p.i + 8 > b.length) throw new Error('Truncated fixed64');
      const dv = new DataView(b.buffer, b.byteOffset + p.i, 8);
      out.push({
        field,
        wire: 'fixed64',
        value: { uint: dv.getBigUint64(0, true).toString(), double: dv.getFloat64(0, true) },
      });
      p.i += 8;
    } else if (wt === 5) {
      if (p.i + 4 > b.length) throw new Error('Truncated fixed32');
      const dv = new DataView(b.buffer, b.byteOffset + p.i, 4);
      out.push({
        field,
        wire: 'fixed32',
        value: { uint: dv.getUint32(0, true), float: Math.fround(dv.getFloat32(0, true)) },
      });
      p.i += 4;
    } else if (wt === 2) {
      const len = Number(readVarint(b, p));
      if (p.i + len > b.length) throw new Error(`Length ${len} at byte ${p.i} runs past the end`);
      const chunk = b.subarray(p.i, p.i + len);
      p.i += len;
      let value: unknown;
      if (depth < 16 && len > 0) {
        try {
          const sub = decodeProtobuf(chunk, depth + 1);
          value = sub.length ? sub : undefined;
        } catch {
          value = undefined;
        }
      }
      if (value === undefined) {
        const s = tryUtf8(chunk);
        value = s !== null && isPrintable(s) ? s : { bytes: bytesToHex(chunk) };
      } else {
        const s = tryUtf8(chunk);
        if (s !== null && isPrintable(s) && /^[\x20-\x7e]+$/.test(s)) value = { string: s, message: value };
      }
      out.push({ field, wire: 'len', value });
    } else throw new Error(`Unsupported wire type ${wt} at byte ${p.i}`);
  }
  return out;
}
