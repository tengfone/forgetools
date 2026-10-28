import { $f, reportError, reportOk } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <h3>Input</h3>
                    <div class="mb-3">
                        <label class="ui-label">Text or URL</label>
                        <input type="text" class="form-control" id="qr-input" placeholder="https://example.com">
                    </div>
                    <div class="mb-3">
                        <label class="ui-label">Size (px)</label>
                        <input type="number" class="form-control" id="qr-size" value="256" min="128" max="512" step="64">
                    </div>
                    <button class="btn-primary btn-block" id="qr-generate"><i class="material-icons">qr_code</i> Generate</button>
                </div>
                <div class="tool-card">
                    <h3>QR Code Preview</h3>
                    <div class="qr-preview panel-well flex items-center justify-center min-h-[280px] mb-3" id="qr-preview">
                        <div class="text-text-secondary">QR Code will appear here</div>
                    </div>
                    <button class="btn-icon w-full hidden" id="qr-download">
                        <i class="material-icons">download</i> Download
                    </button>
                </div>
            </div>
        </div>
    `;
    const input = $f('qr-input');
    const sizeInput = $f('qr-size');
    const preview = $f('qr-preview');
    const downloadBtn = $f('qr-download');
    let currentDataUrl = '';
    
    const generate = async () => {
        const text = input.value.trim();
        if (!text) {
            preview.innerHTML = '<div class="text-text-secondary">Enter text to generate QR code</div>';
            downloadBtn.style.display = 'none';
            return;
        }
        const size = parseInt(sizeInput.value) || 256;
        try {
            currentDataUrl = await window.electronAPI.qrcode.generate(text, { width: size, margin: 2 });
            preview.innerHTML = `<img class="max-w-full rounded-sm" src="${currentDataUrl}" alt="QR Code">`;
            downloadBtn.style.display = 'block';
            reportOk('QR code generated', `${size}px`);
        } catch (e) {
            preview.innerHTML = '<div class="text-text-secondary">Could not generate a QR code</div>';
            reportError(e);
            downloadBtn.style.display = 'none';
        }
    };
    
    $f('qr-generate').onclick = generate;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') generate();
    });
    
    downloadBtn.onclick = () => {
        if (currentDataUrl) {
            const a = document.createElement('a');
            a.href = currentDataUrl;
            a.download = 'qrcode.png';
            a.click();
        }
    };
}
