import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Unix Timestamp (seconds)</h3>
                    <button class="btn-primary" id="ts-now-btn"><i class="material-icons">update</i> Now</button>
                </div>
                <input type="number" class="form-control font-mono text-[13px]" id="ts-unix" placeholder="Enter Unix timestamp...">
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Formatted Dates</h3>
                    <div class="ui-meta flex items-center gap-1">
                        <i class="material-icons icon-sm">info</i>
                        Click any date to copy
                    </div>
                </div>
                <div class="result-grid">
                    <div class="result-item">
                        <label class="field-label">
                            <span>ISO 8601</span>
                            <button class="btn-icon btn-sm" data-copy="ts-iso"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="ts-iso" readonly data-copy-self>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>UTC</span>
                            <button class="btn-icon btn-sm" data-copy="ts-utc"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="ts-utc" readonly data-copy-self>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>Local Time</span>
                            <button class="btn-icon btn-sm" data-copy="ts-local"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="ts-local" readonly data-copy-self>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>Relative</span>
                            <button class="btn-icon btn-sm" data-copy="ts-relative"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control cursor-pointer" id="ts-relative" readonly data-copy-self>
                    </div>
                </div>
            </div>
        </div>
    `;
    const unixInput = $f('ts-unix');
    const update = (ts: number) => {
        if (!ts) return;
        const date = new Date(ts * 1000);
        if (isNaN(date.getTime())) return;
        $f('ts-iso').value = date.toISOString();
        $f('ts-utc').value = date.toUTCString();
        $f('ts-local').value = date.toLocaleString();
        
        // Relative time
        const now = Date.now();
        const diff = now - (ts * 1000);
        const seconds = Math.floor(Math.abs(diff) / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        let relative;
        if (days > 0) relative = `${diff > 0 ? '' : 'in '}${days} day${days > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
        else if (hours > 0) relative = `${diff > 0 ? '' : 'in '}${hours} hour${hours > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
        else if (minutes > 0) relative = `${diff > 0 ? '' : 'in '}${minutes} minute${minutes > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
        else relative = `${diff > 0 ? '' : 'in '}${seconds} second${seconds > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
        
        $f('ts-relative').value = relative;
    };
    unixInput.addEventListener('input', (e) => update(parseInt((e.target as HTMLInputElement).value)));
    $f('ts-now-btn').onclick = () => {
        const now = Math.floor(Date.now() / 1000);
        unixInput.value = String(now);
        update(now);
    };
    $f('ts-now-btn').click();
}
