import { $f, esc } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <h3>Options</h3>
                <div class="flex flex-col gap-3 mb-4">
                    <div>
                        <label class="ui-label">Length: <span id="rand-length-val">16</span></label>
                        <input type="range" id="rand-length" min="4" max="128" value="16" class="form-control w-full">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <label class="check-label"><input type="checkbox" id="rand-upper" checked> Uppercase (A-Z)</label>
                        <label class="check-label"><input type="checkbox" id="rand-lower" checked> Lowercase (a-z)</label>
                        <label class="check-label"><input type="checkbox" id="rand-numbers" checked> Numbers (0-9)</label>
                        <label class="check-label"><input type="checkbox" id="rand-symbols"> Symbols (!@#$...)</label>
                    </div>
                </div>
                <button class="btn-primary btn-block" id="rand-generate">
                    <i class="material-icons">refresh</i> Generate
                </button>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Generated Strings</h3>
                    <div class="ui-meta">Click to copy</div>
                </div>
                <div class="flex flex-col gap-2" id="rand-results"></div>
            </div>
        </div>
    `;
    
    const generate = () => {
        const length = parseInt($f('rand-length').value);
        const useUpper = $f('rand-upper').checked;
        const useLower = $f('rand-lower').checked;
        const useNumbers = $f('rand-numbers').checked;
        const useSymbols = $f('rand-symbols').checked;
        
        let chars = '';
        if (useUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (useLower) chars += 'abcdefghijklmnopqrstuvwxyz';
        if (useNumbers) chars += '0123456789';
        if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        
        if (!chars) {
            $f('rand-results').innerHTML = '<div class="text-center text-error p-5">Select at least one character set</div>';
            return;
        }
        
        const results = Array.from({ length: 5 }, () => {
            const bytes = crypto.getRandomValues(new Uint32Array(length));
            return Array.from(bytes, n => chars[n % chars.length]).join('');
        });
        
        const html = results.map(r => `
            <div class="copy-chip" data-copy-self>${esc(r)}</div>
        `).join('');
        
        $f('rand-results').innerHTML = html;
    };
    
    $f('rand-length').addEventListener('input', (e) => {
        $f('rand-length-val').textContent = (e.target as HTMLInputElement).value;
    });
    $f('rand-generate').onclick = generate;
    generate();
}
