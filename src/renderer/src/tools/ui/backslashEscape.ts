import { $, $f, clearWithUndo, reportOk, resetStatus } from '../../ui';
import { debounce, inputActions, copyButton } from './common';

const SIMPLE_ESC: Record<string, string> = {
    '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '"': '\\"', "'": "\\'",
    '\b': '\\b', '\f': '\\f', '\v': '\\v', '\0': '\\0',
};

/** Escape quotes/backslashes and every non-printable code point so unescape round-trips. */
const escapeString = (s: string): string => {
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        const code = s.charCodeAt(i);
        if (SIMPLE_ESC[ch] !== undefined) {
            // \0 followed by a digit would read as an octal-ish sequence; use \x00 instead.
            out += ch === '\0' && /[0-9]/.test(s[i + 1] ?? '') ? '\\x00' : SIMPLE_ESC[ch];
        } else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
            out += '\\x' + code.toString(16).padStart(2, '0');
        } else if ((code >= 0xd800 && code <= 0xdfff && !isPairedSurrogate(s, i)) || code === 0x2028 || code === 0x2029 || code === 0xfeff) {
            out += '\\u' + code.toString(16).padStart(4, '0');
        } else {
            out += ch;
        }
    }
    return out;
};

const isPairedSurrogate = (s: string, i: number): boolean => {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const n = s.charCodeAt(i + 1); return n >= 0xdc00 && n <= 0xdfff; }
    const p = s.charCodeAt(i - 1);
    return p >= 0xd800 && p <= 0xdbff;
};

const SIMPLE_UNESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** Unescape \n \r \t \b \f \v \0 \xNN \uXXXX \u{...} and \\ \" \'. Unknown escapes keep the char. */
const unescapeString = (s: string): string =>
    s.replace(/\\(u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|[\s\S])/g,
        (m, c: string, cp?: string, u4?: string, x2?: string) => {
            if (cp !== undefined) {
                const n = parseInt(cp, 16);
                return n <= 0x10ffff ? String.fromCodePoint(n) : m;
            }
            if (u4 !== undefined) return String.fromCharCode(parseInt(u4, 16));
            if (x2 !== undefined) return String.fromCharCode(parseInt(x2, 16));
            return SIMPLE_UNESC[c] ?? c;
        });
export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="escape-input-label">Input</h3>
                    ${inputActions({ paste: 'escape-input', sample: 'escape-sample', clear: 'escape-clear' })}
                </div>
                <div class="flex items-center gap-2 mb-2">
                    <label class="ui-label !mb-0" for="escape-mode">Mode</label>
                    <select class="toolbar-select" id="escape-mode">
                        <option value="escape">Escape</option>
                        <option value="unescape">Unescape</option>
                    </select>
                </div>
                <textarea class="form-control" id="escape-input" rows="8" aria-labelledby="escape-input-label" placeholder="Hello&#10;World"></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="escape-output-label">Output</h3>
                    ${copyButton('escape-output')}
                </div>
                <textarea class="form-control" id="escape-output" rows="8" readonly aria-labelledby="escape-output-label"></textarea>
            </div>
        </div>
    `;
    const input = $f('escape-input');
    const mode = $f('escape-mode');
    const update = (): void => {
        const v = input.value;
        $f('escape-output').value = mode.value === 'escape' ? escapeString(v) : unescapeString(v);
        if (v) reportOk(mode.value === 'escape' ? 'Escaped' : 'Unescaped'); else resetStatus();
    };
    input.addEventListener('input', debounce(update));
    mode.addEventListener('change', update);
    $('escape-sample').onclick = () => { input.value = mode.value === 'escape' ? 'He said "hi"\n\tC:\\path' : 'He said \\"hi\\"\\n\\tC:\\\\path'; update(); };
    $('escape-clear').onclick = () => clearWithUndo(['escape-input'], update);
    resetStatus();
}
