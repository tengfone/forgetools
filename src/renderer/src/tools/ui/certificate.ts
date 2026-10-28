import { $f, reportError, reportOk } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>PEM Certificate</h3>
                    <button class="btn-icon btn-sm" data-paste="cert-input">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="cert-input" rows="5" placeholder="-----BEGIN CERTIFICATE-----..."></textarea>
            </div>
            <div class="tool-card hidden" id="cert-details">
                <h3>Certificate Details</h3>
                <div class="result-grid !grid-cols-1">
                    <div class="result-item">
                        <label class="flex items-center justify-between">
                            <span>Subject</span>
                            <button class="btn-icon btn-sm" data-copy="cert-subject">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="cert-subject" readonly data-copy-self>
                    </div>
                    <div class="result-item">
                        <label class="flex items-center justify-between">
                            <span>Issuer</span>
                            <button class="btn-icon btn-sm" data-copy="cert-issuer">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="cert-issuer" readonly data-copy-self>
                    </div>
                    <div class="grid-2">
                        <div class="result-item">
                            <label class="flex items-center justify-between">
                                <span>Valid From</span>
                                <button class="btn-icon btn-sm" data-copy="cert-valid-from">
                                    <i class="material-icons icon-sm">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control cursor-pointer" id="cert-valid-from" readonly data-copy-self>
                        </div>
                        <div class="result-item">
                            <label class="flex items-center justify-between">
                                <span>Valid To</span>
                                <button class="btn-icon btn-sm" data-copy="cert-valid-to">
                                    <i class="material-icons icon-sm">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control cursor-pointer" id="cert-valid-to" readonly data-copy-self>
                        </div>
                    </div>
                    <div class="result-item">
                        <label class="flex items-center justify-between">
                            <span>Serial Number</span>
                            <button class="btn-icon btn-sm" data-copy="cert-serial">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="cert-serial" readonly data-copy-self>
                    </div>
                    <div class="result-item">
                        <label class="flex items-center justify-between">
                            <span>Fingerprint (SHA-1)</span>
                            <button class="btn-icon btn-sm" data-copy="cert-fingerprint">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="cert-fingerprint" readonly data-copy-self>
                    </div>
                </div>
            </div>
        </div>
    `;
    const input = $f('cert-input');
    const details = $f('cert-details');
    
    input.addEventListener('input', () => {
        try {
            const val = input.value.trim();
            if (!val.includes('BEGIN CERTIFICATE')) return;
            
            const decoded = window.electronAPI.x509.decode(val);
            if (decoded) {
                details.style.display = 'block';
                $f('cert-subject').value = decoded.subject || '';
                $f('cert-issuer').value = decoded.issuer || '';
                $f('cert-valid-from').value = decoded.notBefore || '';
                $f('cert-valid-to').value = decoded.notAfter || '';
                $f('cert-serial').value = decoded.serialNumber || '';
                $f('cert-fingerprint').value = decoded.fingerprint?.sha256 || '';
                reportOk('Certificate decoded');
            }
        } catch (e) {
            details.style.display = 'none';
            reportError(e);
        }
    });
}
