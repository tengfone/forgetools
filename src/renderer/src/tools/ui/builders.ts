// Custom UIs for tools that are pickers, builders or references rather than text transforms:
// key pair, fake data, cron builder, .gitignore, HTTP status codes, cheat sheets and pipeline.
import { $, $f, esc, errorMessage, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo, toolEpoch, showToast } from '../../ui';
import { debounce, inputActions, copyButton } from './common';
import { generateKeyPair, type KeyType } from '../lib/crypto';
import { fakeRecords, formatFake, buildCron, buildGitignore, GITIGNORE, CHEATSHEETS, type FakeField, type FakeFormat, type CronFreq } from '../lib/generate';
import { searchHttpStatus } from '../lib/inspect';
import { CHAIN_OPS, CHAIN_RECIPES, runChain } from '../lib/chain';

const icon = (name: string): string => `<i class="material-icons icon-sm" aria-hidden="true">${name}</i>`;
const slug = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const json = (v: unknown): string => JSON.stringify(v, null, 2);
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "Fri 30 Oct 2026 · 09:30 (in 14h)" */
function runLabel(d: Date): string {
    if (Number.isNaN(d.getTime())) return String(d);
    const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    const mins = Math.round((d.getTime() - Date.now()) / 60000);
    const rel = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)} days`;
    return `${day} · ${time} (in ${rel})`;
}

const FAKE_GROUPS: Array<[string, FakeField[]]> = [
    ['Identity', ['id', 'uuid', 'firstName', 'lastName', 'fullName', 'email', 'username', 'phone', 'birthdate', 'age']],
    ['Work', ['company', 'jobTitle']],
    ['Address', ['street', 'city', 'state', 'zip', 'country']],
    ['Values', ['createdAt', 'price', 'boolean', 'ipv4', 'url', 'color', 'sentence']],
];

const CHAIN_GROUPS: Array<[string, string[]]> = [
    ['Encode / decode', ['b64enc', 'b64dec', 'urlenc', 'urldec', 'hexenc', 'hexdec', 'jwtpayload']],
    ['Compress', ['inflate', 'gzip']],
    ['Format / convert', ['jsonfmt', 'jsonmin', 'jsonstr', 'tojsonstr', 'json2yaml', 'yaml2json', 'toml2json']],
    ['Text', ['trim', 'upper', 'lower', 'reverse', 'sortlines', 'uniqlines']],
    ['Hash', ['sha1', 'sha256', 'sha512']],
];

/** A wrapping set of checkbox chips. Ids are `${prefix}-${slug(value)}`. */
function chipSet(prefix: string, labelId: string, items: Array<[value: string, label: string]>, checked: readonly string[]): string {
    return `<div class="chip-set" role="group" aria-labelledby="${labelId}">${items.map(([v, l]) =>
        `<label class="check-chip"><input type="checkbox" id="${prefix}-${slug(v)}" value="${esc(v)}"${checked.includes(v) ? ' checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
}
const checkedValues = (root: HTMLElement): string[] =>
    Array.from(root.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked')).map(c => c.value);
const setChecked = (root: HTMLElement, values: readonly string[]): void =>
    root.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(c => { c.checked = values.includes(c.value); });

const select = (id: string, label: string, choices: Array<[string, string]>, value?: string): string => `
    <label class="flex items-center gap-2 text-[12px]">
        <span class="text-text-secondary">${esc(label)}</span>
        <select id="${id}" class="toolbar-select cursor-pointer">${choices.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
    </label>`;

/** Read an integer field in [lo, hi]; marks the field and throws a readable error otherwise. */
function intField(id: string, lo: number, hi: number, label: string): number {
    const raw = $f(id).value.trim();
    const n = Number(raw);
    const ok = raw !== '' && Number.isInteger(n) && n >= lo && n <= hi;
    setFieldInvalid(id, !ok, ok ? undefined : `${label} must be a whole number from ${lo} to ${hi}`);
    if (!ok) throw new Error(`${label} must be a whole number from ${lo} to ${hi}`);
    return n;
}

// ── Key pair ──────────────────────────────────────────────────────────────

export function keyPair(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                ${select('kp-type', 'Type', [['ed25519', 'Ed25519'], ['ec-p256', 'EC P-256'], ['ec-p384', 'EC P-384'], ['rsa-2048', 'RSA 2048'], ['rsa-3072', 'RSA 3072'], ['rsa-4096', 'RSA 4096']], 'ed25519')}
                ${select('kp-fmt', 'Format', [['pem', 'PEM + OpenSSH'], ['jwk', 'JWK']], 'pem')}
                <label class="flex items-center gap-2 text-[12px]">
                    <span class="text-text-secondary whitespace-nowrap" id="kp-input-label">SSH comment</span>
                    <input type="text" class="form-control py-1" id="kp-input" aria-labelledby="kp-input-label" placeholder="you@host" spellcheck="false">
                </label>
                <button type="button" class="btn-primary" id="kp-generate">${icon('key')} Generate</button>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head"><h3 id="kp-public-label">Public key</h3><div class="flex gap-2"><button type="button" class="btn-icon btn-sm" id="kp-sample">${icon('science')} Sample</button>${copyButton('kp-public')}</div></div>
                    <textarea class="form-control font-mono" id="kp-public" rows="8" readonly data-output aria-labelledby="kp-public-label" placeholder="Press Generate"></textarea>
                    <div id="kp-ssh-wrap">
                        <div class="card-head mt-3"><h3 id="kp-ssh-label">OpenSSH (authorized_keys)</h3>${copyButton('kp-ssh')}</div>
                        <textarea class="form-control font-mono" id="kp-ssh" rows="3" readonly aria-labelledby="kp-ssh-label"></textarea>
                    </div>
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="kp-private-label">Private key <span class="secret-tag"><i class="material-icons" aria-hidden="true">lock</i>Secret: don't share</span></h3>${copyButton('kp-private')}</div>
                    <textarea class="form-control font-mono secret-blur" id="kp-private" rows="14" readonly aria-labelledby="kp-private-label" aria-describedby="kp-private-hint"></textarea>
                    <p class="ui-hint mt-1" id="kp-private-hint">Blurred until you hover or focus it. Copy works either way.</p>
                </div>
            </div>
        </div>`;

    const btn = $<HTMLButtonElement>('kp-generate');
    let sshBase = ''; // "ssh-xxx BASE64" without the comment
    const withComment = (): string => { const c = $f('kp-input').value.trim(); return sshBase ? (c ? `${sshBase} ${c}` : sshBase) : ''; };
    const syncFormat = (): void => { $('kp-ssh-wrap').hidden = $f('kp-fmt').value === 'jwk'; };

    let seq = 0;
    const idle = (): void => { btn.disabled = false; $<HTMLButtonElement>('kp-sample').disabled = false; btn.innerHTML = `${icon('key')} Generate`; };
    const generate = async (): Promise<void> => {
        const mine = ++seq;
        const epoch = toolEpoch;
        const live = (): boolean => mine === seq && epoch === toolEpoch && btn.isConnected;
        const type = $f('kp-type').value as KeyType;
        btn.disabled = true;
        $<HTMLButtonElement>('kp-sample').disabled = true;
        btn.innerHTML = `${icon('hourglass_top')} Generating…`;
        reportOk(type.startsWith('rsa') ? 'Generating RSA key (can take a few seconds)…' : 'Generating…');
        try {
            const kp = await generateKeyPair(type, 'x');
            if (!live()) return;
            const jwk = $f('kp-fmt').value === 'jwk';
            sshBase = kp.ssh ? kp.ssh.split(' ').slice(0, 2).join(' ') : '';
            $f('kp-public').value = jwk ? json(kp.publicJwk) : kp.publicPem;
            $f('kp-private').value = jwk ? json(kp.privateJwk) : kp.privatePem;
            $f('kp-ssh').value = withComment();
            syncFormat();
            reportOk('Generated locally; never leaves this machine');
        } catch (e) {
            if (live()) reportError(e);
        } finally {
            if (live()) idle();
        }
    };
    // The comment only changes the SSH line: never regenerate the key for it
    $('kp-input').addEventListener('input', () => { $f('kp-ssh').value = withComment(); });
    // Changing type/format invalidates the shown key; the user decides when to generate
    for (const id of ['kp-type', 'kp-fmt']) $(id).addEventListener('change', () => {
        seq++; // drop any in-flight generation of the old type/format
        idle();
        sshBase = '';
        for (const o of ['kp-public', 'kp-private', 'kp-ssh']) $f(o).value = '';
        syncFormat();
        resetStatus();
    });
    btn.onclick = () => void generate();
    $('kp-sample').onclick = () => { $f('kp-type').value = 'ed25519'; $f('kp-fmt').value = 'pem'; $f('kp-input').value = 'me@laptop'; void generate(); };
    syncFormat();
    resetStatus();
}

// ── Fake data ─────────────────────────────────────────────────────────────

const FAKE_DEFAULT: FakeField[] = ['id', 'fullName', 'email', 'city'];
const FAKE_SAMPLE: FakeField[] = ['id', 'fullName', 'email', 'company', 'city', 'createdAt'];

export function fakeData(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                ${select('fake-fmt', 'Format', [['json', 'JSON'], ['csv', 'CSV'], ['sql', 'SQL INSERT'], ['ndjson', 'NDJSON']], 'json')}
                ${select('fake-count', 'Rows', ['5', '10', '25', '100', '500'].map(n => [n, n] as [string, string]), '10')}
                <label class="flex items-center gap-2 text-[12px]" id="fake-table-wrap" hidden>
                    <span class="text-text-secondary" id="fake-table-label">Table</span>
                    <input type="text" class="form-control py-1" id="fake-table" value="users" aria-labelledby="fake-table-label" spellcheck="false">
                </label>
                <button type="button" class="btn-icon btn-sm" id="fake-generate">${icon('refresh')} Regenerate</button>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="fake-fields-label">Fields</h3>
                        <div class="flex gap-1">
                            <button type="button" class="btn-icon btn-sm" id="fake-sample">${icon('science')} Sample</button>
                            <button type="button" class="btn-icon btn-sm" id="fake-none">${icon('clear')} None</button>
                        </div>
                    </div>
                    <div id="fake-fields">${FAKE_GROUPS.map(([g, fs], i) => `<p class="chip-group-label" id="fake-g${i}">${g}</p>${chipSet('fake-f', `fake-fields-label fake-g${i}`, fs.map(f => [f, f]), FAKE_DEFAULT)}`).join('')}</div>
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="fake-output-label">Data</h3>${copyButton('fake-output')}</div>
                    <textarea class="form-control font-mono" id="fake-output" rows="18" readonly data-output aria-labelledby="fake-output-label"></textarea>
                </div>
            </div>
        </div>`;
    const fields = $('fake-fields');
    // Rows are regenerated only when fields/count change or on Regenerate; format and table just re-render
    let rows: ReturnType<typeof fakeRecords> = [];
    const update = (regenerate: boolean): void => {
        const fmt = $f('fake-fmt').value as FakeFormat;
        $('fake-table-wrap').hidden = fmt !== 'sql';
        const chosen = checkedValues(fields) as FakeField[];
        if (!chosen.length) { rows = []; $f('fake-output').value = ''; reportError('Pick at least one field'); return; }
        if (regenerate || !rows.length) rows = fakeRecords(Number($f('fake-count').value) || 10, chosen);
        $f('fake-output').value = formatFake(rows, fmt, $f('fake-table').value.trim() || 'users');
        reportOk(`${plural(rows.length, 'row')} · ${plural(chosen.length, 'field')}`);
    };
    fields.addEventListener('change', () => update(true));
    $('fake-count').addEventListener('change', () => update(true));
    $('fake-fmt').addEventListener('change', () => update(false));
    $('fake-table').addEventListener('input', debounce(() => update(false)));
    $('fake-generate').onclick = () => update(true);
    $('fake-sample').onclick = () => { setChecked(fields, FAKE_SAMPLE); update(true); };
    $('fake-none').onclick = () => {
        const before = checkedValues(fields);
        if (!before.length) return;
        setChecked(fields, []); update(true);
        showToast(`Cleared ${plural(before.length, 'field')}`, 'success', { label: 'Undo', run: () => { setChecked(fields, before); update(true); } });
    };
    resetStatus();
    update(true);
}

// ── Cron builder ──────────────────────────────────────────────────────────

const DAYS: Array<[string, string]> = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Which inputs each frequency uses. */
const CRON_USES: Record<CronFreq, string[]> = {
    'minute': [],
    'interval-minutes': ['every'],
    'interval-hours': ['every', 'minute'],
    'hourly': ['minute'],
    'daily': ['time'],
    'weekly': ['time', 'days'],
    'monthly': ['time', 'dom'],
    'yearly': ['time', 'dom', 'month'],
};

export function cronBuilder(container: HTMLElement): void {
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
                        ${([['minute', 'Every minute'], ['interval-minutes', 'Every N minutes'], ['hourly', 'Hourly'], ['interval-hours', 'Every N hours'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']] as Array<[string, string]>)
                            .map(([v, l]) => `<option value="${esc(v)}"${v === 'daily' ? ' selected' : ''}>${esc(l)}</option>`).join('')}
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
        container.querySelectorAll<HTMLElement>('[data-cron-uses]').forEach(el => { el.hidden = !uses.includes(el.dataset.cronUses!); });
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
                spec.hour = Number(m[1]); spec.minute = Number(m[2]);
            }
            if (uses.includes('days')) {
                spec.weekdays = checkedValues(days).map(Number);
                if (!spec.weekdays.length) throw new Error('Pick at least one day');
            }
            if (uses.includes('dom')) spec.dayOfMonth = intField('cronb-dom', 1, 31, 'Day of month');
            if (uses.includes('month')) spec.month = Number($f('cronb-month').value);
            const r = buildCron(spec);
            if (r.error) { setFieldInvalid('cronb-dom', true, r.error); throw new Error(r.error); }
            const runs = window.cronParser.getNextOccurrences(r.expression, 3); // throws if it can never run
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

// ── .gitignore ────────────────────────────────────────────────────────────

const GI_SAMPLE = ['Node', 'Vite', 'Env', 'macOS', 'Windows', 'VSCode'];

export function gitignore(container: HTMLElement): void {
    const names = Object.keys(GITIGNORE);
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="gi-input-label">Templates</h3>
                        <div class="flex gap-1">
                            <button type="button" class="btn-icon btn-sm" id="gi-sample">${icon('science')} Sample</button>
                            <button type="button" class="btn-icon btn-sm" id="gi-clear">${icon('clear')} Clear</button>
                        </div>
                    </div>
                    <div id="gi-templates">${chipSet('gi-t', 'gi-input-label', names.map(n => [n, n]), [])}</div>
                    <p class="mt-3 text-[12px] text-text-tertiary">Combine any number; duplicate lines are removed.</p>
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="gi-output-label">.gitignore</h3>${copyButton('gi-output')}</div>
                    <textarea class="form-control font-mono" id="gi-output" rows="20" wrap="off" readonly data-output aria-labelledby="gi-output-label" placeholder="Pick one or more templates"></textarea>
                </div>
            </div>
        </div>`;
    const set = $('gi-templates');
    const update = (): void => {
        const chosen = names.filter(n => checkedValues(set).includes(n)); // stable template order
        $f('gi-output').value = chosen.length ? buildGitignore(chosen) : '';
        if (chosen.length) reportOk(plural(chosen.length, 'template')); else resetStatus();
    };
    set.addEventListener('change', update);
    $('gi-sample').onclick = () => { setChecked(set, GI_SAMPLE); update(); };
    $('gi-clear').onclick = () => { setChecked(set, []); update(); };
    resetStatus();
    update();
}

// ── Reference tables ──────────────────────────────────────────────────────

/** Searchable reference: search box + grouped table; clicking a row copies its key. */
function referenceTool(opts: {
    prefix: string;
    placeholder: string;
    sample: string;
    toolbar?: string;
    rows: (q: string) => Array<{ group: string; key: string; name?: string; desc: string; copy: string }>;
    onReady?: (update: () => void) => void;
}): (container: HTMLElement) => void {
    const p = opts.prefix;
    return (container: HTMLElement): void => {
        container.innerHTML = `
            <div class="custom-interface">
                <div class="tool-toolbar">
                    <input type="search" class="form-control py-1 max-w-[360px]" id="${p}-input" aria-label="Search" placeholder="${esc(opts.placeholder)}" spellcheck="false">
                    ${opts.toolbar ?? ''}
                    <button type="button" class="btn-icon btn-sm" id="${p}-sample">${icon('science')} Sample</button>
                </div>
                <div class="tool-card">
                    <div id="${p}-output" class="overflow-auto" role="region" aria-label="Results"></div>
                </div>
            </div>`;
        const out = $(`${p}-output`);
        const update = (): void => {
            const rows = opts.rows($f(`${p}-input`).value.trim());
            if (!rows.length) { out.innerHTML = '<p class="text-[13px] text-text-secondary">No matches. Try fewer words or clear the search.</p>'; reportError('No matches'); return; }
            reportOk(`${rows.length} match${rows.length === 1 ? '' : 'es'}`, 'Enter copies the first · ↑↓ to move');
            const groups = new Map<string, typeof rows>();
            for (const r of rows) { const g = groups.get(r.group) ?? []; g.push(r); groups.set(r.group, g); }
            out.innerHTML = [...groups].map(([g, rs]) => `
                <h3 class="ref-group">${esc(g)}</h3>
                <table class="ref-table"><tbody>${rs.map(r => `
                    <tr>
                        <td${/^[1-5]\d\d$/.test(r.key) ? ` data-code-class="${r.key[0]}"` : ''}><button type="button" class="ref-copy" data-copy-text="${esc(r.copy)}" title="Copy ${esc(r.copy)}" aria-label="Copy ${esc(r.copy)}">${esc(r.key)}<i class="material-icons ref-copy-icon" aria-hidden="true">content_copy</i></button></td>
                        <td>${r.name ? `<span class="ref-name">${esc(r.name)}</span> · ` : ''}${esc(r.desc)}</td>
                    </tr>`).join('')}</tbody></table>`).join('');
        };
        $(`${p}-input`).addEventListener('input', debounce(update, 60));
        $(`${p}-input`).addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            update();
            out.querySelector<HTMLButtonElement>('.ref-copy')?.click();
        });
        // ↑/↓ move between copy buttons; ↑ from the first returns to the search box
        container.querySelector<HTMLElement>('.custom-interface')!.addEventListener('keydown', e => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const t = e.target as HTMLElement;
            const btns = Array.from(out.querySelectorAll<HTMLButtonElement>('.ref-copy'));
            const i = t.id === `${p}-input` ? -1 : btns.indexOf(t as HTMLButtonElement);
            if (i === -1 && t.id !== `${p}-input`) return;
            e.preventDefault();
            const next = e.key === 'ArrowDown' ? btns[i + 1] : i <= 0 ? $(`${p}-input`) : btns[i - 1];
            next?.focus();
            next?.scrollIntoView({ block: 'nearest' });
        });
        $(`${p}-sample`).onclick = () => { $f(`${p}-input`).value = opts.sample; update(); };
        opts.onReady?.(update);
        resetStatus();
        update();
    };
}

const HTTP_CLASS: Record<string, string> = { '1': '1xx Informational', '2': '2xx Success', '3': '3xx Redirection', '4': '4xx Client error', '5': '5xx Server error' };

export const httpStatus = referenceTool({
    prefix: 'http',
    placeholder: 'Code (404), class (4) or words (gateway)',
    sample: '5',
    rows: q => searchHttpStatus(q).map(([c, n, d]) => ({ group: HTTP_CLASS[String(c)[0]!] ?? 'Other', key: String(c), name: n, desc: d, copy: `${c} ${n}` })),
});

export const cheatSheets = referenceTool({
    prefix: 'cheat',
    placeholder: 'Filter, e.g. stash, lookahead, prune',
    sample: '',
    toolbar: select('cheat-sheet', 'Sheet', [['', 'All sheets'], ...Object.keys(CHEATSHEETS).map(k => [k, k] as [string, string])], ''),
    rows: q => {
        const sheet = (document.getElementById('cheat-sheet') as HTMLSelectElement | null)?.value ?? '';
        const s = q.toLowerCase();
        return Object.entries(CHEATSHEETS)
            .filter(([name]) => !sheet || name === sheet)
            .flatMap(([name, rows]) => rows
                .filter(([a, b]) => !s || `${a} ${b}`.toLowerCase().includes(s))
                .map(([a, b]) => ({ group: name, key: a, desc: b, copy: a })));
    },
    onReady: update => {
        $('cheat-sheet').addEventListener('change', update);
        $('cheat-sample').onclick = () => { $f('cheat-sheet').value = 'Git'; $f('cheat-input').value = ''; update(); };
    },
});

// ── Pipeline ──────────────────────────────────────────────────────────────

export function pipeline(container: HTMLElement): void {
    const opLabel = (id: string): string => CHAIN_OPS.find(o => o.id === id)?.label ?? id;
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="chain-input-label">Input</h3>
                        ${inputActions({ paste: 'chain-input', sample: 'chain-sample', clear: 'chain-clear' })}
                    </div>
                    <textarea class="form-control font-mono" id="chain-input" rows="8" aria-labelledby="chain-input-label" spellcheck="false"></textarea>
                    <div class="card-head mt-4">
                        <h3 id="chain-steps-label">Steps</h3>
                        <select id="chain-recipe" class="toolbar-select cursor-pointer" aria-label="Load a recipe">
                            <option value="">Load recipe…</option>
                            ${CHAIN_RECIPES.map((r, i) => `<option value="${i}">${esc(r.label)}</option>`).join('')}
                        </select>
                    </div>
                    <p class="ui-hint mb-2" id="chain-hint">Each step's output feeds the next. Try a recipe or Sample.</p>
                    <ol class="step-list" id="chain-steps" aria-labelledby="chain-steps-label"></ol>
                    <input type="hidden" id="chain-ops" value="trim,b64dec,jsonfmt">
                    <div class="grid grid-cols-2 gap-2 mt-2">
                    <input type="search" id="chain-filter" class="form-control min-w-0" placeholder="Filter steps…" aria-label="Filter steps" aria-describedby="chain-hint" spellcheck="false">
                    <select id="chain-add" class="toolbar-select cursor-pointer min-w-0" aria-label="Add a step">
                        <option value="">+ Add step…</option>
                        ${CHAIN_GROUPS.map(([g, ids]) => `<optgroup label="${esc(g)}">${ids.map(id => `<option value="${id}">${esc(opLabel(id))}</option>`).join('')}</optgroup>`).join('')}
                    </select>
                    </div>
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="chain-output-label">Output</h3>${copyButton('chain-output')}</div>
                    <p class="step-warn" id="chain-warn" role="status" hidden><i class="material-icons" aria-hidden="true">info</i><span id="chain-warn-text"></span></p>
                    <textarea class="form-control font-mono" id="chain-output" rows="20" readonly data-output aria-labelledby="chain-output-label"></textarea>
                </div>
            </div>
        </div>`;

    let ops: string[] = ['trim', 'b64dec', 'jsonfmt'];
    let results: Array<{ output?: string; error?: string } | undefined> = [];
    const list = $('chain-steps');

    const focusKey = (): string | null => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !list.contains(a)) return null;
        return a.dataset.stepMove !== undefined ? `[data-step-move="${a.dataset.stepMove}"]` : a.dataset.stepRemove !== undefined ? `[data-step-remove="${a.dataset.stepRemove}"]` : null;
    };
    const renderSteps = (): void => {
        const keep = focusKey();
        renderStepsInner();
        if (keep) list.querySelector<HTMLElement>(keep)?.focus();
    };
    const renderStepsInner = (): void => {
        if (!ops.length) { list.innerHTML = '<li class="text-[12px] text-text-tertiary">No steps: output equals input. Add a step below.</li>'; return; }
        list.innerHTML = ops.map((id, i) => {
            const r = results[i];
            const err = r?.error ? esc(r.error.replace(/^[^:]+:\s*/, '')) : '';
            const meta = err ? 'failed' : r?.output !== undefined ? `${[...r.output].length} chars` : '';
            return `<li class="step-row${r?.error ? ' is-error' : ''}">
                <span class="step-num">${i + 1}</span>
                <span class="step-label">${esc(opLabel(id))}</span>
                <span class="step-meta">${meta}</span>
                <button type="button" class="btn-icon btn-ghost btn-sm" data-step-move="${i}:-1" aria-label="Move ${esc(opLabel(id))} up"${i === 0 ? ' disabled' : ''}>${icon('arrow_upward')}</button>
                <button type="button" class="btn-icon btn-ghost btn-sm" data-step-move="${i}:1" aria-label="Move ${esc(opLabel(id))} down"${i === ops.length - 1 ? ' disabled' : ''}>${icon('arrow_downward')}</button>
                <button type="button" class="btn-icon btn-ghost btn-sm" data-step-remove="${i}" aria-label="Remove ${esc(opLabel(id))}">${icon('close')}</button>
                ${err ? `<p class="step-error">${err}<span class="step-error-hint">Check the input, or remove or reorder this step.</span></p>` : ''}
            </li>`;
        }).join('');
    };

    /** Mark the output as a partial result (stopped before step `failed`), or clear the mark. */
    const showPartial = (failed: number | null): void => {
        const warn = $('chain-warn');
        warn.hidden = failed === null;
        $('chain-output').classList.toggle('is-partial', failed !== null);
        if (failed !== null) $('chain-warn-text').textContent = failed === 0
            ? `Partial result: stopped at step 1 (${opLabel(ops[0]!)}), so this is the unchanged input.`
            : `Partial result: stopped at step ${failed + 1} (${opLabel(ops[failed]!)}), so this is the output of step ${failed}.`;
    };

    let seq = 0;
    const update = async (): Promise<void> => {
        const mine = ++seq;
        const epoch = toolEpoch;
        const input = $f('chain-input').value;
        if (!input.trim()) {
            results = [];
            renderSteps();
            showPartial(null);
            $f('chain-output').value = '';
            setFieldInvalid('chain-input', false);
            resetStatus();
            return;
        }
        const r = await runChain(input, ops);
        if (mine !== seq || epoch !== toolEpoch || !list.isConnected) return;
        results = r.steps;
        renderSteps();
        const failed = r.steps.findIndex(s => s.error);
        if (failed >= 0) {
            $f('chain-output').value = r.output;
            showPartial(failed);
            setFieldInvalid('chain-input', false);
            reportOk(`Partial result: stopped at step ${failed + 1}`, 'see the step for details');
        } else {
            $f('chain-output').value = r.output;
            showPartial(null);
            setFieldInvalid('chain-input', false);
            reportOk(`Ran ${plural(ops.length, 'step')}`);
        }
    };
    const setOps = (next: string[]): void => {
        ops = next.filter(id => CHAIN_OPS.some(o => o.id === id));
        $f('chain-ops').value = ops.join(',');
        results = [];
        renderSteps();
        void update();
    };
    // Session restore writes the hidden field and fires change
    $('chain-ops').addEventListener('change', () => { const v = $f('chain-ops').value; if (v !== ops.join(',')) setOps(v ? v.split(',') : []); });

    list.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!b) return;
        if (b.dataset.stepRemove !== undefined) {
            const i = Number(b.dataset.stepRemove);
            const before = ops, removed = ops[i]!;
            setOps(ops.filter((_, j) => j !== i));
            showToast(`Removed "${opLabel(removed)}"`, 'success', { label: 'Undo', run: () => setOps(before) });
            (list.querySelectorAll<HTMLButtonElement>('[data-step-remove]')[Math.min(i, ops.length - 1)] ?? $('chain-add')).focus();
        } else if (b.dataset.stepMove) {
            const [i, d] = b.dataset.stepMove.split(':').map(Number) as [number, number];
            const next = [...ops];
            [next[i], next[i + d]] = [next[i + d]!, next[i]!];
            setOps(next);
            (list.querySelector<HTMLButtonElement>(`[data-step-move="${i + d}:${d}"]:not(:disabled)`)
                ?? list.querySelector<HTMLButtonElement>(`[data-step-move="${i + d}:${-d}"]`))?.focus();
        }
    });
    const filter = $f('chain-filter');
    const visibleOps = (): HTMLOptionElement[] => Array.from($f('chain-add').querySelectorAll<HTMLOptionElement>('optgroup option')).filter(o => !o.hidden);
    filter.addEventListener('input', () => {
        const q = filter.value.trim().toLowerCase();
        for (const g of Array.from($f('chain-add').querySelectorAll('optgroup'))) {
            let any = false;
            for (const o of Array.from(g.querySelectorAll('option'))) { o.hidden = !!q && !o.textContent!.toLowerCase().includes(q) && !o.value.includes(q); any ||= !o.hidden; }
            g.hidden = !any;
        }
        const n = visibleOps().length;
        if (q) { if (n) reportOk(`${n} matching step${n === 1 ? '' : 's'}`, 'Enter adds the first'); else reportError('No matching step'); } else resetStatus();
    });
    filter.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const first = visibleOps()[0];
            if (first) { e.preventDefault(); setOps([...ops, first.value]); filter.value = ''; filter.dispatchEvent(new Event('input')); }
        } else if (e.key === 'Escape' && filter.value) { e.preventDefault(); filter.value = ''; filter.dispatchEvent(new Event('input')); }
    });
    $('chain-add').addEventListener('change', () => {
        const sel = $f('chain-add');
        if (sel.value) setOps([...ops, sel.value]);
        sel.value = '';
    });
    $('chain-recipe').addEventListener('change', () => {
        const sel = $f('chain-recipe');
        const recipe = CHAIN_RECIPES[Number(sel.value)];
        sel.value = '';
        if (!recipe) return;
        const before = [...ops];
        setOps([...recipe.ops]);
        if (before.length && before.join(',') !== ops.join(',')) showToast(`Loaded "${recipe.label}"`, 'success', { label: 'Undo', run: () => setOps(before) });
    });
    $('chain-input').addEventListener('input', debounce(() => void update()));
    $('chain-sample').onclick = () => { $f('chain-input').value = 'eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iXX0='; setOps(['b64dec', 'jsonfmt']); };
    $('chain-clear').onclick = () => clearWithUndo(['chain-input'], () => void update());
    renderSteps();
    resetStatus();
}
