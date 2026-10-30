import type { editor } from 'monaco-editor';
import { getMonaco, loadMonaco } from '../monacoEnv';
import { logger } from '../logger';
import { setStatus, getIndent, getIndentChoice, showToast, copyText, readClipboardText, requestGuard } from '../ui';
import { defineMonacoThemes, isDarkActive } from './theme';
import { resultCache, resultCacheKey, MAX_CACHEABLE_INPUT, debounce } from './cache';
import { state, currentMode } from './state';

/** Typing pause before an editor tool re-runs. */
const EDIT_DEBOUNCE_MS = 250;
/** requestIdleCallback deadline for that run. */
const IDLE_RUN_TIMEOUT_MS = 100;
/** Monaco needs a layout pass after its container is shown before running autoRun tools. */
export const AUTORUN_DELAY_MS = 100;
const MARKER_OWNER = 'forgetools';

export const editors: { input: editor.IStandaloneCodeEditor | null; output: editor.IStandaloneCodeEditor | null } = {
  input: null,
  output: null,
};

/** Called for real (non-flush) edits of the input editor. */
let onUserEdit: () => void = () => {};
export const setEditorEditListener = (fn: () => void): void => {
  onUserEdit = fn;
};

// Monaco is loaded lazily the first time an editor-based tool opens.
let monacoPromise: Promise<void> | null = null;
export function ensureMonaco(): Promise<void> {
  if (getMonaco() && editors.input) return Promise.resolve();
  if (monacoPromise) return monacoPromise;
  setStatus('idle', 'Loading editor\u2026');
  monacoPromise = loadMonaco()
    .then(() => {
      initMonaco();
    })
    .catch((err) => {
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

export function applyIndentToModels(): void {
  const opts = editorIndentOptions();
  editors.input?.getModel()?.updateOptions(opts);
  editors.output?.getModel()?.updateOptions(opts);
}

const savedFontSize = (): number => parseInt(localStorage.getItem('editor-fontsize') || '13', 10);

function initMonaco(): void {
  const monaco = getMonaco();
  if (!monaco) return;

  defineMonacoThemes();
  const commonOptions: editor.IStandaloneEditorConstructionOptions = {
    theme: isDarkActive() ? 'forge-dark' : 'forge-light',
    fontSize: savedFontSize(),
    wordWrap: localStorage.getItem('editor-wordwrap') === 'true' ? 'on' : 'off',
    fontFamily:
      getComputedStyle(document.documentElement).getPropertyValue('--mono-font').trim() ||
      "'JetBrains Mono','Cascadia Mono','SF Mono',Consolas,monospace",
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
    'semanticHighlighting.enabled': false,
  };

  const inputContainer = document.getElementById('inputEditor');
  const outputContainer = document.getElementById('outputEditor');

  if (inputContainer) {
    inputContainer.innerHTML = '';
    const input = monaco.editor.create(inputContainer, { ...commonOptions, value: '', ariaLabel: 'Input' });
    editors.input = input;

    const debouncedProcessInput = debounce(() => {
      if (state.currentTool && !state.currentTool.useCustomUI) {
        if ('requestIdleCallback' in window)
          requestIdleCallback(() => void processInput(), { timeout: IDLE_RUN_TIMEOUT_MS });
        else setTimeout(() => void processInput(), 0);
      }
    }, EDIT_DEBOUNCE_MS);

    input.onDidChangeModelContent(debouncedProcessInput);
    input.onDidChangeModelContent((e) => {
      // setValue() (restore, handoff, sample, history pick) is a flush: only real edits are recorded
      if (!e.isFlush && state.currentTool && !state.currentTool.useCustomUI) onUserEdit();
    });
  }

  if (outputContainer) {
    outputContainer.innerHTML = '';
    editors.output = monaco.editor.create(outputContainer, {
      ...commonOptions,
      value: '',
      readOnly: true,
      ariaLabel: 'Output',
    });
  }
  applyIndentToModels();
}

export function disposeEditors(): void {
  editors.input?.dispose();
  editors.output?.dispose();
  editors.input = editors.output = null;
}

/** Run the current editor tool after Monaco has laid out its newly shown container. */
export const runSoon = (): void => {
  setTimeout(() => void processInput(), AUTORUN_DELAY_MS);
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Best-effort location extraction from common parser error messages. */
export function locateError(message: string, input: string): { line: number; col: number } | null {
  const lc = message.match(/line\s+(\d+)\D+column\s+(\d+)/i) || message.match(/\((\d+):(\d+)\)/);
  if (lc?.[1] && lc[2]) return { line: parseInt(lc[1], 10), col: parseInt(lc[2], 10) };
  const p = message.match(/position\s+(\d+)/i);
  if (p?.[1]) {
    const pos = Math.min(parseInt(p[1], 10), input.length);
    const before = input.slice(0, pos).split('\n');
    return { line: before.length, col: (before.at(-1) ?? '').length + 1 };
  }
  return null;
}

export function clearMarkers(): void {
  const model = editors.input?.getModel();
  const monaco = getMonaco();
  if (model && monaco) monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
}

/** Latest-request ownership for processInput: an older formatter result never replaces a newer one. */
const formatRequests = requestGuard();

function showOutput(text: string, input: string, current: () => boolean): void {
  clearMarkers();
  requestAnimationFrame(() => {
    if (current()) editors.output?.setValue(text);
  });
  if (!input.trim()) setStatus('idle', 'Ready');
  else setStatus('ok', 'Done', `${formatBytes(input.length)} \u2192 ${formatBytes(text.length)}`);
}

export async function processInput(): Promise<void> {
  const tool = state.currentTool;
  if (!tool || tool.useCustomUI || !editors.output || !tool.format) return;
  const input = editors.input?.getValue() || '';
  const current = formatRequests.start();

  try {
    const indentChoice = getIndentChoice();
    const mode = currentMode(tool) ?? '';
    const cacheable = input.length <= MAX_CACHEABLE_INPUT && input.trim() !== '';
    const cacheKey = cacheable ? resultCacheKey(tool.id, mode, String(indentChoice), input) : '';
    if (cacheable) {
      const cached = resultCache.get(cacheKey);
      if (cached !== undefined) {
        showOutput(cached, input, current);
        return;
      }
    }

    const outputStr = String(await tool.format(input, getIndent(), mode || undefined));
    if (cacheable) resultCache.set(cacheKey, outputStr);
    if (current()) showOutput(outputStr, input, current);
  } catch (e) {
    if (!current()) return; // a newer input or another tool owns the status bar and markers now
    // Keep the last good output; report the problem in the status bar and mark the input
    const error = e instanceof Error ? e : new Error(String(e));
    const loc = locateError(error.message, input);
    setStatus('error', error.message, loc ? `Ln ${loc.line}, Col ${loc.col}` : 'previous output kept');
    const model = editors.input?.getModel();
    const monaco = getMonaco();
    if (model && monaco) {
      const line = loc ? Math.max(1, Math.min(loc.line, model.getLineCount())) : 1;
      const col = loc ? Math.max(1, loc.col) : 1;
      monaco.editor.setModelMarkers(model, MARKER_OWNER, [
        {
          severity: monaco.MarkerSeverity.Error,
          message: error.message,
          startLineNumber: line,
          startColumn: col,
          endLineNumber: line,
          endColumn: loc ? col + 1 : model.getLineMaxColumn(line),
        },
      ]);
    }
  }
}

/** Clear / Paste / Copy / Sample buttons of the editor layout. `onPaste` records the paste in history. */
export function setupEditorActions(onPaste: () => void): void {
  const clearBtn = document.getElementById('clearBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const copyBtn = document.getElementById('copyBtn');
  const sampleBtn = document.getElementById('sampleBtn');

  if (clearBtn)
    clearBtn.onclick = () => {
      const ed = editors.input;
      const model = ed?.getModel();
      if (!ed || !model || !model.getValue()) return;
      // Use an edit (not setValue) so Monaco's own Ctrl+Z history also restores it
      ed.pushUndoStop();
      ed.executeEdits('clear', [{ range: model.getFullModelRange(), text: '' }]);
      ed.pushUndoStop();
      ed.focus();
      showToast('Input cleared', 'success', {
        label: 'Undo',
        run: () => {
          ed.trigger('toast', 'undo', null);
          ed.focus();
        },
      });
    };

  if (pasteBtn)
    pasteBtn.onclick = async () => {
      try {
        const text = await readClipboardText();
        if (editors.input) {
          editors.input.setValue(text);
          editors.input.focus();
          onPaste(); // a user paste (setValue is otherwise ignored as programmatic)
        }
      } catch (e) {
        logger.error('Paste failed:', e);
        showToast('Clipboard is unavailable. Paste into the editor directly.', 'error');
      }
    };

  if (copyBtn)
    copyBtn.onclick = () => {
      if (editors.output) void copyText(editors.output.getValue(), 'Copied output');
    };

  if (sampleBtn)
    sampleBtn.onclick = () => {
      const tool = state.currentTool;
      if (!tool) {
        showToast('Pick a tool first', 'error');
        return;
      }
      const sampleData = tool.sampleData;
      if (!sampleData) {
        showToast('This tool has no sample. Paste your own input.', 'error');
        return;
      }
      // The editor chunk may still be loading (lazy import): apply the sample once it is ready.
      void ensureMonaco().then(() => {
        if (state.currentTool !== tool || !editors.input) return;
        editors.input.setValue(sampleData);
        editors.input.focus();
        if (tool.autoRun) runSoon();
      });
    };
}

/** Word wrap / minimap / font size settings (persisted even before Monaco loads). */
export function setupEditorSettings(): void {
  const wordWrapCheckbox = document.getElementById('setting-wordwrap') as HTMLInputElement | null;
  const minimapCheckbox = document.getElementById('setting-minimap') as HTMLInputElement | null;
  const fontSizeSelect = document.getElementById('setting-fontsize') as HTMLSelectElement | null;

  if (wordWrapCheckbox) wordWrapCheckbox.checked = localStorage.getItem('editor-wordwrap') === 'true';
  if (minimapCheckbox) minimapCheckbox.checked = localStorage.getItem('editor-minimap') === 'true';
  if (fontSizeSelect) fontSizeSelect.value = String(savedFontSize());

  const applySettings = (): void => {
    const wordWrap: 'on' | 'off' = wordWrapCheckbox?.checked ? 'on' : 'off';
    const minimap = { enabled: minimapCheckbox?.checked || false };
    const fontSize = parseInt(fontSizeSelect?.value || '13', 10);
    localStorage.setItem('editor-wordwrap', String(wordWrap === 'on'));
    localStorage.setItem('editor-minimap', String(minimap.enabled));
    localStorage.setItem('editor-fontsize', String(fontSize));
    editors.input?.updateOptions({ wordWrap, minimap, fontSize });
    editors.output?.updateOptions({ wordWrap, minimap, fontSize });
  };

  if (wordWrapCheckbox) wordWrapCheckbox.onchange = applySettings;
  if (minimapCheckbox) minimapCheckbox.onchange = applySettings;
  if (fontSizeSelect) fontSizeSelect.onchange = applySettings;
}
