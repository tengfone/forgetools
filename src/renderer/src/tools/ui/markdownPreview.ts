import { $f, clearWithUndo, reportError, resetStatus } from '../../ui';
import { inputActions } from './common';

const BLOCKED_TAGS = 'script,iframe,object,embed,style,link,meta,form,base,frame,frameset,noscript,template';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'srcset', 'background'];

const isSafeUrl = (raw: string): boolean => {
    // Strip whitespace/control chars browsers ignore when parsing schemes
    const v = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return false;
    if (v.startsWith('data:')) return /^data:image\/(png|gif|jpe?g|webp|bmp)[;,]/.test(v);
    return true;
};

/** Minimal DOM-based sanitizer for marked output (no DOMPurify dependency). */
export function sanitizeHtml(html: string): DocumentFragment {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const frag = tpl.content;
    frag.querySelectorAll(BLOCKED_TAGS).forEach(el => el.remove());
    frag.querySelectorAll('*').forEach(el => {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
                el.removeAttribute(attr.name);
            } else if (URL_ATTRS.includes(name) && !isSafeUrl(attr.value)) {
                el.removeAttribute(attr.name);
            }
        }
    });
    return frag;
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

    source.addEventListener('input', update);
    $f('md-sample').onclick = () => {
        source.value = '# Release notes\n\n## Added\n\n- **Fuzzy search** in the palette\n- Settings in the titlebar\n\n```js\nconst ok = true;\n```\n\n> Runs offline. [Docs](https://example.com)';
        update();
    };
    $f('md-clear').onclick = () => clearWithUndo(['md-source'], update);
    update();
}
