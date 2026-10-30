import { $, $f, reportOk, reportError, resetStatus, requestGuard } from '../../ui';
import { emptyState, inputActions, readonlyField, wireLiveTool, toolCard } from './common';

const ALGOS = [
  ['md5', 'MD5'],
  ['sha1', 'SHA-1'],
  ['sha256', 'SHA-256'],
  ['sha512', 'SHA-512'],
] as const;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({ title: 'Input Text', titleId: 'hash-input-label', actions: inputActions({ paste: 'hash-input', sample: 'hash-sample', clear: 'hash-clear' }), body: '<textarea class="form-control" id="hash-input" rows="6" aria-labelledby="hash-input-label" placeholder="Enter text to hash..."></textarea>' })}
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
  const requests = requestGuard();

  const show = (on: boolean): void => {
    $('hash-results').classList.toggle('hidden', !on);
    $('hash-results').previousElementSibling?.classList.toggle('hidden', on);
  };
  const update = async (): Promise<void> => {
    const text = input.value;
    show(!!text);
    const current = requests.start();
    if (!text) {
      ALGOS.forEach(([id]) => {
        $f(`hash-${id}`).value = '';
      });
      resetStatus();
      return;
    }
    try {
      const { hashText } = await import('../lib/media');
      const values = await Promise.all([
        hashText('md5', text),
        hashText('sha1', text),
        hashText('sha256', text),
        hashText('sha512', text),
      ]);
      if (!current()) return;
      ALGOS.forEach(([id], i) => {
        $f(`hash-${id}`).value = values[i] ?? '';
      });
      reportOk('Hashed', `${new TextEncoder().encode(text).length} bytes`);
    } catch (e) {
      if (current()) reportError(e);
    }
  };

  wireLiveTool({
    input,
    update,
    sample: { button: 'hash-sample', value: 'The quick brown fox jumps over the lazy dog' },
    clear: { button: 'hash-clear', fields: ['hash-input'] },
  });
}
