import { $, $f, clearWithUndo, reportOk, resetStatus } from '../../ui';
import { debounce, inputActions, copyButton } from './common';

const escapeString = (s: string): string => s
    .replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t').replace(/"/g, '\\"').replace(/'/g, "\\'");

const unescapeString = (s: string): string => s.replace(/\\([nrt"'\\])/g, (_, c: string) =>
    ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[c] ?? c);

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
