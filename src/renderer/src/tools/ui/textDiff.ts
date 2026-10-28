import { $f, esc, reportError, clearWithUndo } from '../../ui';
import { logger } from '../../logger';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <!-- Options Bar -->
            <div class="flex items-center gap-3 mb-4 p-3 rounded-sm bg-bg-card border border-border">
                <label class="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input class="cursor-pointer w-4 h-4" type="checkbox" id="diff-case-sensitive">
                    <span class="font-medium text-text-primary">Case Sensitive</span>
                </label>
                <div class="w-px h-5 bg-border"></div>
                <label class="flex items-center gap-2 text-[13px]">
                    <span class="text-text-secondary">Compare Mode:</span>
                    <select id="diff-mode" class="toolbar-select cursor-pointer">
                        <option value="line">Line by Line</option>
                        <option value="word">Word by Word</option>
                        <option value="char">Character</option>
                    </select>
                </label>
                <div class="flex-1"></div>
                <button class="btn-icon" id="diff-swap" title="Swap texts">
                    <i class="material-icons">swap_horiz</i> Swap
                </button>
                <button class="btn-icon" id="diff-clear">
                    <i class="material-icons">clear</i> Clear
                </button>
            </div>
            
            <!-- Input Panels -->
            <div class="grid-2 gap-4 mb-4">
                <div class="tool-card relative">
                    <div class="card-head">
                        <h3>Original Text</h3>
                        <button class="btn-icon btn-sm" data-paste="diff-original">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="diff-original" rows="12" placeholder="Enter or paste original text..."></textarea>
                </div>
                <div class="tool-card relative">
                    <div class="card-head">
                        <h3>Compared Text</h3>
                        <button class="btn-icon btn-sm" data-paste="diff-compared">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" id="diff-compared" rows="12" placeholder="Enter or paste compared text..."></textarea>
                </div>
            </div>
            
            <!-- Result Panel -->
            <div class="tool-card">
                <div class="card-head">
                    <div class="flex items-center gap-3">
                        <h3>Differences</h3>
                        <div class="text-xs text-text-secondary" id="diff-stats"></div>
                    </div>
                    <div class="flex items-center gap-2 text-[11px]">
                        <span class="text-success flex items-center gap-1">
                            <span class="legend-swatch is-add"></span>
                            Added
                        </span>
                        <span class="text-error flex items-center gap-1">
                            <span class="legend-swatch is-del"></span>
                            Removed
                        </span>
                    </div>
                </div>
                <div class="panel-well p-5 min-h-[250px] max-h-[500px] overflow-y-auto font-mono text-[13px] leading-[1.8]" id="diff-result"></div>
            </div>
        </div>
    `;
    
    const originalInput = $f('diff-original');
    const comparedInput = $f('diff-compared');
    const resultDiv = $f('diff-result');
    const statsDiv = $f('diff-stats');
    const caseSensitive = $f('diff-case-sensitive');
    const diffMode = $f('diff-mode');
    
    const computeDiff = () => {
        let original = originalInput.value;
        let compared = comparedInput.value;
        
        if (!original && !compared) {
            resultDiv.innerHTML = '<div class="tool-empty"><i class="material-icons empty-glyph">difference</i>Enter text in both panels to compare...</div>';
            statsDiv.textContent = '';
            return;
        }
        
        // Case sensitivity
        const isCaseSensitive = caseSensitive.checked;
        const displayOriginal = original;
        const displayCompared = compared;
        
        if (!isCaseSensitive) {
            original = original.toLowerCase();
            compared = compared.toLowerCase();
        }
        
        const mode = diffMode.value;
        let result = '';
        let addedCount = 0;
        let removedCount = 0;
        let unchangedCount = 0;
        
        if (!window.Diff) {
            resultDiv.innerHTML = '<div class="text-center text-error p-5">Diff library not available</div>';
            return;
        }
        
        try {
            const kind = (p: { added?: boolean; removed?: boolean }) => (p.added ? 'is-add' : p.removed ? 'is-del' : '');
            if (mode === 'line') {
                result = window.Diff.diffLines(original, compared).map(part => {
                    const lines = part.value.split('\n');
                    if (lines[lines.length - 1] === '') lines.pop();
                    if (part.added) addedCount += lines.length;
                    else if (part.removed) removedCount += lines.length;
                    else unchangedCount += lines.length;
                    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
                    return lines.map(line => `<div class="diff-line ${kind(part)}">${prefix}${esc(line) || ' '}</div>`).join('');
                }).join('');
            } else {
                const diff = mode === 'word' ? window.Diff.diffWords(original, compared) : window.Diff.diffChars(original, compared);
                result = diff.map(part => {
                    const n = mode === 'word' ? part.value.split(/\s+/).filter(Boolean).length : part.value.length;
                    if (part.added) addedCount += n;
                    else if (part.removed) removedCount += n;
                    const text = mode === 'char' ? part.value.replace(/\n/g, '↵\n') : part.value;
                    return `<span class="diff-inline ${kind(part)}">${esc(text)}</span>`;
                }).join('');
            }
            
            resultDiv.innerHTML = result || '<div class="tool-empty"><i class="material-icons empty-glyph">check_circle</i>No differences found - texts are identical!</div>';
            
            // Update stats
            if (addedCount || removedCount) {
                statsDiv.innerHTML = `<span class="text-success">+${addedCount}</span> / <span class="text-error">-${removedCount}</span>`;
            } else {
                statsDiv.textContent = '';
            }
        } catch (e) {
            logger.error('Diff error:', e);
            reportError(e);
        }
    };
    
    originalInput.addEventListener('input', computeDiff);
    comparedInput.addEventListener('input', computeDiff);
    caseSensitive.addEventListener('change', computeDiff);
    diffMode.addEventListener('change', computeDiff);
    
    $f('diff-clear').onclick = () => clearWithUndo([originalInput.id, comparedInput.id], computeDiff);
    
    $f('diff-swap').onclick = () => {
        const temp = originalInput.value;
        originalInput.value = comparedInput.value;
        comparedInput.value = temp;
        computeDiff();
    };
    
    // Initial state
    computeDiff();
}
