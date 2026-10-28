import { $, $f, clearWithUndo, resetStatus, reportOk } from '../../ui';
import { debounce, inputActions } from './common';

const STATS = [['stat-chars', 'Characters'], ['stat-words', 'Words'], ['stat-lines', 'Lines'], ['stat-bytes', 'Bytes']] as const;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="insp-input-label">Input Text</h3>
                    ${inputActions({ paste: 'insp-input', sample: 'insp-sample', clear: 'insp-clear' })}
                </div>
                <textarea class="form-control" id="insp-input" rows="10" aria-labelledby="insp-input-label" placeholder="Enter or paste text to analyze..."></textarea>
            </div>
            <div class="tool-card">
                <h3>Statistics</h3>
                <div class="stats-grid">
                    ${STATS.map(([id, label]) => `
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num" id="${id}" aria-labelledby="${id}-label">0</div>
                        <div class="stat-label ui-section mt-2" id="${id}-label">${label}</div>
                    </div>`).join('')}
                </div>
            </div>
        </div>
    `;
    const input = $f('insp-input');
    const update = (): void => {
        const text = input.value;
        $('stat-chars').textContent = String(text.length);
        $('stat-words').textContent = String(text.trim() ? text.trim().split(/\s+/).length : 0);
        $('stat-lines').textContent = String(text ? text.split('\n').length : 0);
        $('stat-bytes').textContent = String(new TextEncoder().encode(text).length);
        if (text) reportOk('Analyzed'); else resetStatus();
    };
    input.addEventListener('input', debounce(update));
    $('insp-sample').onclick = () => { input.value = 'Hello, world!\nThe quick brown fox jumps over the lazy dog.\nCafé ✓'; update(); };
    $('insp-clear').onclick = () => clearWithUndo(['insp-input'], update);
    resetStatus();
}
