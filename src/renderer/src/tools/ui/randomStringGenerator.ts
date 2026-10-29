import { $, $f, esc, reportError, reportOk, resetStatus } from '../../ui';

const SETS = [
    ['rand-upper', 'Uppercase (A-Z)', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', true],
    ['rand-lower', 'Lowercase (a-z)', 'abcdefghijklmnopqrstuvwxyz', true],
    ['rand-numbers', 'Numbers (0-9)', '0123456789', true],
    ['rand-symbols', 'Symbols (!@#$...)', '!@#$%^&*()_+-=[]{}|;:,.<>?', false],
] as const;

/** Unbiased random integer in [0, n) via rejection sampling on crypto bytes. */
const randInt = (n: number): number => {
    const limit = Math.floor(0x1_0000_0000 / n) * n;
    const buf = new Uint32Array(1);
    for (;;) {
        crypto.getRandomValues(buf);
        if (buf[0]! < limit) return buf[0]! % n;
    }
};

/** One string: at least one char from each set (when length allows), Fisher-Yates shuffled. */
const makeString = (sets: string[], length: number): string => {
    const all = sets.join('');
    const out: string[] = [];
    if (length >= sets.length) for (const set of sets) out.push(set[randInt(set.length)]!);
    while (out.length < length) out.push(all[randInt(all.length)]!);
    for (let i = out.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out.join('');
};

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Options</h3>
                <div class="flex flex-col gap-3 mb-4">
                    <div>
                        <label class="ui-label" for="rand-length">Length: <span id="rand-length-val">16</span></label>
                        <input type="range" id="rand-length" min="4" max="128" value="16" class="form-control w-full">
                    </div>
                    <fieldset class="grid grid-cols-2 gap-2" id="rand-sets">
                        <legend class="sr-only">Character sets</legend>
                        ${SETS.map(([id, label, , on]) => `<label class="check-label" for="${id}"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`).join('')}
                    </fieldset>
                </div>
                <button type="button" class="btn-primary self-start" id="rand-generate">
                    <i class="material-icons" aria-hidden="true">refresh</i> Generate
                </button>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Generated Strings</h3>
                    <div class="ui-meta">Click to copy</div>
                </div>
                <div class="flex flex-col gap-2" id="rand-results"></div>
            </div>
        </div>
    `;

    const generate = (): void => {
        const length = parseInt($f('rand-length').value, 10);
        const sets: string[] = SETS.filter(([id]) => $f(id).checked).map(([, , c]) => c);
        if (!sets.length) {
            reportError('Select at least one character set (uppercase, lowercase, numbers or symbols)');
            return;
        }
        const results = Array.from({ length: 5 }, () => makeString(sets, length));
        $('rand-results').innerHTML = results.map(r => `<div class="copy-chip" data-copy-self>${esc(r)}</div>`).join('');
        reportOk('Generated 5 strings', `${length} chars`);
    };

    $f('rand-length').addEventListener('input', () => {
        $('rand-length-val').textContent = $f('rand-length').value;
        generate();
    });
    $('rand-sets').addEventListener('change', generate);
    $('rand-generate').onclick = generate;
    generate();
    resetStatus();
}
