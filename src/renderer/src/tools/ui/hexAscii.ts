import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>ASCII Text</h3>
                        <button class="btn-icon btn-sm" data-paste="hex-ascii">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="hex-ascii" rows="10" placeholder="Type text here..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>HEX Output</h3>
                        <button class="btn-icon btn-sm" data-copy="hex-output">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <textarea class="form-control" id="hex-output" rows="10" placeholder="HEX output..."></textarea>
                </div>
            </div>
        </div>
    `;
    const ascii = $f('hex-ascii');
    const hex = $f('hex-output');

    ascii.addEventListener('input', () => {
        hex.value = window.electronAPI.string.toHex(ascii.value);
    });

    hex.addEventListener('input', () => {
        hex.value = hex.value.replace(/[^0-9A-Fa-f\s]/g, ''); // Clean input
        ascii.value = window.electronAPI.string.toAscii(hex.value);
    });
}
