// MessagePack decode/encode.
import { bytesToHex, fromUtf8 } from '../bytes';
import { vnum } from './shared';

export function decodeMsgpack(b: Uint8Array): unknown {
  const p = { i: 0 };
  const v = readMp(b, p);
  if (p.i !== b.length) {
    const rest: unknown[] = [v];
    while (p.i < b.length) rest.push(readMp(b, p));
    return rest;
  }
  return v;
}

function readMp(b: Uint8Array, p: { i: number }): unknown {
  if (p.i >= b.length) throw new Error('Unexpected end of MessagePack data');
  const t = b[p.i++]!;
  const dv = new DataView(b.buffer, b.byteOffset);
  const need = (n: number): void => {
    if (p.i + n > b.length) throw new Error('Unexpected end of MessagePack data');
  };
  const u = (n: 1 | 2 | 4 | 8): number | string => {
    need(n);
    const at = p.i;
    p.i += n;
    return n === 1
      ? dv.getUint8(at)
      : n === 2
        ? dv.getUint16(at)
        : n === 4
          ? dv.getUint32(at)
          : vnum(dv.getBigUint64(at));
  };
  const i = (n: 1 | 2 | 4 | 8): number | string => {
    need(n);
    const at = p.i;
    p.i += n;
    return n === 1 ? dv.getInt8(at) : n === 2 ? dv.getInt16(at) : n === 4 ? dv.getInt32(at) : vnum(dv.getBigInt64(at));
  };
  const str = (n: number): string => {
    need(n);
    const s = fromUtf8(b.subarray(p.i, p.i + n));
    p.i += n;
    return s;
  };
  const bin = (n: number): { bin: string } => {
    need(n);
    const s = bytesToHex(b.subarray(p.i, p.i + n));
    p.i += n;
    return { bin: s };
  };
  const arr = (n: number): unknown[] => Array.from({ length: n }, () => readMp(b, p));
  const map = (n: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {};
    for (let k = 0; k < n; k++) {
      const key = readMp(b, p);
      o[typeof key === 'string' ? key : JSON.stringify(key)] = readMp(b, p);
    }
    return o;
  };
  const ext = (n: number): { ext: number; data: string } => {
    need(1 + n);
    const type = dv.getInt8(p.i++);
    const data = bytesToHex(b.subarray(p.i, p.i + n));
    p.i += n;
    return { ext: type, data };
  };
  if (t <= 0x7f) return t;
  if (t >= 0xe0) return t - 256;
  if ((t & 0xf0) === 0x80) return map(t & 0x0f);
  if ((t & 0xf0) === 0x90) return arr(t & 0x0f);
  if ((t & 0xe0) === 0xa0) return str(t & 0x1f);
  switch (t) {
    case 0xc0:
      return null;
    case 0xc2:
      return false;
    case 0xc3:
      return true;
    case 0xc4:
      return bin(u(1) as number);
    case 0xc5:
      return bin(u(2) as number);
    case 0xc6:
      return bin(u(4) as number);
    case 0xc7:
      return ext(u(1) as number);
    case 0xc8:
      return ext(u(2) as number);
    case 0xc9:
      return ext(u(4) as number);
    case 0xca: {
      need(4);
      const v = dv.getFloat32(p.i);
      p.i += 4;
      return v;
    }
    case 0xcb: {
      need(8);
      const v = dv.getFloat64(p.i);
      p.i += 8;
      return v;
    }
    case 0xcc:
      return u(1);
    case 0xcd:
      return u(2);
    case 0xce:
      return u(4);
    case 0xcf:
      return u(8);
    case 0xd0:
      return i(1);
    case 0xd1:
      return i(2);
    case 0xd2:
      return i(4);
    case 0xd3:
      return i(8);
    case 0xd4:
      return ext(1);
    case 0xd5:
      return ext(2);
    case 0xd6:
      return ext(4);
    case 0xd7:
      return ext(8);
    case 0xd8:
      return ext(16);
    case 0xd9:
      return str(u(1) as number);
    case 0xda:
      return str(u(2) as number);
    case 0xdb:
      return str(u(4) as number);
    case 0xdc:
      return arr(u(2) as number);
    case 0xdd:
      return arr(u(4) as number);
    case 0xde:
      return map(u(2) as number);
    case 0xdf:
      return map(u(4) as number);
  }
  throw new Error(`Invalid MessagePack type byte 0x${t.toString(16)} at ${p.i - 1}`);
}

export function encodeMsgpack(v: unknown): Uint8Array {
  const out: number[] = [];
  const w16 = (n: number): void => {
    out.push(n >> 8, n & 255);
  };
  const w32 = (n: number): void => {
    out.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  };
  const enc = (x: unknown): void => {
    if (x === null || x === undefined) out.push(0xc0);
    else if (x === false) out.push(0xc2);
    else if (x === true) out.push(0xc3);
    else if (typeof x === 'number') {
      if (Number.isInteger(x) && x >= 0 && x < 128) out.push(x);
      else if (Number.isInteger(x) && x < 0 && x >= -32) out.push(x & 0xff);
      else if (Number.isInteger(x) && x >= 0 && x <= 0xffffffff) {
        if (x < 256) out.push(0xcc, x);
        else if (x < 65536) {
          out.push(0xcd);
          w16(x);
        } else {
          out.push(0xce);
          w32(x);
        }
      } else if (Number.isInteger(x) && x >= -0x80000000 && x < 0) {
        out.push(0xd2);
        w32(x >>> 0);
      } else {
        const b = new DataView(new ArrayBuffer(8));
        b.setFloat64(0, x);
        out.push(0xcb, ...new Uint8Array(b.buffer));
      }
    } else if (typeof x === 'string') {
      const b = new TextEncoder().encode(x);
      if (b.length < 32) out.push(0xa0 | b.length);
      else if (b.length < 256) out.push(0xd9, b.length);
      else if (b.length < 65536) {
        out.push(0xda);
        w16(b.length);
      } else {
        out.push(0xdb);
        w32(b.length);
      }
      for (const byte of b) out.push(byte); // a spread push overflows the call stack on large strings
    } else if (Array.isArray(x)) {
      if (x.length < 16) out.push(0x90 | x.length);
      else if (x.length < 65536) {
        out.push(0xdc);
        w16(x.length);
      } else {
        out.push(0xdd);
        w32(x.length);
      }
      x.forEach(enc);
    } else if (typeof x === 'object') {
      const e = Object.entries(x);
      if (e.length < 16) out.push(0x80 | e.length);
      else if (e.length < 65536) {
        out.push(0xde);
        w16(e.length);
      } else {
        out.push(0xdf);
        w32(e.length);
      }
      for (const [k, val] of e) {
        enc(k);
        enc(val);
      }
    } else throw new Error(`Cannot encode ${typeof x}`);
  };
  enc(v);
  return Uint8Array.from(out);
}
