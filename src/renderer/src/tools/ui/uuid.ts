import { $f, showToast, reportError, clearWithUndo, copyText } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <h3>Input</h3>
                    <div class="flex gap-2 mb-3">
                        <button class="btn-icon" id="uuid-clipboard-btn"><i class="material-icons">content_paste</i> Paste</button>
                        <button class="btn-icon" id="uuid-sample-btn"><i class="material-icons">shuffle</i> Sample (v4)</button>
                        <button class="btn-icon" id="uuid-clear-btn"><i class="material-icons">clear</i> Clear</button>
                    </div>
                    <input type="text" class="form-control mb-3" id="uuid-input" placeholder="Paste UUID or ULID here...">
                    
                    <h3 class="mt-6">Generate New IDs</h3>
                    <div class="flex items-center gap-2 mb-3">
                        <select id="uuid-type" class="toolbar-select flex-1">
                            <option value="uuid-v4">UUID v4</option>
                            <option value="ulid">ULID</option>
                        </select>
                        <span class="text-xs text-text-secondary">×</span>
                        <input type="number" id="uuid-quantity" class="form-control w-20" value="10" min="1" max="100">
                        <button class="btn-primary" id="uuid-generate-btn">Generate</button>
                    </div>
                    <div class="flex gap-2 mb-3">
                        <button class="btn-icon" id="uuid-copy-all-btn"><i class="material-icons">content_copy</i> Copy</button>
                        <button class="btn-icon" id="uuid-clear-list-btn"><i class="material-icons">delete_outline</i> Clear</button>
                        <label class="check-label ml-auto flex items-center gap-1.5">
                            <input type="checkbox" id="uuid-lowercase">
                            <span>lowercase</span>
                        </label>
                    </div>
                    <textarea id="uuid-list" class="form-control" rows="10" readonly placeholder="Generated IDs will appear here..."></textarea>
                </div>
                
                <div class="tool-card">
                    <h3>Decoded Information</h3>
                    <div class="text-[13px] text-text-secondary" id="uuid-breakdown">
                        <p>Paste or generate a UUID/ULID to see details</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const input = $f('uuid-input');
    const breakdown = $f('uuid-breakdown');
    const generateBtn = $f('uuid-generate-btn');
    const typeSelect = $f('uuid-type');
    const quantityInput = $f('uuid-quantity');
    const list = $f('uuid-list');
    const lowercaseCheckbox = $f('uuid-lowercase');
    
    // Parse and display UUID/ULID breakdown
    const parseID = (id: string) => {
        if (!id) {
            breakdown.innerHTML = '<p>Paste or generate a UUID/ULID to see details</p>';
            return;
        }
        
        const cleanId = id.trim().replace(/-/g, '');
        
        // Check if it's a ULID
        if (cleanId.length === 26 && /^[0-9A-Z]+$/i.test(cleanId)) {
            try {
                const decoded = window.electronAPI.ulid.decode(id);
                breakdown.innerHTML = `
                    <div class="result-item mb-3">
                        <label class="font-semibold text-text-primary">Type</label>
                        <div class="copy-chip mt-1">ULID</div>
                    </div>
                    <div class="result-item mb-3">
                        <label class="font-semibold text-text-primary">Timestamp</label>
                        <div class="copy-chip mt-1">${decoded.timestamp} ms</div>
                    </div>
                    <div class="result-item">
                        <label class="font-semibold text-text-primary">Date</label>
                        <div class="copy-chip mt-1">${decoded.date}</div>
                    </div>
                `;
            } catch (e) {
                breakdown.innerHTML = '';
                reportError('Not a valid ULID');
            }
        } else if ((cleanId.length === 32 && /^[0-9A-F]+$/i.test(cleanId)) || id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            // UUID
            const version = parseInt(cleanId[12], 16);
            const variant = parseInt(cleanId[16], 16) >> 6;
            breakdown.innerHTML = `
                <div class="result-item mb-3">
                    <label class="font-semibold text-text-primary">Type</label>
                    <div class="copy-chip mt-1">UUID</div>
                </div>
                <div class="result-item mb-3">
                    <label class="font-semibold text-text-primary">Standard String Format</label>
                    <div class="copy-chip mt-1">${id.toLowerCase()}</div>
                </div>
                <div class="result-item mb-3">
                    <label class="font-semibold text-text-primary">Raw Contents</label>
                    <div class="copy-chip mt-1">${(cleanId.match(/.{1,2}/g) ?? []).join(':').toLowerCase()}</div>
                </div>
                <div class="result-item mb-3">
                    <label class="font-semibold text-text-primary">Version</label>
                    <div class="copy-chip mt-1">${version} (${version === 4 ? 'random' : version === 1 ? 'time-based' : 'unknown'})</div>
                </div>
                <div class="result-item">
                    <label class="font-semibold text-text-primary">Variant</label>
                    <div class="copy-chip mt-1">${variant === 2 ? 'RFC 4122' : 'Other'}</div>
                </div>
            `;
        } else {
            breakdown.innerHTML = '';
            reportError('Not a valid UUID or ULID');
        }
    };
    
    input.addEventListener('input', (e) => parseID((e.target as HTMLInputElement).value));
    
    // Generate button
    generateBtn.onclick = () => {
        const type = typeSelect.value;
        const count = parseInt(quantityInput.value) || 1;
        const lowercase = lowercaseCheckbox.checked;
        const ids = [];
        
        for (let i = 0; i < count; i++) {
            let id;
            if (type === 'uuid-v4') {
                id = crypto.randomUUID();
            } else {
                id = window.electronAPI.ulid.generate();
            }
            ids.push(lowercase ? id.toLowerCase() : id.toUpperCase());
        }
        
        list.value = ids.join('\n');
        if (ids.length > 0) {
            input.value = ids[0];
            parseID(ids[0]);
        }
    };
    
    // Toolbar buttons
    $f('uuid-clipboard-btn').onclick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            input.value = text;
            parseID(text);
        } catch {
            showToast('Clipboard is unavailable. Paste with Ctrl+V instead.', 'error');
        }
    };
    
    $f('uuid-sample-btn').onclick = () => {
        const sample = crypto.randomUUID();
        input.value = sample;
        parseID(sample);
    };
    
    $f('uuid-clear-btn').onclick = () => clearWithUndo([input.id], () => parseID(input.value));
    
    $f('uuid-copy-all-btn').onclick = () => {
        void copyText(list.value);
    };
    
    $f('uuid-clear-list-btn').onclick = () => clearWithUndo([list.id], () => {}, 'List cleared');
    
    // Generate initial UUIDs
    generateBtn.click();
}
