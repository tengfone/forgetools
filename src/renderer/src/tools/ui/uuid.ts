import { $, $f, esc, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton, emptyState } from './common';

const MAX = 100;

const row = (label: string, value: string, last = false): string => `
    <div class="result-item${last ? '' : ' mb-3'}">
        <div class="ui-section">${label}</div>
        <div class="copy-chip mt-1" data-copy-self>${esc(value)}</div>
    </div>`;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="uuid-input-label">Inspect</h3>
                        ${inputActions({ paste: 'uuid-input', sample: 'uuid-sample-btn', clear: 'uuid-clear-btn' })}
                    </div>
                    <input type="text" class="form-control mb-3" id="uuid-input" aria-labelledby="uuid-input-label" placeholder="Paste UUID or ULID here...">

                    <div class="card-head mt-6">
                        <h3>Generate</h3>
                        <div class="flex gap-1">
                            ${copyButton('uuid-list')}
                            <button type="button" class="btn-icon btn-sm" id="uuid-clear-list-btn"><i class="material-icons icon-sm" aria-hidden="true">clear</i> Clear</button>
                        </div>
                    </div>
                    <div class="flex items-end gap-2 mb-3">
                        <div class="flex-1">
                            <label class="ui-label" for="uuid-type">Type</label>
                            <select id="uuid-type" class="toolbar-select w-full">
                                <option value="uuid-v4">UUID v4</option>
                                <option value="ulid">ULID</option>
                            </select>
                        </div>
                        <div>
                            <label class="ui-label" for="uuid-quantity">Quantity (1-${MAX})</label>
                            <input type="number" id="uuid-quantity" class="form-control w-24 !py-0 h-7" value="10" min="1" max="${MAX}">
                        </div>
                        <button type="button" class="btn-primary" id="uuid-generate-btn">Generate</button>
                    </div>
                    <label class="check-label flex items-center gap-1.5 mb-3" for="uuid-lowercase">
                        <input type="checkbox" id="uuid-lowercase">
                        <span>lowercase</span>
                    </label>
                    <span class="field-label" id="uuid-list-label">Generated IDs</span>
                    <textarea id="uuid-list" class="form-control" rows="10" readonly aria-labelledby="uuid-list-label"></textarea>
                </div>

                <div class="tool-card">
                    <h3>Decoded Information</h3>
                    <div class="text-[13px] text-text-secondary" id="uuid-breakdown"></div>
                </div>
            </div>
        </div>
    `;

    const input = $f('uuid-input');
    const breakdown = $('uuid-breakdown');
    const typeSelect = $f('uuid-type');
    const quantityInput = $f('uuid-quantity');
    const list = $f('uuid-list');
    const lowercaseCheckbox = $f('uuid-lowercase');
    const EMPTY = emptyState('Version, timestamp and variant appear here once an ID is pasted.', 'uuid-sample-btn');

    const parseID = (raw: string): void => {
        const id = raw.trim();
        if (!id) {
            breakdown.innerHTML = EMPTY;
            setFieldInvalid('uuid-input', false);
            resetStatus();
            return;
        }
        const clean = id.replace(/-/g, '');
        if (clean.length === 26 && /^[0-9A-HJKMNP-TV-Z]+$/i.test(clean)) {
            try {
                const decoded = window.electronAPI.ulid.decode(id);
                breakdown.innerHTML = row('Type', 'ULID') + row('Timestamp', `${decoded.timestamp} ms`) + row('Date', String(decoded.date), true);
                setFieldInvalid('uuid-input', false);
                reportOk('Valid ULID');
            } catch {
                breakdown.innerHTML = EMPTY;
                setFieldInvalid('uuid-input', true, 'Not a valid ULID: timestamp part is out of range');
                reportError('Not a valid ULID: timestamp part is out of range');
            }
        } else if (/^[0-9a-f]{32}$/i.test(clean) && (id.length === 32 || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
            const version = parseInt(clean[12], 16);
            const variant = parseInt(clean[16], 16) >> 2;
            const std = clean.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
            breakdown.innerHTML = row('Type', 'UUID')
                + row('Standard String Format', std)
                + row('Raw Contents', (clean.match(/.{2}/g) ?? []).join(':').toLowerCase())
                + row('Version', `${version} (${version === 4 ? 'random' : version === 1 ? 'time-based' : version === 7 ? 'Unix time' : 'other'})`)
                + row('Variant', variant === 2 ? 'RFC 4122' : 'Other', true);
            setFieldInvalid('uuid-input', false);
            reportOk('Valid UUID', `v${version}`);
        } else {
            breakdown.innerHTML = EMPTY;
            setFieldInvalid('uuid-input', true, 'Not a valid UUID (32 hex digits, 8-4-4-4-12) or ULID (26 Crockford base32 chars)');
            reportError('Not a valid UUID (32 hex digits, 8-4-4-4-12) or ULID (26 Crockford base32 chars)');
        }
    };

    const readQuantity = (): number | null => {
        const n = parseInt(quantityInput.value, 10);
        if (!Number.isFinite(n) || n < 1 || n > MAX) {
            setFieldInvalid('uuid-quantity', true, `Quantity must be between 1 and ${MAX}`);
            reportError(`Quantity must be between 1 and ${MAX}`);
            return null;
        }
        setFieldInvalid('uuid-quantity', false);
        return n;
    };

    const generate = (): void => {
        const count = readQuantity();
        if (count === null) return;
        const lower = lowercaseCheckbox.checked;
        const ids = Array.from({ length: count }, () => {
            const id = typeSelect.value === 'uuid-v4' ? crypto.randomUUID() : window.electronAPI.ulid.generate();
            return lower ? id.toLowerCase() : id.toUpperCase();
        });
        list.value = ids.join('\n');
        reportOk(`Generated ${count} ${typeSelect.value === 'ulid' ? 'ULID' : 'UUID'}${count > 1 ? 's' : ''}`);
    };

    input.addEventListener('input', debounce(() => parseID(input.value)));
    quantityInput.addEventListener('input', debounce(generate));
    quantityInput.addEventListener('blur', () => {
        const n = parseInt(quantityInput.value, 10);
        if (Number.isFinite(n)) { quantityInput.value = String(Math.min(MAX, Math.max(1, n))); generate(); }
    });
    typeSelect.addEventListener('change', generate);
    lowercaseCheckbox.addEventListener('change', generate);
    $('uuid-generate-btn').onclick = generate;
    $('uuid-sample-btn').onclick = () => { input.value = crypto.randomUUID(); parseID(input.value); };
    $('uuid-clear-btn').onclick = () => clearWithUndo(['uuid-input'], () => parseID(input.value));
    $('uuid-clear-list-btn').onclick = () => clearWithUndo(['uuid-list'], () => {}, 'List cleared');

    breakdown.innerHTML = EMPTY;
    generate();
    resetStatus();
}
