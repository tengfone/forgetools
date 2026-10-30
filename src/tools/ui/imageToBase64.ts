import { $, $f, copyText, reportError, reportOk, resetStatus } from '../../ui';

const MAX_FILE = 10 * 1024 * 1024; // refuse to encode beyond this
const MAX_INLINE = 1024 * 1024; // above this, don't dump the data URL into the textarea

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Upload Image</h3>
                <div class="drop-zone" id="image-drop-zone" role="button" tabindex="0" aria-label="Select or drop an image">
                    <i class="material-icons empty-glyph" aria-hidden="true">add_photo_alternate</i>
                    <div class="text-text-secondary mb-2">Click to select or drag & drop image</div>
                    <div class="text-[11px] text-text-tertiary">Supports JPG, PNG, GIF, SVG</div>
                </div>
                <input class="hidden" type="file" id="image-input" accept="image/*" aria-label="Image file">
            </div>
            <div class="tool-card hidden" id="image-result-card">
                <div class="card-head">
                    <h3 id="image-base64-label">Preview & Base64</h3>
                    <div class="flex gap-1">
                        <button type="button" class="btn-icon btn-sm" id="image-copy"><i class="material-icons icon-sm" aria-hidden="true">content_copy</i> Copy</button>
                        <button type="button" class="btn-icon btn-sm" id="image-download"><i class="material-icons icon-sm" aria-hidden="true">download</i> Download</button>
                    </div>
                </div>
                <div class="text-center mb-3">
                    <img class="max-w-full max-h-[200px] rounded-sm border border-border" id="image-preview" alt="Selected image preview">
                </div>
                <div class="ui-meta mb-2" id="image-info"></div>
                <div class="ui-meta hidden" id="image-large-note">Output is larger than 1 MB, so it is not shown here. Use Copy or Download.</div>
                <textarea class="form-control h-[150px]" id="image-base64" readonly aria-labelledby="image-base64-label"></textarea>
            </div>
        </div>
    `;

  const dropZone = $('image-drop-zone');
  const fileInput = $<HTMLInputElement>('image-input');
  const resultCard = $('image-result-card');

  let dataUrl = '';
  let baseName = 'image';
  $('image-copy').onclick = () => {
    if (dataUrl) void copyText(dataUrl);
  };
  $('image-download').onclick = () => {
    if (!dataUrl) return;
    const url = URL.createObjectURL(new Blob([dataUrl], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.base64.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleFile = (file: File): void => {
    if (file.size > MAX_FILE) {
      reportError(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      reportError(`"${file.name}" is not an image (expected image/* type)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : '';
      $<HTMLImageElement>('image-preview').src = base64;
      dataUrl = base64;
      baseName =
        file.name
          .replace(/\.[^.]*$/, '')
          .replace(/[/\\:*?"<>|\p{Cc}]/gu, '')
          .slice(0, 64) || 'image';
      const large = base64.length > MAX_INLINE;
      $f('image-base64').value = large ? '' : base64;
      $('image-base64').classList.toggle('hidden', large);
      $('image-large-note').classList.toggle('hidden', !large);
      $('image-info').textContent =
        `File: ${file.name} | Size: ${(file.size / 1024).toFixed(2)} KB | Type: ${file.type}`;
      resultCard.classList.remove('hidden');
      reportOk('Image encoded', `${(base64.length / 1024).toFixed(1)} KB`);
    };
    reader.onerror = () => reportError('Could not read the file');
    reader.readAsDataURL(file);
  };

  dropZone.onclick = () => fileInput.click();
  dropZone.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  };
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  };
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('is-over');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('is-over');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  };
  resetStatus();
}
