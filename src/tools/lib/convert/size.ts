// Data size unit conversion.

export const SIZE_UNITS: Array<[string, number]> = [
  ['B', 1],
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
  ['PB', 1e15],
  ['KiB', 1024],
  ['MiB', 1024 ** 2],
  ['GiB', 1024 ** 3],
  ['TiB', 1024 ** 4],
  ['PiB', 1024 ** 5],
  ['bit', 1 / 8],
  ['Kbit', 1e3 / 8],
  ['Mbit', 1e6 / 8],
  ['Gbit', 1e9 / 8],
];

export function parseSize(input: string): number {
  const m = /^\s*([\d.,_]+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(input);
  if (!m) throw new Error('Enter a size like 1.5 GB, 512MiB or 1024');
  const n = parseFloat(m[1]!.replace(/[,_]/g, ''));
  if (!Number.isFinite(n)) throw new Error('Not a number');
  const u = m[2]!;
  if (!u) return n;
  const unit =
    SIZE_UNITS.find(([k]) => k === u) ??
    SIZE_UNITS.find(([k]) => k.toLowerCase() === u.toLowerCase()) ??
    (/^[kmgtp]$/i.test(u) ? SIZE_UNITS.find(([k]) => k === u.toUpperCase() + 'B') : undefined);
  if (!unit) throw new Error(`Unknown unit "${u}"`);
  return n * unit[1];
}

export function formatSizeNum(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6) return n.toExponential(4);
  return parseFloat(n.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function convertSize(input: string): Array<[string, string]> {
  const bytes = parseSize(input);
  return SIZE_UNITS.map(([u, f]) => [u, formatSizeNum(bytes / f)]);
}
