// Per-tool help: one-line tip plus an optional syntax/reference table.
// Kept apart from the registry so it is only parsed when a popover opens.

export interface ToolHelp {
  tip: string;
  rows?: Array<[string, string]>;
}

const HELP: Record<string, ToolHelp> = {
  json: { tip: 'Paste JSON; errors show line and column in the status bar. Trailing commas and comments are not valid JSON.' },
  xml: { tip: 'Re-indents well-formed XML using the indent size you choose (default 2 spaces). It does not validate against a schema.' },
  sql: { tip: 'Uppercases keywords, puts each clause (SELECT, FROM, JOIN, WHERE…) on its own line, indents AND/OR, column lists and subqueries. Strings and comments are left untouched. It does not validate SQL.' },
  html: { tip: 'Re-indents HTML; inline scripts and styles are formatted too.' },
  htmlJsx: { tip: 'Converts class→className, for→htmlFor, inline styles to objects, and self-closes void tags.' },
  markdownToHtml: { tip: 'GitHub-flavoured Markdown: tables, fenced code and task lists are supported.' },
  markdownPreview: { tip: 'Live preview as you type. Rendering happens locally; images with remote URLs will not load offline.' },
  base64: { tip: 'Decoding accepts standard and URL-safe Base64 (- and _), with or without = padding.' },
  url: { tip: 'Uses encodeURIComponent, so / ? & = are escaped. Decode reverses any percent-encoding.' },
  hexAscii: { tip: 'Type in either box; the other updates live. Spaces between bytes are fine and other non-hex characters are stripped, so remove 0x prefixes first. Each byte pair becomes one character.' },
  certificate: { tip: 'Paste a PEM block including the BEGIN/END CERTIFICATE lines. Nothing is sent anywhere; decoding is local.' },
  csvJson: { tip: 'The first CSV row is treated as headers. JSON → CSV expects an array of flat objects.' },
  jwt: {
    tip: 'Decodes the base64url header and payload locally. The signature is shown but not verified.',
    rows: [['exp', 'expiry (Unix seconds)'], ['iat', 'issued at'], ['nbf', 'not valid before'], ['sub', 'subject'], ['aud', 'audience']],
  },
  timestamp: { tip: 'Accepts Unix seconds or milliseconds; 13-digit values are detected as milliseconds automatically.' },
  color: { tip: 'Type into any field or paste a hex value; every format and code preset updates together.' },
  uuid: { tip: 'Paste a UUID or ULID to inspect it. ULIDs embed a millisecond timestamp; UUID v4 is fully random.' },
  qrcode: { tip: 'Larger sizes scan more reliably when printed. Long text makes denser codes that are harder to scan; shorten URLs where you can.' },
  hash: { tip: 'MD5 and SHA-1 are fine for checksums but broken for security. Use SHA-256 or SHA-512 for integrity.' },
  stringCase: { tip: 'Splits on spaces, dashes, underscores and camelCase boundaries before converting.' },
  stringInspector: { tip: 'Bytes are counted as UTF-8, so emoji and accented letters count as more than one.' },
  cronParser: {
    tip: 'Five fields: minute hour day-of-month month day-of-week.',
    rows: [['*', 'every value'], ['*/15', 'every 15th'], ['1-5', 'range'], ['1,15', 'list'], ['0 9 * * 1-5', '09:00 on weekdays'], ['0 0 1 * *', 'midnight, 1st of month']],
  },
  textDiff: { tip: 'Line mode for code, Word for prose, Character for small edits. Swap reverses which side is "original".' },
  loremIpsum: { tip: 'Generates placeholder paragraphs, sentences or words. Click Copy (or Ctrl/Cmd+Shift+C) to grab it all.' },
  regexTester: {
    tip: 'JavaScript regex syntax. Toggle flags with the checkboxes (including s, dotAll). Hover a highlighted match to see its capture groups.',
    rows: [['\\d \\w \\s', 'digit, word char, whitespace'], ['^ $', 'line start / end (with m flag)'], ['(…) (?<n>…)', 'group / named group'], ['a+? a*?', 'lazy quantifiers'], ['(?=…) (?!…)', 'lookahead / negative'], ['g i m s', 'global, ignore case, multiline, dotAll']],
  },
  yamlFormatter: { tip: 'Validates YAML as you type and shows it as formatted JSON. Indentation must use spaces, never tabs.' },
  numberBaseConverter: { tip: 'Type in any field. Only digits valid for that base are accepted; hex is case-insensitive.' },
  backslashEscape: { tip: 'Escape turns newlines, tabs and quotes into \\n, \\t, \\". Toggle the button to unescape.' },
  randomStringGenerator: { tip: 'Uses the system cryptographic RNG, so output is safe for passwords and tokens. Click a string to copy it.' },
  imageToBase64: { tip: 'Drop an image or click to choose one. Large images make very long data URLs; prefer files over ~50 KB as assets.' },
  svgOptimizer: { tip: 'Runs SVGO locally: strips metadata, comments and redundant attributes without changing rendering.' },
  barcodeGenerator: {
    tip: 'Each format accepts different input; the status bar tells you what is wrong before generating.',
    rows: [['EAN-13', '12 or 13 digits'], ['UPC', '11 or 12 digits'], ['CODE128', 'any ASCII'], ['CODE39', 'A–Z, 0–9, - . $ / + % space']],
  },
};

/** Shown for every tool, below the tool-specific tip. */
export const GENERAL_TIP = 'Ctrl/Cmd+Shift+C copies the tool output.';

export const getHelp = (id: string): ToolHelp | undefined => HELP[id];
