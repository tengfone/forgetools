// Offline helpers for LLM work: a token estimate and prompt templates.
// No tokenizer vocab is bundled (keeps the app small), so counts are estimates.

/**
 * Approximate BPE token count. Tracks GPT/Claude tokenizers to roughly ±10% on English
 * prose and code: short words are one token, long words split every ~4 chars,
 * punctuation is usually its own token and CJK is about one token per character.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let n = 0;
  const re = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|[\p{L}\p{N}_]+|\n|[^\s\p{L}\p{N}_]/gu;
  for (const m of text.matchAll(re)) {
    const s = m[0];
    if (s.length === 1 || s.length <= 6) n += 1;
    else n += Math.ceil(s.length / 5);
  }
  return n;
}

/** Unique `{{name}}` variables in order of first use (whitespace inside braces allowed). */
export function templateVars(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) seen.add(m[1]!);
  return [...seen];
}

/** Parse variables given as a JSON object or as `key=value` / `key: value` lines. */
export function parseVars(src: string): Record<string, string> {
  const t = src.trim();
  if (!t) return {};
  if (t.startsWith('{') || t.startsWith('[')) {
    const obj = JSON.parse(t) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Variables JSON must be an object');
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  }
  const out: Record<string, string> = {};
  for (const line of t.split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*[=:]\s?(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/\\n/g, '\n');
  }
  return out;
}

/** Fill `{{name}}` placeholders; unknown ones are left as-is and reported. */
export function fillTemplate(template: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k: string) => {
    if (Object.hasOwn(vars, k)) return vars[k]!;
    missing.add(k);
    return m;
  });
  return { text, missing: [...missing] };
}
