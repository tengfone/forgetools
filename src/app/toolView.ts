import type { Tool } from '../types/tools';
import { getMonaco } from '../monacoEnv';
import { logger } from '../logger';
import { bumpToolEpoch, nextFrameOrTimeout, setStatus, showToast, copyText, announce, textOf } from '../ui';
import { resultCache } from './cache';
import { state, toolById, currentMode, setMode, disposeCurrentTool } from './state';
import { editors, ensureMonaco, applyIndentToModels, clearMarkers, processInput, runSoon } from './editors';
import { rememberRecent } from './pins';
import { renderQuickGroups, markActiveTool, closeDrawerIfNarrow } from './sidebar';
import { renderWelcome, focusHomeSearch } from './home';
import { snapshotSession, restoreSession, applyHandoff } from './session';
import { syncHistory } from './history';
import { closeHelp } from './help';

/** Form-only tools read better at a constrained width. */
const NARROW_FORM_TOOLS = new Set(['timestamp', 'numberBaseConverter', 'uuid', 'cronParser', 'randomStringGenerator']);

/** Tool inputs hold code/data: no spellcheck squiggles, autocorrect or autocapitalize. */
function disableTextAssist(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>('textarea, input:not([type]), input[type="text"], input[type="search"]')
    .forEach((el) => {
      for (const [attr, v] of [
        ['spellcheck', 'false'],
        ['autocomplete', 'off'],
        ['autocapitalize', 'off'],
        ['autocorrect', 'off'],
      ] as const) {
        if (!el.hasAttribute(attr)) el.setAttribute(attr, v);
      }
    });
}

/** Leave the current tool: snapshot its inputs, dispose its UI, cancel pending loads. */
function leaveTool(): void {
  snapshotSession();
  disposeCurrentTool();
  syncHistory(null);
  state.renderToken++;
  bumpToolEpoch();
  closeHelp();
}

/** Back to the start screen: snapshot the open tool, deselect it. */
export function goHome(): void {
  leaveTool();
  state.currentTool = null;
  closeDrawerIfNarrow();
  document.getElementById('toolContainer')?.classList.add('hidden');
  document.getElementById('welcomeState')?.classList.remove('hidden');
  const custom = document.getElementById('customInterface');
  if (custom) custom.innerHTML = '';
  markActiveTool(null);
  renderWelcome();
  renderQuickGroups();
  announce('Home');
  focusHomeSearch(false);
}

export function switchTool(toolId: string): void {
  const tool = toolById(toolId);
  if (!tool) return;

  leaveTool();
  resultCache.sweepExpired();
  state.currentTool = tool;
  rememberRecent(tool.id);
  const token = state.renderToken;

  // Batch header/nav DOM updates into the next frame
  requestAnimationFrame(() => {
    if (state.currentTool !== tool) return;
    document.getElementById('welcomeState')?.classList.add('hidden');
    document.getElementById('toolContainer')?.classList.remove('hidden');
    const set = (id: string, text: string): void => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('currentToolTitle', tool.title);
    set('currentToolDesc', tool.description);
    set('currentToolCat', tool.category);
    renderQuickGroups();
    markActiveTool(tool);
  });

  const actions = document.getElementById('toolActions');
  if (actions) {
    actions.innerHTML = '';
    if (!tool.useCustomUI && tool.modes?.length) actions.appendChild(buildModeControl(tool));
  }
  const editorInterface = document.getElementById('editorInterface');
  const customInterface = document.getElementById('customInterface');
  setStatus('idle', 'Ready');

  if (tool.useCustomUI) {
    editorInterface?.classList.add('hidden');
    if (!customInterface) return;
    customInterface.classList.remove('hidden');
    customInterface.classList.toggle('form-narrow', NARROW_FORM_TOOLS.has(tool.id));
    customInterface.innerHTML = '';
    tool
      .load?.()
      .then((mod) => {
        if (token !== state.renderToken) return;
        state.disposeTool = mod.render(customInterface) ?? null;
        disableTextAssist(customInterface);
        restoreSession(tool);
        applyHandoff(tool);
        syncHistory(tool);
        focusToolStart(tool);
      })
      .catch((err: unknown) => {
        logger.error(`Failed to load ${tool.id}:`, err);
        if (token === state.renderToken) showToast(`Could not open ${tool.title}`, 'error');
      });
    return;
  }

  editorInterface?.classList.remove('hidden');
  customInterface?.classList.add('hidden');
  focusToolStart(tool);

  void ensureMonaco().then(() => {
    if (token !== state.renderToken || state.currentTool !== tool) return;
    const monaco = getMonaco();
    const { input, output } = editors;
    if (!(input && output && monaco)) return;
    setStatus('idle', 'Ready');
    const inputModel = input.getModel();
    const outputModel = output.getModel();
    if (inputModel) monaco.editor.setModelLanguage(inputModel, tool.language || 'plaintext');
    if (outputModel) monaco.editor.setModelLanguage(outputModel, tool.language || 'plaintext');
    applyIndentToModels();
    // Lay out after the visibility change has been painted
    nextFrameOrTimeout(
      () => {
        editors.input?.layout();
        editors.output?.layout();
      },
      undefined,
      2,
    );

    input.setValue(''); // Start blank, don't use placeholder as value
    output.setValue('');
    clearMarkers();
    restoreSession(tool);
    applyHandoff(tool);
    syncHistory(tool);
    if (
      document.activeElement === document.getElementById('currentToolTitle') ||
      document.activeElement === document.body
    )
      input.focus();
    if (tool.autoRun) runSoon();
  });
}

/** Segmented radiogroup for an editor tool's modes (neutral selected style, arrow-key navigation). */
function buildModeControl(tool: Tool): HTMLElement {
  const modes = tool.modes ?? [];
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Mode');
  group.id = 'modeControl';
  const btns = modes.map((m) => {
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
    btns.forEach((b) => {
      const on = b.dataset.mode === cur;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  const select = (i: number, focus: boolean): void => {
    const mode = modes[i];
    if (!mode) return;
    setMode(tool.id, mode.id);
    sync();
    if (focus) btns[i]?.focus();
    void processInput();
  };
  btns.forEach((b, i) => {
    b.onclick = () => select(i, false);
    b.onkeydown = (e) => {
      const n = btns.length;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j >= 0) {
        e.preventDefault();
        select(j, true);
      }
    };
  });
  group.append(...btns);
  sync();
  return group;
}

/** Land keyboard users in the tool's primary input and announce the tool politely. */
function focusToolStart(tool: Tool): void {
  announce(`${tool.title} opened`);
  // Next frame, or a timer when WebKit pauses rAF (window occluded or not yet shown).
  nextFrameOrTimeout(() => {
    if (state.currentTool !== tool) return;
    // Don't steal focus from the palette while it's still handling input
    if (document.activeElement?.closest('#cmdPalette')) return;
    if (tool.useCustomUI) {
      const root = document.getElementById('customInterface');
      const usable = (x: Element | null | undefined): x is HTMLElement =>
        x instanceof HTMLElement &&
        x.offsetParent !== null &&
        !((x instanceof HTMLInputElement || x instanceof HTMLTextAreaElement) && x.readOnly) &&
        !(
          (x instanceof HTMLInputElement || x instanceof HTMLTextAreaElement || x instanceof HTMLSelectElement) &&
          x.disabled
        );
      const primary = tool.primaryInput ? document.getElementById(tool.primaryInput) : null;
      const el = usable(primary)
        ? primary
        : Array.from(
            root?.querySelectorAll<HTMLElement>('textarea, select, input:not([type=hidden]):not([type=radio])') ?? [],
          ).find(usable);
      if (el) {
        el.focus({ preventScroll: true });
        return;
      }
    } else if (editors.input) {
      editors.input.focus();
      return;
    }
    document.getElementById('currentToolTitle')?.focus({ preventScroll: true });
  });
}

/** Ctrl/Cmd+Shift+C: copy the current tool's output. */
export function copyCurrentOutput(): void {
  const tool = state.currentTool;
  if (!tool) {
    showToast('Pick a tool first', 'error');
    return;
  }
  let text = '';
  if (!tool.useCustomUI) {
    text = editors.output?.getValue() ?? '';
  } else {
    const root = document.getElementById('customInterface');
    const out = root?.querySelector<HTMLElement>('[data-output]');
    const copyId = root?.querySelector<HTMLElement>('[data-copy]')?.dataset.copy;
    text = textOf(out ?? (copyId ? document.getElementById(copyId) : null));
  }
  void copyText(text, 'Copied output');
}
