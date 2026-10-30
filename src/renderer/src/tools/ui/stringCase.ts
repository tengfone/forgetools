import { $f, reportOk, resetStatus } from '../../ui';
import { inputActions, readonlyField, wireLiveTool, toolCard } from './common';
import { toCamelCase, toPascalCase, toSnakeCase, toKebabCase } from '../lib/text';

const CASES: [id: string, label: string, fn: (s: string) => string][] = [
  ['case-camel', 'camelCase', toCamelCase],
  ['case-pascal', 'PascalCase', toPascalCase],
  ['case-snake', 'snake_case', toSnakeCase],
  ['case-kebab', 'kebab-case', toKebabCase],
  ['case-upper', 'UPPER CASE', (s) => s.toUpperCase()],
  ['case-lower', 'lower case', (s) => s.toLowerCase()],
];

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({ title: 'Input Text', titleId: 'case-input-label', actions: inputActions({ paste: 'case-input', sample: 'case-sample', clear: 'case-clear' }), body: '<textarea class="form-control" id="case-input" rows="6" aria-labelledby="case-input-label" placeholder="Enter or paste text to convert..."></textarea>' })}
            <div class="tool-card">
                <div class="card-head">
                    <h3>Converted Cases</h3>
                    <div class="ui-meta">Click any output to copy</div>
                </div>
                <div class="result-grid">
                    ${CASES.map(([id, label]) => readonlyField(id, label)).join('')}
                </div>
            </div>
        </div>
    `;
  const input = $f('case-input');
  const update = (): void => {
    const val = input.value;
    CASES.forEach(([id, , fn]) => {
      $f(id).value = val ? fn(val) : '';
    });
    if (val) reportOk('Converted');
    else resetStatus();
  };
  wireLiveTool({
    input,
    update,
    sample: { button: 'case-sample', value: 'hello world from forgeTools' },
    clear: { button: 'case-clear', fields: ['case-input'] },
  });
}
