import type { Tool } from '../types/tools';
import {
  captureFields,
  restoreFields,
  clearableFieldIds,
  clearWithUndo,
  showToast,
  notifyProgrammatic,
  setValueProgrammatically,
  type FieldSnapshot,
} from '../ui';
import { state } from './state';
import { editors } from './editors';
import { takeHandoff } from './home';

// ---- Per-tool session state (memory only: never localStorage, disk or IPC) ----
type SessionState = { editor?: string; fields?: FieldSnapshot };
const sessionState = new Map<string, SessionState>();
const REMEMBER_KEY = 'remember-inputs'; // preference flag only, never the data
const MAX_SESSION_CHARS = 1024 * 1024;
const rememberInputs = (): boolean => localStorage.getItem(REMEMBER_KEY) !== 'false';

export function snapshotSession(): void {
  const tool = state.currentTool;
  if (!tool || !rememberInputs()) return;
  if (tool.useCustomUI) {
    const root = document.getElementById('customInterface');
    if (!root || !root.firstElementChild) return; // not rendered yet: keep the previous snapshot
    sessionState.set(tool.id, { fields: captureFields(root) });
  } else if (editors.input) {
    const v = editors.input.getValue();
    if (v.length > MAX_SESSION_CHARS) sessionState.delete(tool.id);
    else sessionState.set(tool.id, { editor: v });
  }
}

export function restoreSession(tool: Tool): void {
  const s = rememberInputs() ? sessionState.get(tool.id) : undefined;
  if (!s) return;
  if (tool.useCustomUI && s.fields) {
    const root = document.getElementById('customInterface');
    if (root) restoreFields(root, s.fields);
  } else if (!tool.useCustomUI && s.editor && editors.input) {
    editors.input.setValue(s.editor);
  }
}

/** Fill the tool's input with text pasted on Home (programmatic: not recorded in history). */
export function applyHandoff(tool: Tool): void {
  const text = takeHandoff(tool.id);
  if (text === null) return;
  if (!tool.useCustomUI) {
    editors.input?.setValue(text);
    editors.input?.focus();
    return;
  }
  const el = tool.primaryInput ? document.getElementById(tool.primaryInput) : null;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) setValueProgrammatically(el, text);
}

/** Ctrl/Cmd+Shift+Backspace and palette: wipe the current tool's inputs and its session snapshot. */
export function clearToolSession(): void {
  const tool = state.currentTool;
  if (!tool) {
    showToast('Pick a tool first', 'error');
    return;
  }
  sessionState.delete(tool.id);
  if (!tool.useCustomUI) {
    if (editors.input?.getValue()) document.getElementById('clearBtn')?.click();
    else showToast('Session cleared');
    return;
  }
  const root = document.getElementById('customInterface');
  if (!root) return;
  const ids = clearableFieldIds(root);
  const fields = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const fire = (): void => fields.forEach(notifyProgrammatic);
  const hasValue = fields.some(
    (el) =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) &&
      el.value,
  );
  if (hasValue) clearWithUndo(ids, fire, 'Session cleared');
  else showToast('Session cleared');
}

/** Settings sheet: the "remember inputs" checkbox. */
export function setupRememberSetting(): void {
  const box = document.getElementById('setting-remember');
  if (!(box instanceof HTMLInputElement)) return;
  box.checked = rememberInputs();
  box.onchange = () => {
    localStorage.setItem(REMEMBER_KEY, String(box.checked));
    if (!box.checked) sessionState.clear();
  };
}
