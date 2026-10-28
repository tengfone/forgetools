import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Input Text</h3>
                    <button class="btn-icon btn-sm" data-paste="hash-input">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="hash-input" rows="6" placeholder="Enter text to hash..."></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Hash Results</h3>
                    <div class="ui-meta flex items-center gap-1">
                        <i class="material-icons icon-sm">info</i>
                        Click any hash to copy
                    </div>
                </div>
                <div id="hash-results"></div>
            </div>
        </div>
    `;
    const input = $f('hash-input');
    const results = $f('hash-results');
    
    const update = async () => {
        const text = input.value;
        if (!text) {
            results.innerHTML = '<div class="tool-empty"><i class="material-icons empty-glyph">tag</i>Enter text to generate hashes...</div>';
            return;
        }
        const md5 = await window.electronAPI.crypto.md5(text);
        const sha1 = await window.electronAPI.crypto.sha1(text);
        const sha256 = await window.electronAPI.crypto.sha256(text);
        const sha512 = await window.electronAPI.crypto.sha512(text);
        results.innerHTML = `
            <div class="result-grid">
                <div class="result-item">
                    <label class="field-label">
                        <span>MD5</span>
                        <button class="btn-icon btn-sm" data-copy-text="${md5}">
                            <i class="material-icons icon-sm">content_copy</i>
                        </button>
                    </label>
                    <input type="text" class="form-control cursor-pointer" value="${md5}" readonly data-copy-self>
                </div>
                <div class="result-item">
                    <label class="field-label">
                        <span>SHA-1</span>
                        <button class="btn-icon btn-sm" data-copy-text="${sha1}">
                            <i class="material-icons icon-sm">content_copy</i>
                        </button>
                    </label>
                    <input type="text" class="form-control cursor-pointer" value="${sha1}" readonly data-copy-self>
                </div>
                <div class="result-item">
                    <label class="field-label">
                        <span>SHA-256</span>
                        <button class="btn-icon btn-sm" data-copy-text="${sha256}">
                            <i class="material-icons icon-sm">content_copy</i>
                        </button>
                    </label>
                    <input type="text" class="form-control cursor-pointer" value="${sha256}" readonly data-copy-self>
                </div>
                <div class="result-item">
                    <label class="field-label">
                        <span>SHA-512</span>
                        <button class="btn-icon btn-sm" data-copy-text="${sha512}">
                            <i class="material-icons icon-sm">content_copy</i>
                        </button>
                    </label>
                    <input type="text" class="form-control cursor-pointer" value="${sha512}" readonly data-copy-self>
                </div>
            </div>
        `;
    };
    input.addEventListener('input', update);
    update();
}
