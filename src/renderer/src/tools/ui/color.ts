import { $f, showToast } from '../../ui';

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <h3>Input</h3>
                    <div class="flex gap-2 mb-3">
                        <button class="btn-icon" id="color-clipboard-btn"><i class="material-icons">content_paste</i> Paste</button>
                        <button class="btn-icon" id="color-sample-btn"><i class="material-icons">colorize</i> Sample</button>
                        <button class="btn-icon" id="color-clear-btn"><i class="material-icons">clear</i> Clear</button>
                    </div>
                    
                    <div class="flex gap-3 mb-4">
                        <div class="flex-1">
                            <div class="color-preview h-[120px] !mb-0" id="color-preview" style="background: #72cd42;"></div>
                        </div>
                        <div class="flex-1">
                            <label class="ui-label">Color Picker</label>
                            <input class="w-full h-[100px] rounded-sm border border-border cursor-pointer" type="color" id="color-picker" value="#72cd42">
                        </div>
                    </div>
                    
                    <div class="input-group">
                        <label>Hex</label>
                        <input type="text" class="form-control" id="color-hex" value="#72cd42" placeholder="#RRGGBB">
                    </div>
                    <div class="input-group">
                        <label>Hex with alpha</label>
                        <input type="text" class="form-control" id="color-hex-alpha" value="#72cd42ff" placeholder="#RRGGBBAA">
                    </div>
                    <div class="input-group">
                        <label>RGB</label>
                        <input type="text" class="form-control" id="color-rgb" value="rgb(114, 205, 66)" placeholder="rgb(r, g, b)">
                    </div>
                    <div class="input-group">
                        <label>RGBA</label>
                        <input type="text" class="form-control" id="color-rgba" value="rgba(114, 205, 66, 1)" placeholder="rgba(r, g, b, a)">
                    </div>
                    <div class="input-group">
                        <label>HSL</label>
                        <input type="text" class="form-control" id="color-hsl" value="hsl(99, 58%, 53%)" placeholder="hsl(h, s%, l%)">
                    </div>
                    <div class="input-group">
                        <label>HSLA</label>
                        <input type="text" class="form-control" id="color-hsla" value="hsla(99, 58%, 53%, 100%)" placeholder="hsla(h, s%, l%, a%)">
                    </div>
                    <div class="input-group">
                        <label>HSV (HSB)</label>
                        <input type="text" class="form-control" id="color-hsv" value="hsv(99, 68%, 80%)" placeholder="hsv(h, s%, v%)">
                    </div>
                    <div class="input-group">
                        <label>Opacity</label>
                        <div class="flex items-center gap-2">
                            <input class="flex-1" type="range" id="color-opacity" min="0" max="100" value="100">
                            <span class="font-mono text-[13px] min-w-[45px]" id="color-opacity-label">100%</span>
                        </div>
                    </div>
                </div>
                
                <div class="tool-card">
                    <h3>Code Presets</h3>
                    <div id="color-code-presets">
                        <div class="mb-4">
                            <div class="ui-section">CSS Level 4 Color Module:</div>
                            <div class="result-item mb-2">
                                <div class="copy-chip" data-copy-self>rgb(114 205 66)</div>
                            </div>
                            <div class="result-item mb-2">
                                <div class="copy-chip" data-copy-self>rgb(114 205 66 / 100%)</div>
                            </div>
                            <div class="result-item">
                                <div class="copy-chip" data-copy-self>hsl(99deg 58% 53%)</div>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <div class="ui-section">Swift:</div>
                            <div class="result-item">
                                <div class="copy-chip" data-copy-self>NSColor(calibratedRed: 0.4459, green: 0.8035, blue: 0.2577, alpha: 1)</div>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <div class="ui-section">.NET:</div>
                            <div class="result-item">
                                <div class="copy-chip" data-copy-self>Color.FromRgb(114, 205, 66)</div>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <div class="ui-section">Java:</div>
                            <div class="result-item">
                                <div class="copy-chip" data-copy-self>new Color(114, 205, 66)</div>
                            </div>
                        </div>
                        
                        <div>
                            <div class="ui-section">Android:</div>
                            <div class="result-item">
                                <div class="copy-chip" data-copy-self>Color.argb(255, 114, 205, 66)</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const preview = $f('color-preview');
    const picker = $f('color-picker');
    const hexInput = $f('color-hex');
    const hexAlphaInput = $f('color-hex-alpha');
    const rgbInput = $f('color-rgb');
    const rgbaInput = $f('color-rgba');
    const hslInput = $f('color-hsl');
    const hslaInput = $f('color-hsla');
    const hsvInput = $f('color-hsv');
    const opacityInput = $f('color-opacity');
    const opacityLabel = $f('color-opacity-label');
    
    let currentColor = { r: 114, g: 205, b: 66, a: 1 };
    
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
            a: result[4] ? parseInt(result[4], 16) / 255 : 1
        } : null;
    };
    
    const rgbToHsl = (r: number, g: number, b: number) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s: number, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };
    
    const rgbToHsv = (r: number, g: number, b: number) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let h = 0, s = max === 0 ? 0 : d / max, v = max;
        if (max === min) { h = 0; }
        else {
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
    };
    
    const updateAll = () => {
        const { r, g, b, a } = currentColor;
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        const hexAlpha = hex + Math.round(a * 255).toString(16).padStart(2, '0');
        const hsl = rgbToHsl(r, g, b);
        const hsv = rgbToHsv(r, g, b);
        
        preview.style.background = `rgba(${r}, ${g}, ${b}, ${a})`;
        picker.value = hex;
        hexInput.value = hex;
        hexAlphaInput.value = hexAlpha;
        rgbInput.value = `rgb(${r}, ${g}, ${b})`;
        rgbaInput.value = `rgba(${r}, ${g}, ${b}, ${a})`;
        hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
        hslaInput.value = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${Math.round(a * 100)}%)`;
        hsvInput.value = `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
        opacityInput.value = String(Math.round(a * 100));
        opacityLabel.textContent = Math.round(a * 100) + '%';
        
        // Update code presets
        $f('color-code-presets').innerHTML = `
            <div class="mb-4">
                <div class="ui-section">CSS Level 4 Color Module:</div>
                <div class="result-item mb-2"><div class="copy-chip" data-copy-self>rgb(${r} ${g} ${b})</div></div>
                <div class="result-item mb-2"><div class="copy-chip" data-copy-self>rgb(${r} ${g} ${b} / ${Math.round(a * 100)}%)</div></div>
                <div class="result-item"><div class="copy-chip" data-copy-self>hsl(${hsl.h}deg ${hsl.s}% ${hsl.l}%)</div></div>
            </div>
            <div class="mb-4">
                <div class="ui-section">Swift:</div>
                <div class="result-item"><div class="copy-chip" data-copy-self>NSColor(calibratedRed: ${(r/255).toFixed(4)}, green: ${(g/255).toFixed(4)}, blue: ${(b/255).toFixed(4)}, alpha: ${a})</div></div>
            </div>
            <div class="mb-4">
                <div class="ui-section">.NET:</div>
                <div class="result-item"><div class="copy-chip" data-copy-self>Color.FromRgb(${r}, ${g}, ${b})</div></div>
            </div>
            <div class="mb-4">
                <div class="ui-section">Java:</div>
                <div class="result-item"><div class="copy-chip" data-copy-self>new Color(${r}, ${g}, ${b})</div></div>
            </div>
            <div>
                <div class="ui-section">Android:</div>
                <div class="result-item"><div class="copy-chip" data-copy-self>Color.argb(${Math.round(a * 255)}, ${r}, ${g}, ${b})</div></div>
            </div>
        `;
    };
    
    picker.addEventListener('input', (e) => {
        const rgb = hexToRgb((e.target as HTMLInputElement).value);
        if (rgb) {
            currentColor = { ...rgb, a: currentColor.a };
            updateAll();
        }
    });
    
    hexInput.addEventListener('input', (e) => {
        const rgb = hexToRgb((e.target as HTMLInputElement).value);
        if (rgb) {
            currentColor = { ...rgb, a: currentColor.a };
            updateAll();
        }
    });
    
    opacityInput.addEventListener('input', (e) => {
        currentColor.a = parseInt((e.target as HTMLInputElement).value) / 100;
        updateAll();
    });
    
    $f('color-sample-btn').onclick = () => {
        const colors = ['#72cd42', '#ff5733', '#3357ff', '#f0f000', '#ff1493'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const rgb = hexToRgb(randomColor);
        if (rgb) {
            currentColor = { ...rgb, a: 1 };
            updateAll();
        }
    };
    
    $f('color-clear-btn').onclick = () => {
        const previous = { ...currentColor };
        currentColor = { r: 0, g: 0, b: 0, a: 1 };
        updateAll();
        showToast('Reset to black', 'success', { label: 'Undo', run: () => { currentColor = previous; updateAll(); } });
    };
    
    $f('color-clipboard-btn').onclick = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const rgb = hexToRgb(text.trim());
            if (rgb) {
                currentColor = rgb;
                updateAll();
            }
        } catch (e) {}
    };
    
    updateAll();
}
