import { errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid, copyText } from '../../ui';
import { inputActions, wireLiveTool } from './common';
import { getNextOccurrences } from '../lib/cron';

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="cron-input-label">Cron Expression</h3>
                    ${inputActions({ paste: 'cron-input', sample: 'cron-sample', clear: 'cron-clear' })}
                </div>
                <input type="text" class="form-control mb-3 font-mono" id="cron-input" aria-labelledby="cron-input-label" aria-describedby="cron-desc" placeholder="*/5 * * * *">
                <div class="panel-well p-3 text-[13px]" id="cron-desc" aria-live="polite"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Next 5 Scheduled Runs</h3>
                    <button type="button" class="btn-icon btn-sm" id="cron-copy">
                        <i class="material-icons icon-sm" aria-hidden="true">content_copy</i> Copy
                    </button>
                </div>
                <ul class="cron-next-runs list-none p-0 m-0" id="cron-next"></ul>
            </div>
        </div>
    `;
  const cronInput = $f('cron-input');
  const cronDesc = $('cron-desc');
  const cronNext = $('cron-next');

  const update = (): void => {
    const val = cronInput.value.trim();
    cronNext.innerHTML = '';
    if (!val) {
      cronDesc.textContent = 'Enter a cron expression';
      setFieldInvalid('cron-input', false);
      resetStatus();
      return;
    }
    try {
      const runs = getNextOccurrences(val, 5);
      cronDesc.textContent = 'Valid expression: next 5 runs listed below';
      runs.forEach((dateStr) => {
        const li = document.createElement('li');
        li.className = 'copy-chip mb-1.5';
        li.dataset.copySelf = '';
        li.textContent = dateStr;
        cronNext.appendChild(li);
      });
      setFieldInvalid('cron-input', false);
      reportOk('Valid cron expression');
    } catch (e) {
      cronDesc.textContent = 'Fix the expression to see upcoming runs';
      setFieldInvalid('cron-input', true, errorMessage(e));
      reportError(e, 'format: minute hour day month weekday');
    }
  };

  wireLiveTool({
    input: cronInput,
    update,
    sample: { button: 'cron-sample', value: '*/5 * * * *' },
    clear: { button: 'cron-clear', fields: ['cron-input'] },
    initial: 'none',
  });
  $('cron-copy').onclick = () => {
    void copyText(
      Array.from(cronNext.children)
        .map((li) => li.textContent)
        .join('\n'),
    );
  };
  update();
}
