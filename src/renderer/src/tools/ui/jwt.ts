import { emptyState, inputActions } from './common';
import { clearWithUndo, errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';

const b64urlDecode = (s: string): string => {
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b)) throw new Error('contains characters outside base64url');
    b = b.replace(/=+$/, '');
    if (b.length % 4 === 1) throw new Error('has an invalid length');
    b += '='.repeat((4 - (b.length % 4)) % 4);
    const bin = atob(b);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const decodePart = (part: string, name: string): string => {
    let text: string;
    try { text = b64urlDecode(part); } catch (e) {
        throw new Error(`${name} is not valid base64url: ${e instanceof Error ? e.message : String(e)}`);
    }
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch {
        throw new Error(`${name} decoded but is not valid JSON`);
    }
};

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3><label for="jwt-input">Encoded Token</label></h3>
                    ${inputActions({ paste: 'jwt-input', sample: 'jwt-sample', clear: 'jwt-clear' })}
                </div>
                <textarea class="form-control" id="jwt-input" rows="4" aria-label="Encoded JWT" placeholder="Paste JWT here (header.payload.signature)..."></textarea>
                <div class="ui-meta mt-2">Decoded locally · signature not verified</div>
            </div>
            <div class="tool-card" id="jwt-empty">${emptyState('Header, payload and signature appear here once a token is pasted.', 'jwt-sample')}</div>
            <div class="jwt-parts hidden" id="jwt-parts">
                <div class="jwt-part jwt-header">
                    <div class="card-head">
                        <h3>Header</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-header-out" aria-label="Copy header">
                            <i class="material-icons icon-sm" aria-hidden="true">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-header-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
                <div class="jwt-part jwt-payload">
                    <div class="card-head">
                        <h3>Payload</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-payload-out" aria-label="Copy payload">
                            <i class="material-icons icon-sm" aria-hidden="true">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-payload-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
                <div class="jwt-part jwt-signature">
                    <div class="card-head">
                        <h3>Signature</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-sig-out" aria-label="Copy signature">
                            <i class="material-icons icon-sm" aria-hidden="true">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-sig-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
            </div>
        </div>
    `;

    const outs = ['jwt-header-out', 'jwt-payload-out', 'jwt-sig-out'];
    const showParts = (on: boolean): void => {
        $('jwt-parts').classList.toggle('hidden', !on);
        $('jwt-empty').classList.toggle('hidden', on);
    };
    const clearOuts = (): void => { outs.forEach(id => { $f(id).textContent = ''; }); showParts(false); };

    const input = $f('jwt-input');
    input.addEventListener('input', () => {
        const val = input.value.trim();
        if (!val) { clearOuts(); setFieldInvalid('jwt-input', false); resetStatus(); return; }
        try {
            const parts = val.split('.');
            if (parts.length !== 3) throw new Error(`JWT must have 3 dot-separated parts (found ${parts.length})`);
            const header = decodePart(parts[0]!, 'Header');
            const payload = decodePart(parts[1]!, 'Payload');
            if (!/^[A-Za-z0-9_-]*$/.test(parts[2]!)) throw new Error('Signature is not valid base64url');
            $f('jwt-header-out').textContent = header;
            $f('jwt-payload-out').textContent = payload;
            $f('jwt-sig-out').textContent = parts[2]!;
            showParts(true);
            setFieldInvalid('jwt-input', false);
            reportOk('Token decoded', 'signature not verified');
        } catch (err) {
            clearOuts();
            setFieldInvalid('jwt-input', true, errorMessage(err));
            reportError(err);
        }
    });
    $('jwt-sample').onclick = () => {
        input.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    $('jwt-clear').onclick = () => clearWithUndo(['jwt-input'], () => input.dispatchEvent(new Event('input', { bubbles: true })));
}
