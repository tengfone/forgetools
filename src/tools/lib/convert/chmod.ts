// Unix permission bits (octal and symbolic).

export interface ChmodInfo {
  octal: string;
  symbolic: string;
  command: string;
  description: string[];
}

const WHO = ['Owner', 'Group', 'Others'];

export function parseChmod(input: string): ChmodInfo {
  const s = input.trim();
  let bits: number;
  if (/^[0-7]{3,4}$/.test(s)) bits = parseInt(s, 8);
  else {
    const sym = s.replace(/^[-dlcbps]/, (m) => (s.length === 10 ? '' : m));
    if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(sym))
      throw new Error('Use octal (755, 0644) or symbolic (rwxr-xr-x, -rw-r--r--)');
    bits = 0;
    for (let i = 0; i < 9; i++) {
      const c = sym[i]!;
      if (c !== '-' && c !== 'S' && c !== 'T') bits |= 1 << (8 - i);
    }
    if (/[sS]/.test(sym[2]!)) bits |= 0o4000;
    if (/[sS]/.test(sym[5]!)) bits |= 0o2000;
    if (/[tT]/.test(sym[8]!)) bits |= 0o1000;
  }
  return chmodFromBits(bits);
}

export function chmodFromBits(bits: number): ChmodInfo {
  const special = (bits >> 9) & 7;
  let sym = '';
  for (let w = 0; w < 3; w++) {
    const p = (bits >> (6 - w * 3)) & 7;
    sym += p & 4 ? 'r' : '-';
    sym += p & 2 ? 'w' : '-';
    const x = !!(p & 1);
    const sp = w === 0 ? special & 4 : w === 1 ? special & 2 : special & 1;
    sym += sp ? (w === 2 ? (x ? 't' : 'T') : x ? 's' : 'S') : x ? 'x' : '-';
  }
  const octal = (special ? special.toString() : '') + (bits & 0o777).toString(8).padStart(3, '0');
  const description = WHO.map((who, w) => {
    const p = (bits >> (6 - w * 3)) & 7;
    const names = [p & 4 && 'read', p & 2 && 'write', p & 1 && 'execute'].filter(Boolean);
    return `${who}: ${names.length ? names.join(', ') : 'no access'}`;
  });
  if (special & 4) description.push('setuid: runs as the file owner');
  if (special & 2) description.push('setgid: runs as the group / new files inherit group');
  if (special & 1) description.push('sticky: only owners can delete files in this directory');
  return { octal, symbolic: sym, command: `chmod ${octal} <file>`, description };
}
