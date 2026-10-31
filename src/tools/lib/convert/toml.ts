// TOML <-> JSON.
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

export function tomlToJson(src: string, indent = 2): string {
  try {
    return JSON.stringify(
      parseToml(src),
      (_k, v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v),
      indent,
    );
  } catch (e) {
    throw new Error('Invalid TOML: ' + (e as Error).message.split('\n')[0]);
  }
}

export function jsonToToml(json: string): string {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('Invalid JSON: ' + (e as Error).message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('TOML needs a top-level JSON object');
  if (containsNull(data)) throw new Error('TOML has no null: remove null values first');
  return stringifyToml(data);
}

const containsNull = (v: unknown): boolean =>
  v === null || (typeof v === 'object' && Object.values(v).some(containsNull));
