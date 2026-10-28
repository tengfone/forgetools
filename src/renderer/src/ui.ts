// Shared renderer UI helpers: typed DOM getters, toast, and delegated clipboard actions.
// Tools declare intent with data attributes instead of inline onclick handlers:
//   data-copy="elementId"   copy value/textContent of that element
//   data-copy-self          copy this element's own value/textContent
//   data-copy-text="..."    copy a literal string
//   data-paste="elementId"  paste clipboard into that field and fire `input`

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
  return (typeof v === 'string' ? v : el.textContent ?? '').trim();
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastAction: (() => void) | null = null;

export interface ToastAction { label: string; run: () => void; }

export function showToast(msg: string, type: 'success' | 'error' = 'success', action?: ToastAction): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  container.textContent = '';
  clearTimeout(toastTimer);
  toastAction = null;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = msg;
  toast.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = action.label;
    toastAction = () => { action.run(); dismiss(); };
    btn.onclick = toastAction;
    toast.appendChild(btn);
  }
  container.appendChild(toast);

  const dismiss = (): void => {
    toastAction = null;
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('visible')));
  toastTimer = setTimeout(dismiss, action ? 5000 : type === 'error' ? 3200 : 1600);
}

/** Ctrl/Cmd+Z triggers the pending toast action (Undo) when focus is not inside an editable field. */
document.addEventListener('keydown', e => {
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
  const fields = ids.map(id => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)
    .filter((f): f is HTMLInputElement | HTMLTextAreaElement => !!f);
  const snapshot = fields.map(f => f.value);
  if (snapshot.every(v => !v)) return;
  fields.forEach(f => { f.value = ''; });
  after();
  fields[0]?.focus();
  showToast(label, 'success', {
    label: 'Undo',
    run: () => {
      fields.forEach((f, i) => { f.value = snapshot[i] ?? ''; });
      after();
      fields[0]?.focus();
    },
  });
}

export async function copyText(text: string): Promise<void> {
  if (!text) { showToast('Nothing to copy yet', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Copy failed. Select the text and copy it manually.', 'error');
  }
}

export async function pasteInto(id: string): Promise<void> {
  const field = $f(id);
  if (!field) return;
  try {
    field.value = await navigator.clipboard.readText();
    field.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    showToast('Clipboard is unavailable. Paste with Ctrl+V instead.', 'error');
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Escape text for safe interpolation into innerHTML templates. */
export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

let wired = false;
export function wireClipboardActions(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', e => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-copy],[data-copy-self],[data-copy-text],[data-paste]');
    if (!target) return;
    const { copy, copyText: literal, paste } = target.dataset;
    if (paste) { void pasteInto(paste); return; }
    if (literal !== undefined) { void copyText(literal); return; }
    if (copy) { void copyText(textOf(document.getElementById(copy))); return; }
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
}

/** Report a tool error in the status bar (single error surface). */
export const reportError = (e: unknown, meta = ''): void => setStatus('error', errorMessage(e).replace(/^Error:\s*/, ''), meta);
export const reportOk = (msg = 'Done', meta = ''): void => setStatus('ok', msg, meta);
export const resetStatus = (): void => setStatus('idle', 'Ready');

/** Mark a form field invalid (red border + aria-invalid) without replacing its value. */
export function setFieldInvalid(id: string, invalid: boolean): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('is-invalid', invalid);
  el.setAttribute('aria-invalid', String(invalid));
}
