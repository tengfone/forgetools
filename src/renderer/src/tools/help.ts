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
  hexAscii: { tip: 'Type in either box; the other updates live. Text is encoded as UTF-8 bytes. On the hex side, 0x prefixes, whitespace and , : - separators are ignored; any other non-hex character is an error. Each byte pair is one UTF-8 byte.' },
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
  backslashEscape: { tip: 'Escape turns newlines, tabs, quotes and other control characters into \\n, \\t, \\", \\xNN, \\uXXXX. Unescape also understands \\0, \\b, \\f, \\v and \\u{...}. Pick the mode in the Mode menu.' },
  randomStringGenerator: { tip: 'Uses the system cryptographic RNG, so output is safe for passwords and tokens. Click a string to copy it.' },
  imageToBase64: { tip: 'Drop an image or click to choose one. Large images make very long data URLs; prefer files over ~50 KB as assets.' },
  svgOptimizer: { tip: 'Runs SVGO locally: strips metadata, comments and redundant attributes without changing rendering.' },
  barcodeGenerator: {
    tip: 'Each format accepts different input; the status bar tells you what is wrong before generating.',
    rows: [['EAN-13', '12 or 13 digits'], ['UPC', '11 or 12 digits'], ['CODE128', 'any ASCII'], ['CODE39', 'A–Z, 0–9, - . $ / + % space']],
  },
  hmac: { tip: 'Webhook signatures (GitHub, Stripe, Slack) are HMACs of the raw body. Paste the header value into Verify; a sha256= prefix and hex or Base64 are all accepted.' },
  csrDecoder: { tip: 'Paste a PEM block including BEGIN/END CERTIFICATE REQUEST. Shows the subject, key, signature algorithm and SANs.' },
  samlDecoder: { tip: 'Accepts a Base64 SAMLResponse (POST binding) or a full redirect URL with SAMLRequest= (deflated). Signatures are not verified.' },
  urlParser: { tip: 'Shows every URL part and the decoded query parameters. Repeated keys are listed separately.' },
  userAgent: { tip: 'Best-effort parsing of browser, OS and device. Client hints (Sec-CH-UA) are more reliable when available.' },
  cidr: { tip: 'Accepts 10.0.0.0/8, 10.0.0.0 255.0.0.0 or IPv6 like 2001:db8::/48.', rows: [['/32', '1 host'], ['/30', '2 usable'], ['/24', '254 usable'], ['/16', '65,534 usable']] },
  decompress: { tip: 'Paste Base64 or hex. The format (gzip, zlib, raw deflate) is detected from the header bytes.' },
  binaryDecoder: { tip: 'Protobuf without a schema shows field numbers and wire types; length-delimited fields are shown as nested messages when they parse cleanly.' },
  unicodeInspector: { tip: 'Finds zero-width spaces, BOMs, bidi overrides and non-breaking spaces that break code and config files.' },
  dockerfileLint: { tip: 'Rule IDs follow hadolint where they overlap. Info items are suggestions, not errors.' },
  cssJsFormat: { tip: 'JavaScript minification uses Terser (mangle + compress). CSS minification keeps /*! licence */ comments.' },
  graphqlFormat: { tip: 'Uses the reference graphql-js parser and printer, so invalid documents are rejected with the parser error.' },
  jsonYaml: { tip: 'Multi-document YAML (separated by ---) becomes a JSON array.' },
  jsonTypes: { tip: 'Arrays of objects are merged; a field missing from some items becomes optional.' },
  tomlJson: { tip: 'TOML 1.0. Dates become ISO strings in JSON.' },
  envJson: { tip: 'Supports export, quoted values, and # comments. Values are always strings.' },
  pemJwk: { tip: 'Handles RSA, EC (P-256/384/521) and Ed25519 public (SPKI) and private (PKCS#8) keys.' },
  curlConverter: { tip: 'Understands -X, -H, -d/--data*, --json, -F, -u, -k and --compressed.' },
  dockerCompose: { tip: 'Named volumes and external networks are declared at the top level automatically.' },
  chmod: { tip: 'Enter octal (755, 4755) or symbolic (rwxr-xr-x, -rw-r--r--).', rows: [['4', 'read'], ['2', 'write'], ['1', 'execute'], ['4xxx', 'setuid'], ['2xxx', 'setgid'], ['1xxx', 'sticky']] },
  dataSize: { tip: 'KB/MB/GB are decimal (1000); KiB/MiB/GiB are binary (1024). Bits use lowercase "bit".' },
  timezone: { tip: 'A plain "YYYY-MM-DD HH:mm" is read in the "Interpret in zone" zone; ISO strings with an offset and Unix timestamps are absolute.' },
  jsonPath: { tip: 'Supports $, ., .., *, [n], [-1], [a:b], [\'x\',\'y\'] and filters.', rows: [['$..price', 'all prices'], ['$.a[*].b', 'b of every item'], ['[?(@.x > 1)]', 'filter'], ['[?(@.k =~ /re/)]', 'regex filter']] },
  passwordStrength: { tip: 'An estimate based on character pools, patterns and common passwords. Nothing is stored or sent.' },
  passwordHash: { tip: 'Fill in "Existing hash" to verify instead of hashing. bcrypt accepts $2a$, $2b$ and $2y$.' },
  httpStatus: { tip: 'Type a code, a class like 4, or words like "gateway". Click a row to copy it.' },
  cheatSheets: { tip: 'Search across every sheet, or pick one. Click a row to copy the command.' },
  pipeline: { tip: 'Add steps in order, reorder or remove them, or load a recipe. Each step shows its result size; a failing step is marked and the output keeps the last good result.' },
  jwtSign: { tip: 'HS* takes a shared secret; RS/PS/ES/EdDSA take a PKCS#8 private key PEM (generate one with Key Pair Generator).' },
  keyPair: { tip: 'Pick a type and press Generate. Keys are made with WebCrypto on this machine; editing the SSH comment never replaces the key.' },
  fakeData: { tip: 'Toggle the fields you want. Values are random and fictional (example.com domains, 555 phone numbers). Regenerate for new values.' },
  cronBuilder: { tip: 'Pick a frequency; only the fields it uses are shown. The next runs confirm the schedule.' },
  gitignore: { tip: 'Toggle templates to combine them; duplicate lines are removed.' },
  favicon: { tip: 'Type a letter or emoji, or pick an image (cropped to a square). The .ico contains 16, 32 and 48 px images.' },
  jsonDiff: { tip: 'Compares structure, not text: key order is ignored and array items are compared by position.' },
};

/** Shown for every tool, below the tool-specific tip. */
export const GENERAL_TIP = 'Ctrl/Cmd+Shift+C copies the tool output.';

export const getHelp = (id: string): ToolHelp | undefined => HELP[id];
