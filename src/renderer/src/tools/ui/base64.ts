import { copyButton, debounce, decodeBase64Url, directionBar, emptyState, inputActions, twoWay } from './common';
import { $f, clearWithUndo, errorMessage, reportError, resetStatus, setFieldInvalid } from '../../ui';

const encode = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
};

const decode = (input: string): string => {
    let bytes: Uint8Array;
    try { bytes = decodeBase64Url(input); } catch {
        throw new Error('Invalid Base64: only A-Z, a-z, 0-9, +, /, -, _ and trailing = are allowed, with a valid length');
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error('Decoded bytes are not valid UTF-8 text');
    }
};

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">${directionBar('b64')}
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="b64-plain-h"><label for="b64-plain">Plain Text</label></h3>
                        ${inputActions({ paste: 'b64-plain', sample: 'b64-sample', clear: 'b64-clear' })}
                    </div>
                    <textarea class="form-control" id="b64-plain" rows="12" placeholder="Type or paste text here..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="b64-encoded-h"><label for="b64-encoded">Base64 Encoded</label></h3>
                        ${copyButton('b64-encoded')}
                    </div>
                    <textarea class="form-control" id="b64-encoded" rows="12" placeholder="Base64 output..."></textarea>
                </div>
            </div>
            <div id="b64-empty" class="tool-card">${emptyState('Type on either side: plain text encodes to Base64, Base64 decodes back.')}</div>
        </div>
    `;
    const plain = $f('b64-plain') as HTMLTextAreaElement | null;
    const encoded = $f('b64-encoded') as HTMLTextAreaElement | null;

    if (!plain || !encoded) return;

    const ok = (): void => {
        setFieldInvalid('b64-plain', false);
        setFieldInvalid('b64-encoded', false);
        resetStatus();
    };

    const runEncode = (): void => {
        try {
            encoded.value = encode(plain.value);
            ok();
        } catch (e) {
            setFieldInvalid('b64-plain', true, errorMessage(e));
            reportError(e);
        }
    };

    const runDecode = (): void => {
        try {
            plain.value = decode(encoded.value);
            ok();
        } catch (e) {
            setFieldInvalid('b64-encoded', true, errorMessage(e));
            reportError(e, 'plain text unchanged');
        }
    };
    const syncEmpty = (): void => { document.getElementById('b64-empty')?.classList.toggle('hidden', !!(plain.value || encoded.value)); };
    plain.addEventListener('input', syncEmpty);
    encoded.addEventListener('input', syncEmpty);
    plain.addEventListener('input', debounce(runEncode));
    encoded.addEventListener('input', debounce(runDecode));
    const dir = twoWay({ prefix: 'b64', a: { field: 'b64-plain', label: 'b64-plain-h', run: runEncode }, b: { field: 'b64-encoded', label: 'b64-encoded-h', run: runDecode }, forward: 'Encode', backward: 'Decode' });
    document.getElementById('b64-sample')!.onclick = () => { plain.value = 'Hello, ForgeTools! \u2713'; dir.set('a'); runEncode(); syncEmpty(); };
    document.getElementById('b64-clear')!.onclick = () => clearWithUndo(['b64-plain', 'b64-encoded'], () => { ok(); syncEmpty(); });
}
