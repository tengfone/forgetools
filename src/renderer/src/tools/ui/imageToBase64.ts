import { $f, showToast, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Upload Image</h3>
                <div class="drop-zone" id="image-drop-zone">
                    <i class="material-icons empty-glyph">add_photo_alternate</i>
                    <div class="text-text-secondary mb-2">Click to select or drag & drop image</div>
                    <div class="text-[11px] text-text-tertiary">Supports JPG, PNG, GIF, SVG</div>
                </div>
                <input class="hidden" type="file" id="image-input" accept="image/*">
            </div>
            <div class="tool-card hidden" id="image-result-card">
                <div class="card-head">
                    <h3>Preview & Base64</h3>
                    <button class="btn-icon" id="image-copy">
                        <i class="material-icons">content_copy</i> Copy
                    </button>
                </div>
                <div class="text-center mb-3">
                    <img class="max-w-full max-h-[200px] rounded-sm border border-border" id="image-preview">
                </div>
                <div class="ui-meta mb-2" id="image-info"></div>
                <textarea class="form-control h-[150px]" id="image-base64" readonly></textarea>
            </div>
        </div>
    `;
    
    const dropZone = $f('image-drop-zone');
    const fileInput = $f('image-input');
    const resultCard = $f('image-result-card');
    
    const handleFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            showToast('That file is not an image', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = String(reader.result);
            $f('image-preview').src = base64;
            $f('image-base64').value = base64;
            $f('image-info').textContent = `File: ${file.name} | Size: ${(file.size / 1024).toFixed(2)} KB | Type: ${file.type}`;
            resultCard.style.display = 'block';
        };
        reader.readAsDataURL(file);
    };
    
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = fileInput.files?.[0];
        if (file) handleFile(file);
    };
    
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('is-over');
    };
    
    dropZone.ondragleave = () => {
        dropZone.classList.remove('is-over');
    };
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-over');
        const file = e.dataTransfer?.files[0];
        if (file) handleFile(file);
    };
    
    $f('image-copy').onclick = () => {
        void copyText($f('image-base64').value);
    };
}
