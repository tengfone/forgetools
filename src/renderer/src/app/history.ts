import type { Tool } from '../../../types/tools';
import { esc, showToast, isUserEdit, setValueProgrammatically } from '../ui';
import {
  historyEnabled,
  HISTORY_FLAG,
  clearAllHistory,
  getHistory,
  pushHistory,
  historyLabel,
  MAX_ENTRY,
} from '../tools/lib/history';
import { state } from './state';
import { editors } from './editors';

// ---- Opt-in input history (any tool with a text primary input; secrets opt out via noHistory) ----

/** Quiet period after the last edit before the input is recorded. */
const HISTORY_SETTLE_MS = 1500;

function historySelect(): HTMLSelectElement | null {
  const el = document.getElementById('toolHistory');
  return el instanceof HTMLSelectElement ? el : null;
}

function historyField(tool: Tool): HTMLInputElement | HTMLTextAreaElement | null {
  if (!tool.useCustomUI || !tool.primaryInput) return null;
  const el = document.getElementById(tool.primaryInput);
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return null;
  // data-secret survives the reveal toggle (which flips type=password to text)
  if (
    el.matches('[type=password],[data-secret]') ||
    (el instanceof HTMLInputElement && !['text', 'search', 'url', ''].includes(el.type))
  )
    return null;
  return el;
}

const historyAllowed = (tool: Tool | null): tool is Tool =>
  !!tool && !tool.noHistory && historyEnabled(localStorage) && (!tool.useCustomUI || !!historyField(tool));

/** Input text to record, or null when it's too long to keep (checked before copying a large editor model). */
function historyInputOf(tool: Tool): string | null {
  const limit = MAX_ENTRY + 64; // slack for trailing whitespace that pushHistory trims
  if (tool.useCustomUI) {
    const v = historyField(tool)?.value ?? '';
    return v.length > limit ? null : v;
  }
  const model = editors.input?.getModel();
  if (!model || model.getValueLength() > limit) return null;
  return model.getValue();
}

function fillHistorySelect(tool: Tool): void {
  const sel = historySelect();
  if (!sel) return;
  const items = getHistory(localStorage, tool.id);
  sel.innerHTML =
    `<option value=""${items.length ? '' : ' disabled'}>${items.length ? 'Recent…' : 'No history yet'}</option>` +
    items.map((h, i) => `<option value="${i}">${esc(historyLabel(h))}</option>`).join('');
  sel.value = '';
}

/** Show/hide and refill the header history select for `tool` (null hides and empties it). */
export function syncHistory(tool: Tool | null): void {
  flushHistory();
  const sel = historySelect();
  if (!sel) return;
  const on = historyAllowed(tool);
  sel.hidden = !on;
  if (on) fillHistorySelect(tool);
  else sel.innerHTML = '';
}

// Pending save: captured when the user edits, so a tool switch can't redirect it to another tool.
let pendingHistory: { tool: Tool; text: string } | null = null;
let historyTimer: ReturnType<typeof setTimeout> | undefined;

function flushHistory(): void {
  clearTimeout(historyTimer);
  const p = pendingHistory;
  pendingHistory = null;
  if (!p || !historyAllowed(p.tool) || !p.text.trim()) return;
  pushHistory(localStorage, p.tool.id, p.text);
  // Don't rebuild the list under an open dropdown; it refills on focus instead
  if (state.currentTool === p.tool && document.activeElement !== historySelect()) fillHistorySelect(p.tool);
}

/** Schedule recording the current tool's input (only call for real user edits). */
export function recordHistorySoon(): void {
  const tool = state.currentTool;
  if (!historyAllowed(tool)) return;
  if (pendingHistory && pendingHistory.tool !== tool) flushHistory();
  const text = historyInputOf(tool);
  clearTimeout(historyTimer);
  if (text === null) {
    pendingHistory = null;
    return;
  }
  pendingHistory = { tool, text };
  historyTimer = setTimeout(flushHistory, HISTORY_SETTLE_MS);
}

export function setupHistory(): void {
  const sel = historySelect();
  sel?.addEventListener('change', () => {
    const tool = state.currentTool;
    const h = tool ? getHistory(localStorage, tool.id)[Number(sel.value)] : undefined;
    sel.value = '';
    if (!tool || h === undefined) return;
    if (!tool.useCustomUI) {
      editors.input?.setValue(h); // a flush: the editor listener ignores it
      editors.input?.focus();
    } else {
      const el = historyField(tool);
      if (!el) return;
      setValueProgrammatically(el, h); // marked: not recorded as a user edit
      el.focus();
    }
    // Like shell history: a reused entry moves to the top
    pushHistory(localStorage, tool.id, h);
    fillHistorySelect(tool);
    showToast('Restored from history');
  });
  sel?.addEventListener('focus', () => {
    if (historyAllowed(state.currentTool)) fillHistorySelect(state.currentTool);
  });
  document.getElementById('customInterface')?.addEventListener('input', (e) => {
    const tool = state.currentTool;
    const target = e.target;
    if (isUserEdit(e) && tool?.useCustomUI && target instanceof HTMLElement && target.id === tool.primaryInput)
      recordHistorySoon();
  });
}

/** Settings sheet: the history on/off checkbox. */
export function setupHistorySetting(): void {
  const box = document.getElementById('setting-history');
  if (!(box instanceof HTMLInputElement)) return;
  box.checked = historyEnabled(localStorage);
  box.onchange = () => {
    localStorage.setItem(HISTORY_FLAG, String(box.checked));
    if (!box.checked) clearAllHistory(localStorage);
    if (state.currentTool) syncHistory(state.currentTool);
    showToast(
      box.checked ? "History on; recent inputs appear in each tool's header" : 'History off; saved inputs deleted',
    );
  };
}
