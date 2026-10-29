import { $, $f, errorMessage, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { logger } from '../../logger';
import { debounce, inputActions } from './common';

const BARCODE_RULES: Record<string, [RegExp, string]> = {
    EAN13: [/^\d{12,13}$/, 'EAN-13 needs 12 or 13 digits'],
    UPC: [/^\d{11,12}$/, 'UPC needs 11 or 12 digits'],
    CODE39: [/^[0-9A-Z \-.$/+%]+$/, 'CODE39 allows only A-Z, 0-9 and - . $ / + % space'],
    CODE128: [/^[\x20-\x7e]+$/, 'CODE128 allows only printable ASCII characters'],
};

const SAMPLES: Record<string, string> = {
    EAN13: '123456789012',
    UPC: '12345678901',
    CODE39: 'FORGE-123',
    CODE128: 'ForgeTools 128',
};

function validateBarcode(input: string, format: string): string | null {
    const rule = BARCODE_RULES[format];
    return rule && !rule[0].test(input) ? rule[1] : null;
}

/** Safe download name: strip path/reserved/control chars and cap length. */
const safeFileName = (s: string): string =>
    s.replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) || 'barcode';

/** Parse generator output as SVG XML and return an imported <svg> element, or throw. */
const parseSvg = (svgString: string): SVGSVGElement => {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.getElementsByTagName('parsererror').length || root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
        throw new Error('Barcode generator returned invalid SVG');
    }
    root.querySelectorAll('script, foreignObject').forEach(n => n.remove());
    return document.importNode(root, true) as unknown as SVGSVGElement;
};

const EMPTY = '<div>Enter text to generate a barcode</div>';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2 gap-4 items-start">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Input</h3>
                        ${inputActions({ paste: 'barcode-input', sample: 'barcode-sample', clear: 'barcode-clear' })}
                    </div>
                    <label class="ui-label" for="barcode-input">Content</label>
                    <input type="text" class="form-control mb-3" id="barcode-input" placeholder="Enter text or number...">
                    <label class="ui-label" for="barcode-format">Format</label>
                    <select class="form-control mb-3 cursor-pointer" id="barcode-format">
                        <option value="CODE128">CODE128</option>
                        <option value="EAN13" selected>EAN-13</option>
                        <option value="UPC">UPC</option>
                        <option value="CODE39">CODE39</option>
                    </select>
                    <button type="button" class="btn-primary self-start" id="barcode-generate">
                        <i class="material-icons" aria-hidden="true">qr_code</i> Generate
                    </button>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Preview</h3>
                        <button type="button" class="btn-icon btn-sm" id="barcode-download" disabled>
                            <i class="material-icons icon-sm" aria-hidden="true">download</i> Download
                        </button>
                    </div>
                    <div class="barcode-canvas" id="barcode-preview">${EMPTY}</div>
                </div>
            </div>
        </div>
    `;

    const inputEl = $f('barcode-input');
    const formatEl = $f('barcode-format');
    const preview = $('barcode-preview');
    const downloadBtn = $<HTMLButtonElement>('barcode-download');

    let seq = 0;
    const generate = (): void => {
        const my = ++seq;
        const input = inputEl.value;
        const format = formatEl.value;
        if (!input) {
            preview.innerHTML = EMPTY;
            downloadBtn.disabled = true;
            setFieldInvalid('barcode-input', false);
            resetStatus();
            return;
        }
        const problem = validateBarcode(input, format);
        if (problem) {
            downloadBtn.disabled = true;
            setFieldInvalid('barcode-input', true, errorMessage(problem));
            reportError(problem);
            return;
        }
        setFieldInvalid('barcode-input', false);
        window.electronAPI.barcode.generate(input, { format, width: 2, height: 100, displayValue: true })
            .then(svgString => {
                if (my !== seq || !preview.isConnected) return; // stale result
                const svg = parseSvg(svgString);
                svg.setAttribute('id', 'barcode');
                preview.replaceChildren(svg);
                downloadBtn.disabled = false;
                reportOk('Barcode generated', format);
            })
            .catch(e => {
                if (my !== seq || !preview.isConnected) return;
                logger.error('Barcode error:', e);
                downloadBtn.disabled = true;
                setFieldInvalid('barcode-input', true, errorMessage(e).replace('JsBarcode Error: ', ''));
                reportError(errorMessage(e).replace('JsBarcode Error: ', ''), `check input for ${format}`);
            });
    };
    const live = debounce(generate);

    inputEl.addEventListener('input', live);
    formatEl.addEventListener('change', live);
    $('barcode-generate').onclick = generate;
    $('barcode-sample').onclick = () => { inputEl.value = SAMPLES[formatEl.value] ?? '123456789012'; generate(); };
    $('barcode-clear').onclick = () => clearWithUndo(['barcode-input'], generate);

    downloadBtn.onclick = () => {
        const svg = document.getElementById('barcode');
        if (!svg) return;
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `barcode-${safeFileName(inputEl.value)}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    resetStatus();
}
