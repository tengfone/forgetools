import { $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo, esc } from '../../ui';
import { debounce, inputActions } from './common';

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Input</h3>
                        ${inputActions({ paste: 'qr-input', sample: 'qr-sample', clear: 'qr-clear' })}
                    </div>
                    <div class="mb-3">
                        <label class="ui-label" for="qr-input">Text or URL</label>
                        <input type="text" class="form-control" id="qr-input" placeholder="https://example.com">
                    </div>
                    <div class="mb-3">
                        <label class="ui-label" for="qr-size">Size (px)</label>
                        <input type="number" class="form-control" id="qr-size" value="256" min="128" max="512" step="64">
                    </div>
                    <button type="button" class="btn-primary self-start" id="qr-generate"><i class="material-icons" aria-hidden="true">qr_code</i> Generate</button>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Preview</h3>
                        <button type="button" class="btn-icon btn-sm" id="qr-download" disabled>
                            <i class="material-icons icon-sm" aria-hidden="true">download</i> Download
                        </button>
                    </div>
                    <div class="qr-preview panel-well flex items-center justify-center min-h-[280px]" id="qr-preview">
                        <div class="text-text-secondary">Enter text to generate a QR code</div>
                    </div>
                </div>
            </div>
        </div>
    `;
  const input = $f('qr-input');
  const sizeInput = $f('qr-size');
  const preview = $('qr-preview');
  const downloadBtn = $<HTMLButtonElement>('qr-download');
  let currentDataUrl = '';

  const empty = (msg: string): void => {
    preview.innerHTML = `<div class="text-text-secondary">${esc(msg)}</div>`;
    downloadBtn.disabled = true;
    currentDataUrl = '';
  };

  let seq = 0;
  const generate = async (): Promise<void> => {
    const my = ++seq;
    const text = input.value.trim();
    const size = parseInt(sizeInput.value, 10);
    if (!Number.isFinite(size) || size < 128 || size > 512) {
      setFieldInvalid('qr-size', true, 'Size must be between 128 and 512 px');
      reportError('Size must be between 128 and 512 px');
      return;
    }
    setFieldInvalid('qr-size', false);
    if (!text) {
      empty('Enter text to generate a QR code');
      resetStatus();
      return;
    }
    try {
      const url = await (await import('../lib/media')).generateQr(text, { width: size, margin: 2 });
      if (my !== seq || !preview.isConnected) return; // stale result
      currentDataUrl = url;
      const img = document.createElement('img');
      img.className = 'max-w-full rounded-sm';
      img.alt = 'QR code for the entered text';
      img.src = url;
      preview.replaceChildren(img);
      downloadBtn.disabled = false;
      reportOk('QR code generated', `${size}px`);
    } catch (e) {
      if (my !== seq) return;
      empty('Could not generate a QR code');
      reportError(e);
    }
  };
  const live = debounce(() => void generate());

  input.addEventListener('input', live);
  sizeInput.addEventListener('input', live);
  $('qr-generate').onclick = () => void generate();
  $('qr-sample').onclick = () => {
    input.value = 'https://example.com';
    void generate();
  };
  $('qr-clear').onclick = () => clearWithUndo(['qr-input'], () => void generate());

  downloadBtn.onclick = () => {
    if (!currentDataUrl) return;
    const a = document.createElement('a');
    a.href = currentDataUrl;
    a.download = 'qrcode.png';
    a.click();
  };
  resetStatus();
}
