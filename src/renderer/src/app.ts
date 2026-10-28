import type { Tool } from '../../types/tools';
import type { editor } from 'monaco-editor';
import '../../types/electronAPI'; // Ensure Window types are available
import { logger } from './logger';
import './tools';
import { getHelp } from './tools/help';
import { esc } from './ui';
import { showToast, wireClipboardActions, setStatus } from './ui';

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
let isEncodeMode = true;
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

const resultCache = new LRUCache<string>(100, 5 * 60 * 1000);

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
  
  // Update Monaco Theme
  if (window.monaco) {
    window.monaco.editor.setTheme(isDark ? 'forge-dark' : 'vs');
    // Update Diff Editor Theme if active
    if (window.diffEditor) {
      window.diffEditor.updateOptions({ 
        theme: isDark ? 'forge-dark' : 'vs' 
      } as editor.IDiffEditorConstructionOptions);
    }
  }
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
  
  // Try to load Monaco - improved with better error handling and retry logic
  // Use requestIdleCallback in production for non-critical loading
  const loadMonaco = (retryCount = 0): void => {
    const maxRetries = 30; // 3 seconds max (30 * 100ms)
    
    if (window.monacoPath && (window.require || typeof require !== 'undefined')) {
      try {
        const req = window.require || require;
        if (req) {
          req.config({ paths: { vs: window.monacoPath } });
          req(['vs/editor/editor.main'], (monaco: typeof import('monaco-editor')) => {
            window.monaco = monaco;
            initMonaco();
          }, (error: Error) => {
            logger.error('Monaco Editor failed to load:', error);
            // Don't retry on actual load errors, only on missing require
          });
        }
      } catch (e) {
        logger.error('Failed to load Monaco Editor:', e);
      }
    } else if (window.monacoPath && retryCount < maxRetries) {
      // Exponential backoff for retries
      const delay = Math.min(100 * Math.pow(1.2, retryCount), 500);
      setTimeout(() => loadMonaco(retryCount + 1), delay);
    } else if (retryCount >= maxRetries) {
      logger.warn('Monaco Editor failed to load after maximum retries');
    }
  };
  
  // Optimize Monaco loading: use requestIdleCallback in production, immediate in dev
  const isProduction = import.meta.env.PROD;
  if (isProduction && 'requestIdleCallback' in window) {
    requestIdleCallback(() => loadMonaco(0), { timeout: 1000 });
  } else {
    // Start loading Monaco after a short delay to ensure require.js is loaded
    setTimeout(() => loadMonaco(0), 300);
  }
});

function initMonaco(): void {
  if (!window.monaco) return;

  const themeData: editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: '', background: '0d1117' }],
    colors: {
      'editor.background': '#0d1117',
      'editor.lineHighlightBackground': '#161b22',
      'editorLineNumber.foreground': '#8b949e'
    }
  };
  window.monaco.editor.defineTheme('forge-dark', themeData);

  const isDark = currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const commonOptions: editor.IStandaloneEditorConstructionOptions = {
    theme: isDark ? 'forge-dark' : 'vs',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    minimap: { enabled: false },
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
    // Disable semantic highlighting and other worker-dependent features
    'semanticHighlighting.enabled': false
  };

  // Replace placeholder divs with Monaco editors
  const inputContainer = document.getElementById('inputEditor');
  const outputContainer = document.getElementById('outputEditor');
  
  // MonacoEnvironment is already set in index.html before Monaco loads
  // No need to set it again here
  
  if (inputContainer && window.monaco) {
    inputContainer.innerHTML = '';
    inputEditor = window.monaco.editor.create(inputContainer, {
      ...commonOptions,
      value: ''
    });
    
    // Debounce input processing - optimized timing for better UX
    const debouncedProcessInput = debounce(() => {
      if (currentTool && !currentTool.useCustomUI) {
        // Use requestIdleCallback if available for non-critical processing
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => processInput(), { timeout: 100 });
        } else {
          // Fallback: use setTimeout for better performance than immediate execution
          setTimeout(() => processInput(), 0);
        }
      }
    }, 250); // Optimized debounce delay
    
    inputEditor.onDidChangeModelContent(debouncedProcessInput);
  }

  if (outputContainer && window.monaco) {
    outputContainer.innerHTML = '';
    outputEditor = window.monaco.editor.create(outputContainer, {
      ...commonOptions,
      value: '',
      readOnly: true
    });
  }
  
  // If a tool is already selected, refresh it to use Monaco
  if (currentTool && !currentTool.useCustomUI) {
    switchTool(currentTool.id);
  }
}

// --- Tool help popover (button + F1) ---
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
    + `<div class="help-foot">Runs offline. Ctrl+K to switch tools · Esc to close</div>`;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function setupHelp(): void {
  document.getElementById('helpBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleHelp(); });
  document.addEventListener('click', e => {
    const pop = document.getElementById('helpPopover');
    if (pop && !pop.hidden && !pop.contains(e.target as Node)) closeHelp();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'F1') { e.preventDefault(); toggleHelp(); }
    else if (e.key === 'Escape') closeHelp();
  });
}

function initApp(): void {
  renderSidebar();
  renderWelcome();
  document.getElementById('welcomeSearch')?.addEventListener('click', () => openPalette());
  wireClipboardActions();
  setupHelp();
  setupEventListeners();
  setupCommandPalette();
  
  // With native window controls on all platforms, hide custom controls
  const isMac = window.platform?.isMac ?? (navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  const titlebar = document.querySelector('.titlebar');
  const titlebarControls = document.querySelector('.titlebar-controls');
  
  if (titlebar && titlebarControls) {
    // Hide custom window controls - native controls are used on all platforms
    (titlebarControls as HTMLElement).style.display = 'none';
    
    document.querySelectorAll('.mod-key').forEach(el => { el.textContent = isMac ? '⌘' : 'Ctrl'; });
    if (isMac) {
      // macOS: native controls on the left with titleBarStyle: 'hiddenInset'
      // Adjust titlebar padding to account for native controls
      (titlebar as HTMLElement).style.paddingLeft = '78px';
    } else {
      // Windows/Linux: native frame includes titlebar with controls
      // Our custom titlebar is below the native one, so no padding adjustment needed
    }
    
    // Theme Switcher
    const themeSelect = document.createElement('select');
    themeSelect.className = 'toolbar-select absolute top-3 right-4 z-[200]';
    themeSelect.setAttribute('aria-label', 'Theme');
    themeSelect.innerHTML = `
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    `;
    themeSelect.value = currentTheme;
    themeSelect.onchange = (e) => {
      const target = e.target as HTMLSelectElement;
      setTheme(target.value as 'system' | 'light' | 'dark');
    };
    titlebar.appendChild(themeSelect);
  }

  // Hide loading screen
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    setTimeout(() => {
      loadingScreen.style.opacity = '0';
      setTimeout(() => loadingScreen.remove(), 300);
    }, 500); // Small buffer to ensure smooth transition
  }
}

function renderSidebar(): void {
  const nav = document.getElementById('toolsNav');
  if (!nav || !window.tools) return;
  
  // Use DocumentFragment to minimize reflows
  const fragment = document.createDocumentFragment();
  
  const categories: Record<string, Tool[]> = {};
  Object.values(window.tools).forEach(tool => {
    if (!categories[tool.category]) categories[tool.category] = [];
    categories[tool.category].push(tool);
  });

  Object.entries(categories).forEach(([category, categoryTools]) => {
    const header = document.createElement('div');
    header.className = 'category-header';
    header.textContent = category;
    fragment.appendChild(header);

    categoryTools.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.setAttribute('data-tool-id', tool.id);
      btn.innerHTML = `<i class="material-icons nav-icon">${tool.icon}</i> ${tool.title}`;
      btn.onclick = () => switchTool(tool.id);
      fragment.appendChild(btn);
    });
  });
  
  // Single DOM update
  nav.textContent = '';
  nav.appendChild(fragment);
}

function switchTool(toolId: string): void {
  if (!window.tools) return;
  const tool = window.tools[toolId];
  if (!tool) return;

  // Ensure we have a proper reference to the tool with all properties
  currentTool = tool;
  rememberRecent(tool.id);
  
  try {
    // Batch DOM updates to reduce reflows
    const welcome = document.getElementById('welcomeState');
    const container = document.getElementById('toolContainer');
    const titleEl = document.getElementById('currentToolTitle');
    const descEl = document.getElementById('currentToolDesc');
    
    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
      if (welcome) welcome.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      if (titleEl) titleEl.textContent = tool.title;
      if (descEl) descEl.textContent = tool.description;
    });
    
    // Update Sidebar Active State - use requestAnimationFrame for batched updates
    requestAnimationFrame(() => {
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(btn => {
        const btnToolId = btn.getAttribute('data-tool-id');
        const isActive = btnToolId === tool.id;
        btn.classList.toggle('active', isActive);
      });
    });

    // Setup Actions
    const actionsContainer = document.getElementById('toolActions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      if (!tool.useCustomUI && tool.hasMode) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-primary';
        toggleBtn.textContent = isEncodeMode ? tool.encodeText || 'Encode' : tool.decodeText || 'Decode';
        toggleBtn.onclick = () => {
          isEncodeMode = !isEncodeMode;
          toggleBtn.textContent = isEncodeMode ? tool.encodeText || 'Encode' : tool.decodeText || 'Decode';
          processInput();
        };
        actionsContainer.appendChild(toggleBtn);
      }
    }

    // Toggle Interfaces
    const editorInterface = document.getElementById('editorInterface');
    const customInterface = document.getElementById('customInterface');
    
    setStatus('idle', 'Ready');
    closeHelp();
    if (tool.useCustomUI) {
      // Show Custom UI
      if (editorInterface) editorInterface.classList.add('hidden');
      if (customInterface) {
        customInterface.classList.remove('hidden');
        customInterface.innerHTML = '';
        if (tool.load) {
          const token = ++renderToken;
          tool.load()
            .then(mod => { if (token === renderToken) mod.render(customInterface); })
            .catch(err => {
              logger.error(`Failed to load ${tool.id}:`, err);
              if (token === renderToken) showToast(`Could not open ${tool.title}`, 'error');
            });
        }
      }
    } else {
      renderToken++; // cancel any pending custom UI load
      // Show Editor UI
      if (editorInterface) editorInterface.classList.remove('hidden');
      if (customInterface) customInterface.classList.add('hidden');
      
      // Configure Monaco if available
      if (inputEditor && outputEditor && window.monaco) {
        const inputModel = inputEditor.getModel();
        const outputModel = outputEditor.getModel();
        if (inputModel) {
          window.monaco.editor.setModelLanguage(inputModel, tool.language || 'plaintext');
        }
        if (outputModel) {
          window.monaco.editor.setModelLanguage(outputModel, tool.language || 'plaintext');
        }
        
        // Force layout update after visibility change - use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Double RAF ensures layout is complete
            if (inputEditor) inputEditor.layout();
            if (outputEditor) outputEditor.layout();
          });
        });
        
        // Set value (this triggers processInput via event listener)
        inputEditor.setValue(''); // Start blank, don't use placeholder as value
        outputEditor.setValue('');
        clearMarkers();
      }
      
      if (tool.autoRun) {
        setTimeout(() => processInput(), 100);
      }
    }

    } catch (e) {
      logger.error('Error switching tool:', e);
    }
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
    setStatus('ok', 'Done', `${formatBytes(input.length)} → ${formatBytes(text.length)}`);
  }
}

async function processInput(): Promise<void> {
  if (!currentTool || currentTool.useCustomUI || !outputEditor) return;
  const input = inputEditor?.getValue() || '';

  try {
    if (!currentTool.format) return;

    if (input.trim()) {
      const cached = resultCache.get(`${currentTool.id}:${input}`);
      if (cached !== undefined) {
        showOutput(cached, input);
        return;
      }
    }

    const result = currentTool.format(input);
    const outputStr = String(typeof result === 'string' ? result : await result);

    if (input.trim()) {
      resultCache.set(`${currentTool.id}:${input}`, outputStr);
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
    const searchHandler = debounce((e: Event) => {
      const term = (e.target as HTMLInputElement).value.toLowerCase();
      // Batch DOM updates using requestAnimationFrame
      requestAnimationFrame(() => {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
          const text = item.textContent?.toLowerCase() ?? '';
          const toolId = item.getAttribute('data-tool-id');
          // Also search by tool ID if available
          const matches = text.includes(term) || (toolId && toolId.toLowerCase().includes(term));
          (item as HTMLElement).style.display = matches ? 'flex' : 'none';
        });
      });
    }, 120); // Reduced debounce for better responsiveness
    
    searchInput.addEventListener('input', searchHandler);
    eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
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

  // Settings Button
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const settingsClose = document.getElementById('settingsClose');
  
  if (settingsBtn && settingsOverlay) {
    settingsBtn.onclick = () => {
      settingsOverlay.classList.remove('hidden');
      settingsOverlay.classList.add('visible');
      (document.getElementById('setting-wordwrap') as HTMLElement | null)?.focus();
    };
    const settingsEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOverlay.classList.contains('visible')) {
        settingsOverlay.classList.remove('visible');
        settingsOverlay.classList.add('hidden');
        settingsBtn.focus();
      }
    };
    document.addEventListener('keydown', settingsEsc);
    eventListeners.push({ element: document, event: 'keydown', handler: settingsEsc as EventListener });
  }
  
  if (settingsClose && settingsOverlay) {
    settingsClose.onclick = () => {
      settingsOverlay.classList.remove('visible');
      settingsOverlay.classList.add('hidden');
    };
  }
  
  if (settingsOverlay) {
    const overlayClickHandler = (e: Event) => {
      if (e.target === settingsOverlay) {
        settingsOverlay.classList.remove('visible');
        settingsOverlay.classList.add('hidden');
      }
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
  
  // Apply settings to editors
  const applySettings = (): void => {
    if (!inputEditor || !outputEditor) return;
    
    const wordWrap: 'on' | 'off' = wordWrapCheckbox?.checked ? 'on' : 'off';
    const minimap = { enabled: minimapCheckbox?.checked || false };
    const fontSize = parseInt(fontSizeSelect?.value || '13', 10);
    
    inputEditor.updateOptions({ wordWrap, minimap, fontSize });
    outputEditor.updateOptions({ wordWrap, minimap, fontSize });
    
    // Save to localStorage
    localStorage.setItem('editor-wordwrap', String(wordWrap === 'on'));
    localStorage.setItem('editor-minimap', String(minimap.enabled));
    localStorage.setItem('editor-fontsize', String(fontSize));
  };
  
  if (wordWrapCheckbox) wordWrapCheckbox.onchange = applySettings;
  if (minimapCheckbox) minimapCheckbox.onchange = applySettings;
  if (fontSizeSelect) fontSizeSelect.onchange = applySettings;
  
  // Apply initial settings if editors exist
  if (inputEditor && outputEditor) {
    applySettings();
  }
}

function setupCommandPalette(): void {
  const palette = document.getElementById('cmdPalette');
  const input = document.getElementById('cmdInput') as HTMLInputElement | null;
  const results = document.getElementById('cmdResults');

  if (!palette || !input || !results || !window.tools) return;

  let matches: Tool[] = [];
  let selected = 0;
  let returnFocus: HTMLElement | null = null;

  const open = (): void => {
    returnFocus = document.activeElement as HTMLElement | null;
    palette.classList.add('visible');
    input.value = '';
    renderCmdResults('');
    input.focus();
  };
  const close = (): void => {
    palette.classList.remove('visible');
    returnFocus?.focus?.();
  };
  openPalette = open;

  const choose = (tool: Tool | undefined): void => {
    if (!tool) return;
    palette.classList.remove('visible');
    switchTool(tool.id);
  };

  const keydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (palette.classList.contains('visible')) close(); else open();
      return;
    }
    if (palette.classList.contains('visible') && e.key === 'Escape') {
      e.preventDefault();
      close();
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
      // Rank: title prefix > title contains > id/category > description
      const score = (x: Tool): number => {
        const title = x.title.toLowerCase();
        if (title.startsWith(t)) return 0;
        if (title.includes(t)) return 1;
        if (x.id.toLowerCase().includes(t) || x.category.toLowerCase().includes(t)) return 2;
        if (x.description.toLowerCase().includes(t)) return 3;
        return 9;
      };
      matches = all.map(x => [x, score(x)] as const).filter(([, sc]) => sc < 9)
        .sort((a, b) => a[1] - b[1]).map(([x]) => x);
    }
    selected = 0;

    const fragment = document.createDocumentFragment();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'cmd-empty';
      empty.textContent = `No tool matches "${term.trim()}"`;
      fragment.appendChild(empty);
      input!.removeAttribute('aria-activedescendant');
    }
    matches.forEach((tool, i) => {
      const item = document.createElement('div');
      item.className = 'cmd-item';
      item.id = `cmd-opt-${i}`;
      item.setAttribute('role', 'option');
      const left = document.createElement('span');
      left.className = 'flex items-center gap-2.5 min-w-0';
      const icon = document.createElement('i');
      icon.className = 'material-icons text-[18px] opacity-70';
      icon.textContent = tool.icon;
      const title = document.createElement('span');
      title.className = 'truncate';
      title.appendChild(highlight(tool.title, t));
      left.append(icon, title);
      const cat = document.createElement('span');
      cat.className = 'cmd-meta';
      cat.textContent = tool.category;
      item.append(left, cat);
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
const POPULAR = ['json-formatter', 'jwt-decoder', 'base64', 'url-encoder', 'timestamp', 'uuid-generator', 'hash-generator', 'diff'];
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
    icon.textContent = tool.icon;
    const title = document.createElement('span');
    title.className = 'truncate';
    title.textContent = tool.title;
    const cat = document.createElement('span');
    cat.className = 'welcome-tool-cat';
    cat.textContent = tool.category;
    b.append(icon, title, cat);
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
    let popular = POPULAR.map(id => tools[id]).filter(t => t && !recent.includes(t)) as Tool[];
    if (popular.length < 4) {
      popular = Object.values(tools).filter(t => !recent.includes(t));
    }
    popular.slice(0, 8).forEach(t => popularWrap.appendChild(make(t)));
  }
}

