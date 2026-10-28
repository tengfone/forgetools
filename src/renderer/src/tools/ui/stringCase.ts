import { $f } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Input Text</h3>
                    <button class="btn-icon btn-sm" data-paste="case-input" aria-label="Paste from clipboard">
                        <i class="material-icons icon-sm">content_paste</i> Paste
                    </button>
                </div>
                <textarea class="form-control" id="case-input" rows="6" placeholder="Enter or paste text to convert..."></textarea>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Converted Cases</h3>
                    <div class="ui-meta flex items-center gap-1">
                        <i class="material-icons icon-sm">info</i>
                        Click any output to copy
                    </div>
                </div>
                <div class="result-grid">
                    <div class="result-item">
                        <label class="field-label">
                            <span>camelCase</span>
                            <button class="btn-icon btn-sm" data-copy="case-camel"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-camel" readonly>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>PascalCase</span>
                            <button class="btn-icon btn-sm" data-copy="case-pascal"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-pascal" readonly>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>snake_case</span>
                            <button class="btn-icon btn-sm" data-copy="case-snake"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-snake" readonly>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>kebab-case</span>
                            <button class="btn-icon btn-sm" data-copy="case-kebab"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-kebab" readonly>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>UPPER CASE</span>
                            <button class="btn-icon btn-sm" data-copy="case-upper"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-upper" readonly>
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>lower case</span>
                            <button class="btn-icon btn-sm" data-copy="case-lower"><i class="material-icons icon-sm">content_copy</i></button>
                        </label>
                        <input type="text" class="form-control" id="case-lower" readonly>
                    </div>
                </div>
            </div>
        </div>
    `;
    $f('case-input').addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (!val) {
            $f('case-camel').value = '';
            $f('case-pascal').value = '';
            $f('case-snake').value = '';
            $f('case-kebab').value = '';
            $f('case-upper').value = '';
            $f('case-lower').value = '';
            return;
        }
        $f('case-camel').value = window.electronAPI.string.cases.toCamelCase(val);
        $f('case-pascal').value = window.electronAPI.string.cases.toPascalCase(val);
        $f('case-snake').value = window.electronAPI.string.cases.toSnakeCase(val);
        $f('case-kebab').value = window.electronAPI.string.cases.toKebabCase(val);
        $f('case-upper').value = val.toUpperCase();
        $f('case-lower').value = val.toLowerCase();
    });
}
