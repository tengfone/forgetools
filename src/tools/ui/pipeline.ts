import {
  $,
  $f,
  esc,
  reportError,
  reportOk,
  resetStatus,
  setFieldInvalid,
  clearWithUndo,
  toolEpoch,
  showToast,
} from '../../ui';
import { debounce, inputActions, copyButton, icon, plural } from './common';
import { CHAIN_OPS, CHAIN_RECIPES, runChain } from '../lib/chain';

const CHAIN_GROUPS: Array<[string, string[]]> = [
  ['Encode / decode', ['b64enc', 'b64dec', 'urlenc', 'urldec', 'hexenc', 'hexdec', 'jwtpayload']],
  ['Compress', ['inflate', 'gzip']],
  ['Format / convert', ['jsonfmt', 'jsonmin', 'jsonstr', 'tojsonstr', 'json2yaml', 'yaml2json', 'toml2json']],
  ['Text', ['trim', 'upper', 'lower', 'reverse', 'sortlines', 'uniqlines']],
  ['Hash', ['sha1', 'sha256', 'sha512']],
];

export function render(container: HTMLElement): void {
  const opLabel = (id: string): string => CHAIN_OPS.find((o) => o.id === id)?.label ?? id;
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
                        ${CHAIN_GROUPS.map(([g, ids]) => `<optgroup label="${esc(g)}">${ids.map((id) => `<option value="${id}">${esc(opLabel(id))}</option>`).join('')}</optgroup>`).join('')}
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
    return a.dataset.stepMove !== undefined
      ? `[data-step-move="${a.dataset.stepMove}"]`
      : a.dataset.stepRemove !== undefined
        ? `[data-step-remove="${a.dataset.stepRemove}"]`
        : null;
  };
  const renderSteps = (): void => {
    const keep = focusKey();
    renderStepsInner();
    if (keep) list.querySelector<HTMLElement>(keep)?.focus();
  };
  const renderStepsInner = (): void => {
    if (!ops.length) {
      list.innerHTML =
        '<li class="text-[12px] text-text-tertiary">No steps: output equals input. Add a step below.</li>';
      return;
    }
    list.innerHTML = ops
      .map((id, i) => {
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
      })
      .join('');
  };

  /** Mark the output as a partial result (stopped before step `failed`), or clear the mark. */
  const showPartial = (failed: number | null): void => {
    const warn = $('chain-warn');
    warn.hidden = failed === null;
    $('chain-output').classList.toggle('is-partial', failed !== null);
    if (failed !== null)
      $('chain-warn-text').textContent =
        failed === 0
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
    const failed = r.steps.findIndex((s) => s.error);
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
    ops = next.filter((id) => CHAIN_OPS.some((o) => o.id === id));
    $f('chain-ops').value = ops.join(',');
    results = [];
    renderSteps();
    void update();
  };
  // Session restore writes the hidden field and fires change
  $('chain-ops').addEventListener('change', () => {
    const v = $f('chain-ops').value;
    if (v !== ops.join(',')) setOps(v ? v.split(',') : []);
  });

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.stepRemove !== undefined) {
      const i = Number(b.dataset.stepRemove);
      const before = ops,
        removed = ops[i]!;
      setOps(ops.filter((_, j) => j !== i));
      showToast(`Removed "${opLabel(removed)}"`, 'success', { label: 'Undo', run: () => setOps(before) });
      (
        list.querySelectorAll<HTMLButtonElement>('[data-step-remove]')[Math.min(i, ops.length - 1)] ?? $('chain-add')
      ).focus();
    } else if (b.dataset.stepMove) {
      const [i, d] = b.dataset.stepMove.split(':').map(Number) as [number, number];
      const next = [...ops];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      setOps(next);
      (
        list.querySelector<HTMLButtonElement>(`[data-step-move="${i + d}:${d}"]:not(:disabled)`) ??
        list.querySelector<HTMLButtonElement>(`[data-step-move="${i + d}:${-d}"]`)
      )?.focus();
    }
  });
  const filter = $f('chain-filter');
  const visibleOps = (): HTMLOptionElement[] =>
    Array.from($f('chain-add').querySelectorAll<HTMLOptionElement>('optgroup option')).filter((o) => !o.hidden);
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const g of Array.from($f('chain-add').querySelectorAll('optgroup'))) {
      let any = false;
      for (const o of Array.from(g.querySelectorAll('option'))) {
        o.hidden = !!q && !o.textContent!.toLowerCase().includes(q) && !o.value.includes(q);
        any ||= !o.hidden;
      }
      g.hidden = !any;
    }
    const n = visibleOps().length;
    if (q) {
      if (n) reportOk(`${n} matching step${n === 1 ? '' : 's'}`, 'Enter adds the first');
      else reportError('No matching step');
    } else resetStatus();
  });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = visibleOps()[0];
      if (first) {
        e.preventDefault();
        setOps([...ops, first.value]);
        filter.value = '';
        filter.dispatchEvent(new Event('input'));
      }
    } else if (e.key === 'Escape' && filter.value) {
      e.preventDefault();
      filter.value = '';
      filter.dispatchEvent(new Event('input'));
    }
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
    if (before.length && before.join(',') !== ops.join(','))
      showToast(`Loaded "${recipe.label}"`, 'success', { label: 'Undo', run: () => setOps(before) });
  });
  $('chain-input').addEventListener(
    'input',
    debounce(() => void update()),
  );
  $('chain-sample').onclick = () => {
    $f('chain-input').value = 'eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iXX0=';
    setOps(['b64dec', 'jsonfmt']);
  };
  $('chain-clear').onclick = () => clearWithUndo(['chain-input'], () => void update());
  renderSteps();
  resetStatus();
}
