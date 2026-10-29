// Pure string helpers. No dependencies, safe to import anywhere.

/**
 * Split an identifier/phrase into lower-case words: separators (space, _, -, ., /),
 * camelCase boundaries, acronym boundaries (XMLHttp -> xml http); digits stay attached
 * to the preceding word (version2Beta -> version2 beta).
 */
export function splitWords(str: string): string[] {
  return (str.match(/[A-Z]+\d*(?![a-z])|[A-Z]?[a-z]+\d*|\d+/g) ?? [])
    .map((w) => w.toLowerCase());
}
const cap = (w: string): string => (w ? w[0]!.toUpperCase() + w.slice(1) : w);

export const toCamelCase = (s: string): string => splitWords(s).map((w, i) => (i ? cap(w) : w)).join('');
export const toPascalCase = (s: string): string => splitWords(s).map(cap).join('');
export const toSnakeCase = (s: string): string => splitWords(s).join('_');
export const toKebabCase = (s: string): string => splitWords(s).join('-');
export const toConstantCase = (s: string): string => splitWords(s).join('_').toUpperCase();

const utf8Encoder = new TextEncoder();

/** Hex bytes -> text, decoded as UTF-8. */
export function hexToText(hex: string): string {
  const compact = hex.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
  const pairs = compact.match(/[0-9A-Fa-f]{2}/g) ?? [];
  return new TextDecoder('utf-8').decode(Uint8Array.from(pairs, (p) => parseInt(p, 16)));
}

/** Text -> hex of its UTF-8 bytes. */
export const textToHex = (text: string): string =>
  Array.from(utf8Encoder.encode(text), (b) => b.toString(16).padStart(2, '0')).join('');
