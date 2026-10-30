import { $, $f, esc, reportError, reportOk, resetStatus, toolEpoch } from '../../ui';
import { debounce, copyButton } from './common';
import { buildIco, FAVICON_SIZES, ICO_SIZES, faviconHtml } from '../lib/favicon';

const graphemes = (s: string): string[] => Array.from(new Intl.Segmenter().segment(s), (g) => g.segment);
/** Keep the blob URL alive long enough for the WebView to start the download. */
const DOWNLOAD_REVOKE_MS = 1500;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
}

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <h3 id="fav-input-label">Source</h3>
                    <label class="ui-label" for="fav-input">Text or emoji</label>
                    <input type="text" class="form-control mb-3 emoji-input" id="fav-input" value="F" aria-describedby="fav-input-hint">
                    <p class="ui-hint -mt-2 mb-3" id="fav-input-hint">Up to 2 characters or emoji.</p>
                    <div class="flex gap-3 mb-3 items-end">
                        <div><label class="ui-label" for="fav-bg">Background</label><input type="color" class="swatch" id="fav-bg" value="#2563eb"></div>
                        <div class="fav-text-only"><label class="ui-label" for="fav-fg">Text color</label><input type="color" class="swatch" id="fav-fg" value="#ffffff"></div>
                        <div><label class="ui-label" for="fav-shape">Shape</label>
                            <select id="fav-shape" class="toolbar-select"><option value="rounded">Rounded</option><option value="circle">Circle</option><option value="square">Square</option></select></div>
                    </div>
                    <span class="ui-label" id="fav-file-label">Or use an image (replaces the text)</span>
                    <div class="flex items-center gap-2 mb-4">
                        <label class="btn-icon btn-sm cursor-pointer" for="fav-file"><i class="material-icons icon-sm" aria-hidden="true">image</i> Choose image…</label>
                        <input type="file" id="fav-file" accept="image/*" class="sr-only" aria-labelledby="fav-file-label">
                        <span class="text-[12px] text-text-tertiary truncate" id="fav-file-name">No image: using text</span>
                        <button type="button" class="btn-icon btn-ghost btn-sm" id="fav-remove" hidden>Remove</button>
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button type="button" class="btn-icon btn-sm" id="fav-sample"><i class="material-icons icon-sm" aria-hidden="true">science</i> Sample</button>
                        <button type="button" class="btn-icon btn-sm" id="fav-dl-ico"><i class="material-icons icon-sm" aria-hidden="true">download</i> favicon.ico</button>
                        <button type="button" class="btn-icon btn-sm" id="fav-dl-all"><i class="material-icons icon-sm" aria-hidden="true">download</i> All PNGs</button>
                    </div>
                </div>
                <div class="tool-card">
                    <h3>Preview</h3>
                    <div class="flex flex-wrap gap-4 items-center mb-3" id="fav-preview"></div>
                    <div class="card-head"><h3 id="fav-output-label">HTML</h3>${copyButton('fav-output')}</div>
                    <textarea class="form-control font-mono" id="fav-output" rows="9" readonly data-output aria-labelledby="fav-output-label"></textarea>
                </div>
            </div>
        </div>`;

  let image: HTMLImageElement | null = null;
  const draw = (size: number): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const shape = $f('fav-shape').value;
    g.beginPath();
    if (shape === 'circle') g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    else if (shape === 'rounded') g.roundRect(0, 0, size, size, size * 0.2);
    else g.rect(0, 0, size, size);
    g.clip();
    if (image) {
      // SVGs without width/height report 0×0; draw them scaled to fill instead of cropping
      const w = image.naturalWidth,
        h = image.naturalHeight;
      if (!w || !h) g.drawImage(image, 0, 0, size, size);
      else {
        const s = Math.min(w, h);
        g.drawImage(image, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
      }
    } else {
      g.fillStyle = $f('fav-bg').value;
      g.fillRect(0, 0, size, size);
      const chars = graphemes($f('fav-input').value).slice(0, 2);
      const text = chars.join('') || ' ';
      g.fillStyle = $f('fav-fg').value;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 ${Math.round(size * (chars.length > 1 ? 0.45 : 0.65))}px system-ui, "Segoe UI Emoji", sans-serif`;
      g.fillText(text, size / 2, size / 2 + size * 0.04);
    }
    return c;
  };
  const png = (c: HTMLCanvasElement): Promise<Blob> =>
    new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));

  const update = (): void => {
    const prev = $('fav-preview');
    prev.innerHTML = '';
    for (const s of [16, 32, 64, 128]) {
      const wrap = document.createElement('div');
      wrap.className = 'text-center text-[11px] text-text-tertiary';
      wrap.appendChild(draw(s));
      wrap.insertAdjacentHTML('beforeend', `<div>${esc(s)}px</div>`);
      prev.appendChild(wrap);
    }
    $f('fav-output').value = faviconHtml();
    reportOk(`${FAVICON_SIZES.length} sizes + .ico ready`);
  };
  const live = debounce(update);
  for (const id of ['fav-input', 'fav-bg', 'fav-fg']) $(id).addEventListener('input', live);
  $('fav-shape').addEventListener('change', update);
  $<HTMLInputElement>('fav-file').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const img = new Image();
    const src = URL.createObjectURL(f);
    const epoch = toolEpoch;
    img.onload = () => {
      URL.revokeObjectURL(src);
      if (epoch !== toolEpoch) return;
      image = img;
      $('fav-remove').hidden = false;
      $('fav-file-name').textContent = f.name;
      setImageMode(true);
      update();
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      if (epoch === toolEpoch) reportError('Could not read that image');
    };
    img.src = src;
  });
  // An image replaces the text, so dim the text-only fields while one is loaded
  const setImageMode = (on: boolean): void => {
    for (const el of [$('fav-input'), ...Array.from(container.querySelectorAll<HTMLElement>('.fav-text-only'))])
      el.classList.toggle('is-overridden', on);
    $f('fav-input').title = on ? 'Not used while an image is loaded' : '';
  };
  const dropImage = (): void => {
    image = null;
    $f('fav-file').value = '';
    $('fav-remove').hidden = true;
    $('fav-file-name').textContent = 'No image: using text';
    setImageMode(false);
  };
  $('fav-remove').onclick = () => {
    dropImage();
    update();
    $f('fav-input').focus();
  };
  $('fav-sample').onclick = () => {
    dropImage();
    $f('fav-input').value = '⚒';
    $f('fav-bg').value = '#0f172a';
    $f('fav-fg').value = '#f59e0b';
    update();
  };
  // Draw every canvas synchronously (DOM reads happen now), then encode; drop the result after a tool switch
  $('fav-dl-ico').onclick = async () => {
    const epoch = toolEpoch;
    try {
      const canvases = ICO_SIZES.map((size) => ({ size, c: draw(size) }));
      const imgs = await Promise.all(
        canvases.map(async ({ size, c }) => ({ size, png: new Uint8Array(await (await png(c)).arrayBuffer()) })),
      );
      if (epoch !== toolEpoch) return;
      download(new Blob([buildIco(imgs)], { type: 'image/x-icon' }), 'favicon.ico');
      reportOk('Saved favicon.ico');
    } catch (e) {
      if (epoch === toolEpoch) reportError(e);
    }
  };
  $('fav-dl-all').onclick = async () => {
    const epoch = toolEpoch;
    try {
      const blobs = await Promise.all(FAVICON_SIZES.map((s) => png(draw(s))));
      if (epoch !== toolEpoch) return;
      blobs.forEach((b, i) => download(b, `favicon-${FAVICON_SIZES[i]}.png`));
      reportOk(`Saved ${FAVICON_SIZES.length} PNGs`);
    } catch (e) {
      if (epoch === toolEpoch) reportError(e);
    }
  };
  resetStatus();
  update();
}
