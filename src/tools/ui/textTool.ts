// Shared UI for "text in -> text out" custom tools: one input, optional extra fields and
// option selects, one read-only output. Tools declare a spec and get consistent markup,
// live updates, Sample/Clear/Paste, status-bar reporting and Ctrl/Cmd+Shift+C support.
import {
  $,
  $f,
  esc,
  errorMessage,
  reportError,
  reportOk,
  resetStatus,
  setFieldInvalid,
  clearWithUndo,
  toolEpoch,
} from '../../ui';
import { debounce, inputActions, copyButton } from './common';
import { bytesToHex } from '../lib/bytes';

/** Choices for a two-direction select: option `a` (forward) and `b` (reverse). */
export const dir = (a: string, b: string): Array<[string, string]> => [
  ['a', a],
  ['b', b],
];

/** JSON.stringify that renders bigint as a decimal string and Uint8Array as hex. */
export const jsonBytes = (v: unknown): string =>
  JSON.stringify(
    v,
    (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? bytesToHex(x) : x),
    2,
  );

export interface SelectOption {
  id: string;
  label: string;
  choices: Array<[value: string, label: string]>;
  default?: string;
}

export interface ExtraField {
  id: string;
  label: string;
  placeholder?: string;
  /** Rows for a textarea; omitted = single-line input. */
  rows?: number;
  default?: string;
}

export interface TextToolSpec {
  /** Element id prefix, e.g. "hmac" gives hmac-input / hmac-output / hmac-sample. */
  prefix: string;
  inputLabel: string;
  outputLabel: string;
  placeholder?: string;
  inputRows?: number;
  outputRows?: number;
  /** 'password' renders a masked single-line input with a reveal toggle. */
  inputType?: 'password';
  /** Sample input (and optional extra-field / option values). */
  sample: { input: string; fields?: Record<string, string>; options?: Record<string, string> };
  options?: SelectOption[];
  fields?: ExtraField[];
  /** Empty input yields empty output unless this is true (generators). */
  runOnEmpty?: boolean;
  run: (input: string, values: Record<string, string>) => string | Promise<string>;
  okMessage?: (output: string, input: string, values: Record<string, string>) => string;
}

const fieldId = (prefix: string, id: string): string => `${prefix}-${id}`;

export function textTool(spec: TextToolSpec): (container: HTMLElement) => void {
  const p = spec.prefix;
  return (container: HTMLElement): void => {
    const selects = (spec.options ?? [])
      .map(
        (o) => `
            <label class="flex items-center gap-2 text-[12px]">
                <span class="text-text-secondary">${esc(o.label)}</span>
                <select id="${fieldId(p, o.id)}" class="toolbar-select cursor-pointer">
                    ${o.choices.map(([v, l]) => `<option value="${esc(v)}"${v === (o.default ?? o.choices[0]![0]) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
                </select>
            </label>`,
      )
      .join('');
    const extras = (spec.fields ?? [])
      .map((f) => {
        const id = fieldId(p, f.id);
        const ctl = f.rows
          ? `<textarea class="form-control" id="${id}" rows="${f.rows}" aria-labelledby="${id}-label" placeholder="${esc(f.placeholder ?? '')}">${esc(f.default ?? '')}</textarea>`
          : `<input type="text" class="form-control" id="${id}" aria-labelledby="${id}-label" placeholder="${esc(f.placeholder ?? '')}" value="${esc(f.default ?? '')}">`;
        return `<div class="mt-3"><label class="ui-label" id="${id}-label" for="${id}">${esc(f.label)}</label>${ctl}</div>`;
      })
      .join('');

    container.innerHTML = `
            <div class="custom-interface">
                ${selects ? `<div class="tool-toolbar">${selects}</div>` : ''}
                <div class="grid-2">
                    <div class="tool-card">
                        <div class="card-head">
                            <h3 id="${p}-input-label">${esc(spec.inputLabel)}</h3>
                            ${inputActions({ paste: `${p}-input`, sample: `${p}-sample`, clear: `${p}-clear` })}
                        </div>
                        ${
                          spec.inputType === 'password'
                            ? `
                        <div class="flex gap-2 items-center">
                            <input type="password" class="form-control font-mono" id="${p}-input" aria-labelledby="${p}-input-label" data-secret autocomplete="off" spellcheck="false" placeholder="${esc(spec.placeholder ?? '')}">
                            <button type="button" class="btn-icon btn-ghost btn-sm" id="${p}-reveal" aria-pressed="false" aria-label="Show password" title="Show password"><i class="material-icons icon-sm" aria-hidden="true">visibility</i></button>
                        </div>`
                            : `
                        <textarea class="form-control font-mono" id="${p}-input" rows="${spec.inputRows ?? 12}" aria-labelledby="${p}-input-label" spellcheck="false" placeholder="${esc(spec.placeholder ?? '')}"></textarea>`
                        }
                        ${extras}
                    </div>
                    <div class="tool-card">
                        <div class="card-head">
                            <h3 id="${p}-output-label">${esc(spec.outputLabel)}</h3>
                            ${copyButton(`${p}-output`)}
                        </div>
                        <textarea class="form-control font-mono" id="${p}-output" rows="${spec.outputRows ?? spec.inputRows ?? 12}" aria-labelledby="${p}-output-label" readonly data-output spellcheck="false"></textarea>
                    </div>
                </div>
            </div>`;

    const input = $f(`${p}-input`);
    const output = $f(`${p}-output`);
    const values = (): Record<string, string> => {
      const v: Record<string, string> = {};
      for (const o of spec.options ?? []) v[o.id] = $f(fieldId(p, o.id)).value;
      for (const f of spec.fields ?? []) v[f.id] = $f(fieldId(p, f.id)).value;
      return v;
    };
    const reveal = document.getElementById(`${p}-reveal`);
    if (reveal)
      reveal.onclick = () => {
        const show = (input as HTMLInputElement).type === 'password';
        (input as HTMLInputElement).type = show ? 'text' : 'password';
        reveal.setAttribute('aria-pressed', String(show)); // fixed name; state via aria-pressed
        reveal.title = show ? 'Hide password' : 'Show password';
        reveal.querySelector('i')!.textContent = show ? 'visibility_off' : 'visibility';
      };
    let seq = 0;
    const update = async (): Promise<void> => {
      const mine = ++seq;
      const epoch = toolEpoch;
      const stale = (): boolean => mine !== seq || epoch !== toolEpoch || !input.isConnected;
      const text = input.value;
      if (!text.trim() && !spec.runOnEmpty) {
        output.value = '';
        setFieldInvalid(`${p}-input`, false);
        resetStatus();
        return;
      }
      try {
        const vals = values();
        const out = await spec.run(text, vals);
        if (stale()) return;
        output.value = out;
        setFieldInvalid(`${p}-input`, false);
        reportOk(spec.okMessage ? spec.okMessage(out, text, vals) : 'Done');
      } catch (e) {
        if (stale()) return;
        setFieldInvalid(`${p}-input`, true, errorMessage(e));
        reportError(e);
      }
    };
    const live = debounce(() => void update());
    input.addEventListener('input', live);
    for (const f of spec.fields ?? []) $(fieldId(p, f.id)).addEventListener('input', live);
    for (const o of spec.options ?? []) $(fieldId(p, o.id)).addEventListener('change', () => void update());

    $(`${p}-sample`).onclick = () => {
      for (const [k, v] of Object.entries(spec.sample.options ?? {})) $f(fieldId(p, k)).value = v;
      for (const [k, v] of Object.entries(spec.sample.fields ?? {})) $f(fieldId(p, k)).value = v;
      input.value = spec.sample.input;
      void update();
    };
    $(`${p}-clear`).onclick = () => clearWithUndo([`${p}-input`], () => void update());
    resetStatus();
    if (spec.runOnEmpty) void update();
  };
}
