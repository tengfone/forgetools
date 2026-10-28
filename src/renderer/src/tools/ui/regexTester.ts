import { $f, reportError } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Regular Expression</h3>
                    <div class="flex items-center gap-2">
                        <label class="text-xs text-text-secondary"><input type="checkbox" id="regex-global" checked> g</label>
                        <label class="text-xs text-text-secondary"><input type="checkbox" id="regex-case"> i</label>
                        <label class="text-xs text-text-secondary"><input type="checkbox" id="regex-multiline"> m</label>
                    </div>
                </div>
                <input type="text" class="form-control font-mono text-[13px]" id="regex-pattern" placeholder="^[a-z0-9]+$" value="\\w+">
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Test String</h3>
                    <button class="btn-icon btn-sm" data-paste="regex-test" aria-label="Paste test string">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="regex-test" rows="6" placeholder="Enter text to test...">Hello world 123</textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Visual Preview</h3>
                    <div class="ui-meta">Hover matches to see groups</div>
                </div>
                <div class="panel-well font-mono p-3 min-h-[60px] max-h-[200px] overflow-y-auto whitespace-pre-wrap" id="regex-preview"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Match Details</h3>
                    <div class="text-xs text-text-secondary" id="regex-count"></div>
                </div>
                <div class="panel-well p-4 min-h-[100px] max-h-[300px] overflow-y-auto" id="regex-matches"></div>
            </div>
        </div>
    `;
    
    const update = () => {
        try {
            const pattern = $f('regex-pattern').value;
            const testStr = $f('regex-test').value;
            const flags = ($f('regex-global').checked ? 'g' : '') +
                        ($f('regex-case').checked ? 'i' : '') +
                        ($f('regex-multiline').checked ? 'm' : '');
            
            if (!pattern) {
                $f('regex-matches').innerHTML = '<div class="text-center text-text-secondary p-5"><i class="material-icons empty-glyph">pattern</i>Enter a regex pattern...</div>';
                $f('regex-count').textContent = '';
                $f('regex-preview').textContent = testStr;
                return;
            }
            
            if (!testStr) {
                $f('regex-matches').innerHTML = '<div class="text-center text-text-secondary p-5">Enter test string...</div>';
                $f('regex-count').textContent = '';
                $f('regex-preview').textContent = '';
                return;
            }
            
            const regex = new RegExp(pattern, flags);
            const matches = [...testStr.matchAll(regex)];
            
            // Update Visual Preview with Highlights
            let lastIndex = 0;
            let previewHtml = '';
            const fullText = testStr;
            
            // Sort matches by index to ensure correct reconstruction
            matches.sort((a, b) => a.index - b.index);
            
            matches.forEach((match, i) => {
                // Add non-matched text before this match
                previewHtml += fullText.substring(lastIndex, match.index)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                    
                // Add matched text with highlight
                const matchText = match[0]
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                    
                const groupsTooltip = match.length > 1 
                    ? match.slice(1).map((g: string | undefined, gi: number) => `Group ${gi+1}: ${g}`).join('\n')
                    : 'Full Match';
                    
                previewHtml += `<span class="regex-match regex-hit" title="${groupsTooltip.replace(/"/g, '&quot;')}">${matchText}</span>`;
                
                lastIndex = match.index + match[0].length;
            });
            
            // Add remaining text
            previewHtml += fullText.substring(lastIndex)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
                
            const previewEl = $f('regex-preview');
            previewEl.innerHTML = previewHtml;
            
            
            if (matches.length === 0) {
                $f('regex-matches').innerHTML = '<div class="text-center text-error p-5"><i class="material-icons empty-glyph">error_outline</i>No matches found</div>';
                $f('regex-count').textContent = '0 matches';
            } else {
                $f('regex-count').textContent = matches.length + ' match' + (matches.length > 1 ? 'es' : '');
                let html = '<div class="flex flex-col gap-2">';
                matches.forEach((match, i) => {
                    html += `
                        <div class="match-card">
                            <div class="ui-meta mb-1">Match ${i + 1}</div>
                            <div class="match-card-value mb-2">${match[0]}</div>
                            ${match.length > 1 ? '<div class="ui-meta mb-1">Groups:</div>' : ''}
                            ${match.slice(1).map((g: string | undefined, gi: number) => `<div class="font-mono text-xs ml-3">Group ${gi + 1}: ${g || '<em>empty</em>'}</div>`).join('')}
                        </div>
                    `;
                });
                html += '</div>';
                $f('regex-matches').innerHTML = html;
            }
        } catch (e) {
            reportError(e, 'previous matches kept');
            $f('regex-count').textContent = 'Error';
            $f('regex-preview').textContent = $f('regex-test').value;
        }
    };
    
    $f('regex-pattern').addEventListener('input', update);
    $f('regex-test').addEventListener('input', update);
    $f('regex-global').addEventListener('change', update);
    $f('regex-case').addEventListener('change', update);
    $f('regex-multiline').addEventListener('change', update);
    update();
}
