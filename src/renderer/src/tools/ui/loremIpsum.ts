import { $, $f, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { debounce, copyButton } from './common';

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const PARAGRAPH = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Options</h3>
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label class="ui-label" for="lorem-count">Count (1-50)</label>
                        <input type="number" class="form-control" id="lorem-count" value="3" min="1" max="50">
                    </div>
                    <div>
                        <label class="ui-label" for="lorem-type">Type</label>
                        <select class="form-control cursor-pointer" id="lorem-type">
                            <option value="paragraphs">Paragraphs</option>
                            <option value="sentences">Sentences</option>
                            <option value="words">Words</option>
                        </select>
                    </div>
                </div>
                <button type="button" class="btn-primary self-start" id="lorem-generate"><i class="material-icons" aria-hidden="true">refresh</i> Generate</button>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3 id="lorem-result-label">Generated Text</h3>
                    ${copyButton('lorem-result')}
                </div>
                <div class="panel-well p-5 min-h-[200px] max-h-[500px] overflow-y-auto leading-[1.8] whitespace-pre-wrap" id="lorem-result" role="textbox" aria-readonly="true" aria-labelledby="lorem-result-label"></div>
            </div>
        </div>
    `;

    const generate = (): void => {
        const count = parseInt($f('lorem-count').value, 10);
        if (!Number.isFinite(count) || count < 1 || count > 50) {
            setFieldInvalid('lorem-count', true, 'Count must be between 1 and 50');
            reportError('Count must be between 1 and 50');
            return;
        }
        setFieldInvalid('lorem-count', false);
        const type = $f('lorem-type').value;
        let parts: string[];
        if (type === 'words') {
            parts = [Array.from({ length: count }, (_, i) => WORDS[i % WORDS.length]).join(' ')];
        } else if (type === 'sentences') {
            parts = [Array.from({ length: count }, () => {
                const len = 8 + Math.floor(Math.random() * 8);
                const w = Array.from({ length: len }, () => WORDS[Math.floor(Math.random() * WORDS.length)]);
                w[0] = w[0].charAt(0).toUpperCase() + w[0].slice(1);
                return w.join(' ') + '.';
            }).join(' ')];
        } else {
            parts = Array.from({ length: count }, () => PARAGRAPH);
        }
        $('lorem-result').textContent = parts.join('\n\n');
        reportOk('Generated', `${count} ${type}`);
    };

    $f('lorem-count').addEventListener('input', debounce(generate));
    $f('lorem-type').addEventListener('change', generate);
    $('lorem-generate').onclick = generate;
    generate();
    resetStatus();
}
