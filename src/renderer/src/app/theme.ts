// Theme management: app colour scheme, theme toggle button, and Monaco themes derived from CSS variables.
import type { editor } from 'monaco-editor';
import '../../../types/electronAPI';

export type ThemeChoice = 'system' | 'light' | 'dark';
let currentTheme: ThemeChoice = (localStorage.getItem('theme') as ThemeChoice) || 'system';
export const getTheme = (): ThemeChoice => currentTheme;
// Theme Management
export function setTheme(theme: 'system' | 'light' | 'dark'): void {
  currentTheme = theme;
  localStorage.setItem('theme', theme);
  
  let isDark: boolean;
  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'light') {
    isDark = false;
  } else {
    // system theme
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  // Remove dark class, then add it if needed
  // Tailwind uses 'dark' class for dark mode, absence means light mode
  document.documentElement.classList.remove('dark');
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
  // Keep the native caption buttons (Windows/Linux overlay) in step with the app theme
  try { window.electronAPI?.window?.setTitleBarTheme?.(isDark ? 'dark' : 'light'); } catch { /* not in Electron */ }
  
  // Update Monaco Theme (themes are rebuilt from the CSS variables now in effect)
  if (window.monaco) {
    defineMonacoThemes();
    window.monaco.editor.setTheme(isDark ? 'forge-dark' : 'forge-light');
  }
  syncThemeButton();
}

export function syncThemeButton(): void {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const name = currentTheme === 'system' ? 'System' : currentTheme === 'light' ? 'Light' : 'Dark';
  const next = currentTheme === 'system' ? 'light' : currentTheme === 'light' ? 'dark' : 'system';
  btn.dataset.theme = currentTheme;
  btn.setAttribute('aria-label', `Theme: ${name}. Switch to ${next}`);
  btn.title = `Theme: ${name} (click for ${next})`;
  const icon = btn.querySelector('.material-icons');
  if (icon) icon.textContent = currentTheme === 'system' ? 'brightness_auto' : currentTheme === 'light' ? 'light_mode' : 'dark_mode';
}

export function isDarkActive(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Resolve a CSS color (any syntax, incl. rgba()) to #rrggbb[aa] for Monaco. */
function cssColor(varName: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return fallback;
  probe.fillStyle = fallback;
  probe.fillStyle = raw;
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) return v;
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return fallback;
  const [r, g, b, a = '1'] = m[1].split(',').map(s => s.trim());
  const hex = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(+r)}${hex(+g)}${hex(+b)}${parseFloat(a) < 1 ? hex(parseFloat(a) * 255) : ''}`;
}

export function defineMonacoThemes(): void {
  if (!window.monaco) return;
  const build = (dark: boolean): editor.IStandaloneThemeData => {
    // Read tokens with the matching class applied, then restore
    const root = document.documentElement;
    const had = root.classList.contains('dark');
    root.classList.toggle('dark', dark);
    const canvas = cssColor('--bg-panel', dark ? '#111113' : '#ffffff');
    const ink = cssColor('--text-primary', dark ? '#ededef' : '#18181b');
    const secondary = cssColor('--text-tertiary', dark ? '#8a8a92' : '#6b6b73');
    const hairline = cssColor('--border-color', dark ? '#1f1f22' : '#e4e4e0');
    const selection = cssColor('--selection', dark ? '#ff8a3d40' : '#ff8a3d47');
    const accent = cssColor('--accent-color', dark ? '#ff8a3d' : '#e5670f');
    const tint = cssColor('--hover-tint', dark ? '#ffffff0a' : '#0000000a');
    root.classList.toggle('dark', had);
    return {
      base: dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': canvas,
        'editor.foreground': ink,
        'editorLineNumber.foreground': secondary,
        'editorLineNumber.activeForeground': ink,
        'editor.lineHighlightBackground': tint,
        'editor.lineHighlightBorder': '#00000000',
        'editor.selectionBackground': selection,
        'editor.inactiveSelectionBackground': selection,
        'editorCursor.foreground': accent,
        'editorIndentGuide.background': hairline,
        'editorWidget.border': hairline,
        'focusBorder': accent,
        'editorGutter.background': canvas,
        'scrollbarSlider.background': hairline,
        'editorOverviewRuler.border': '#00000000'
      }
    };
  };
  window.monaco.editor.defineTheme('forge-light', build(false));
  window.monaco.editor.defineTheme('forge-dark', build(true));
}
