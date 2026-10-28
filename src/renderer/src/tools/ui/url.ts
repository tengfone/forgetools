import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Decoded URL</h3>
                        <button class="btn-icon btn-sm" data-paste="url-decoded">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="url-decoded" rows="12" placeholder="https://example.com/path?query=..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Encoded URL</h3>
                        <button class="btn-icon btn-sm" data-copy="url-encoded">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <textarea class="form-control" id="url-encoded" rows="12" placeholder="https%3A%2F%2Fexample.com..."></textarea>
                </div>
            </div>
        </div>
    `;
    const decoded = $f('url-decoded') as HTMLTextAreaElement | null;
    const encoded = $f('url-encoded') as HTMLTextAreaElement | null;

    if (!decoded || !encoded) return;

    decoded.addEventListener('input', () => {
        encoded.value = encodeURIComponent(decoded.value);
    });

    encoded.addEventListener('input', () => {
        try {
            decoded.value = decodeURIComponent(encoded.value);
        } catch {
            decoded.value = 'Error decoding';
        }
    });
}
