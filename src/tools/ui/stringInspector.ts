import { $, $f, resetStatus, reportOk } from '../../ui';
import { inputActions, wireLiveTool, toolCard } from './common';

const STATS = [
  ['stat-chars', 'Characters'],
  ['stat-words', 'Words'],
  ['stat-lines', 'Lines'],
  ['stat-bytes', 'Bytes'],
] as const;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({ title: 'Input Text', titleId: 'insp-input-label', actions: inputActions({ paste: 'insp-input', sample: 'insp-sample', clear: 'insp-clear' }), body: '<textarea class="form-control" id="insp-input" rows="10" aria-labelledby="insp-input-label" placeholder="Enter or paste text to analyze..."></textarea>' })}
            <div class="tool-card">
                <h3>Statistics</h3>
                <div class="stats-grid">
                    ${STATS.map(
                      ([id, label]) => `
                    <div class="stat-card rounded-sm bg-bg-input p-5 text-center">
                        <div class="stat-value big-num" id="${id}" aria-labelledby="${id}-label">0</div>
                        <div class="stat-label ui-section mt-2" id="${id}-label">${label}</div>
                    </div>`,
                    ).join('')}
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
    if (text) reportOk('Analyzed');
    else resetStatus();
  };
  wireLiveTool({
    input,
    update,
    sample: { button: 'insp-sample', value: 'Hello, world!\nThe quick brown fox jumps over the lazy dog.\nCafé ✓' },
    clear: { button: 'insp-clear', fields: ['insp-input'] },
  });
}
