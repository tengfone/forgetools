// Shared renderer UI helpers: typed DOM getters, toast, and delegated clipboard actions.
// Tools declare intent with data attributes instead of inline onclick handlers:
//   data-copy="elementId"   copy value/textContent of that element
//   data-copy-self          copy this element's own value/textContent
//   data-copy-text="..."    copy a literal string
//   data-paste="elementId"  paste clipboard into that field and fire `input`
import { clipboard, isTauri } from './native';

type Field = HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement;

/** Typed getElementById. Tool templates guarantee these ids exist after render. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Form field getter (input, textarea or select). */
export const $f = (id: string): Field => $<Field>(id);

const textOf = (el: Element | null): string => {
  if (!el) return '';
  const v = (el as Partial<Field>).value;
  return (typeof v === 'string' ? v : (el.textContent ?? '')).trim();
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastAction: (() => void) | null = null;

export interface ToastAction {
  label: string;
  run: () => void;
}

export function showToast(msg: string, type: 'success' | 'error' = 'success', action?: ToastAction): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  container.textContent = '';
  clearTimeout(toastTimer);
  toastAction = null;

  // #toastContainer is a persistent polite live region; errors are announced via the
  // persistent assertive #toastAlert region instead (visual text hidden to avoid double reads).
  const alertRegion = document.getElementById('toastAlert');
  if (alertRegion) alertRegion.textContent = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const text = document.createElement('span');
  text.textContent = msg;
  if (type === 'error' && alertRegion) {
    text.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => {
      alertRegion.textContent = msg;
    });
  }
  toast.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = action.label;
    // Undo belongs to the tool that showed it; after a tool switch it would act on removed DOM.
    const epoch = toolEpoch;
    toastAction = () => {
      if (epoch === toolEpoch) action.run();
      dismiss();
    };
    btn.onclick = toastAction;
    toast.appendChild(btn);
  }
  container.appendChild(toast);

  const dismiss = (): void => {
    toastAction = null;
    toast.classList.remove('visible');
    removeAfterTransition(toast, TOAST_FADE_MS);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
  toastTimer = setTimeout(dismiss, action ? TOAST_MS.action : TOAST_MS[type]);
}

/** How long a toast stays up: longer for errors, longest when it offers an action (Undo). */
const TOAST_MS = { success: 1600, error: 3200, action: 5000 } as const;
/** Upper bound for the toast fade-out (CSS transition); removal normally happens on transitionend. */
const TOAST_FADE_MS = 300;

/**
 * Remove `el` once its CSS transition ends, or after `fallbackMs` if no transitionend arrives
 * (no transition, reduced motion, element hidden).
 */
export function removeAfterTransition(el: HTMLElement, fallbackMs: number): void {
  const done = (): void => {
    clearTimeout(timer);
    el.remove();
  };
  const timer = setTimeout(done, fallbackMs + 50);
  el.addEventListener('transitionend', done, { once: true });
}

/** Delay between clearing and refilling a live region so screen readers announce repeated text. */
const ANNOUNCE_DELAY_MS = 50;
/** Politely announce `text` through the #toolAnnounce live region. */
export function announce(text: string): void {
  const live = document.getElementById('toolAnnounce');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => {
    live.textContent = text;
  }, ANNOUNCE_DELAY_MS);
}

/** Fallback delay when rAF is throttled (WebKit skips frames for hidden windows). */
export const REVEAL_FALLBACK_MS = 100;

/**
 * Run `fn` exactly once: after `frames` animation frames, or after `ms` if frames never fire.
 */
export function nextFrameOrTimeout(fn: () => void, ms = REVEAL_FALLBACK_MS, frames = 1): void {
  let done = false;
  const once = (): void => {
    if (done) return;
    done = true;
    fn();
  };
  const frame = (left: number): void => {
    requestAnimationFrame(() => (left > 1 ? frame(left - 1) : once()));
  };
  frame(Math.max(1, frames));
  setTimeout(once, ms);
}

/** Ctrl/Cmd+Z triggers the pending toast action (Undo) when focus is not inside an editable field. */
document.addEventListener('keydown', (e) => {
  if (!toastAction || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName) || t.closest('.monaco-editor'))) return;
  e.preventDefault();
  toastAction();
});

/**
 * Clear form fields with an Undo toast. Snapshots values, empties them,
 * runs `after`, and restores everything if the user hits Undo.
 */
export function clearWithUndo(ids: string[], after: () => void = () => {}, label = 'Cleared'): void {
  const fields = ids
    .map((id) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)
    .filter((f): f is HTMLInputElement | HTMLTextAreaElement => !!f);
  const snapshot = fields.map((f) => f.value);
  if (snapshot.every((v) => !v)) return;
  fields.forEach((f) => {
    f.value = '';
  });
  after();
  fields[0]?.focus();
  showToast(label, 'success', {
    label: 'Undo',
    run: () => {
      fields.forEach((f, i) => {
        f.value = snapshot[i] ?? '';
      });
      after();
      fields[0]?.focus();
    },
  });
}

// ---- Per-tool session state: in memory only, never persisted ----
export type FieldSnapshot = Record<string, string | boolean>;
const MAX_FIELD_CHARS = 1024 * 1024; // ~1 MB per field; larger values are skipped

function snapshotFields(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('input[id],textarea[id],select[id]')).filter((el) => {
    const f = el as HTMLInputElement;
    if (
      f.type === 'file' ||
      f.type === 'button' ||
      f.type === 'submit' ||
      f.type === 'password' ||
      el.hasAttribute('data-secret')
    )
      return false;
    return !f.readOnly && !f.disabled && !el.hasAttribute('data-output');
  });
}

/** Capture values of editable fields under `root`, keyed by id. */
export function captureFields(root: HTMLElement): FieldSnapshot {
  const snap: FieldSnapshot = {};
  let total = 0;
  for (const el of snapshotFields(root)) {
    const f = el as HTMLInputElement;
    if (f.type === 'checkbox' || f.type === 'radio') {
      snap[el.id] = f.checked;
      continue;
    }
    if (f.value.length > MAX_FIELD_CHARS || total + f.value.length > MAX_FIELD_CHARS) continue;
    total += f.value.length;
    snap[el.id] = f.value;
  }
  return snap;
}

// ---- Programmatic writes vs. user edits ----
// The app sometimes writes a field and fires `input`/`change` so live tools recompute (session
// restore, welcome handoff, history pick, samples). Those events are marked here; every other
// input event (typing, paste, IME, automation) is a user edit.
const programmaticEvents = new WeakSet<Event>();

/** Fire bubbling `input` + `change` on `el`, marked as app-originated (not a user edit). */
export function notifyProgrammatic(el: Element): void {
  for (const type of ['input', 'change']) {
    const ev = new Event(type, { bubbles: true });
    programmaticEvents.add(ev);
    el.dispatchEvent(ev);
  }
}

/** Set a field's value as the app (not the user) and let live tools recompute. */
export function setValueProgrammatically(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  el.value = value;
  notifyProgrammatic(el);
}

/** True for input/change events caused by the user rather than by setValueProgrammatically/notifyProgrammatic. */
export const isUserEdit = (e: Event): boolean => !programmaticEvents.has(e);

/** Restore a snapshot, firing (programmatic) input/change so live tools recompute. */
export function restoreFields(root: HTMLElement, snap: FieldSnapshot): void {
  for (const [id, v] of Object.entries(snap)) {
    const el = root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
    if (!el) continue;
    if (typeof v === 'boolean') {
      if (el.checked === v) continue;
      el.checked = v;
    } else {
      if (el.value === v) continue;
      el.value = v;
      if (el.value !== v) continue;
    }
    notifyProgrammatic(el);
  }
}

/** Ids of text-like editable fields under `root` (for clearWithUndo). */
export function clearableFieldIds(root: HTMLElement): string[] {
  return snapshotFields(root)
    .filter((el) => {
      const t = (el as HTMLInputElement).type;
      return (
        el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'range', 'color', 'number', 'date', 'datetime-local', 'time'].includes(t))
      );
    })
    .map((el) => el.id);
}

/** Write to the system clipboard via the clipboard plugin (navigator fallback outside Tauri). */
export function writeClipboardText(text: string): Promise<void> {
  return isTauri() ? clipboard.writeText(text) : navigator.clipboard.writeText(text);
}

/** Read the system clipboard via the clipboard plugin (navigator fallback outside Tauri). */
export function readClipboardText(): Promise<string> {
  return isTauri() ? clipboard.readText() : navigator.clipboard.readText();
}

export async function copyText(text: string, msg = 'Copied'): Promise<void> {
  if (!text) {
    showToast('Nothing to copy yet', 'error');
    return;
  }
  try {
    await writeClipboardText(text);
    showToast(msg);
  } catch {
    showToast('Copy failed. Select the text and copy it manually.', 'error');
  }
}

export async function pasteInto(id: string): Promise<void> {
  const field = $f(id);
  if (!field) return;
  try {
    field.value = await readClipboardText();
    // A plain (unmarked) event: the Paste button is a user edit, so two-way tools treat the
    // pasted pane as the source and history records it.
    field.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    showToast('Clipboard is unavailable. Paste with Ctrl+V instead.', 'error');
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Escape text for safe interpolation into innerHTML templates. */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let wired = false;
export function wireClipboardActions(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>(
      '[data-copy],[data-copy-self],[data-copy-text],[data-paste]',
    );
    if (!target) return;
    const { copy, copyText: literal, paste } = target.dataset;
    if (paste) {
      void pasteInto(paste);
      return;
    }
    if (literal !== undefined) {
      void copyText(literal);
      return;
    }
    if (copy) {
      void copyText(textOf(document.getElementById(copy)));
      return;
    }
    if ('select' in target) (target as Field).select();
    void copyText(textOf(target));
  });
}

/** Shared status bar used by every tool, editor-based or custom. */
export function setStatus(kind: 'ok' | 'error' | 'idle', msg: string, meta = ''): void {
  const bar = document.getElementById('statusBar');
  const msgEl = document.getElementById('statusMsg');
  const metaEl = document.getElementById('statusMeta');
  if (!bar || !msgEl || !metaEl) return;
  bar.classList.toggle('is-error', kind === 'error');
  msgEl.textContent = msg;
  msgEl.title = msg;
  metaEl.textContent = meta || 'offline';
  // Announce only on state transitions (ok <-> error), not on every keystroke.
  const live = document.getElementById('statusLive');
  const state = kind === 'error' ? 'error' : 'ok';
  if (live && state !== lastStatusState) {
    const wasError = lastStatusState === 'error';
    lastStatusState = state;
    if (state === 'error') live.textContent = `Error: ${msg}`;
    else if (wasError) live.textContent = 'Error resolved';
  }
}
let lastStatusState: 'ok' | 'error' = 'ok';

// ---- Indentation preference (shared by editor tools) ----
export type IndentChoice = 2 | 4 | 'tab';
const INDENT_KEY = 'editor-indent';
/** Current indent choice: 2, 4 or 'tab'. */
export function getIndentChoice(): IndentChoice {
  const v = localStorage.getItem(INDENT_KEY);
  return v === '4' ? 4 : v === 'tab' ? 'tab' : 2;
}
/** Indent width in spaces for formatters (tab => 4; app.ts converts leading spaces to tabs afterwards). */
export function getIndent(): number {
  const c = getIndentChoice();
  return c === 'tab' ? 4 : c;
}
export function getIndentString(): string {
  const c = getIndentChoice();
  return c === 'tab' ? '\t' : ' '.repeat(c);
}
export function setIndentChoice(c: IndentChoice): void {
  localStorage.setItem(INDENT_KEY, String(c));
}

// ---- Modal helpers: focus trap, inert background, focus restore ----
interface ModalState {
  el: HTMLElement;
  opener: HTMLElement | null;
  onKey: (e: KeyboardEvent) => void;
}
const modalStack: ModalState[] = [];
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function setBackgroundInert(on: boolean): void {
  ['appBody', 'mainContent'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.inert = on;
  });
  const tb = document.querySelector<HTMLElement & { inert: boolean }>('.titlebar');
  if (tb) tb.inert = on;
}

/** Open a modal: traps Tab inside `el`, makes the app inert, remembers the opener. */
export function openModal(
  el: HTMLElement,
  opts: { opener?: HTMLElement | null; initialFocus?: HTMLElement | null; onEscape?: () => void } = {},
): void {
  if (modalStack.some((m) => m.el === el)) return;
  const opener = opts.opener ?? (document.activeElement as HTMLElement | null);
  const onKey = (e: KeyboardEvent): void => {
    if (modalStack[modalStack.length - 1]?.el !== el) return;
    if (e.key === 'Escape') {
      // A focused control that is consuming Escape itself (e.g. the shortcut recorder) wins.
      if ((e.target as HTMLElement | null)?.closest?.('[data-captures-escape="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      (opts.onEscape ?? (() => closeModal(el)))();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    const first = items[0],
      last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  modalStack.push({ el, opener, onKey });
  setBackgroundInert(true);
  (opts.initialFocus ?? el.querySelector<HTMLElement>(FOCUSABLE))?.focus();
}

/** Close a modal opened with openModal; restores focus to the opener unless `restoreFocus` is false. */
export function closeModal(el: HTMLElement, restoreFocus = true): void {
  const i = modalStack.findIndex((m) => m.el === el);
  if (i < 0) return;
  const [m] = modalStack.splice(i, 1);
  if (!m) return;
  document.removeEventListener('keydown', m.onKey, true);
  if (!modalStack.length) setBackgroundInert(false);
  if (restoreFocus && m.opener && document.contains(m.opener)) m.opener.focus();
}

// ---- Safety net: decorative icon fonts are never announced ----
function hideIcons(root: ParentNode): void {
  root
    .querySelectorAll('.material-icons:not([aria-hidden]),.material-icons-outlined:not([aria-hidden])')
    .forEach((n) => n.setAttribute('aria-hidden', 'true'));
}
function startIconObserver(): void {
  hideIcons(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      // Text-only / removal mutations (e.g. Monaco typing, live outputs) cost nothing here
      if (r.addedNodes.length === 0) continue;
      // Monaco re-renders its view lines constantly and never contains icon fonts
      if (r.target instanceof Element && r.target.closest('.monaco-editor')) continue;
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (
          (el.classList.contains('material-icons') || el.classList.contains('material-icons-outlined')) &&
          !el.hasAttribute('aria-hidden')
        ) {
          el.setAttribute('aria-hidden', 'true');
        }
        // Cheap pre-check via the (native, cached) class collections before running a selector query
        if (
          el.firstElementChild &&
          (el.getElementsByClassName('material-icons').length ||
            el.getElementsByClassName('material-icons-outlined').length)
        )
          hideIcons(el);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
if (document.body) startIconObserver();
else document.addEventListener('DOMContentLoaded', startIconObserver, { once: true });

/** Report a tool error in the status bar (single error surface). */
export const reportError = (e: unknown, meta = ''): void =>
  setStatus('error', errorMessage(e).replace(/^Error:\s*/, ''), meta);
export const reportOk = (msg = 'Done', meta = ''): void => setStatus('ok', msg, meta);
export const resetStatus = (): void => setStatus('idle', 'Ready');

/**
 * Mark a form field invalid (red border + aria-invalid) without replacing its value.
 * With `message`, also shows an inline `<p class="field-error">` right after the field
 * (or after its input wrapper) and links it via aria-describedby. Cleared when valid.
 */
export function setFieldInvalid(id: string, invalid: boolean, message?: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('is-invalid', invalid);
  el.setAttribute('aria-invalid', String(invalid));
  const errId = `${id}-error`;
  let err = document.getElementById(errId);
  const described = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((x) => x && x !== errId);
  if (invalid && message) {
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.id = errId;
      const wrap = el.parentElement;
      const anchor = wrap && wrap.matches('.input-group, .input-wrap, .relative') ? wrap : el;
      anchor.insertAdjacentElement('afterend', err);
    }
    err.innerHTML = '<i class="material-icons" aria-hidden="true">error</i><span></span>';
    err.querySelector('span')!.textContent = message.replace(/^Error:\s*/, '');
    described.push(errId);
  } else {
    err?.remove();
  }
  if (described.length) el.setAttribute('aria-describedby', described.join(' '));
  else el.removeAttribute('aria-describedby');
}
/** Incremented on every tool switch; deferred tool work scheduled under an older epoch is dropped. */
export let toolEpoch = 0;
export const bumpToolEpoch = (): number => {
  // An Undo toast belongs to the tool that showed it; don't leave it offering a dead action
  if (toastAction) {
    toastAction = null;
    clearTimeout(toastTimer);
    const c = document.getElementById('toastContainer');
    if (c) c.textContent = '';
  }
  return ++toolEpoch;
};
