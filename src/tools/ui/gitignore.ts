import { $, $f, reportOk, resetStatus } from '../../ui';
import { copyButton, icon, chipSet, checkedValues, setChecked, plural } from './common';
import { buildGitignore, GITIGNORE } from '../lib/generate';

const GI_SAMPLE = ['Node', 'Vite', 'Env', 'macOS', 'Windows', 'VSCode'];

export function render(container: HTMLElement): void {
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
                    <div id="gi-templates">${chipSet(
                      'gi-t',
                      'gi-input-label',
                      names.map((n) => [n, n]),
                      [],
                    )}</div>
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
    const chosen = names.filter((n) => checkedValues(set).includes(n)); // stable template order
    $f('gi-output').value = chosen.length ? buildGitignore(chosen) : '';
    if (chosen.length) reportOk(plural(chosen.length, 'template'));
    else resetStatus();
  };
  set.addEventListener('change', update);
  $('gi-sample').onclick = () => {
    setChecked(set, GI_SAMPLE);
    update();
  };
  $('gi-clear').onclick = () => {
    setChecked(set, []);
    update();
  };
  resetStatus();
  update();
}
