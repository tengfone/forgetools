import { $, $f, esc, reportOk, reportError, resetStatus, setFieldInvalid, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton } from './common';
import { readToolDef, renderTool, checkTool, tsToSchema, type ToolTarget } from '../lib/toolSchema';

const TARGETS: Array<[ToolTarget, string]> = [
  ['openai', 'OpenAI Chat'],
  ['openai-responses', 'OpenAI Responses'],
  ['anthropic', 'Anthropic'],
  ['gemini', 'Gemini'],
  ['mcp', 'MCP'],
];

const SAMPLE = `interface SearchFlights {
  /** IATA code, e.g. SIN */
  from: string;
  /** IATA code, e.g. NRT */
  to: string;
  /** YYYY-MM-DD */
  date: string;
  cabin?: 'economy' | 'business' | 'first';
  passengers: number;
}`;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                <label class="flex items-center gap-2 text-[12px]">
                    <span class="text-text-secondary">Output for</span>
                    <select id="tsch-target" class="toolbar-select cursor-pointer">
                        ${TARGETS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                    </select>
                </label>
                <label class="check-chip" id="tsch-strict-wrap"><input type="checkbox" id="tsch-strict"> Strict (OpenAI)</label>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="tsch-input-label">Input</h3>
                        ${inputActions({ paste: 'tsch-input', sample: 'tsch-sample', clear: 'tsch-clear' })}
                    </div>
                    <textarea class="form-control font-mono" id="tsch-input" rows="13" spellcheck="false" aria-labelledby="tsch-input-label" placeholder="A TypeScript interface, a JSON Schema, sample arguments as JSON, or a tool definition from any provider..."></textarea>
                    <div class="grid grid-cols-2 gap-3 mt-3">
                        <div><label class="ui-label" for="tsch-name">Name</label><input type="text" class="form-control font-mono" id="tsch-name" placeholder="search_flights"></div>
                        <div><label class="ui-label" for="tsch-desc">Description</label><input type="text" class="form-control" id="tsch-desc" placeholder="What the tool does and when to use it"></div>
                    </div>
                    <p class="ui-meta mt-2" id="tsch-from"></p>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="tsch-output-label">Tool definition</h3>
                        ${copyButton('tsch-output')}
                    </div>
                    <textarea class="form-control font-mono" id="tsch-output" rows="13" aria-labelledby="tsch-output-label" readonly data-output spellcheck="false"></textarea>
                    <ul class="tsch-warn mt-2" id="tsch-warn" aria-live="polite"></ul>
                </div>
            </div>
        </div>`;

  const input = $f('tsch-input');
  const nameEl = $f('tsch-name');
  const descEl = $f('tsch-desc');
  const target = $<HTMLSelectElement>('tsch-target');
  const strict = $<HTMLInputElement>('tsch-strict');
  const output = $f('tsch-output');
  const warn = $('tsch-warn');
  const from = $('tsch-from');

  const update = (): void => {
    const src = input.value.trim();
    $('tsch-strict-wrap').hidden = !target.value.startsWith('openai');
    if (!src) {
      output.value = '';
      warn.innerHTML = '';
      from.textContent = '';
      setFieldInvalid('tsch-input', false);
      resetStatus();
      return;
    }
    try {
      const fallbackName = nameEl.value.trim() || 'my_tool';
      const fallbackDesc = descEl.value.trim();
      let parsed;
      if (/^\s*(export\s+)?(interface|type)\b|^\s*\{\s*[\w$]+\??\s*:/.test(src) && !/^\s*\{\s*"/.test(src)) {
        const ifaceName = /(?:interface|type)\s+([\w$]+)/.exec(src)?.[1];
        const snake = ifaceName?.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        parsed = {
          def: {
            name: nameEl.value.trim() || snake || 'my_tool',
            description: fallbackDesc,
            parameters: tsToSchema(src),
          },
          from: 'TypeScript',
        };
      } else {
        parsed = readToolDef(JSON.parse(src) as unknown, fallbackName, fallbackDesc);
      }
      const def = parsed.def;
      // Name/description fields override what the input carried
      if (nameEl.value.trim()) def.name = nameEl.value.trim();
      if (descEl.value.trim()) def.description = descEl.value.trim();
      nameEl.placeholder = def.name;
      if (!descEl.value.trim() && def.description) descEl.placeholder = def.description;
      const t = target.value as ToolTarget;
      const opts = { strict: strict.checked };
      output.value = JSON.stringify(renderTool(def, t, opts), null, 2);
      from.textContent = `Read as ${parsed.from}`;
      const issues = checkTool(def, t, opts);
      warn.innerHTML = issues
        .map((w) => `<li><i class="material-icons icon-sm" aria-hidden="true">warning</i>${esc(w)}</li>`)
        .join('');
      setFieldInvalid('tsch-input', false);
      reportOk(issues.length ? `${issues.length} warning(s)` : 'Valid for this provider');
    } catch (e) {
      setFieldInvalid('tsch-input', true);
      reportError(e);
    }
  };
  const live = debounce(update);
  for (const el of [input, nameEl, descEl]) el.addEventListener('input', live);
  target.addEventListener('change', update);
  strict.addEventListener('change', update);
  $('tsch-sample').onclick = () => {
    input.value = SAMPLE;
    nameEl.value = '';
    descEl.value = 'Search one-way flights between two airports on a date';
    update();
  };
  $('tsch-clear').onclick = () => clearWithUndo(['tsch-input', 'tsch-name', 'tsch-desc'], update);
  update();
}
