import { errorMessage, $f, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { inputActions, copyButton, wireLiveTool, toolCard } from './common';
import yaml from 'js-yaml';

const SAMPLE = `name: John Doe
age: 30
email: john@example.com
address:
  street: 123 Main St
  city: San Francisco
  state: CA
skills:
  - JavaScript
  - Python
  - Go
active: true`;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({ title: 'YAML Input', titleId: 'yaml-input-label', actions: inputActions({ paste: 'yaml-input', sample: 'yaml-sample', clear: 'yaml-clear' }), body: '<textarea class="form-control font-mono" id="yaml-input" rows="12" aria-labelledby="yaml-input-label" placeholder="name: John&#10;age: 30"></textarea>' })}
            ${toolCard({ title: 'JSON Output', titleId: 'yaml-output-label', actions: copyButton('yaml-output'), body: '<textarea class="form-control font-mono" id="yaml-output" rows="12" readonly aria-labelledby="yaml-output-label"></textarea>' })}
        </div>
    `;
  const input = $f('yaml-input');
  const output = $f('yaml-output');

  const update = (): void => {
    if (!input.value.trim()) {
      output.value = '';
      setFieldInvalid('yaml-input', false);
      resetStatus();
      return;
    }
    try {
      output.value = JSON.stringify(yaml.load(input.value), null, 2);
      setFieldInvalid('yaml-input', false);
      reportOk('Valid YAML');
    } catch (e) {
      setFieldInvalid('yaml-input', true, errorMessage(e));
      reportError(e, 'check indentation and colons');
    }
  };

  wireLiveTool({
    input,
    update,
    sample: { button: 'yaml-sample', value: SAMPLE },
    clear: { button: 'yaml-clear', fields: ['yaml-input'] },
  });
}
