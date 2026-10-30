// Local, synchronous heuristics that guess which tool fits a pasted string. Nothing leaves the machine.
import { base64ToBytes } from './tools/lib/bytes';

const decodeBase64UrlText = (s: string): string => new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(s));

const MAX_ANALYSE = 64 * 1024;

export interface Candidate {
  toolId: string;
  label: string;
  confidence: number;
}

const b64urlToText = (s: string): string | null => {
  try {
    return decodeBase64UrlText(s);
  } catch {
    return null;
  }
};

const printableRatio = (s: string): number => {
  if (!s.length) return 0;
  let n = 0,
    total = 0;
  for (const ch of s) {
    total++;
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) n++;
  }
  return n / total;
};

const isJwt = (s: string): boolean => {
  const parts = s.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]*$/.test(p)) || !parts[0] || !parts[1]) return false;
  const h = b64urlToText(parts[0]);
  if (!h) return false;
  try {
    const o: unknown = JSON.parse(h);
    return !!o && typeof o === 'object' && 'alg' in o;
  } catch {
    return false;
  }
};

const isJson = (s: string): boolean => {
  if (!/^[[{]/.test(s)) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

const CRON_FIELD = /^(\*|\?|[0-9A-Za-z]+([-,/][0-9A-Za-z*]+)*|\*\/\d+|[0-9]+[LW#]?[0-9]*)$/;

export function detect(raw: string): Candidate[] {
  const s = raw.slice(0, MAX_ANALYSE).trim();
  if (!s) return [];
  const out: Candidate[] = [];
  const add = (toolId: string, label: string, confidence: number): void => {
    const prev = out.find((c) => c.toolId === toolId);
    if (prev) {
      if (confidence > prev.confidence) Object.assign(prev, { label, confidence });
    } else out.push({ toolId, label, confidence });
  };
  const oneLine = !/\n/.test(s);

  const truncated = raw.length > MAX_ANALYSE;
  const jwt = !truncated && isJwt(s);
  // Large inputs are only sniffed (no full parse) to keep detection cheap.
  const json = truncated ? /^\s*[[{]/.test(raw) && /[\]}]\s*$/.test(raw) : isJson(s);
  if (jwt) add('jwt', 'a JWT', 0.98);
  if (/-----BEGIN CERTIFICATE-----/.test(s)) add('certificate', 'an X.509 certificate', 0.97);
  if (json) add('json', 'JSON', 0.95);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) add('uuid', 'a UUID', 0.96);
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(s)) add('uuid', 'a ULID', 0.85);
  if (/^\d{10}$|^\d{13}$/.test(s)) add('timestamp', 'a Unix timestamp', 0.9);
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) || /^(rgba?|hsla?)\([^)]*\)$/i.test(s))
    add('color', 'a colour', 0.93);
  if (oneLine && /%[0-9A-Fa-f]{2}/.test(s)) add('url', 'URL-encoded text', 0.8);
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|WITH|ALTER|DROP)\b/i.test(s)) add('sql', 'SQL', 0.85);
  if (/^<\?xml|^<svg[\s>]/i.test(s))
    add(/^<svg/i.test(s) ? 'svgOptimizer' : 'xml', /^<svg/i.test(s) ? 'SVG' : 'XML', 0.88);
  else if (/^<!doctype html|^<html[\s>]/i.test(s)) add('html', 'HTML', 0.88);
  else if (s.startsWith('<') && s.endsWith('>')) {
    add(
      /<(div|span|p|a|body|head|ul|li|table|img|br)\b/i.test(s) ? 'html' : 'xml',
      /<(div|span|p|a|body|head|ul|li|table|img|br)\b/i.test(s) ? 'HTML' : 'XML',
      0.75,
    );
  }
  const fields = s.split(/\s+/);
  if (
    oneLine &&
    (fields.length === 5 || fields.length === 6) &&
    fields.every((f) => CRON_FIELD.test(f)) &&
    fields.some((f) => /[*/?,-]/.test(f))
  ) {
    add('cronParser', 'a cron expression', 0.88);
  }
  if (/^([0-9a-f]{2}[\s:]?){2,}$/i.test(s) && /[\s:]/.test(s)) add('hexAscii', 'hex bytes', 0.7);
  if (!json && !s.startsWith('<')) {
    const lines = s.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const kv = lines.filter((l) => /^\s*(- )?[\w"'.-]+\s*:(\s|$)/.test(l) || /^\s*- /.test(l)).length;
    if (lines.length >= 2 && kv >= 2 && kv / lines.length >= 0.6) add('yamlFormatter', 'YAML', 0.8);
  }
  if (/^curl\s/i.test(s)) add('curlConverter', 'a cURL command', 0.97);
  if (/^(docker|podman)\s+(container\s+)?run\s/i.test(s)) add('dockerCompose', 'a docker run command', 0.95);
  if (/-----BEGIN (NEW )?CERTIFICATE REQUEST-----/.test(s)) add('csrDecoder', 'a certificate signing request', 0.97);
  if (/-----BEGIN (RSA |EC )?(PUBLIC|PRIVATE) KEY-----/.test(s)) add('pemJwk', 'a PEM key', 0.93);
  if (/^\{[\s\S]*"kty"\s*:/.test(s) && json) add('pemJwk', 'a JWK', 0.96);
  if (
    oneLine &&
    /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(s) &&
    s
      .split(/[./]/)
      .slice(0, 4)
      .every((n) => +n <= 255) &&
    (!s.includes('/') || Number(s.split('/')[1]) <= 32)
  )
    add('cidr', s.includes('/') ? 'a CIDR range' : 'an IP address', 0.92);
  if (
    oneLine &&
    /^[0-9a-f:]*::?[0-9a-f:]*\/\d{1,3}$/i.test(s) &&
    (s.match(/:/g) ?? []).length >= 2 &&
    +s.split('/')[1]! <= 128
  )
    add('cidr', 'an IPv6 CIDR range', 0.9);
  if (/SAMLRequest=|SAMLResponse=/.test(s)) add('samlDecoder', 'a SAML message', 0.95);
  if (/^PHNhbWxwO|^PHNhbWw6|^PD94bWwg[\s\S]*c2FtbD/.test(s.replace(/\s+/g, '')))
    add('samlDecoder', 'a SAML message', 0.9);
  if (/^H4sI/.test(s) || (oneLine && /^(eJ|eAE|eF4|eNo)[A-Za-z0-9+/_-]+=*$/.test(s)))
    add('decompress', 'compressed data (gzip/zlib)', 0.85);
  if (oneLine && /^Mozilla\/\d|^(curl|Wget|python-requests|okhttp|Go-http-client)\/[\d.]/.test(s))
    add('userAgent', 'a User-Agent string', 0.9);
  if (oneLine && /^https?:\/\/\S+$/i.test(s)) add('urlParser', 'a URL', 0.85);
  if (/^FROM\s+\S+/im.test(s) && /^(RUN|COPY|CMD|ENTRYPOINT|WORKDIR|ADD|ENV)\s/m.test(s))
    add('dockerfileLint', 'a Dockerfile', 0.92);
  if (/^services:\s*$/m.test(s)) add('dockerCompose', 'a compose file', 0.88);
  if (!json && /^\s*\[[\w.-]+\]\s*$/m.test(s) && /^\s*[\w.-]+\s*=\s*\S/m.test(s)) add('tomlJson', 'TOML', 0.85);
  if (!json && !oneLine) {
    const envLines = s.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    if (envLines.length >= 2 && envLines.every((l) => /^(export\s+)?[A-Z_][A-Z0-9_]*=/.test(l.trim())))
      add('envJson', 'a .env file', 0.9);
  }
  if (oneLine && (/^[0-7]{3}$/.test(s) || /^0[0-7]{3}$/.test(s))) add('chmod', 'Unix permissions', 0.6);
  if (oneLine && /^-?[rwx-]{9,10}$/.test(s) && /[rwx]/.test(s)) add('chmod', 'Unix permissions', 0.9);
  if (/^(query|mutation|subscription|fragment)\b[\s\S]*\{/.test(s) || /^type\s+\w+\s*\{/.test(s))
    add('graphqlFormat', 'GraphQL', 0.88);
  if (oneLine && /^\d+(\.\d+)?\s*(KB|MB|GB|TB|KiB|MiB|GiB|TiB)$/i.test(s)) add('dataSize', 'a data size', 0.85);
  if (/[\u200B-\u200F\u2060\uFEFF\u202A-\u202E]/.test(s))
    add('unicodeInspector', 'text with invisible characters', 0.8);
  const compact = s.replace(/\s+/g, '');
  if (
    compact.length >= 8 &&
    /^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) &&
    compact.length % 4 !== 1 &&
    !/^\d+$/.test(compact) &&
    !jwt
  ) {
    const txt = b64urlToText(compact);
    if (txt && printableRatio(txt) > 0.9) add('base64', 'Base64', compact.length % 4 === 0 ? 0.75 : 0.6);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
