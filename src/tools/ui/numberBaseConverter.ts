import { $f, clearWithUndo, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { debounce, copyIconButton, inputActions } from './common';

const FIELDS: [id: string, base: number, label: string, short: string, ph: string][] = [
  ['num-binary', 2, 'Binary (Base 2)', 'binary', '1010'],
  ['num-octal', 8, 'Octal (Base 8)', 'octal', '12'],
  ['num-decimal', 10, 'Decimal (Base 10)', 'decimal', '10'],
  ['num-hex', 16, 'Hexadecimal (Base 16)', 'hexadecimal', 'A'],
];
const ALLOWED: Record<number, string> = { 2: '0 and 1', 8: '0-7', 10: '0-9', 16: '0-9 and A-F' };

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Number Bases <span class="ui-meta font-normal">type in any field</span></h3>
                    ${inputActions({ paste: 'num-decimal', sample: 'num-sample', clear: 'num-clear' })}
                </div>
                <div class="result-grid">
                    ${FIELDS.map(
                      ([id, , label, short, ph]) => `
                    <div class="result-item">
                        <div class="field-label">
                            <label for="${id}">${label}</label>
                            ${copyIconButton(id, short)}
                        </div>
                        <input type="text" class="form-control font-mono" id="${id}" placeholder="${ph}" spellcheck="false">
                    </div>`,
                    ).join('')}
                </div>
            </div>
        </div>
    `;

  const update = (sourceBase: number, sourceId: string): void => {
    const value = $f(sourceId).value.trim();
    const others = FIELDS.filter(([id]) => id !== sourceId);
    FIELDS.forEach(([id]) => setFieldInvalid(id, false));
    if (!value) {
      others.forEach(([id]) => {
        $f(id).value = '';
      });
      resetStatus();
      return;
    }
    // Accept a leading sign, a base prefix matching this field (0x/0b/0o) and `_` separators.
    const PREFIX: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' };
    let body = value.replace(/_/g, '');
    let neg = false;
    if (/^[+-]/.test(body)) {
      neg = body[0] === '-';
      body = body.slice(1);
    }
    const pre = PREFIX[sourceBase];
    if (pre && body.toLowerCase().startsWith(pre)) body = body.slice(2);
    const digits = '0123456789abcdef'.slice(0, sourceBase);
    if (!new RegExp(`^[${digits}]+$`, 'i').test(body) || /^_|_$|__/.test(value.replace(/^[+-]?(0[xbo])?/i, ''))) {
      others.forEach(([id]) => {
        $f(id).value = '';
      });
      const msg = `Base-${sourceBase} numbers may only contain ${ALLOWED[sourceBase]}${pre ? ` (optional ${pre} prefix)` : ''}, single _ separators and a leading -`;
      setFieldInvalid(sourceId, true, msg);
      reportError(msg);
      return;
    }
    let n = BigInt(sourceBase === 10 ? body : `${pre}${body}`);
    if (neg) n = -n;
    others.forEach(([id, base]) => {
      const s = n.toString(base);
      $f(id).value = base === 16 ? s.toUpperCase() : s;
    });
    reportOk('Converted', `base ${sourceBase}`);
  };

  FIELDS.forEach(([id, base]) =>
    $f(id).addEventListener(
      'input',
      debounce(() => update(base, id)),
    ),
  );
  $f('num-sample').onclick = () => {
    $f('num-decimal').value = '255';
    update(10, 'num-decimal');
  };
  $f('num-clear').onclick = () =>
    clearWithUndo(
      FIELDS.map(([id]) => id),
      () => FIELDS.forEach(([id]) => setFieldInvalid(id, false)),
    );
  resetStatus();
}
