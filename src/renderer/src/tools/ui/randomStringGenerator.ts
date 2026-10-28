import { $, $f, esc, reportError, reportOk, resetStatus } from '../../ui';

const SETS = [
    ['rand-upper', 'Uppercase (A-Z)', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', true],
    ['rand-lower', 'Lowercase (a-z)', 'abcdefghijklmnopqrstuvwxyz', true],
    ['rand-numbers', 'Numbers (0-9)', '0123456789', true],
    ['rand-symbols', 'Symbols (!@#$...)', '!@#$%^&*()_+-=[]{}|;:,.<>?', false],
] as const;

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
        const chars = SETS.filter(([id]) => $f(id).checked).map(([, , c]) => c).join('');
        if (!chars) {
            reportError('Select at least one character set (uppercase, lowercase, numbers or symbols)');
            return;
        }
        const results = Array.from({ length: 5 }, () => {
            const bytes = crypto.getRandomValues(new Uint32Array(length));
            return Array.from(bytes, n => chars[n % chars.length]).join('');
        });
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
