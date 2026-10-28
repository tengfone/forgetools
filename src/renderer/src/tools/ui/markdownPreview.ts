import { $f, reportError, resetStatus } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <h3>Markdown Source</h3>
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
    
    const update = (): void => {
        try {
            const html = window.electronAPI.marked.parse(source.value);
            preview.innerHTML = html;
            resetStatus();
        } catch (e) {
            reportError(e, 'previous preview kept');
        }
    };
    
    source.addEventListener('input', update);
    update();
}
