import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './monacoEnv'; // must run before Monaco's AMD loader requests editor.main
import type { Tool } from '../../types/tools';
import type { editor } from 'monaco-editor';
import '../../types/electronAPI'; // Ensure Window types are available
import { logger } from './logger';
import { detect, type Candidate } from './detect';
import './tools';
import { getHelp } from './tools/help';
import { scoreTool } from './search';
import { esc, bumpToolEpoch } from './ui';
import { captureFields, restoreFields, clearableFieldIds, clearWithUndo, type FieldSnapshot } from './ui';
import { showToast, wireClipboardActions, setStatus, openModal, closeModal, getIndent, getIndentChoice, setIndentChoice, type IndentChoice } from './ui';

// Configure Monaco loader (using requirejs for Monaco)
// Monaco Editor uses AMD/RequireJS which is loaded via script tag
declare global {
  interface Window {
    require?: {
      config: (config: { paths: Record<string, string> }) => void;
      (deps: string[], callback: (monaco: typeof import('monaco-editor')) => void, errback?: (err: Error) => void): void;
    };
  }
  
  const require: {
    config: (config: { paths: Record<string, string> }) => void;
    (deps: string[], callback: (monaco: typeof import('monaco-editor')) => void, errback?: (err: Error) => void): void;
  } | undefined;
}

// Global State
let inputEditor: editor.IStandaloneCodeEditor | null = null;
let outputEditor: editor.IStandaloneCodeEditor | null = null;
let currentTool: Tool | null = null;
/** Selected mode per editor tool (memory only). */
const toolModes = new Map<string, string>();
const currentMode = (t: Tool): string | undefined => t.modes?.length ? (toolModes.get(t.id) ?? t.modes[0].id) : undefined;
let renderToken = 0; // guards against a slow tool module rendering over a newer one
let currentTheme: 'system' | 'light' | 'dark' = (localStorage.getItem('theme') as 'system' | 'light' | 'dark') || 'system';

// Optimized LRU Cache implementation for processed results
// Uses Map for O(1) operations and better memory efficiency
class LRUCache<K> {
  private cache: Map<K, { value: string; timestamp: number }>;
  private maxSize: number;
  private ttl: number;
  private cleanupThreshold: number;

  constructor(maxSize: number = 100, ttl: number = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    // Cleanup when cache is 90% full to avoid frequent cleanup
    this.cleanupThreshold = Math.floor(maxSize * 0.9);
  }

  get(key: K): string | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    const now = Date.now();
    // Check TTL
    if (now - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Move to end (most recently used) - Map maintains insertion order
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key: K, value: string): void {
    const now = Date.now();
    
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item in Map iteration order)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { value, timestamp: now });
    
    // Periodic cleanup of expired entries when threshold is reached
    if (this.cache.size >= this.cleanupThreshold) {
      this.cleanupExpired(now);
    }
  }

  private cleanupExpired(now: number): void {
    // Remove expired entries in batches
    let removed = 0;
    const maxRemovals = Math.floor(this.maxSize * 0.1); // Remove up to 10% at a time
    
    for (const [key, item] of this.cache.entries()) {
      if (removed >= maxRemovals) break;
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Small and short-lived: inputs may contain secrets (JWTs, keys), so don't hold them long.
const resultCache = new LRUCache<string>(20, 60 * 1000);

// Event listener cleanup tracking
const eventListeners: Array<{ element: EventTarget; event: string; handler: EventListener }> = [];

// Cleanup function for event listeners
function cleanupEventListeners(): void {
  eventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  eventListeners.length = 0;
}

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Theme Management
function setTheme(theme: 'system' | 'light' | 'dark'): void {
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
  
  // Update Monaco Theme (themes are rebuilt from the CSS variables now in effect)
  if (window.monaco) {
    defineMonacoThemes();
    window.monaco.editor.setTheme(isDark ? 'forge-dark' : 'forge-light');
  }
}

function isDarkActive(): boolean {
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

function defineMonacoThemes(): void {
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

// Initialize Theme Listener with cleanup tracking
const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const themeChangeHandler = () => {
  if (currentTheme === 'system') setTheme('system');
};
themeMediaQuery.addEventListener('change', themeChangeHandler);
eventListeners.push({ element: themeMediaQuery, event: 'change', handler: themeChangeHandler });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupEventListeners();
  resultCache.clear();
  if (inputEditor) {
    inputEditor.dispose();
    inputEditor = null;
  }
  if (outputEditor) {
    outputEditor.dispose();
    outputEditor = null;
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Set theme immediately on load
  setTheme(currentTheme);
  initApp();
});

// Monaco is loaded lazily the first time an editor-based tool opens.
let monacoPromise: Promise<void> | null = null;
function ensureMonaco(): Promise<void> {
  if (window.monaco && inputEditor) return Promise.resolve();
  if (monacoPromise) return monacoPromise;
  setStatus('idle', 'Loading editor\u2026');
  monacoPromise = new Promise<void>((resolve, reject) => {
    const attempt = (retryCount: number): void => {
      const req = window.require || (typeof require !== 'undefined' ? require : undefined);
      if (window.monacoPath && req) {
        try {
          req.config({ paths: { vs: window.monacoPath } });
          req(['vs/editor/editor.main'], (monaco: typeof import('monaco-editor')) => {
            window.monaco = monaco;
            initMonaco();
            resolve();
          }, (error: Error) => reject(error));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      } else if (retryCount < 30) {
        setTimeout(() => attempt(retryCount + 1), Math.min(100 * Math.pow(1.2, retryCount), 500));
      } else {
        reject(new Error('Editor loader unavailable'));
      }
    };
    attempt(0);
  }).catch(err => {
    logger.error('Monaco Editor failed to load:', err);
    setStatus('error', 'Editor failed to load', 'restart the app');
    monacoPromise = null;
  });
  return monacoPromise;
}

function editorIndentOptions(): { tabSize: number; insertSpaces: boolean } {
  const c = getIndentChoice();
  return c === 'tab' ? { tabSize: 4, insertSpaces: false } : { tabSize: c, insertSpaces: true };
}

function applyIndentToModels(): void {
  const opts = editorIndentOptions();
  inputEditor?.getModel()?.updateOptions(opts);
  outputEditor?.getModel()?.updateOptions(opts);
}

function initMonaco(): void {
  if (!window.monaco) return;

  defineMonacoThemes();
  const isDark = isDarkActive();
  const commonOptions: editor.IStandaloneEditorConstructionOptions = {
    theme: isDark ? 'forge-dark' : 'forge-light',
    fontSize: parseInt(localStorage.getItem('editor-fontsize') || '13', 10),
    wordWrap: localStorage.getItem('editor-wordwrap') === 'true' ? 'on' : 'off',
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim()
      || "'JetBrains Mono','Cascadia Mono','SF Mono',Consolas,monospace",
    minimap: { enabled: localStorage.getItem('editor-minimap') === 'true' },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'gutter',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 16, bottom: 16 },
    // Disable language features that require workers to avoid worker-related errors
    quickSuggestions: false,
    parameterHints: { enabled: false },
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'off',
    wordBasedSuggestions: 'off',
    'semanticHighlighting.enabled': false
  };

  const inputContainer = document.getElementById('inputEditor');
  const outputContainer = document.getElementById('outputEditor');

  if (inputContainer && window.monaco) {
    inputContainer.innerHTML = '';
    inputEditor = window.monaco.editor.create(inputContainer, {
      ...commonOptions,
      value: '',
      ariaLabel: 'Input'
    });

    const debouncedProcessInput = debounce(() => {
      if (currentTool && !currentTool.useCustomUI) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => processInput(), { timeout: 100 });
        } else {
          setTimeout(() => processInput(), 0);
        }
      }
    }, 250);

    inputEditor.onDidChangeModelContent(debouncedProcessInput);
  }

  if (outputContainer && window.monaco) {
    outputContainer.innerHTML = '';
    outputEditor = window.monaco.editor.create(outputContainer, {
      ...commonOptions,
      value: '',
      readOnly: true,
      ariaLabel: 'Output'
    });
  }
  applyIndentToModels();
}

// --- Tool help popover (button + F1) ---
const isMacPlatform = (): boolean => window.platform?.isMac ?? (navigator.platform.toUpperCase().indexOf('MAC') >= 0);
/** Platform modifier label: \u2318 on macOS, Ctrl elsewhere. */
const modKey = (): string => isMacPlatform() ? '\u2318' : 'Ctrl';

function closeHelp(): void {
  const pop = document.getElementById('helpPopover');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  document.getElementById('helpBtn')?.setAttribute('aria-expanded', 'false');
}

function toggleHelp(): void {
  const pop = document.getElementById('helpPopover');
  const btn = document.getElementById('helpBtn');
  if (!pop || !btn || !currentTool) return;
  if (!pop.hidden) { closeHelp(); return; }
  const help = getHelp(currentTool.id);
  const rows = help?.rows?.length
    ? `<table class="help-table">${help.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  pop.innerHTML = `<p class="help-tip">${esc(help?.tip ?? currentTool.description)}</p>${rows}`
    + `<div class="help-foot"><p class="help-foot-line">Runs offline.</p><dl class="help-keys">`
    + [[`${modKey()}+K`, 'Switch tools'], [`${modKey()}+Shift+C`, 'Copy output'], [`${modKey()}+Shift+Backspace`, 'Clear tool session'], ['P', 'Pin focused tool row'], ['F1', 'Toggle help'], ['Esc', 'Close']]
      .map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join('')
    + `</dl></div>`;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  pop.focus();
}

function setupHelp(): void {
  document.getElementById('helpBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleHelp(); });
  document.addEventListener('click', e => {
    const pop = document.getElementById('helpPopover');
    if (pop && !pop.hidden && !pop.contains(e.target as Node)) closeHelp();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); toggleHelp(); }
    else if (e.key === 'Escape') {
      const pop = document.getElementById('helpPopover');
      const wasInside = !!pop && pop.contains(document.activeElement);
      closeHelp();
      if (wasInside) document.getElementById('helpBtn')?.focus();
    }
  });
}

let openSettingsSheet: (opener?: HTMLElement | null) => void = () => {};

function setupTitlebar(): void {
  const isMac = window.platform?.isMac ?? (navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  const titlebar = document.querySelector<HTMLElement>('.titlebar');
  if (!titlebar) return;
  document.querySelectorAll('.mod-key').forEach(el => { el.textContent = isMac ? '\u2318' : 'Ctrl'; });
  // macOS: native traffic lights sit on the left with titleBarStyle 'hiddenInset'
  if (isMac) titlebar.style.paddingLeft = '78px';

  const controls = document.getElementById('titlebarControls') ?? titlebar;
  const label = document.createElement('label');
  label.htmlFor = 'themeSelect';
  label.className = 'sr-only';
  label.textContent = 'Theme';
  const themeSelect = document.createElement('select');
  themeSelect.id = 'themeSelect';
  themeSelect.className = 'toolbar-select';
  themeSelect.innerHTML = '<option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>';
  themeSelect.value = currentTheme;
  themeSelect.onchange = () => setTheme(themeSelect.value as 'system' | 'light' | 'dark');
  const themeIcon = document.createElement('span');
  themeIcon.className = 'material-icons theme-icon';
  themeIcon.setAttribute('aria-hidden', 'true');
  themeIcon.textContent = 'contrast';
  controls.append(themeIcon, label, themeSelect);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.id = 'titlebarSettings';
  settings.className = 'btn-icon btn-ghost btn-sm';
  settings.title = 'Settings';
  settings.setAttribute('aria-label', 'Settings');
  settings.setAttribute('aria-haspopup', 'dialog');
  settings.innerHTML = '<i class="material-icons icon-sm" aria-hidden="true">tune</i>';
  settings.onclick = () => openSettingsSheet(settings);
  controls.append(settings);
}

// ---- Responsive off-canvas sidebar (< 760px) ----
const narrowMq = window.matchMedia('(max-width: 759px)');
function setDrawer(open: boolean, focusSearch = false): void {
  const toggle = document.getElementById('sidebarToggle');
  const scrim = document.getElementById('sidebarScrim');
  document.body.classList.toggle('drawer-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
  toggle?.setAttribute('aria-label', open ? 'Hide tools list' : 'Show tools list');
  if (scrim) scrim.hidden = !open;
  if (open && focusSearch) (document.getElementById('sidebarSearch') as HTMLInputElement | null)?.focus();
}
function setupDrawer(): void {
  const toggle = document.getElementById('sidebarToggle');
  toggle?.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open'), true));
  document.getElementById('sidebarScrim')?.addEventListener('click', () => { setDrawer(false); toggle?.focus(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) { setDrawer(false); toggle?.focus(); }
  });
  narrowMq.addEventListener('change', () => { if (!narrowMq.matches) setDrawer(false); });
}

function setupIndent(): void {
  const sel = document.getElementById('indentSelect') as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = String(getIndentChoice());
  sel.addEventListener('change', () => {
    const v = sel.value;
    setIndentChoice((v === 'tab' ? 'tab' : parseInt(v, 10)) as IndentChoice);
    (window as unknown as { forgeIndent: number }).forgeIndent = getIndent();
    applyIndentToModels();
    resultCache.clear();
    void processInput();
  });
  (window as unknown as { forgeIndent: number }).forgeIndent = getIndent();
}

// Ctrl/Cmd+Shift+C: copy the current tool's output
function copyCurrentOutput(): void {
  if (!currentTool) { showToast('Pick a tool first', 'error'); return; }
  let text = '';
  if (!currentTool.useCustomUI) {
    text = outputEditor?.getValue() ?? '';
  } else {
    const root = document.getElementById('customInterface');
    const out = root?.querySelector<HTMLElement>('[data-output]');
    const copyBtn = root?.querySelector<HTMLElement>('[data-copy]');
    const target = out ?? (copyBtn?.dataset.copy ? document.getElementById(copyBtn.dataset.copy) : null);
    if (target) {
      const v = (target as HTMLInputElement).value;
      text = (typeof v === 'string' ? v : target.textContent ?? '').trim();
    }
  }
  if (!text) { showToast('Nothing to copy yet', 'error'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Copied output'))
    .catch(() => showToast('Copy failed. Select the output and copy it manually.', 'error'));
}

function initApp(): void {
  renderSidebar();
  renderWelcome();
  document.getElementById('welcomeSearch')?.addEventListener('click', () => openPalette());
  setupWelcomePaste();
  wireClipboardActions();
  setupHelp();
  setupEventListeners();
  setupCommandPalette();
  setupTitlebar();
  setupDrawer();
  setupIndent();
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      // Let native copy work when the user has a text selection in a field/editor
      const sel = window.getSelection()?.toString();
      if (sel && !(document.activeElement?.closest('.monaco-editor'))) return;
      e.preventDefault();
      copyCurrentOutput();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Backspace') {
      e.preventDefault();
      clearToolSession();
    }
  });

  // Hide loading screen as soon as the shell is ready
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => loadingScreen.remove(), 150);
  }
}

function renderSidebar(): void {
  const nav = document.getElementById('toolsNav');
  if (!nav || !window.tools) return;
  
  const fragment = document.createDocumentFragment();
  // Pinned / Recent live in their own container so they can refresh without
  // rebuilding (and losing focus in) the category list.
  const quick = document.createElement('div');
  quick.id = 'navQuick';
  fragment.appendChild(quick);

  const categories: Record<string, Tool[]> = {};
  Object.values(window.tools).forEach(tool => {
    (categories[tool.category] ??= []).push(tool);
  });
  const collapsed = getCollapsed();
  let gi = 0;
  Object.entries(categories).forEach(([category, categoryTools]) => {
    const group = makeNavGroup(`nav-cat-${gi++}`, category, categoryTools, 'data-tool-id');
    group.dataset.category = category;
    setGroupExpanded(group, !collapsed.includes(category));
    fragment.appendChild(group);
  });

  nav.textContent = '';
  nav.appendChild(fragment);
  renderQuickGroups();
}

// ---- Sidebar groups: collapse, pinned, recent (ids only in localStorage) ----
const COLLAPSED_KEY = 'nav-collapsed';
const PINNED_KEY = 'pinned-tools';
const readList = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};
const getCollapsed = (): string[] => readList(COLLAPSED_KEY);
const getPinned = (): string[] => readList(PINNED_KEY).filter(id => window.tools?.[id]);
const isPinned = (id: string): boolean => getPinned().includes(id);

function togglePin(id: string): void {
  const list = getPinned();
  const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  renderQuickGroups();
  const title = window.tools?.[id]?.title ?? id;
  showToast(next.includes(id) ? `Pinned ${title}` : `Unpinned ${title}`);
}

function setGroupExpanded(group: HTMLElement, expanded: boolean): void {
  const toggle = group.querySelector<HTMLElement>('.category-toggle');
  const list = group.querySelector<HTMLElement>('.nav-list');
  if (!toggle || !list) return;
  toggle.setAttribute('aria-expanded', String(expanded));
  list.hidden = !expanded;
}

function makeNavRow(tool: Tool, attr: 'data-tool-id' | 'data-tool-ref'): HTMLElement {
  const row = document.createElement('div');
  row.className = 'nav-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-item';
  btn.setAttribute(attr, tool.id);
  btn.title = tool.title;
  // Only the canonical category row shows the active state; Pinned/Recent refs never do.
  if (attr === 'data-tool-id' && currentTool?.id === tool.id) { btn.classList.add('active'); btn.setAttribute('aria-current', 'page'); }
  const icon = document.createElement('i');
  icon.className = 'material-icons nav-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = tool.icon;
  const label = document.createElement('span');
  label.className = 'truncate';
  label.textContent = tool.title;
  btn.append(icon, label);
  btn.onclick = () => { switchTool(tool.id); if (narrowMq.matches) setDrawer(false); };
  const pinned = isPinned(tool.id);
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'nav-pin';
  pin.classList.toggle('is-pinned', pinned);
  pin.setAttribute('aria-label', pinned ? `Unpin ${tool.title}` : `Pin ${tool.title}`);
  pin.title = pinned ? 'Unpin' : 'Pin';
  const pinIcon = document.createElement('i');
  pinIcon.className = 'material-icons';
  pinIcon.setAttribute('aria-hidden', 'true');
  pinIcon.textContent = 'push_pin';
  pin.appendChild(pinIcon);
  pin.onclick = (e) => { e.stopPropagation(); togglePin(tool.id); };
  row.append(btn, pin);
  return row;
}

function makeNavGroup(id: string, name: string, items: Tool[], attr: 'data-tool-id' | 'data-tool-ref', collapsible = true): HTMLElement {
  const group = document.createElement('div');
  group.className = 'nav-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', id);
  const header = document.createElement('h2');
  header.className = 'category-header';
  const list = document.createElement('div');
  list.className = 'nav-list';
  list.id = `${id}-list`;
  if (collapsible) {
    // role=button (not <button>): the first real button in #toolsNav must stay a tool row
    const toggle = document.createElement('div');
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    toggle.className = 'category-toggle';
    toggle.id = id;
    toggle.setAttribute('aria-controls', list.id);
    toggle.setAttribute('aria-expanded', 'true');
    const label = document.createElement('span');
    label.textContent = name;
    const chev = document.createElement('i');
    chev.className = 'material-icons category-chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = 'expand_more';
    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = String(items.length);
    count.setAttribute('aria-label', `${items.length} tools`);
    toggle.append(label, count, chev);
    toggle.onclick = () => {
      const expand = toggle.getAttribute('aria-expanded') !== 'true';
      setGroupExpanded(group, expand);
      const set = new Set(getCollapsed());
      if (expand) set.delete(name); else set.add(name);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
    };
    toggle.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    };
    header.appendChild(toggle);
  } else {
    header.id = id;
    header.textContent = name;
  }
  group.appendChild(header);
  items.forEach(t => list.appendChild(makeNavRow(t, attr)));
  group.appendChild(list);
  return group;
}

function renderQuickGroups(): void {
  const quick = document.getElementById('navQuick');
  if (!quick || !window.tools) return;
  const tools = window.tools;
  const pinned = getPinned();
  // Recent: at most 3, never the tool that is already open, never a pinned tool.
  const recent = getRecent().filter(id => !pinned.includes(id) && id !== currentTool?.id).slice(0, 3);
  const focusedRef = (document.activeElement as HTMLElement | null)?.closest('#navQuick') ? (document.activeElement as HTMLElement).getAttribute('data-tool-ref') : null;
  quick.textContent = '';
  if (pinned.length) quick.appendChild(makeNavGroup('nav-pinned', 'Pinned', pinned.map(id => tools[id]!), 'data-tool-ref', false));
  if (recent.length) quick.appendChild(makeNavGroup('nav-recent', 'Recent', recent.map(id => tools[id]!), 'data-tool-ref', false));
  // Pin state shows on category rows too
  document.querySelectorAll<HTMLElement>('#toolsNav .nav-row').forEach(row => {
    const id = row.querySelector('.nav-item')?.getAttribute('data-tool-id');
    const pin = row.querySelector<HTMLElement>('.nav-pin');
    if (!id || !pin) return;
    const on = pinned.includes(id);
    const title = tools[id]?.title ?? id;
    pin.classList.toggle('is-pinned', on);
    pin.setAttribute('aria-label', on ? `Unpin ${title}` : `Pin ${title}`);
    pin.title = on ? 'Unpin' : 'Pin';
  });
  if (focusedRef) quick.querySelector<HTMLElement>(`[data-tool-ref="${focusedRef}"]`)?.focus();
  applySidebarFilter();
}

let applySidebarFilter: () => void = () => {};

function switchTool(toolId: string): void {
  if (!window.tools) return;
  const tool = window.tools[toolId];
  if (!tool) return;

  snapshotSession();
  // Ensure we have a proper reference to the tool with all properties
  currentTool = tool;
  rememberRecent(tool.id);
  
  try {
    // Batch DOM updates to reduce reflows
    const welcome = document.getElementById('welcomeState');
    const container = document.getElementById('toolContainer');
    const titleEl = document.getElementById('currentToolTitle');
    const descEl = document.getElementById('currentToolDesc');
    const catEl = document.getElementById('currentToolCat');
    
    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
      if (welcome) welcome.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      if (titleEl) titleEl.textContent = tool.title;
      if (descEl) descEl.textContent = tool.description;
      if (catEl) catEl.textContent = tool.category;
    });
    
    // Update Sidebar Active State - use requestAnimationFrame for batched updates
    requestAnimationFrame(() => {
      renderQuickGroups();
      const navItems = document.querySelectorAll('#toolsNav .nav-item');
      navItems.forEach(btn => {
        // Only the canonical category row is active / the "current page"
        const isActive = btn.getAttribute('data-tool-id') === tool.id;
        btn.classList.toggle('active', isActive);
        if (isActive) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
      });
      // Reveal the active tool's category if it was collapsed
      const home = document.querySelector<HTMLElement>(`#toolsNav [data-tool-id="${tool.id}"]`)?.closest<HTMLElement>('.nav-group');
      if (home && home.querySelector('.category-toggle')?.getAttribute('aria-expanded') === 'false') {
        setGroupExpanded(home, true);
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(getCollapsed().filter(c => c !== home.dataset.category)));
      }
    });

    // Setup Actions
    const actionsContainer = document.getElementById('toolActions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      if (!tool.useCustomUI && tool.modes?.length) actionsContainer.appendChild(buildModeControl(tool));
    }
    // Toggle Interfaces
    const editorInterface = document.getElementById('editorInterface');
    const customInterface = document.getElementById('customInterface');
    
    bumpToolEpoch();
    setStatus('idle', 'Ready');
    closeHelp();
    if (tool.useCustomUI) {
      // Show Custom UI
      if (editorInterface) editorInterface.classList.add('hidden');
      if (customInterface) {
        customInterface.classList.remove('hidden');
        customInterface.classList.toggle('form-narrow', isNarrowForm(tool.id));
        customInterface.innerHTML = '';
        if (tool.load) {
          const token = ++renderToken;
          tool.load()
            .then(mod => {
              if (token !== renderToken) return;
              mod.render(customInterface);
              disableTextAssist(customInterface);
              restoreSession(tool);
              applyHandoff(tool);
              focusToolStart(tool);
            })
            .catch(err => {
              logger.error(`Failed to load ${tool.id}:`, err);
              if (token === renderToken) showToast(`Could not open ${tool.title}`, 'error');
            });
        }
      }
    } else {
      renderToken++; // cancel any pending custom UI load
      const token = renderToken;
      // Show Editor UI
      if (editorInterface) editorInterface.classList.remove('hidden');
      if (customInterface) customInterface.classList.add('hidden');
      focusToolStart(tool);

      void ensureMonaco().then(() => {
        if (token !== renderToken || currentTool !== tool) return;
        if (!(inputEditor && outputEditor && window.monaco)) return;
        setStatus('idle', 'Ready');
        const inputModel = inputEditor.getModel();
        const outputModel = outputEditor.getModel();
        if (inputModel) window.monaco.editor.setModelLanguage(inputModel, tool.language || 'plaintext');
        if (outputModel) window.monaco.editor.setModelLanguage(outputModel, tool.language || 'plaintext');
        applyIndentToModels();

        // Double RAF ensures layout is complete after visibility change
        requestAnimationFrame(() => requestAnimationFrame(() => {
          inputEditor?.layout();
          outputEditor?.layout();
        }));

        inputEditor.setValue(''); // Start blank, don't use placeholder as value
        outputEditor.setValue('');
        clearMarkers();
        restoreSession(tool);
        applyHandoff(tool);
        if (document.activeElement === document.getElementById('currentToolTitle') || document.activeElement === document.body) inputEditor.focus();
        if (tool.autoRun) setTimeout(() => processInput(), 100);
      });
    }

    } catch (e) {
      logger.error('Error switching tool:', e);
    }
}

/** Tool inputs hold code/data: no spellcheck squiggles, autocorrect or autocapitalize. */
// Form-only tools read better at a constrained width
function isNarrowForm(id: string): boolean {
  return ['timestamp', 'numberBaseConverter', 'uuid', 'cronParser', 'randomStringGenerator'].includes(id);
}

function disableTextAssist(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('textarea, input:not([type]), input[type="text"], input[type="search"]').forEach(el => {
    if (!el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'false');
    if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
    if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'off');
    if (!el.hasAttribute('autocorrect')) el.setAttribute('autocorrect', 'off');
  });
}

// ---- Per-tool session state (memory only: never localStorage, disk or IPC) ----
type SessionState = { editor?: string; fields?: FieldSnapshot };
const sessionState = new Map<string, SessionState>();
const REMEMBER_KEY = 'remember-inputs'; // preference flag only, never the data
const MAX_SESSION_CHARS = 1024 * 1024;
const rememberInputs = (): boolean => localStorage.getItem(REMEMBER_KEY) !== 'false';

function snapshotSession(): void {
  const tool = currentTool;
  if (!tool || !rememberInputs()) return;
  if (tool.useCustomUI) {
    const root = document.getElementById('customInterface');
    if (!root || !root.firstElementChild) return; // not rendered yet: keep the previous snapshot
    sessionState.set(tool.id, { fields: captureFields(root) });
  } else if (inputEditor) {
    const v = inputEditor.getValue();
    if (v.length > MAX_SESSION_CHARS) sessionState.delete(tool.id);
    else sessionState.set(tool.id, { editor: v });
  }
}

/** Text pasted on the welcome screen, waiting for its tool to render. */
let pendingHandoff: { toolId: string; text: string } | null = null;

function applyHandoff(tool: Tool): void {
  const h = pendingHandoff;
  if (!h || h.toolId !== tool.id) return;
  pendingHandoff = null;
  if (!tool.useCustomUI) {
    inputEditor?.setValue(h.text);
    inputEditor?.focus();
    return;
  }
  if (!tool.primaryInput) return;
  const el = document.getElementById(tool.primaryInput) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  el.value = h.text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setupWelcomePaste(): void {
  const box = document.getElementById('welcomePaste') as HTMLTextAreaElement | null;
  const line = document.getElementById('welcomeDetect');
  if (!box || !line) return;
  let top: Candidate[] = [];
  const open = (c: Candidate): void => {
    const text = box.value.trim();
    if (!text || !window.tools?.[c.toolId]) return;
    pendingHandoff = { toolId: c.toolId, text };
    box.value = '';
    render();
    switchTool(c.toolId);
  };
  const render = (): void => {
    top = detect(box.value).filter(c => window.tools?.[c.toolId]).slice(0, 3);
    line.innerHTML = '';
    if (!box.value.trim()) return;
    if (!top.length) {
      line.innerHTML = '<span class="welcome-detect-none">No match. Try <button type="button" class="link-btn" id="welcomeJump">Jump to a tool</button>.</span>';
      document.getElementById('welcomeJump')?.addEventListener('click', () => openPalette());
      return;
    }
    top.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const title = window.tools![c.toolId]!.title;
      if (i === 0) {
        b.className = 'btn-primary';
        b.innerHTML = `Looks like ${esc(c.label)} <span aria-hidden="true">&rarr;</span> Open ${esc(title)} <kbd class="welcome-detect-kbd">&crarr;</kbd>`;
      } else {
        b.className = 'welcome-detect-alt';
        b.textContent = `or ${title}`;
      }
      b.onclick = () => open(c);
      line.appendChild(b);
    });
  };
  box.addEventListener('input', render);
  box.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && top[0]) { e.preventDefault(); open(top[0]); }
  });
}

function restoreSession(tool: Tool): void {
  const s = rememberInputs() ? sessionState.get(tool.id) : undefined;
  if (!s) return;
  if (tool.useCustomUI && s.fields) {
    const root = document.getElementById('customInterface');
    if (root) restoreFields(root, s.fields);
  } else if (!tool.useCustomUI && s.editor && inputEditor) {
    inputEditor.setValue(s.editor);
  }
}

/** Ctrl/Cmd+Shift+Backspace and palette: wipe the current tool's inputs and its session snapshot. */
function clearToolSession(): void {
  const tool = currentTool;
  if (!tool) { showToast('Pick a tool first', 'error'); return; }
  sessionState.delete(tool.id);
  if (!tool.useCustomUI) {
    if (inputEditor?.getValue()) document.getElementById('clearBtn')?.click();
    else showToast('Session cleared');
    return;
  }
  const root = document.getElementById('customInterface');
  if (!root) return;
  const ids = clearableFieldIds(root);
  const fire = (): void => ids.forEach(id => {
    const el = document.getElementById(id);
    el?.dispatchEvent(new Event('input', { bubbles: true }));
    el?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const hasValue = ids.some(id => (document.getElementById(id) as HTMLInputElement | null)?.value);
  if (hasValue) clearWithUndo(ids, fire, 'Session cleared');
  else showToast('Session cleared');
}

/** Segmented radiogroup for an editor tool's modes (neutral selected style, arrow-key navigation). */
function buildModeControl(tool: Tool): HTMLElement {
  const modes = tool.modes ?? [];
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Mode');
  group.id = 'modeControl';
  const btns = modes.map(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'segmented-opt';
    b.setAttribute('role', 'radio');
    b.dataset.mode = m.id;
    b.textContent = m.label;
    return b;
  });
  const sync = (): void => {
    const cur = currentMode(tool);
    btns.forEach(b => {
      const on = b.dataset.mode === cur;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  const select = (i: number, focus: boolean): void => {
    const b = btns[i];
    if (!b) return;
    toolModes.set(tool.id, b.dataset.mode!);
    sync();
    if (focus) b.focus();
    void processInput();
  };
  btns.forEach((b, i) => {
    b.onclick = () => select(i, false);
    b.onkeydown = e => {
      const n = btns.length;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j >= 0) { e.preventDefault(); select(j, true); }
    };
  });
  group.append(...btns);
  sync();
  return group;
}

/** Land keyboard users in the tool's primary input and announce the tool politely. */
function focusToolStart(tool: Tool): void {
  const live = document.getElementById('toolAnnounce');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = `${tool.title} opened`; }, 50); }
  requestAnimationFrame(() => {
    if (currentTool !== tool) return;
    const active = document.activeElement;
    // Don't steal focus from the palette while it's still handling input
    if (active && active.closest('#cmdPalette')) return;
    if (tool.useCustomUI) {
      const root = document.getElementById('customInterface');
      const el = (tool.primaryInput ? document.getElementById(tool.primaryInput) : null)
        ?? root?.querySelector<HTMLElement>('textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio])');
      if (el) { el.focus({ preventScroll: true }); return; }
    } else if (inputEditor) {
      inputEditor.focus();
      return;
    }
    document.getElementById('currentToolTitle')?.focus({ preventScroll: true });
  });
}


function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Best-effort location extraction from common parser error messages
function locateError(message: string, input: string): { line: number; col: number } | null {
  let m = message.match(/line\s+(\d+)\D+column\s+(\d+)/i) || message.match(/\((\d+):(\d+)\)/);
  if (m) return { line: parseInt(m[1], 10), col: parseInt(m[2], 10) };
  m = message.match(/position\s+(\d+)/i);
  if (m) {
    const pos = Math.min(parseInt(m[1], 10), input.length);
    const before = input.slice(0, pos).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
  }
  return null;
}

function clearMarkers(): void {
  const model = inputEditor?.getModel();
  if (model && window.monaco) window.monaco.editor.setModelMarkers(model, 'forgetools', []);
}

function showOutput(text: string, input: string): void {
  clearMarkers();
  requestAnimationFrame(() => outputEditor?.setValue(text));
  if (!input.trim()) {
    setStatus('idle', 'Ready');
  } else {
    setStatus('ok', 'Done', `${formatBytes(input.length)} \u2192 ${formatBytes(text.length)}`);
  }
}

async function processInput(): Promise<void> {
  if (!currentTool || currentTool.useCustomUI || !outputEditor) return;
  const input = inputEditor?.getValue() || '';

  try {
    if (!currentTool.format) return;

    const indentChoice = getIndentChoice();
    const mode = currentMode(currentTool) ?? '';
    const cacheKey = `${currentTool.id}:${mode}:${indentChoice}:${input}`;
    if (input.trim()) {
      const cached = resultCache.get(cacheKey);
      if (cached !== undefined) {
        showOutput(cached, input);
        return;
      }
    }

    const result = currentTool.format(input, getIndent(), mode || undefined);
    let outputStr = String(typeof result === 'string' ? result : await result);
    if (indentChoice === 'tab') {
      // Formatters indent with 4 spaces in tab mode; convert leading runs to tabs
      outputStr = outputStr.replace(/^(?: {4})+/gm, m => '\t'.repeat(m.length / 4));
    }

    if (input.trim()) {
      resultCache.set(cacheKey, outputStr);
    }
    showOutput(outputStr, input);
  } catch (e) {
    // Keep the last good output; report the problem in the status bar and mark the input
    const error = e instanceof Error ? e : new Error(String(e));
    const loc = locateError(error.message, input);
    setStatus('error', error.message, loc ? `Ln ${loc.line}, Col ${loc.col}` : 'previous output kept');
    const model = inputEditor?.getModel();
    if (model && window.monaco) {
      const line = loc ? Math.max(1, Math.min(loc.line, model.getLineCount())) : 1;
      const col = loc ? Math.max(1, loc.col) : 1;
      window.monaco.editor.setModelMarkers(model, 'forgetools', [{
        severity: window.monaco.MarkerSeverity.Error,
        message: error.message,
        startLineNumber: line,
        startColumn: col,
        endLineNumber: line,
        endColumn: loc ? col + 1 : model.getLineMaxColumn(line)
      }]);
    }
  }
}

function setupEventListeners(): void {
  // Sidebar Search - optimized with debouncing and batched DOM updates
  const searchInput = document.getElementById('sidebarSearch') as HTMLInputElement | null;
  if (searchInput) {
    const applyFilter = (): void => {
      const term = searchInput.value.trim().toLowerCase();
      let total = 0;
      document.querySelectorAll<HTMLElement>('#toolsNav .nav-group').forEach(group => {
        let visible = 0;
        group.querySelectorAll<HTMLElement>('.nav-row').forEach(row => {
          const item = row.querySelector<HTMLElement>('.nav-item');
          const toolId = item?.getAttribute('data-tool-id') ?? item?.getAttribute('data-tool-ref') ?? '';
          const tool = window.tools?.[toolId];
          const matches = !term || (tool ? scoreTool(tool, term) > 0 : (item?.textContent?.toLowerCase() ?? '').includes(term));
          row.hidden = !matches;
          if (matches) visible++;
        });
        group.hidden = visible === 0;
        // Searching temporarily expands matching groups; clearing restores the saved state
        group.classList.toggle('is-searching', !!term);
        // Quick groups duplicate category rows; don't count them toward "no match"
        if (group.closest('#navQuick')) return;
        total += visible;
      });
      const empty = document.getElementById('navEmpty');
      if (empty) empty.hidden = total > 0;
    };
    applySidebarFilter = applyFilter;
    const visibleItems = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('#toolsNav .nav-item')).filter(el => el.offsetParent !== null);
    const searchHandler = debounce(() => requestAnimationFrame(applyFilter), 80);
    searchInput.addEventListener('input', searchHandler);
    eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        applyFilter();
        const first = visibleItems()[0];
        if (first) { e.preventDefault(); first.click(); }
      } else if (e.key === 'ArrowDown') {
        applyFilter();
        const first = visibleItems()[0];
        if (first) { e.preventDefault(); first.focus(); }
      } else if (e.key === 'Escape' && searchInput.value) {
        e.stopPropagation();
        searchInput.value = '';
        applyFilter();
      }
    });
    // Arrow-key movement within the tool list (category toggles included, collapsed rows skipped)
    document.getElementById('toolsNav')?.addEventListener('keydown', e => {
      const el = document.activeElement as HTMLElement;
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && el?.classList.contains('nav-item')) {
        const id = el.getAttribute('data-tool-id') ?? el.getAttribute('data-tool-ref');
        if (id) { e.preventDefault(); togglePin(id); }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = Array.from(document.querySelectorAll<HTMLElement>('#toolsNav .nav-item, #toolsNav .category-toggle'))
        .filter(x => x.offsetParent !== null);
      const i = items.indexOf(el);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && i === 0) { searchInput.focus(); return; }
      items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    });
  }

  // Editor Actions
  const clearBtn = document.getElementById('clearBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const copyBtn = document.getElementById('copyBtn');
  const sampleBtn = document.getElementById('sampleBtn');

  if (clearBtn) clearBtn.onclick = () => {
    const ed = inputEditor;
    const model = ed?.getModel();
    if (!ed || !model || !model.getValue()) return;
    // Use an edit (not setValue) so Monaco's own Ctrl+Z history also restores it
    ed.pushUndoStop();
    ed.executeEdits('clear', [{ range: model.getFullModelRange(), text: '' }]);
    ed.pushUndoStop();
    ed.focus();
    showToast('Input cleared', 'success', { label: 'Undo', run: () => { ed.trigger('toast', 'undo', null); ed.focus(); } });
  };

  if (pasteBtn) pasteBtn.onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (inputEditor) {
        inputEditor.setValue(text);
        inputEditor.focus();
      }
    } catch (e) {
      logger.error('Paste failed:', e);
      showToast('Clipboard is unavailable. Paste into the editor directly.', 'error');
    }
  };

  if (copyBtn) copyBtn.onclick = () => {
    if (outputEditor) {
      const text = outputEditor.getValue();
      if (!text) { showToast('Nothing to copy yet', 'error'); return; }
      navigator.clipboard.writeText(text)
        .then(() => showToast('Copied output'))
        .catch(() => showToast('Copy failed. Select the output and copy it manually.', 'error'));
    }
  };

  if (sampleBtn) sampleBtn.onclick = () => {
    if (!currentTool) {
      showToast('Pick a tool first', 'error');
      return;
    }
    
    // Check if tool has sampleData property
    const sampleData = currentTool.sampleData;
    if (!sampleData) {
      showToast('This tool has no sample. Paste your own input.', 'error');
      return;
    }
    
    if (!inputEditor) {
      showToast('Editor is still loading. Try again in a moment.', 'error');
      return;
    }
    
    inputEditor.setValue(sampleData);
    inputEditor.focus();
    // Trigger processing if autoRun is enabled
    if (currentTool.autoRun) {
      setTimeout(() => processInput(), 100);
    }
  };

  // Settings sheet (opened from the titlebar button and the palette)
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose = document.getElementById('settingsClose');
  
  if (settingsOverlay) {
    const panel = settingsOverlay.querySelector<HTMLElement>('[role="dialog"]') ?? settingsOverlay;
    const closeSettings = (): void => {
      if (!settingsOverlay.classList.contains('visible')) return;
      settingsOverlay.classList.remove('visible');
      settingsOverlay.classList.add('hidden');
      closeModal(panel);
    };
    openSettingsSheet = (opener?: HTMLElement | null) => {
      settingsOverlay.classList.remove('hidden');
      settingsOverlay.classList.add('visible');
      openModal(panel, {
        opener: opener ?? (document.activeElement as HTMLElement | null) ?? undefined,
        initialFocus: document.getElementById('setting-wordwrap'),
        onEscape: closeSettings
      });
    };
    if (settingsClose) settingsClose.onclick = closeSettings;
    const overlayClickHandler = (e: Event) => {
      if (e.target === settingsOverlay) closeSettings();
    };
    settingsOverlay.addEventListener('click', overlayClickHandler);
    eventListeners.push({ element: settingsOverlay, event: 'click', handler: overlayClickHandler });
  }
  
  // Settings Controls
  const wordWrapCheckbox = document.getElementById('setting-wordwrap') as HTMLInputElement | null;
  const minimapCheckbox = document.getElementById('setting-minimap') as HTMLInputElement | null;
  const fontSizeSelect = document.getElementById('setting-fontsize') as HTMLSelectElement | null;
  
  // Load settings from localStorage
  const savedSettings = {
    wordWrap: localStorage.getItem('editor-wordwrap') === 'true',
    minimap: localStorage.getItem('editor-minimap') === 'true',
    fontSize: parseInt(localStorage.getItem('editor-fontsize') || '13', 10)
  };
  
  if (wordWrapCheckbox) wordWrapCheckbox.checked = savedSettings.wordWrap;
  if (minimapCheckbox) minimapCheckbox.checked = savedSettings.minimap;
  if (fontSizeSelect) fontSizeSelect.value = String(savedSettings.fontSize);
  
  // Apply settings to editors (and persist even before Monaco loads)
  const applySettings = (): void => {
    const wordWrap: 'on' | 'off' = wordWrapCheckbox?.checked ? 'on' : 'off';
    const minimap = { enabled: minimapCheckbox?.checked || false };
    const fontSize = parseInt(fontSizeSelect?.value || '13', 10);

    localStorage.setItem('editor-wordwrap', String(wordWrap === 'on'));
    localStorage.setItem('editor-minimap', String(minimap.enabled));
    localStorage.setItem('editor-fontsize', String(fontSize));

    inputEditor?.updateOptions({ wordWrap, minimap, fontSize });
    outputEditor?.updateOptions({ wordWrap, minimap, fontSize });
  };
  
  if (wordWrapCheckbox) wordWrapCheckbox.onchange = applySettings;
  if (minimapCheckbox) minimapCheckbox.onchange = applySettings;
  if (fontSizeSelect) fontSizeSelect.onchange = applySettings;

  const rememberCheckbox = document.getElementById('setting-remember') as HTMLInputElement | null;
  if (rememberCheckbox) {
    rememberCheckbox.checked = rememberInputs();
    rememberCheckbox.onchange = () => {
      localStorage.setItem(REMEMBER_KEY, String(rememberCheckbox.checked));
      if (!rememberCheckbox.checked) sessionState.clear();
    };
  }
}

function setupCommandPalette(): void {
  const palette = document.getElementById('cmdPalette');
  const input = document.getElementById('cmdInput') as HTMLInputElement | null;
  const results = document.getElementById('cmdResults');

  if (!palette || !input || !results || !window.tools) return;

  let matches: Tool[] = [];
  let selected = 0;
  const dialog = palette.querySelector<HTMLElement>('[role="dialog"]') ?? palette;
  const isOpen = (): boolean => palette.classList.contains('visible');

  const open = (): void => {
    if (isOpen()) return;
    palette.classList.add('visible');
    input.setAttribute('aria-expanded', 'true');
    input.value = '';
    renderCmdResults('');
    openModal(dialog, { initialFocus: input, onEscape: () => close() });
  };
  const close = (restoreFocus = true): void => {
    if (!isOpen()) return;
    palette.classList.remove('visible');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    closeModal(dialog, restoreFocus);
  };
  openPalette = open;

  const choose = (tool: Tool | undefined): void => {
    if (!tool) return;
    const cmd = (tool as Tool & { run?: () => void }).run;
    if (cmd) { close(); cmd(); return; }
    // Focus moves into the opened tool rather than back to the opener
    close(false);
    if (narrowMq.matches) setDrawer(false);
    switchTool(tool.id);
  };

  const keydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isOpen()) close(); else open();
    }
  };
  document.addEventListener('keydown', keydownHandler);
  eventListeners.push({ element: document, event: 'keydown', handler: keydownHandler as EventListener });

  const navHandler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      selected = (selected + step + matches.length) % matches.length;
      updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[selected]);
    }
  };
  input.addEventListener('keydown', navHandler);
  eventListeners.push({ element: input, event: 'keydown', handler: navHandler as EventListener });

  const paletteClickHandler = (e: Event) => {
    if (e.target === palette) close();
  };
  palette.addEventListener('click', paletteClickHandler);
  eventListeners.push({ element: palette, event: 'click', handler: paletteClickHandler });

  // No debounce: filtering a few dozen tools is instant, and lag here is felt
  const inputHandler = () => renderCmdResults(input.value);
  input.addEventListener('input', inputHandler);
  eventListeners.push({ element: input, event: 'input', handler: inputHandler });

  function updateSelection(): void {
    const items = results!.querySelectorAll<HTMLElement>('.cmd-item');
    items.forEach((el, i) => {
      const on = i === selected;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
      if (on) {
        el.scrollIntoView({ block: 'nearest' });
        input!.setAttribute('aria-activedescendant', el.id);
      }
    });
  }

  function highlight(text: string, term: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const idx = term ? text.toLowerCase().indexOf(term) : -1;
    if (idx < 0) { frag.append(text); return frag; }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + term.length);
    frag.append(text.slice(0, idx), mark, text.slice(idx + term.length));
    return frag;
  }

  function renderCmdResults(term: string): void {
    if (!window.tools || !results) return;
    const t = term.trim().toLowerCase();
    const all = Object.values(window.tools);
    if (!t) {
      const recent = getRecent().map(id => window.tools![id]).filter(Boolean) as Tool[];
      matches = [...recent, ...all.filter(x => !recent.includes(x))];
    } else {
      // Rank: prefix > word-start > substring > subsequence across title/keywords/id; then description
      matches = all.map(x => [x, scoreTool(x, t)] as const).filter(([, sc]) => sc > 0)
        .sort((a, b) => b[1] - a[1]).map(([x]) => x);
    }
    // Commands (synthetic entries) come first when they match
    const cmds: Tool[] = [];
    if (currentTool) {
      const label = `Clear session for ${currentTool.title}`;
      if (t && (label.toLowerCase().includes(t) || 'clear session'.startsWith(t))) {
        cmds.push({ id: '__clear-session', title: label, category: 'Commands', description: '', icon: 'backspace', run: clearToolSession } as unknown as Tool);
      }
    }
    if (t && ('open settings'.includes(t) || 'settings'.startsWith(t) || t.startsWith('sett'))) {
      cmds.push({ id: '__open-settings', title: 'Open settings', category: 'Commands', description: '', icon: 'tune', run: () => openSettingsSheet() } as unknown as Tool);
    }
    // "pin json" / "unpin jwt": a pin command per matching tool
    const pinMatch = /^(un)?pin(?:\s+(.*))?$/.exec(t);
    if (t && pinMatch) {
      const rest = (pinMatch[2] ?? '').trim();
      const pool = rest ? all.filter(x => x.title.toLowerCase().includes(rest) || x.id.toLowerCase().includes(rest))
        : currentTool ? [currentTool] : [];
      pool.slice(0, 6).forEach(x => {
        const pinned = isPinned(x.id);
        if (pinMatch[1] && !pinned) return;
        cmds.push({ id: `__pin-${x.id}`, title: `${pinned ? 'Unpin' : 'Pin'} ${x.title}`, category: 'Commands', description: '', icon: 'push_pin', run: () => togglePin(x.id) } as unknown as Tool);
      });
    }
    matches = [...cmds, ...matches];
    // Group by section (Recent first when browsing); groups appear in order of their best match
    const recentIds = t ? [] : getRecent();
    const groupOf = (x: Tool): string => x.id.startsWith('__') ? 'Commands' : recentIds.includes(x.id) ? 'Recent' : x.category;
    const order: string[] = [];
    matches.forEach(x => { const g = groupOf(x); if (!order.includes(g)) order.push(g); });
    matches = order.flatMap(g => matches.filter(x => groupOf(x) === g));
    selected = 0;

    const fragment = document.createDocumentFragment();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'cmd-empty';
      empty.textContent = `No tool matches "${term.trim()}"`;
      fragment.appendChild(empty);
      input!.removeAttribute('aria-activedescendant');
    }
    let lastGroup = '';
    matches.forEach((tool, i) => {
      const g = groupOf(tool);
      if (g !== lastGroup) {
        lastGroup = g;
        const label = document.createElement('div');
        label.className = 'cmd-group-label';
        label.setAttribute('role', 'presentation');
        label.textContent = g;
        fragment.appendChild(label);
      }
      const item = document.createElement('div');
      item.className = 'cmd-item';
      item.id = `cmd-opt-${i}`;
      item.setAttribute('role', 'option');
      const icon = document.createElement('i');
      icon.className = 'material-icons';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = tool.icon;
      const title = document.createElement('span');
      title.className = 'truncate shrink-0 max-w-[60%]';
      title.appendChild(highlight(tool.title, t));
      const cat = document.createElement('span');
      cat.className = 'cmd-meta';
      cat.textContent = `\u2014 ${tool.category}`;
      // Category is redundant under its own group heading; keep it only under Recent/Commands.
      if (g === tool.category) item.append(icon, title); else item.append(icon, title, cat);
      item.onmousemove = () => { if (selected !== i) { selected = i; updateSelection(); } };
      item.onclick = () => choose(tool);
      fragment.appendChild(item);
    });
    results.textContent = '';
    results.appendChild(fragment);
    updateSelection();
  }
}

// ---- Recent tools + start screen ----
const RECENT_KEY = 'recent-tools';
const POPULAR = ['json', 'jwt', 'base64', 'url', 'timestamp', 'uuid', 'hash', 'textDiff'];
let openPalette: () => void = () => {};

function getRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
    return list.filter(id => window.tools?.[id]);
  } catch {
    return [];
  }
}

function rememberRecent(id: string): void {
  const list = [id, ...getRecent().filter(x => x !== id)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

function renderWelcome(): void {
  if (!window.tools) return;
  const tools = window.tools;
  const make = (tool: Tool): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'welcome-tool';
    const icon = document.createElement('i');
    icon.className = 'material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tool.icon;
    const title = document.createElement('span');
    title.className = 'truncate';
    title.textContent = tool.title;
    const desc = document.createElement('span');
    desc.className = 'welcome-tool-desc';
    desc.textContent = tool.description;
    desc.title = tool.description;
    b.append(icon, title, desc);
    b.onclick = () => switchTool(tool.id);
    return b;
  };
  const recent = getRecent().map(id => tools[id]).filter(Boolean) as Tool[];
  const recentWrap = document.getElementById('recentTools');
  const recentSection = document.getElementById('recentSection');
  if (recentWrap && recentSection) {
    recentWrap.textContent = '';
    recent.forEach(t => recentWrap.appendChild(make(t)));
    recentSection.classList.toggle('hidden', recent.length === 0);
  }
  const popularWrap = document.getElementById('popularTools');
  if (popularWrap) {
    popularWrap.textContent = '';
    const missing = POPULAR.filter(id => !tools[id]);
    if (missing.length) logger.warn('Popular tool ids not found in registry:', missing.join(', '));
    let popular = POPULAR.map(id => tools[id]).filter(t => t && !recent.includes(t)) as Tool[];
    if (missing.length) {
      // Only backfill the slots lost to missing ids
      const extra = Object.values(tools).filter(t => !recent.includes(t) && !popular.includes(t));
      popular = [...popular, ...extra.slice(0, missing.length)];
    }
    popular.forEach(t => popularWrap.appendChild(make(t)));
  }
}

