// Opt-in, local-only per-tool input history (localStorage). Off unless the user enables it.
export const HISTORY_FLAG = 'tool-history-enabled';
const KEY = (tool: string): string => `tool-history:${tool}`;
export const HISTORY_MAX = 10;
export const MAX_ENTRY = 4000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const historyEnabled = (s: Store): boolean => s.getItem(HISTORY_FLAG) === 'true';

/** Inputs that look like credentials are never written to history, whatever the tool. */
const SECRET_PATTERNS: RegExp[] = [
    /eyJ[\w-]{8,}\.[\w-]{8,}\.?/,                                   // JWT / JWS
    /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE|PUBLIC KEY)/,      // PEM
    /\bAuthorization\s*:/i, /\bCookie\s*:/i, /\bBearer\s+[\w.~+/-]{8,}/i, /\bBasic\s+[A-Za-z0-9+/=]{8,}/,
    /(?:\b|_)(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)\b\s*["']?\s*[:=]/i,
    /[?&](access_token|id_token|token|code|sig|signature|X-Amz-Signature|key)=/i,
    /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bsk_(live|test)_[A-Za-z0-9]{10,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    /\s-u\s+\S+:\S+/,                                               // curl -u user:pass
    /:\/\/[^/\s:@]+:[^/\s@]+@/,                                     // user:pass@host
];
export const looksSecret = (s: string): boolean => SECRET_PATTERNS.some(re => re.test(s));

export function getHistory(s: Store, tool: string): string[] {
    try { const v = JSON.parse(s.getItem(KEY(tool)) || '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

export function pushHistory(s: Store, tool: string, input: string): string[] {
    const t = input.trimEnd();
    if (!historyEnabled(s) || !t.trim() || t.length > MAX_ENTRY || looksSecret(t)) return getHistory(s, tool);
    const next = [t, ...getHistory(s, tool).filter(x => x.trimEnd() !== t)].slice(0, HISTORY_MAX);
    for (const keep of [next.length, 3, 1]) {
        try { s.setItem(KEY(tool), JSON.stringify(next.slice(0, keep))); return next.slice(0, keep); } catch { /* quota: retry smaller */ }
    }
    return getHistory(s, tool);
}

/** Remove every stored history list (called when the user turns the feature off). */
export function clearAllHistory(s: Storage): void {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith('tool-history:')) keys.push(k); }
    keys.forEach(k => s.removeItem(k));
}

export const historyLabel = (s: string): string => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > 60 ? one.slice(0, 57) + '\u2026' : one; };
