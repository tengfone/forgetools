import { $f, reportError, reportOk, resetStatus } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Encoded Token</h3>
                    <button class="btn-icon btn-sm" data-paste="jwt-input">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="jwt-input" rows="4" placeholder="Paste JWT here (header.payload.signature)..."></textarea>
            </div>
            <div class="jwt-parts">
                <div class="jwt-part jwt-header">
                    <div class="card-head">
                        <h3>Header</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-header-out">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-header-out" class="result-box cursor-pointer" data-copy-self>{}</pre>
                </div>
                <div class="jwt-part jwt-payload">
                    <div class="card-head">
                        <h3>Payload</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-payload-out">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-payload-out" class="result-box cursor-pointer" data-copy-self>{}</pre>
                </div>
                <div class="jwt-part jwt-signature">
                    <div class="card-head">
                        <h3>Signature</h3>
                        <button class="btn-icon btn-sm" data-copy="jwt-sig-out">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <pre id="jwt-sig-out" class="result-box cursor-pointer" data-copy-self>Signature</pre>
                </div>
            </div>
        </div>
    `;
    
    const input = $f('jwt-input');
    input.addEventListener('input', (e) => {
        try {
            const val = (e.target as HTMLInputElement).value.trim();
            if (!val) { resetStatus(); return; }
            const parts = val.split('.');
            if (parts.length !== 3) throw new Error('Invalid JWT format');
            
            $f('jwt-header-out').textContent = JSON.stringify(JSON.parse(atob(parts[0])), null, 2);
            $f('jwt-payload-out').textContent = JSON.stringify(JSON.parse(atob(parts[1])), null, 2);
            $f('jwt-sig-out').textContent = parts[2];
            reportOk('Token decoded', 'signature not verified');
        } catch (err) {
            reportError(err);
        }
    });
}
