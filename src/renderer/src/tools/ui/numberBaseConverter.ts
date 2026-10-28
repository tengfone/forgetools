import { $f, reportError, resetStatus, setFieldInvalid } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3>Number Bases</h3>
                    <div class="ui-meta flex items-center gap-1">
                        <i class="material-icons icon-sm">info</i>
                        Type in any field to convert
                    </div>
                </div>
                <div class="result-grid">
                    <div class="result-item">
                        <label class="field-label">
                            <span>Binary (Base 2)</span>
                            <button class="btn-icon btn-sm" data-copy="num-binary">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control" id="num-binary" placeholder="1010">
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>Octal (Base 8)</span>
                            <button class="btn-icon btn-sm" data-copy="num-octal">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control" id="num-octal" placeholder="12">
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>Decimal (Base 10)</span>
                            <button class="btn-icon btn-sm" data-copy="num-decimal">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control" id="num-decimal" placeholder="10">
                    </div>
                    <div class="result-item">
                        <label class="field-label">
                            <span>Hexadecimal (Base 16)</span>
                            <button class="btn-icon btn-sm" data-copy="num-hex">
                                <i class="material-icons icon-sm">content_copy</i>
                            </button>
                        </label>
                        <input type="text" class="form-control" id="num-hex" placeholder="A">
                    </div>
                </div>
            </div>
        </div>
    `;
    
    let updating = false;
    const update = (sourceBase: number, sourceId: string) => {
        if (updating) return;
        updating = true;
        
        try {
            const value = $f(sourceId).value.trim();
            if (!value) {
                $f('num-binary').value = '';
                $f('num-octal').value = '';
                $f('num-decimal').value = '';
                $f('num-hex').value = '';
                resetStatus();
                updating = false;
                return;
            }
            
            const digits = '0123456789abcdef'.slice(0, sourceBase);
            if (!new RegExp(`^[${digits}]+$`, 'i').test(value)) throw new Error(`Not a valid base-${sourceBase} number`);
            const decimal = parseInt(value, sourceBase);
            
            if (sourceId !== 'num-binary') $f('num-binary').value = decimal.toString(2);
            if (sourceId !== 'num-octal') $f('num-octal').value = decimal.toString(8);
            if (sourceId !== 'num-decimal') $f('num-decimal').value = decimal.toString(10);
            if (sourceId !== 'num-hex') $f('num-hex').value = decimal.toString(16).toUpperCase();
            setFieldInvalid(sourceId, false);
            resetStatus();
        } catch (e) {
            ['num-binary', 'num-octal', 'num-decimal', 'num-hex'].forEach(id => { if (id !== sourceId) $f(id).value = ''; });
            setFieldInvalid(sourceId, true);
            reportError(e);
        }
        
        updating = false;
    };
    
    $f('num-binary').addEventListener('input', () => update(2, 'num-binary'));
    $f('num-octal').addEventListener('input', () => update(8, 'num-octal'));
    $f('num-decimal').addEventListener('input', () => update(10, 'num-decimal'));
    $f('num-hex').addEventListener('input', () => update(16, 'num-hex'));
}
