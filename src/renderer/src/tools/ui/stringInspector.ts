import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Input Text</h3>
                   <button class="btn-icon btn-sm" data-paste="insp-input">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="insp-input" rows="10" placeholder="Enter or paste text to analyze..."></textarea>
            </div>
            <div class="tool-card">
                <h3>Statistics</h3>
                <div class="stats-grid">
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num text-accent" id="stat-chars">0</div>
                        <div class="stat-label ui-section mt-2">Characters</div>
                    </div>
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num text-success" id="stat-words">0</div>
                        <div class="stat-label ui-section mt-2">Words</div>
                    </div>
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num text-error" id="stat-lines">0</div>
                        <div class="stat-label ui-section mt-2">Lines</div>
                    </div>
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num" id="stat-bytes">0</div>
                        <div class="stat-label ui-section mt-2">Bytes</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    const input = $f('insp-input');
    input.addEventListener('input', () => {
        const text = input.value;
        $f('stat-chars').textContent = String(text.length);
        $f('stat-words').textContent = String(text.trim() ? text.trim().split(/\s+/).length : 0);
        $f('stat-lines').textContent = String(text ? text.split('\n').length : 0);
        $f('stat-bytes').textContent = String(new TextEncoder().encode(text).length);
    });
}
