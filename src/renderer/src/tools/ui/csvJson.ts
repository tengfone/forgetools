import { $, $f, errorMessage, reportError, reportOk, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { directionBar, twoWay, debounce, inputActions, copyButton, toolCard } from './common';
import Papa from 'papaparse';

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">${directionBar('csv')}
            <div class="grid-2">
                ${toolCard({ title: 'CSV', titleId: 'csv-input-label', actions: inputActions({ paste: 'csv-input', sample: 'csv-sample', clear: 'csv-clear' }), body: '<textarea class="form-control" id="csv-input" rows="12" aria-labelledby="csv-input-label" placeholder="id,name&#10;1,John"></textarea>' })}
                ${toolCard({ title: 'JSON', titleId: 'json-output-label', actions: copyButton('json-output'), body: '<textarea class="form-control" id="json-output" rows="12" aria-labelledby="json-output-label" placeholder="[&#10;  { &quot;id&quot;: &quot;1&quot;, &quot;name&quot;: &quot;John&quot; }&#10;]"></textarea>' })}
            </div>
        </div>
    `;
  const csv = $f('csv-input');
  const json = $f('json-output');

  const fromCsv = (): void => {
    setFieldInvalid('json-output', false);
    if (!csv.value.trim()) {
      json.value = '';
      setFieldInvalid('csv-input', false);
      resetStatus();
      return;
    }
    try {
      const result = Papa.parse<Record<string, unknown>>(csv.value, { header: true });
      json.value = JSON.stringify(result.data, null, 2);
      setFieldInvalid('csv-input', false);
      reportOk('Converted CSV to JSON');
    } catch (e) {
      setFieldInvalid('csv-input', true, errorMessage(e));
      reportError(e);
    }
  };

  const fromJson = (): void => {
    setFieldInvalid('csv-input', false);
    if (!json.value.trim()) {
      csv.value = '';
      setFieldInvalid('json-output', false);
      resetStatus();
      return;
    }
    try {
      const data: unknown = JSON.parse(json.value);
      if (!Array.isArray(data) || data.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) {
        throw new Error('JSON must be an array of objects to convert to CSV');
      }
      csv.value = Papa.unparse(data as Record<string, unknown>[]);
      setFieldInvalid('json-output', false);
      reportOk('Converted JSON to CSV');
    } catch (e) {
      setFieldInvalid('json-output', true, errorMessage(e));
      reportError(e);
    }
  };

  csv.addEventListener('input', debounce(fromCsv));
  json.addEventListener('input', debounce(fromJson));
  const dir = twoWay({
    prefix: 'csv',
    a: { field: 'csv-input', label: 'csv-input-label', run: fromCsv },
    b: { field: 'json-output', label: 'json-output-label', run: fromJson },
    forward: 'CSV \u2192 JSON',
    backward: 'JSON \u2192 CSV',
  });
  $('csv-sample').onclick = () => {
    csv.value = 'id,name,role\n1,Ada,admin\n2,Linus,dev';
    dir.set('a');
    fromCsv();
  };
  $('csv-clear').onclick = () => clearWithUndo(['csv-input', 'json-output'], resetStatus);
  resetStatus();
}
