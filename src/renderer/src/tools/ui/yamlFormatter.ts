import { $f, reportError, reportOk, resetStatus, clearWithUndo, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>YAML Input</h3>
                    <div class="flex gap-1">
                        <button class="btn-icon btn-sm" data-paste="yaml-input">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                        <button class="btn-icon btn-sm" id="yaml-sample">
                            <i class="material-icons icon-sm">data_object</i> Sample
                        </button>
                        <button class="btn-icon btn-sm" id="yaml-clear">
                            <i class="material-icons icon-sm">clear</i> Clear
                        </button>
                    </div>
                </div>
                <textarea class="form-control" id="yaml-input" rows="12" placeholder="name: John
age: 30
hobbies:
- coding
- music"></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>JSON Output</h3>
                    <button class="btn-icon" id="yaml-copy">
                        <i class="material-icons">content_copy</i> Copy
                    </button>
                </div>
                <textarea class="form-control" id="yaml-output" rows="12" readonly></textarea>
            </div>
        </div>
    `;
    
    const update = () => {
        try {
            const input = $f('yaml-input').value;
            const output = $f('yaml-output');
            
            if (!input.trim()) {
                output.value = '';
                resetStatus();
                return;
            }
            
            const parsed = window.electronAPI.yaml.parse(input);
            output.value = JSON.stringify(parsed, null, 2);
            reportOk('Valid YAML');
        } catch (e) {
            reportError(e, 'check indentation and colons');
        }
    };
    
    $f('yaml-input').addEventListener('input', update);
    $f('yaml-sample').onclick = () => {
        $f('yaml-input').value = `name: John Doe
age: 30
email: john@example.com
address:
street: 123 Main St
city: San Francisco
state: CA
skills:
- JavaScript
- Python
- Go
active: true`;
        update();
    };
    $f('yaml-clear').onclick = () => clearWithUndo(['yaml-input'], update);
    $f('yaml-copy').onclick = () => {
        void copyText($f('yaml-output').value);
    };
}
