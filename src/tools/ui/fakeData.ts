import { $, $f, reportError, reportOk, resetStatus, showToast } from '../../ui';
import { debounce, copyButton, icon, select, chipSet, checkedValues, setChecked, plural } from './common';
import { fakeRecords, formatFake, type FakeField, type FakeFormat } from '../lib/generate';

const FAKE_GROUPS: Array<[string, FakeField[]]> = [
  ['Identity', ['id', 'uuid', 'firstName', 'lastName', 'fullName', 'email', 'username', 'phone', 'birthdate', 'age']],
  ['Work', ['company', 'jobTitle']],
  ['Address', ['street', 'city', 'state', 'zip', 'country']],
  ['Values', ['createdAt', 'price', 'boolean', 'ipv4', 'url', 'color', 'sentence']],
];
const FAKE_DEFAULT: FakeField[] = ['id', 'fullName', 'email', 'city'];
const FAKE_SAMPLE: FakeField[] = ['id', 'fullName', 'email', 'company', 'city', 'createdAt'];

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                ${select(
                  'fake-fmt',
                  'Format',
                  [
                    ['json', 'JSON'],
                    ['csv', 'CSV'],
                    ['sql', 'SQL INSERT'],
                    ['ndjson', 'NDJSON'],
                  ],
                  'json',
                )}
                ${select(
                  'fake-count',
                  'Rows',
                  ['5', '10', '25', '100', '500'].map((n) => [n, n] as [string, string]),
                  '10',
                )}
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
                    <div id="fake-fields">${FAKE_GROUPS.map(
                      ([g, fs], i) =>
                        `<p class="chip-group-label" id="fake-g${i}">${g}</p>${chipSet(
                          'fake-f',
                          `fake-fields-label fake-g${i}`,
                          fs.map((f) => [f, f]),
                          FAKE_DEFAULT,
                        )}`,
                    ).join('')}</div>
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
    if (!chosen.length) {
      rows = [];
      $f('fake-output').value = '';
      reportError('Pick at least one field');
      return;
    }
    if (regenerate || !rows.length) rows = fakeRecords(Number($f('fake-count').value) || 10, chosen);
    $f('fake-output').value = formatFake(rows, fmt, $f('fake-table').value.trim() || 'users');
    reportOk(`${plural(rows.length, 'row')} · ${plural(chosen.length, 'field')}`);
  };
  fields.addEventListener('change', () => update(true));
  $('fake-count').addEventListener('change', () => update(true));
  $('fake-fmt').addEventListener('change', () => update(false));
  $('fake-table').addEventListener(
    'input',
    debounce(() => update(false)),
  );
  $('fake-generate').onclick = () => update(true);
  $('fake-sample').onclick = () => {
    setChecked(fields, FAKE_SAMPLE);
    update(true);
  };
  $('fake-none').onclick = () => {
    const before = checkedValues(fields);
    if (!before.length) return;
    setChecked(fields, []);
    update(true);
    showToast(`Cleared ${plural(before.length, 'field')}`, 'success', {
      label: 'Undo',
      run: () => {
        setChecked(fields, before);
        update(true);
      },
    });
  };
  resetStatus();
  update(true);
}
