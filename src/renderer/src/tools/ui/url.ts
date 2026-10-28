import { $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { directionBar, twoWay, debounce, inputActions, copyButton } from './common';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">${directionBar('url')}
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="url-decoded-label">Decoded URL</h3>
                        ${inputActions({ paste: 'url-decoded', sample: 'url-sample', clear: 'url-clear' })}
                    </div>
                    <textarea class="form-control" id="url-decoded" rows="12" aria-labelledby="url-decoded-label" placeholder="https://example.com/path?query=..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="url-encoded-label">Encoded URL</h3>
                        ${copyButton('url-encoded')}
                    </div>
                    <textarea class="form-control" id="url-encoded" rows="12" aria-labelledby="url-encoded-label" placeholder="https%3A%2F%2Fexample.com..."></textarea>
                </div>
            </div>
        </div>
    `;
    const decoded = $f('url-decoded');
    const encoded = $f('url-encoded');

    const encode = (): void => {
        setFieldInvalid('url-encoded', false);
        encoded.value = encodeURIComponent(decoded.value);
        if (decoded.value) reportOk('Encoded'); else resetStatus();
    };
    const decode = (): void => {
        if (!encoded.value) { decoded.value = ''; setFieldInvalid('url-encoded', false); resetStatus(); return; }
        try {
            decoded.value = decodeURIComponent(encoded.value);
            setFieldInvalid('url-encoded', false);
            reportOk('Decoded');
        } catch {
            const msg = 'Malformed percent-encoding: every % must be followed by two hex digits';
            setFieldInvalid('url-encoded', true, msg);
            reportError(msg);
        }
    };

    decoded.addEventListener('input', debounce(encode));
    encoded.addEventListener('input', debounce(decode));
    const dir = twoWay({ prefix: 'url', a: { field: 'url-decoded', label: 'url-decoded-label', run: encode }, b: { field: 'url-encoded', label: 'url-encoded-label', run: decode }, forward: 'Encode', backward: 'Decode' });
    $('url-sample').onclick = () => { decoded.value = 'https://example.com/search?q=forge tools&lang=en'; dir.set('a'); encode(); };
    $('url-clear').onclick = () => clearWithUndo(['url-decoded', 'url-encoded'], resetStatus);
    resetStatus();
}
