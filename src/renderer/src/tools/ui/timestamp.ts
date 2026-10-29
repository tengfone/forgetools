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
                <input type="text" inputmode="numeric" class="form-control font-mono text-[13px]" id="ts-unix" placeholder="Seconds, milliseconds, microseconds or nanoseconds" aria-describedby="ts-unit">
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

    type Unit = { name: string; digits: string; div: bigint };
    // Unit by digit count: <=11 s, 12-14 ms, 15-17 µs, 18+ ns.
    const detectUnit = (digits: number): Unit =>
        digits <= 11 ? { name: 'seconds', digits: '≤11 digits', div: 0n }
            : digits <= 14 ? { name: 'milliseconds', digits: '12-14 digits', div: 1n }
                : digits <= 17 ? { name: 'microseconds', digits: '15-17 digits', div: 1000n }
                    : { name: 'nanoseconds', digits: '18+ digits', div: 1_000_000n };

    let currentMs: number | null = null;

    const update = (): void => {
        currentMs = null;
        const raw = unixInput.value.trim();
        if (!raw) { clearOut(); unit.textContent = ''; setFieldInvalid('ts-unix', false); resetStatus(); return; }
        if (!/^-?\d+$/.test(raw)) {
            clearOut();
            unit.textContent = '';
            setFieldInvalid('ts-unix', true, 'Timestamp must be whole digits only (s, ms, µs or ns)');
            reportError('Timestamp must be whole digits only (s, ms, µs or ns)');
            return;
        }
        const digits = raw.replace('-', '').length;
        const u = detectUnit(digits);
        let ms: number;
        if (u.div === 0n) ms = Number(raw) * 1000;
        else {
            const big = BigInt(raw);
            // Truncate toward negative infinity so pre-1970 sub-ms values land on the right millisecond.
            let q = big / u.div;
            if (big < 0n && big % u.div !== 0n) q -= 1n;
            ms = Number(q);
        }
        const date = new Date(ms);
        if (isNaN(date.getTime())) {
            clearOut();
            setFieldInvalid('ts-unix', true, 'Timestamp is outside the representable date range');
            reportError('Timestamp is outside the representable date range');
            return;
        }
        unit.textContent = `Detected ${u.name} (${u.digits})`;
        $f('ts-iso').value = date.toISOString();
        $f('ts-utc').value = date.toUTCString();
        $f('ts-local').value = date.toLocaleString();
        $f('ts-relative').value = relative(ms);
        currentMs = ms;
        setFieldInvalid('ts-unix', false);
        reportOk('Converted', u.name);
    };

    // Keep "Relative" fresh; stop once the tool is gone.
    const tick = setInterval(() => {
        const el = document.getElementById('ts-relative') as HTMLInputElement | null;
        if (!el || !el.isConnected || !container.isConnected) { clearInterval(tick); return; }
        if (currentMs !== null) el.value = relative(currentMs);
    }, 5000);
    unixInput.addEventListener('input', debounce(update));
    $('ts-clear').onclick = () => clearWithUndo(['ts-unix'], update);
    $('ts-sample').onclick = () => { unixInput.value = '1700000000000'; update(); };
    $('ts-now-btn').onclick = () => { unixInput.value = String(Math.floor(Date.now() / 1000)); update(); };
    unixInput.value = String(Math.floor(Date.now() / 1000));
    update();
    resetStatus();
}
