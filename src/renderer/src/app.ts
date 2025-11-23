import type { Tool } from '../../types/tools';
import type { editor } from 'monaco-editor';
import '../../types/electronAPI'; // Ensure Window types are available
import { logger } from './logger';

// Configure Monaco loader (using requirejs for Monaco)
// Monaco Editor uses AMD/RequireJS which is loaded via script tag
declare global {
  interface Window {
    require?: {
      config: (config: { paths: Record<string, string> }) => void;
      (deps: string[], callback: (monaco: typeof import('monaco-editor')) => void): void;
    };
  }
  
  const require: {
    config: (config: { paths: Record<string, string> }) => void;
    (deps: string[], callback: (monaco: typeof import('monaco-editor')) => void): void;
  } | undefined;
}

// Global State
let inputEditor: editor.IStandaloneCodeEditor | null = null;
let outputEditor: editor.IStandaloneCodeEditor | null = null;
let currentTool: Tool | null = null;
let isEncodeMode = true;
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
  
  // Wait for tools to be loaded - use Promise-based approach instead of polling
  const waitForTools = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.tools) {
        resolve();
        return;
      }
      
      let attempts = 0;
      const maxAttempts = 200; // 2 seconds max wait
      const checkTools = setInterval(() => {
        attempts++;
        if (window.tools) {
          clearInterval(checkTools);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkTools);
          reject(new Error('window.tools not found after timeout'));
        }
      }, 10);
    });
  };
  
  waitForTools()
    .then(() => initApp())
    .catch((error) => {
      logger.error('Failed to initialize app:', error);
      // Still try to initialize in case tools load later
      setTimeout(() => {
        if (window.tools) initApp();
      }, 1000);
    });
  
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

function initApp(): void {
  renderSidebar();
  setupEventListeners();
  setupCommandPalette();
  
  // With native window controls on all platforms, hide custom controls
  const isMac = window.platform?.isMac ?? (navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  const titlebar = document.querySelector('.titlebar');
  const titlebarControls = document.querySelector('.titlebar-controls');
  
  if (titlebar && titlebarControls) {
    // Hide custom window controls - native controls are used on all platforms
    (titlebarControls as HTMLElement).style.display = 'none';
    
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
    themeSelect.className = 'absolute top-3.5 right-4 z-[200] -webkit-app-region-no-drag bg-bg-input text-text-primary border border-border px-2 py-1 rounded-[6px] text-xs cursor-pointer outline-none';
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
    header.className = 'text-[11px] font-bold text-text-secondary dark:text-text-secondary uppercase my-3 mx-2 tracking-wider';
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
        toggleBtn.className = 'px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium cursor-pointer transition-colors';
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
    
    if (tool.useCustomUI) {
      // Show Custom UI
      if (editorInterface) editorInterface.classList.add('hidden');
      if (customInterface) {
        customInterface.classList.remove('hidden');
        customInterface.innerHTML = ''; // Clear previous
        if (tool.render) tool.render(customInterface);
      }
    } else {
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
      }
      
      if (tool.autoRun) {
        setTimeout(() => processInput(), 100);
      }
    }

    } catch (e) {
      logger.error('Error switching tool:', e);
    }
}

async function processInput(): Promise<void> {
  if (!currentTool || currentTool.useCustomUI || !outputEditor) return;
  
  try {
    const input = inputEditor?.getValue() || '';
    
    if (!currentTool.format) return;
    
    // Check cache first (only for non-empty inputs to avoid caching empty results)
    if (input.trim()) {
      const cacheKey = `${currentTool.id}:${input}`;
      const cached = resultCache.get(cacheKey);
      
      if (cached !== undefined) {
        // Use requestAnimationFrame for smooth UI updates
        requestAnimationFrame(() => {
          outputEditor?.setValue(
            currentTool.customOutput 
              ? 'Custom output not fully implemented in this version.\n\n' + cached 
              : cached
          );
        });
        return;
      }
    }
    
    const result = currentTool.format(input);
    const output = typeof result === 'string' ? result : await result;
    const outputStr = String(output);
    
    // Cache the result (LRU cache handles size limits automatically)
    if (input.trim()) {
      const cacheKey = `${currentTool.id}:${input}`;
      resultCache.set(cacheKey, outputStr);
    }
    
    // Use requestAnimationFrame for smooth UI updates
    requestAnimationFrame(() => {
      outputEditor?.setValue(
        currentTool.customOutput 
          ? 'Custom output not fully implemented in this version.\n\n' + outputStr 
          : outputStr
      );
    });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (outputEditor) {
      requestAnimationFrame(() => {
        outputEditor?.setValue('Error: ' + error.message);
      });
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
    if (inputEditor) {
      inputEditor.setValue('');
      inputEditor.focus();
    }
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
    }
  };

  if (copyBtn) copyBtn.onclick = () => {
    if (outputEditor) {
      navigator.clipboard.writeText(outputEditor.getValue());
      showToast('Copied to clipboard');
    }
  };

  if (sampleBtn) sampleBtn.onclick = () => {
    if (!currentTool) {
      showToast('No tool selected', 'error');
      return;
    }
    
    // Check if tool has sampleData property
    const sampleData = currentTool.sampleData;
    if (!sampleData) {
      showToast('No sample data available for this tool', 'error');
      return;
    }
    
    if (!inputEditor) {
      showToast('Editor not ready', 'error');
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
    };
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

  const keydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      palette.classList.add('visible');
      input.focus();
      renderCmdResults('');
    }
    if (e.key === 'Escape') {
      palette.classList.remove('visible');
    }
  };
  document.addEventListener('keydown', keydownHandler);
  eventListeners.push({ element: document, event: 'keydown', handler: keydownHandler });

  const paletteClickHandler = (e: Event) => {
    if (e.target === palette) {
      palette.classList.remove('visible');
    }
  };
  palette.addEventListener('click', paletteClickHandler);
  eventListeners.push({ element: palette, event: 'click', handler: paletteClickHandler });

  const inputHandler = debounce((e: Event) => {
    renderCmdResults((e.target as HTMLInputElement).value);
  }, 100);
  
  input.addEventListener('input', inputHandler);
  eventListeners.push({ element: input, event: 'input', handler: inputHandler });

  function renderCmdResults(term: string): void {
    if (!window.tools || !results) return;
    
    const lowerTerm = term.toLowerCase();
    
    // Filter tools first, then create elements (more efficient)
    const matchingTools = Object.values(window.tools).filter(tool => 
      tool.title.toLowerCase().includes(lowerTerm) || 
      tool.description.toLowerCase().includes(lowerTerm)
    );
    
    // Use requestAnimationFrame for batched DOM updates
    requestAnimationFrame(() => {
      // Use DocumentFragment for better performance when adding multiple elements
      const fragment = document.createDocumentFragment();
      
      matchingTools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'p-3 px-4 flex justify-between items-center cursor-pointer rounded-[6px] text-text-primary hover:bg-accent hover:text-white transition-colors';
        
        const titleSpan = document.createElement('span');
        titleSpan.textContent = tool.title;
        
        const categorySpan = document.createElement('span');
        categorySpan.className = 'text-xs opacity-60';
        categorySpan.textContent = tool.category;
        
        item.appendChild(titleSpan);
        item.appendChild(categorySpan);
        
        item.onclick = () => {
          switchTool(tool.id);
          palette.classList.remove('visible');
        };
        fragment.appendChild(item);
      });
      
      // Clear and append in one operation to minimize reflows
      results.textContent = '';
      results.appendChild(fragment);
    });
  }
}

function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? 'bg-success' : 'bg-error';
  toast.className = `fixed bottom-6 right-6 bg-bg-card dark:bg-bg-card text-text-primary dark:text-text-primary px-5 py-3 rounded-[10px] shadow-lg border border-border dark:border-border translate-y-[100px] opacity-0 transition-all duration-300 z-[2000] font-medium flex items-center gap-2.5 ${bgColor} before:content-[''] before:block before:w-2 before:h-2 before:rounded-full`;
  toast.textContent = msg;
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.remove('translate-y-[100px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  }, 10);
  
  setTimeout(() => {
    toast.classList.add('translate-y-[100px]', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

