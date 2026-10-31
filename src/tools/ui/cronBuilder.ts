import { $, $f, errorMessage, esc, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { debounce, copyButton, icon, chipSet, checkedValues, setChecked, intField } from './common';
import { buildCron, type CronFreq } from '../lib/generate';
import { getNextOccurrences } from '../lib/cron';

/** "Fri 30 Oct 2026 · 09:30 (in 14h)" */
function runLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return String(d);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  const rel =
    mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)} days`;
  return `${day} · ${time} (in ${rel})`;
}

const DAYS: Array<[string, string]> = [
  ['1', 'Mon'],
  ['2', 'Tue'],
  ['3', 'Wed'],
  ['4', 'Thu'],
  ['5', 'Fri'],
  ['6', 'Sat'],
  ['0', 'Sun'],
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** Which inputs each frequency uses. */
const CRON_USES: Record<CronFreq, string[]> = {
  minute: [],
  'interval-minutes': ['every'],
  'interval-hours': ['every', 'minute'],
  hourly: ['minute'],
  daily: ['time'],
  weekly: ['time', 'days'],
  monthly: ['time', 'dom'],
  yearly: ['time', 'dom', 'month'],
};

export function render(container: HTMLElement): void {
  const group = (key: string, inner: string): string => `<div class="mt-3" data-cron-uses="${key}">${inner}</div>`;
  container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Schedule</h3>
                        <button type="button" class="btn-icon btn-sm" id="cronb-sample">${icon('science')} Sample</button>
                    </div>
                    <label class="ui-label" for="cronb-freq">Frequency</label>
                    <select id="cronb-freq" class="toolbar-select cursor-pointer">
                        ${(
                          [
                            ['minute', 'Every minute'],
                            ['interval-minutes', 'Every N minutes'],
                            ['hourly', 'Hourly'],
                            ['interval-hours', 'Every N hours'],
                            ['daily', 'Daily'],
                            ['weekly', 'Weekly'],
                            ['monthly', 'Monthly'],
                            ['yearly', 'Yearly'],
                          ] as Array<[string, string]>
                        )
                          .map(
                            ([v, l]) =>
                              `<option value="${esc(v)}"${v === 'daily' ? ' selected' : ''}>${esc(l)}</option>`,
                          )
                          .join('')}
                    </select>
                    ${group('every', `<label class="ui-label" for="cronb-every" id="cronb-every-label">Every N</label><input type="number" class="form-control" id="cronb-every" min="1" max="59" value="15" inputmode="numeric">`)}
                    ${group('minute', `<label class="ui-label" for="cronb-minute">At minute (0–59)</label><input type="number" class="form-control" id="cronb-minute" min="0" max="59" value="0" inputmode="numeric">`)}
                    ${group('time', `<label class="ui-label" for="cronb-time">Time</label><input type="time" class="form-control" id="cronb-time" value="09:00">`)}
                    ${group('days', `<span class="ui-label" id="cronb-days-label">Days</span><div id="cronb-days">${chipSet('cronb-d', 'cronb-days-label', DAYS, ['1', '2', '3', '4', '5']).replace('class="chip-set"', 'class="chip-set is-week"')}</div>`)}
                    ${group('dom', `<label class="ui-label" for="cronb-dom">Day of month (1–31)</label><input type="number" class="form-control" id="cronb-dom" min="1" max="31" value="1" inputmode="numeric">`)}
                    ${group('month', `<label class="ui-label" for="cronb-month">Month</label><select id="cronb-month" class="toolbar-select cursor-pointer">${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>`)}
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="cronb-output-label">Cron expression</h3>${copyButton('cronb-output')}</div>
                    <input type="text" class="form-control font-mono text-[15px]" id="cronb-output" readonly data-output aria-labelledby="cronb-output-label" aria-describedby="cronb-desc">
                    <p class="mt-2 text-[13px] text-text-secondary" id="cronb-desc"></p>
                    <h3 class="ui-section cron-next-head" id="cronb-next-label">Next runs <span class="normal-case tracking-normal">· ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></h3>
                    <ul class="list-none p-0 m-0" id="cronb-next" aria-labelledby="cronb-next-label"></ul>
                </div>
            </div>
        </div>`;
  const days = $('cronb-days');
  const update = (): void => {
    const freq = $f('cronb-freq').value as CronFreq;
    const uses = CRON_USES[freq];
    container.querySelectorAll<HTMLElement>('[data-cron-uses]').forEach((el) => {
      el.hidden = !uses.includes(el.dataset.cronUses!);
    });
    $('cronb-every-label').textContent = freq === 'interval-hours' ? 'Every N hours (1–23)' : 'Every N minutes (1–59)';
    for (const id of ['cronb-every', 'cronb-minute', 'cronb-dom', 'cronb-time']) setFieldInvalid(id, false);
    const next = $('cronb-next');
    try {
      const spec: Parameters<typeof buildCron>[0] = { freq };
      if (uses.includes('every')) spec.every = intField('cronb-every', 1, freq === 'interval-hours' ? 23 : 59, 'N');
      if (uses.includes('minute')) spec.minute = intField('cronb-minute', 0, 59, 'Minute');
      if (uses.includes('time')) {
        const t = $f('cronb-time').value;
        const m = /^(\d{2}):(\d{2})/.exec(t);
        setFieldInvalid('cronb-time', !m, m ? undefined : 'Pick a time');
        if (!m) throw new Error('Pick a time');
        spec.hour = Number(m[1]);
        spec.minute = Number(m[2]);
      }
      if (uses.includes('days')) {
        spec.weekdays = checkedValues(days).map(Number);
        if (!spec.weekdays.length) throw new Error('Pick at least one day');
      }
      if (uses.includes('dom')) spec.dayOfMonth = intField('cronb-dom', 1, 31, 'Day of month');
      if (uses.includes('month')) spec.month = Number($f('cronb-month').value);
      const r = buildCron(spec);
      if (r.error) {
        setFieldInvalid('cronb-dom', true, r.error);
        throw new Error(r.error);
      }
      const runs = getNextOccurrences(r.expression, 3); // throws if it can never run
      $f('cronb-output').value = r.expression;
      $('cronb-desc').textContent = r.description + (r.note ? ` (${r.note})` : '');
      next.innerHTML = '';
      for (const d of runs) {
        const li = document.createElement('li');
        li.className = 'font-mono text-[12px] text-text-secondary py-0.5';
        li.textContent = runLabel(new Date(d));
        next.appendChild(li);
      }
      reportOk(r.description, r.note);
    } catch (e) {
      $f('cronb-output').value = '';
      $('cronb-desc').textContent = errorMessage(e);
      next.innerHTML = '';
      reportError(e);
    }
  };
  const live = debounce(update);
  container.querySelector('.custom-interface')!.addEventListener('input', live);
  container.querySelector('.custom-interface')!.addEventListener('change', update);
  $('cronb-sample').onclick = () => {
    $f('cronb-freq').value = 'weekly';
    $f('cronb-time').value = '09:30';
    setChecked(days, ['1', '2', '3', '4', '5']);
    update();
  };
  resetStatus();
  update();
}
