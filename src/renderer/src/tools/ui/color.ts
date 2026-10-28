import { $, $f, showToast, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { debounce, inputActions, copyIconButton } from './common';

const DEFAULT = '#72cd42'; // sample data, not a UI colour

type RGBA = { r: number; g: number; b: number; a: number };

const hexToRgb = (hex: string): RGBA | null => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex.trim());
    return m ? {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
        a: m[4] ? parseInt(m[4], 16) / 255 : 1,
    } : null;
};

const hue = (r: number, g: number, b: number, max: number, d: number): number => {
    if (d === 0) return 0;
    switch (max) {
        case r: return ((g - b) / d + (g < b ? 6 : 0)) / 6;
        case g: return ((b - r) / d + 2) / 6;
        default: return ((r - g) / d + 4) / 6;
    }
};

const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
    return { h: Math.round(hue(r, g, b, max, d) * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const rgbToHsv = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    return { h: Math.round(hue(r, g, b, max, d) * 360), s: Math.round((max === 0 ? 0 : d / max) * 100), v: Math.round(max * 100) };
};

const outField = (id: string, label: string): string => `
    <div class="input-group">
        <div class="field-label">
            <span id="${id}-label">${label}</span>
            ${copyIconButton(id, label)}
        </div>
        <input type="text" class="form-control font-mono cursor-pointer" id="${id}" readonly data-copy-self aria-labelledby="${id}-label">
    </div>`;

const chip = (label: string, id: string): string => `
    <div class="mb-3">
        <div class="ui-section">${label}</div>
        <div class="copy-chip" id="${id}" data-copy-self></div>
    </div>`;

export function render(container: HTMLElement): void {
    container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Input</h3>
                        ${inputActions({ paste: 'color-hex', sample: 'color-sample-btn', clear: 'color-clear-btn' })}
                    </div>
                    <div class="flex gap-3 mb-4 items-stretch">
                        <label class="sr-only" for="color-picker">Pick colour</label>
                        <input class="color-swatch-picker" type="color" id="color-picker" value="${DEFAULT}" title="Pick colour">
                        <div class="color-preview flex-1 h-[72px] !mb-0" id="color-preview" role="img" aria-label="Colour preview"></div>
                    </div>
                    <div class="input-group">
                        <div class="field-label"><label for="color-hex">HEX</label>${copyIconButton('color-hex', 'HEX')}</div>
                        <input type="text" class="form-control font-mono" id="color-hex" placeholder="#RRGGBB or #RRGGBBAA">
                    </div>
                    ${outField('color-rgb', 'RGB')}
                    ${outField('color-hsl', 'HSL')}
                    <div class="input-group">
                        <label for="color-opacity">Opacity</label>
                        <div class="flex items-center gap-2">
                            <input class="flex-1" type="range" id="color-opacity" min="0" max="100" value="100">
                            <span class="font-mono text-[13px] min-w-[45px]" id="color-opacity-label" aria-hidden="true">100%</span>
                        </div>
                    </div>
                    <details class="mt-2">
                        <summary class="ui-section cursor-pointer">More formats</summary>
                        <div class="mt-2">
                            ${outField('color-hex-alpha', 'HEX with alpha')}
                            ${outField('color-rgba', 'RGBA')}
                            ${outField('color-hsla', 'HSLA')}
                            ${outField('color-hsv', 'HSV (HSB)')}
                        </div>
                    </details>
                </div>
                <div class="tool-card">
                    <h3>Code Presets</h3>
                    ${chip('CSS Level 4', 'color-css4-rgb')}
                    ${chip('CSS Level 4 (alpha)', 'color-css4-rgba')}
                    ${chip('CSS Level 4 (HSL)', 'color-css4-hsl')}
                    <details>
                        <summary class="ui-section cursor-pointer">More code presets</summary>
                        <div class="mt-2">
                            ${chip('Swift', 'color-swift')}
                            ${chip('.NET', 'color-dotnet')}
                            ${chip('Java', 'color-java')}
                            ${chip('Android', 'color-android')}
                        </div>
                    </details>
                </div>
            </div>
        </div>
    `;

    const preview = $('color-preview');
    const picker = $f('color-picker');
    const hexInput = $f('color-hex');
    const opacityInput = $f('color-opacity');

    let current: RGBA = hexToRgb(DEFAULT)!;

    const set = (id: string, v: string): void => { $f(id).value = v; };
    const text = (id: string, v: string): void => { $(id).textContent = v; };

    const updateAll = (fromHex = false): void => {
        const { r, g, b, a } = current;
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        const pct = Math.round(a * 100);
        const hsl = rgbToHsl(r, g, b);
        const hsv = rgbToHsv(r, g, b);

        preview.style.background = `rgba(${r}, ${g}, ${b}, ${a})`; // user's colour value (data)
        picker.value = hex;
        if (!fromHex) hexInput.value = hex;
        setFieldInvalid('color-hex', false);
        set('color-hex-alpha', hex + Math.round(a * 255).toString(16).padStart(2, '0'));
        set('color-rgb', `rgb(${r}, ${g}, ${b})`);
        set('color-rgba', `rgba(${r}, ${g}, ${b}, ${a})`);
        set('color-hsl', `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`);
        set('color-hsla', `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${pct}%)`);
        set('color-hsv', `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`);
        opacityInput.value = String(pct);
        text('color-opacity-label', pct + '%');
        text('color-css4-rgb', `rgb(${r} ${g} ${b})`);
        text('color-css4-rgba', `rgb(${r} ${g} ${b} / ${pct}%)`);
        text('color-css4-hsl', `hsl(${hsl.h}deg ${hsl.s}% ${hsl.l}%)`);
        text('color-swift', `NSColor(calibratedRed: ${(r / 255).toFixed(4)}, green: ${(g / 255).toFixed(4)}, blue: ${(b / 255).toFixed(4)}, alpha: ${a})`);
        text('color-dotnet', `Color.FromRgb(${r}, ${g}, ${b})`);
        text('color-java', `new Color(${r}, ${g}, ${b})`);
        text('color-android', `Color.argb(${Math.round(a * 255)}, ${r}, ${g}, ${b})`);
    };

    picker.addEventListener('input', () => {
        const rgb = hexToRgb(picker.value);
        if (rgb) { current = { ...rgb, a: current.a }; updateAll(); }
    });

    hexInput.addEventListener('input', debounce(() => {
        const val = hexInput.value.trim();
        if (!val) { setFieldInvalid('color-hex', false); resetStatus(); return; }
        const rgb = hexToRgb(val);
        if (!rgb) {
            setFieldInvalid('color-hex', true, 'HEX must be #RRGGBB or #RRGGBBAA (hex digits 0-9, A-F)');
            reportError('HEX must be #RRGGBB or #RRGGBBAA (hex digits 0-9, A-F)');
            return;
        }
        current = rgb;
        updateAll(true);
        reportOk('Valid colour');
    }));

    opacityInput.addEventListener('input', () => {
        current.a = parseInt(opacityInput.value, 10) / 100;
        updateAll();
    });

    $('color-sample-btn').onclick = () => {
        const colors = [DEFAULT, '#ff5733', '#3357ff', '#f0f000', '#ff1493'];
        current = hexToRgb(colors[Math.floor(Math.random() * colors.length)])!;
        updateAll();
    };

    $('color-clear-btn').onclick = () => {
        const previous = { ...current };
        current = { r: 0, g: 0, b: 0, a: 1 };
        updateAll();
        showToast('Reset to black', 'success', { label: 'Undo', run: () => { current = previous; updateAll(); } });
    };

    updateAll();
    resetStatus();
}
