import { $f, reportError, clearWithUndo, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>SVG Input</h3>
                    <div class="flex gap-1">
                        <button class="btn-icon btn-sm" data-paste="svg-input">
                            <i class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                        <button class="btn-icon btn-sm" id="svg-clear">
                            <i class="material-icons icon-sm">clear</i> Clear
                        </button>
                    </div>
                </div>
                <textarea class="form-control" id="svg-input" rows="12" placeholder="<svg>...</svg>"></textarea>
                <div class="ui-meta mt-1.5" id="svg-input-size"></div>
            </div>
            <div class="tool-card">
                <div class="card-head">
                    <h3>Optimized Output</h3>
                    <button class="btn-icon" id="svg-copy">
                        <i class="material-icons">content_copy</i> Copy
                    </button>
                </div>
                <textarea class="form-control" id="svg-output" rows="12" readonly></textarea>
                <div class="ui-meta mt-1.5" id="svg-stats"></div>
            </div>
        </div>
    `;
    
    const optimizeSVG = (svg: string): string => window.electronAPI.svg.optimize(svg);

    const update = () => {
        const input = $f('svg-input').value;
        const output = $f('svg-output');
        
        if (!input.trim()) {
            output.value = '';
            $f('svg-input-size').textContent = '';
            $f('svg-stats').textContent = '';
            return;
        }
        
        const inputSize = new Blob([input]).size;
        $f('svg-input-size').textContent = `Size: ${(inputSize / 1024).toFixed(2)} KB`;
        
        let optimized: string;
        try {
            optimized = optimizeSVG(input);
        } catch (e) {
            output.value = '';
            $f('svg-stats').textContent = '';
            reportError(e);
            return;
        }
        const outputSize = new Blob([optimized]).size;
        const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
        
        output.value = optimized;
        $f('svg-stats').textContent = `Size: ${(outputSize / 1024).toFixed(2)} KB | Reduced by ${reduction}%`;
        $f('svg-stats').className = Number(reduction) > 0 ? 'ui-meta mt-1.5 text-success' : 'ui-meta mt-1.5';
    };
    
    $f('svg-input').addEventListener('input', update);
    $f('svg-clear').onclick = () => clearWithUndo(['svg-input'], update);
    $f('svg-copy').onclick = () => {
        void copyText($f('svg-output').value);
    };
}
