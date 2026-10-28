import { $f, reportError, reportOk, resetStatus, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Cron Expression</h3>
                    <button class="btn-icon btn-sm" data-paste="cron-input">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <input type="text" class="form-control mb-3" id="cron-input" placeholder="*/5 * * * *" value="*/5 * * * *">
                <div class="panel-well p-3 text-[13px]" id="cron-desc"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Next 5 Scheduled Runs</h3>
                    <button class="btn-icon btn-sm" id="cron-copy" aria-label="Copy all scheduled dates">
                        <i class="material-icons icon-sm">content_copy</i> Copy All
                    </button>
                </div>
                <ul class="cron-next-runs list-none p-0 m-0" id="cron-next"></ul>
            </div>
        </div>
    `;
    
    const update = () => {
        const cronInput = $f('cron-input');
        const cronDesc = $f('cron-desc');
        const cronNext = $f('cron-next');

        const val = cronInput.value.trim();
        if (!val) {
            cronDesc.textContent = 'Enter a cron expression';
            cronNext.innerHTML = '';
            resetStatus();
            return;
        }

        try {
            // Use the exposed electronAPI to get description
            const result = window.electronAPI.cron.parse(val);
            cronDesc.textContent = result.description;
            
            cronNext.innerHTML = '';
            
            // Use the exposed cronParser helper to get next occurrences
            const nextDates = window.cronParser.getNextOccurrences(val, 5);
            nextDates.forEach(dateStr => {
                const li = document.createElement('li');
                li.className = 'copy-chip mb-1.5';
                li.title = 'Click to copy';
                li.dataset.copySelf = '';
                li.textContent = dateStr;
                cronNext.appendChild(li);
            });
            reportOk('Valid cron expression');
        } catch (e) {
            cronDesc.textContent = 'Fix the expression to see upcoming runs';
            cronNext.innerHTML = '';
            reportError(e);
        }
    };
    
    $f('cron-input').addEventListener('input', update);
    // Paste is handled by inline onclick in HTML to avoid ID dependency issues
    $f('cron-copy').onclick = () => {
        const times = Array.from($f('cron-next').children).map(li => li.textContent).join('\n');
        void copyText(times);
    };
    
    // Initialize with default
    update();
}
