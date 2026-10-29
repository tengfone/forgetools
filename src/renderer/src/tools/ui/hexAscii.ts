import { $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { directionBar, twoWay, debounce, inputActions, copyButton } from './common';

/** UTF-8 encode text as space-separated lowercase hex bytes. */
const textToHex = (s: string): string => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join(' ');

/** Strip 0x prefixes, whitespace and , : - separators; returns null if any other non-hex char remains. */
const cleanHex = (s: string): string | null => {
    const c = s.replace(/0x/gi, '').replace(/[\s,:-]+/g, '');
    return /^[0-9a-f]*$/i.test(c) ? c : null;
};

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">${directionBar('hex')}
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="hex-ascii-label">ASCII Text</h3>
                        ${inputActions({ paste: 'hex-ascii', sample: 'hex-sample', clear: 'hex-clear' })}
                    </div>
                    <textarea class="form-control" id="hex-ascii" rows="10" aria-labelledby="hex-ascii-label" placeholder="Type text here..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="hex-output-label">HEX</h3>
                        ${copyButton('hex-output')}
                    </div>
                    <textarea class="form-control font-mono" id="hex-output" rows="10" aria-labelledby="hex-output-label" placeholder="48 65 6c 6c 6f"></textarea>
                </div>
            </div>
        </div>
    `;
    const ascii = $f('hex-ascii');
    const hex = $f('hex-output');

    const fromAscii = (): void => {
        setFieldInvalid('hex-output', false);
        hex.value = textToHex(ascii.value);
        if (ascii.value) reportOk('Converted to HEX'); else resetStatus();
    };
    const fail = (msg: string): void => { setFieldInvalid('hex-output', true, msg); reportError(msg); };
    const fromHex = (): void => {
        const v = hex.value;
        if (!v.trim()) { ascii.value = ''; setFieldInvalid('hex-output', false); resetStatus(); return; }
        const h = cleanHex(v);
        if (h === null) {
            fail('HEX may only contain 0-9, A-F, 0x prefixes, spaces and , : - separators');
            return;
        }
        if (h.length % 2) {
            fail('HEX needs an even number of digits (two per byte)');
            return;
        }
        const bytes = new Uint8Array(h.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
            fail('Bytes are not valid UTF-8 text');
            return;
        }
        setFieldInvalid('hex-output', false);
        ascii.value = text;
        reportOk('Converted to text');
    };

    ascii.addEventListener('input', debounce(fromAscii));
    hex.addEventListener('input', debounce(fromHex));
    const dir = twoWay({ prefix: 'hex', a: { field: 'hex-ascii', label: 'hex-ascii-label', run: fromAscii }, b: { field: 'hex-output', label: 'hex-output-label', run: fromHex }, forward: 'Text \u2192 Hex', backward: 'Hex \u2192 Text' });
    $('hex-sample').onclick = () => { ascii.value = 'Hello, ForgeTools!'; dir.set('a'); fromAscii(); };
    $('hex-clear').onclick = () => clearWithUndo(['hex-ascii', 'hex-output'], resetStatus);
    resetStatus();
}
