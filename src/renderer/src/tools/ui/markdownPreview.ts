import DOMPurify from 'dompurify';
import { $f, clearWithUndo, reportError, resetStatus } from '../../ui';
import { debounce, inputActions } from './common';

const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'srcset', 'background'];

/** Allow only http(s), mailto, in-page anchors and inline raster images. */
const isSafeUrl = (name: string, raw: string): boolean => {
    const v = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    if (name === 'srcset') return false;
    if (v.startsWith('#')) return true;
    if (/^data:image\/(png|jpeg|gif|webp)[;,]/.test(v)) return true;
    if (name === 'href' && v.startsWith('mailto:')) return true;
    return /^https?:\/\//.test(v);
};

let hooked = false;
const ensureHook = (): void => {
    if (hooked) return;
    hooked = true;
    DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
        const name = data.attrName.toLowerCase();
        if (URL_ATTRS.includes(name) && !isSafeUrl(name, data.attrValue)) data.keepAttr = false;
    });
};

/** Sanitize marked output with DOMPurify (HTML profile + strict URL scheme allowlist). */
export function sanitizeHtml(html: string): DocumentFragment {
    ensureHook();
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, RETURN_DOM_FRAGMENT: true });
}

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3><label for="md-source">Markdown Source</label></h3>
                        ${inputActions({ paste: 'md-source', sample: 'md-sample', clear: 'md-clear' })}
                    </div>
                    <textarea class="form-control" id="md-source" rows="20" placeholder="# Enter markdown here..."># Welcome

Write your **markdown** here and see the preview!</textarea>
                </div>
                <div class="tool-card">
                    <h3>Preview</h3>
                    <div id="md-preview" class="p-4 min-h-[400px] bg-bg-input dark:bg-bg-input rounded-sm overflow-y-auto text-text-primary dark:text-text-primary markdown-preview"></div>
                </div>
            </div>
        </div>
    `;
    const source = $f('md-source') as HTMLTextAreaElement | null;
    const preview = $f('md-preview') as HTMLDivElement | null;

    if (!source || !preview) return;

    // Links in the preview must never navigate the app window.
    preview.addEventListener('click', e => {
        if ((e.target as Element | null)?.closest('a')) e.preventDefault();
    });

    const update = (): void => {
        try {
            const html = window.electronAPI.marked.parse(source.value);
            preview.replaceChildren(sanitizeHtml(html));
            resetStatus();
        } catch (e) {
            reportError(e, 'previous preview kept');
        }
    };

    source.addEventListener('input', debounce(update, 150));
    $f('md-sample').onclick = () => {
        source.value = '# Release notes\n\n## Added\n\n- **Fuzzy search** in the palette\n- Settings in the titlebar\n\n```js\nconst ok = true;\n```\n\n> Runs offline. [Docs](https://example.com)';
        update();
    };
    $f('md-clear').onclick = () => clearWithUndo(['md-source'], update);
    update();
}
