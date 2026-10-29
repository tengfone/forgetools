import { errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton } from './common';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Sample icon -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <g>
        <circle cx="12.000" cy="12.000" r="10.000" fill="#72cd42" />
    </g>
</svg>`;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="svg-input-label">SVG Input</h3>
                    ${inputActions({ paste: 'svg-input', sample: 'svg-sample', clear: 'svg-clear' })}
                </div>
                <textarea class="form-control font-mono" id="svg-input" rows="12" aria-labelledby="svg-input-label" placeholder="<svg>...</svg>"></textarea>
                <div class="ui-meta mt-1.5" id="svg-input-size"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="svg-output-label">Optimized Output</h3>
                    ${copyButton('svg-output')}
                </div>
                <textarea class="form-control font-mono" id="svg-output" rows="12" readonly aria-labelledby="svg-output-label"></textarea>
                <div class="ui-meta mt-1.5" id="svg-stats"></div>
            </div>
        </div>
    `;
    const inputEl = $f('svg-input');
    const output = $f('svg-output');

    let seq = 0;
    const update = async (): Promise<void> => {
        const mine = ++seq;
        const input = inputEl.value;
        if (!input.trim()) {
            output.value = '';
            $('svg-input-size').textContent = '';
            $('svg-stats').textContent = '';
            setFieldInvalid('svg-input', false);
            resetStatus();
            return;
        }
        const inputSize = new Blob([input]).size;
        $('svg-input-size').textContent = `Size: ${(inputSize / 1024).toFixed(2)} KB`;
        try {
            if (!/<svg[\s>]/i.test(input)) throw new Error('Input must contain an <svg> element');
            const optimized = await (await import('../lib/media')).optimizeSvg(input);
            if (mine !== seq) return;
            const outputSize = new Blob([optimized]).size;
            const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
            output.value = optimized;
            $('svg-stats').textContent = `Size: ${(outputSize / 1024).toFixed(2)} KB | Reduced by ${reduction}%`;
            setFieldInvalid('svg-input', false);
            reportOk('Optimized', `-${reduction}%`);
        } catch (e) {
            if (mine !== seq) return;
            output.value = '';
            $('svg-stats').textContent = '';
            setFieldInvalid('svg-input', true, errorMessage(e));
            reportError(e);
        }
    };

    inputEl.addEventListener('input', debounce(() => void update()));
    $('svg-sample').onclick = () => { inputEl.value = SAMPLE; void update(); };
    $('svg-clear').onclick = () => clearWithUndo(['svg-input'], () => void update());
    resetStatus();
}
