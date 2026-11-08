// Secret / PII redaction (offline). Replaces matches with stable placeholders and returns a
// mapping so a model's reply can be restored with the original values.

export interface Rule {
  id: string;
  label: string;
  re: RegExp;
  /** Extra check on a match (e.g. Luhn for card numbers). */
  valid?: (m: string) => boolean;
}

const luhn = (s: string): boolean => {
  const d = s.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
};

// Order matters: specific secrets first so a generic rule doesn't eat them.
export const RULES: Rule[] = [
  {
    id: 'PRIVATE_KEY',
    label: 'Private keys',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { id: 'JWT', label: 'JWTs', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  {
    id: 'API_KEY',
    label: 'API keys & tokens',
    re: /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{20}|npm_[A-Za-z0-9]{36})\b/g,
  },
  {
    id: 'SECRET',
    label: 'Secret assignments (password=, token: ...)',
    re: /(?<=\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi,
  },
  { id: 'URL_CREDS', label: 'Credentials in URLs', re: /(?<=[a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+(?=@)/gi },
  { id: 'EMAIL', label: 'Emails', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { id: 'CARD', label: 'Card numbers', re: /\b(?:\d[ -]?){12,18}\d\b/g, valid: luhn },
  { id: 'IP', label: 'IP addresses', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  {
    id: 'PHONE',
    label: 'Phone numbers',
    re: /(?<![\w.+])(?:\+\d{1,3}[ .-]?\(?\d{1,4}\)?[ .-]?\d{3,4}(?:[ .-]?\d{3,4})?|\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4})(?!\w|\.\d)/g,
  },
];

export interface Redaction {
  text: string;
  /** placeholder -> original */
  map: Record<string, string>;
  counts: Record<string, number>;
}

export function redact(input: string, enabled: ReadonlySet<string> = new Set(RULES.map((r) => r.id))): Redaction {
  const map: Record<string, string> = {};
  const byValue = new Map<string, string>();
  const counts: Record<string, number> = {};
  let text = input;
  for (const rule of RULES) {
    if (!enabled.has(rule.id)) continue;
    text = text.replace(rule.re, (m) => {
      // Never re-redact a placeholder from an earlier rule
      if (/^<[A-Z_]+_\d+>$/.test(m) || (rule.valid && !rule.valid(m))) return m;
      let ph = byValue.get(m);
      if (!ph) {
        counts[rule.id] = (counts[rule.id] ?? 0) + 1;
        ph = `<${rule.id}_${counts[rule.id]}>`;
        byValue.set(m, ph);
        map[ph] = m;
      }
      return ph;
    });
  }
  return { text, map, counts };
}

/** Put original values back into text that contains placeholders. */
export function restore(text: string, map: Record<string, string>): string {
  return text.replace(/<[A-Z_]+_\d+>/g, (ph) => map[ph] ?? ph);
}
