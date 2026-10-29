import { $, $f, reportOk, reportError, resetStatus, clearWithUndo } from '../../ui';
import { debounce, emptyState, inputActions, readonlyField } from './common';

const ALGOS = [['md5', 'MD5'], ['sha1', 'SHA-1'], ['sha256', 'SHA-256'], ['sha512', 'SHA-512']] as const;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="hash-input-label">Input Text</h3>
                    ${inputActions({ paste: 'hash-input', sample: 'hash-sample', clear: 'hash-clear' })}
                </div>
                <textarea class="form-control" id="hash-input" rows="6" aria-labelledby="hash-input-label" placeholder="Enter text to hash..."></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Hash Results</h3>
                    <div class="ui-meta">Click any hash to copy</div>
                </div>
                ${emptyState('MD5, SHA-1, SHA-256 and SHA-512 appear here as you type.', 'hash-sample')}
                <div class="result-grid hidden" id="hash-results">
                    ${ALGOS.map(([id, label]) => readonlyField(`hash-${id}`, label)).join('')}
                </div>
            </div>
        </div>
    `;
    const input = $f('hash-input');
    let seq = 0;

    const show = (on: boolean): void => {
        $('hash-results').classList.toggle('hidden', !on);
        $('hash-results').previousElementSibling?.classList.toggle('hidden', on);
    };
    const update = async (): Promise<void> => {
        const text = input.value;
        show(!!text);
        const mine = ++seq;
        if (!text) {
            ALGOS.forEach(([id]) => { $f(`hash-${id}`).value = ''; });
            resetStatus();
            return;
        }
        try {
            const { hashText } = await import('../lib/media');
            const values = await Promise.all([hashText('md5', text), hashText('sha1', text), hashText('sha256', text), hashText('sha512', text)]);
            if (mine !== seq) return;
            ALGOS.forEach(([id], i) => { $f(`hash-${id}`).value = values[i]; });
            reportOk('Hashed', `${new TextEncoder().encode(text).length} bytes`);
        } catch (e) {
            reportError(e);
        }
    };

    input.addEventListener('input', debounce(() => void update()));
    $('hash-sample').onclick = () => { input.value = 'The quick brown fox jumps over the lazy dog'; void update(); };
    $('hash-clear').onclick = () => clearWithUndo(['hash-input'], () => void update());
    resetStatus();
}
