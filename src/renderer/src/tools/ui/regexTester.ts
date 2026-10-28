import { emptyState, inputActions } from './common';
import { $f, clearWithUndo, esc, reportError, resetStatus } from '../../ui';

const MAX_INPUT = 200_000;
const MAX_MATCHES = 1000;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3><label for="regex-pattern">Regular Expression</label></h3>
                    <div class="flex items-center gap-2" role="group" aria-label="Flags">
                        <label class="text-xs text-text-secondary" title="global"><input type="checkbox" id="regex-global" checked aria-label="g — global"> g</label>
                        <label class="text-xs text-text-secondary" title="ignore case"><input type="checkbox" id="regex-case" aria-label="i — ignore case"> i</label>
                        <label class="text-xs text-text-secondary" title="multiline"><input type="checkbox" id="regex-multiline" aria-label="m — multiline"> m</label>
                        <label class="text-xs text-text-secondary" title="dot matches newline"><input type="checkbox" id="regex-dotall" aria-label="s — dot matches newline"> s</label>
                    </div>
                </div>
                <input type="text" class="form-control font-mono text-[13px]" id="regex-pattern" aria-label="Regular expression pattern" placeholder="^[a-z0-9]+$" value="\\w+">
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3><label for="regex-test">Test String</label></h3>
                    ${inputActions({ paste: 'regex-test', sample: 'regex-sample', clear: 'regex-clear' })}
                </div>
                <textarea class="form-control" id="regex-test" rows="6" placeholder="Enter text to test...">Hello world 123</textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Visual Preview</h3>
                    <div class="ui-meta">Capture groups are listed under Match Details</div>
                </div>
                <div class="panel-well font-mono p-3 min-h-[60px] max-h-[200px] overflow-y-auto whitespace-pre-wrap" id="regex-preview"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Match Details</h3>
                    <div class="ui-meta" id="regex-count"></div>
                </div>
                <div class="panel-well match-list min-h-[100px] max-h-[300px] overflow-y-auto" id="regex-matches"></div>
            </div>
        </div>
    `;

    const collect = (regex: RegExp, text: string): { matches: RegExpExecArray[]; capped: boolean } => {
        const matches: RegExpExecArray[] = [];
        if (!regex.global) {
            const m = regex.exec(text);
            if (m) matches.push(m);
            return { matches, capped: false };
        }
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
            if (matches.length >= MAX_MATCHES) return { matches, capped: true };
            matches.push(m);
            if (m[0].length === 0) regex.lastIndex++; // avoid infinite loop on zero-length matches
        }
        return { matches, capped: false };
    };

    const update = (): void => {
        try {
            const pattern = $f('regex-pattern').value;
            const testStr = $f('regex-test').value;
            const flags = ($f('regex-global').checked ? 'g' : '') +
                        ($f('regex-case').checked ? 'i' : '') +
                        ($f('regex-multiline').checked ? 'm' : '') +
                        ($f('regex-dotall').checked ? 's' : '');

            if (testStr.length > MAX_INPUT) {
                reportError(`Test string is too long (${testStr.length.toLocaleString()} chars). Limit is ${MAX_INPUT.toLocaleString()} characters.`);
                return;
            }

            if (!pattern) {
                $f('regex-matches').innerHTML = emptyState('Matches and capture groups appear here once a pattern is entered.');
                $f('regex-count').textContent = '';
                $f('regex-preview').textContent = testStr;
                resetStatus();
                return;
            }

            if (!testStr) {
                $f('regex-matches').innerHTML = emptyState('Matches appear here once there is a test string.');
                $f('regex-count').textContent = '';
                $f('regex-preview').textContent = '';
                resetStatus();
                return;
            }

            const regex = new RegExp(pattern, flags);
            const { matches, capped } = collect(regex, testStr);

            let lastIndex = 0;
            let previewHtml = '';
            for (const match of matches) {
                if (match.index < lastIndex) continue;
                previewHtml += esc(testStr.substring(lastIndex, match.index));
                const tip = match.length > 1
                    ? match.slice(1).map((g, gi) => `Group ${gi + 1}: ${g ?? ''}`).join('\n')
                    : 'Full Match';
                previewHtml += `<span class="regex-match regex-hit" title="${esc(tip)}">${esc(match[0])}</span>`;
                lastIndex = match.index + match[0].length;
            }
            previewHtml += esc(testStr.substring(lastIndex));
            $f('regex-preview').innerHTML = previewHtml;

            if (matches.length === 0) {
                $f('regex-matches').innerHTML = emptyState('No matches for this pattern.');
                $f('regex-count').textContent = '0 matches';
            } else {
                $f('regex-count').textContent = (capped ? `First ${MAX_MATCHES}` : String(matches.length)) +
                    ' match' + (matches.length > 1 ? 'es' : '') + (capped ? ' (more not shown)' : '');
                let html = '<div class="flex flex-col gap-2">';
                matches.forEach((match, i) => {
                    html += `
                        <div class="match-card">
                            <div class="ui-meta mb-1">Match ${i + 1}</div>
                            <div class="match-card-value mb-2">${esc(match[0])}</div>
                            ${match.length > 1 ? '<div class="ui-meta mb-1">Groups:</div>' : ''}
                            ${match.slice(1).map((g, gi) => `<div class="font-mono text-xs ml-3">Group ${gi + 1}: ${g ? esc(g) : '<em>empty</em>'}</div>`).join('')}
                        </div>
                    `;
                });
                if (capped) html += `<div class="ui-meta text-center p-2">Showing the first ${MAX_MATCHES} matches only.</div>`;
                html += '</div>';
                $f('regex-matches').innerHTML = html;
            }
            resetStatus();
        } catch (e) {
            reportError(e, 'previous matches kept');
            $f('regex-count').textContent = 'Error';
            $f('regex-preview').textContent = $f('regex-test').value.slice(0, MAX_INPUT);
        }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => { clearTimeout(timer); timer = setTimeout(update, 150); };

    $f('regex-pattern').addEventListener('input', schedule);
    $f('regex-test').addEventListener('input', schedule);
    for (const id of ['regex-global', 'regex-case', 'regex-multiline', 'regex-dotall']) {
        $f(id).addEventListener('change', update);
    }
    $f('regex-sample').onclick = () => {
        $f('regex-pattern').value = '(\\w+)@(\\w+)\\.com';
        $f('regex-test').value = 'Contact ada@forge.com or linus@tools.com for access.';
        update();
    };
    $f('regex-clear').onclick = () => clearWithUndo(['regex-test'], update);
    update();
}
