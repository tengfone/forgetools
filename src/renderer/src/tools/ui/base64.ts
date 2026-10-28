import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Plain Text</h3>
                        <button class="btn-icon btn-sm" data-paste="b64-plain">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="b64-plain" rows="12" placeholder="Type or paste text here..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Base64 Encoded</h3>
                        <button class="btn-icon btn-sm" data-copy="b64-encoded">
                            <i class="material-icons icon-sm">content_copy</i> Copy
                        </button>
                    </div>
                    <textarea class="form-control" id="b64-encoded" rows="12" placeholder="Base64 output..."></textarea>
                </div>
            </div>
        </div>
    `;
    const plain = $f('b64-plain') as HTMLTextAreaElement | null;
    const encoded = $f('b64-encoded') as HTMLTextAreaElement | null;

    if (!plain || !encoded) return;

    plain.addEventListener('input', () => {
        try {
            encoded.value = btoa(unescape(encodeURIComponent(plain.value)));
        } catch {
            encoded.value = 'Error encoding';
        }
    });

    encoded.addEventListener('input', () => {
        try {
            plain.value = decodeURIComponent(escape(atob(encoded.value.trim())));
        } catch {
            plain.value = 'Error decoding';
        }
    });
}
