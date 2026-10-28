import { errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton } from './common';

const SAMPLE = `name: John Doe
age: 30
email: john@example.com
address:
  street: 123 Main St
  city: San Francisco
  state: CA
skills:
  - JavaScript
  - Python
  - Go
active: true`;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="yaml-input-label">YAML Input</h3>
                    ${inputActions({ paste: 'yaml-input', sample: 'yaml-sample', clear: 'yaml-clear' })}
                </div>
                <textarea class="form-control font-mono" id="yaml-input" rows="12" aria-labelledby="yaml-input-label" placeholder="name: John&#10;age: 30"></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="yaml-output-label">JSON Output</h3>
                    ${copyButton('yaml-output')}
                </div>
                <textarea class="form-control font-mono" id="yaml-output" rows="12" readonly aria-labelledby="yaml-output-label"></textarea>
            </div>
        </div>
    `;
    const input = $f('yaml-input');
    const output = $f('yaml-output');

    const update = (): void => {
        if (!input.value.trim()) { output.value = ''; setFieldInvalid('yaml-input', false); resetStatus(); return; }
        try {
            output.value = JSON.stringify(window.electronAPI.yaml.parse(input.value), null, 2);
            setFieldInvalid('yaml-input', false);
            reportOk('Valid YAML');
        } catch (e) {
            setFieldInvalid('yaml-input', true, errorMessage(e));
            reportError(e, 'check indentation and colons');
        }
    };

    input.addEventListener('input', debounce(update));
    $('yaml-sample').onclick = () => { input.value = SAMPLE; update(); };
    $('yaml-clear').onclick = () => clearWithUndo(['yaml-input'], update);
    resetStatus();
}
