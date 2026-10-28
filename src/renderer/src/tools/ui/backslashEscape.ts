import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Input</h3>
                    <div class="flex gap-1">
                        <button class="btn-icon btn-sm" data-paste="escape-input">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                        <button class="btn-primary" id="escape-mode">
                            Escape
                        </button>
                    </div>
                </div>
                <textarea class="form-control" id="escape-input" rows="8" placeholder="Hello\nWorld"></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Output</h3>
                    <button class="btn-icon" data-copy="escape-output">
                        <i class="material-icons">content_copy</i> Copy
                    </button>
                </div>
                <textarea class="form-control" id="escape-output" rows="8" readonly></textarea>
            </div>
        </div>
    `;
    
    let mode = 'escape'; // 'escape' or 'unescape'
    
    const escapeString = (str: string) => {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'");
    };
    
    const unescapeString = (str: string) => {
        return str
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');
    };
    
    const update = () => {
        const input = $f('escape-input').value;
        const output = $f('escape-output');
        
        if (mode === 'escape') {
            output.value = escapeString(input);
        } else {
            output.value = unescapeString(input);
        }
    };
    
    $f('escape-input').addEventListener('input', update);
    const modeBtn = $f('escape-mode');
    modeBtn.onclick = () => {
        mode = mode === 'escape' ? 'unescape' : 'escape';
        modeBtn.textContent = mode === 'escape' ? 'Escape' : 'Unescape';
        update();
    };
}
