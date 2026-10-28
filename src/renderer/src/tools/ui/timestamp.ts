import { $, $f, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, readonlyField } from './common';

const relative = (ms: number): string => {
    const diff = Date.now() - ms;
    const s = Math.floor(Math.abs(diff) / 1000);
    const units: [number, string][] = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
    const [size, name] = units.find(([u]) => s >= u) ?? [1, 'second'];
    const n = Math.floor(s / size);
    const txt = `${n} ${name}${n === 1 ? '' : 's'}`;
    return diff >= 0 ? `${txt} ago` : `in ${txt}`;
};

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3><label for="ts-unix">Unix Timestamp</label></h3>
                    <div class="flex gap-1">
                        ${inputActions({ paste: 'ts-unix', sample: 'ts-sample', clear: 'ts-clear' })}
                        <button type="button" class="btn-icon btn-sm" id="ts-now-btn"><i class="material-icons icon-sm" aria-hidden="true">update</i> Now</button>
                    </div>
                </div>
                <input type="text" inputmode="numeric" class="form-control font-mono text-[13px]" id="ts-unix" placeholder="Seconds (10 digits) or milliseconds (13 digits)" aria-describedby="ts-unit">
                <div class="ui-meta mt-1.5" id="ts-unit"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Formatted Dates</h3>
                    <div class="ui-meta">Click any date to copy</div>
                </div>
                <div class="result-grid">
                    ${readonlyField('ts-iso', 'ISO 8601')}
                    ${readonlyField('ts-utc', 'UTC')}
                    ${readonlyField('ts-local', 'Local Time')}
                    ${readonlyField('ts-relative', 'Relative')}
                </div>
            </div>
        </div>
    `;
    const unixInput = $f('ts-unix');
    const unit = $('ts-unit');
    const outs = ['ts-iso', 'ts-utc', 'ts-local', 'ts-relative'];
    const clearOut = (): void => outs.forEach(id => { $f(id).value = ''; });

    const update = (): void => {
        const raw = unixInput.value.trim();
        if (!raw) { clearOut(); unit.textContent = ''; setFieldInvalid('ts-unix', false); resetStatus(); return; }
        if (!/^-?\d+$/.test(raw)) {
            clearOut();
            unit.textContent = '';
            setFieldInvalid('ts-unix', true, 'Timestamp must be whole digits only (seconds or milliseconds)');
            reportError('Timestamp must be whole digits only (seconds or milliseconds)');
            return;
        }
        const digits = raw.replace('-', '').length;
        const isMs = digits >= 12;
        const ms = isMs ? Number(raw) : Number(raw) * 1000;
        const date = new Date(ms);
        if (isNaN(date.getTime())) {
            clearOut();
            setFieldInvalid('ts-unix', true, 'Timestamp is outside the representable date range');
            reportError('Timestamp is outside the representable date range');
            return;
        }
        const label = isMs ? 'Detected milliseconds (13 digits)' : 'Detected seconds (10 digits)';
        unit.textContent = label;
        $f('ts-iso').value = date.toISOString();
        $f('ts-utc').value = date.toUTCString();
        $f('ts-local').value = date.toLocaleString();
        $f('ts-relative').value = relative(ms);
        setFieldInvalid('ts-unix', false);
        reportOk('Converted', isMs ? 'milliseconds' : 'seconds');
    };

    unixInput.addEventListener('input', debounce(update));
    $('ts-clear').onclick = () => clearWithUndo(['ts-unix'], update);
    $('ts-sample').onclick = () => { unixInput.value = '1700000000000'; update(); };
    $('ts-now-btn').onclick = () => { unixInput.value = String(Math.floor(Date.now() / 1000)); update(); };
    unixInput.value = String(Math.floor(Date.now() / 1000));
    update();
    resetStatus();
}
