import { $, clearWithUndo, resetStatus, toolEpoch, isUserEdit } from '../../ui';
// Shared building blocks for custom tool UIs so every tool looks and behaves the same.

/** Debounce live updates (default 120ms). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 120): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    const epoch = toolEpoch;
    t = setTimeout(() => {
      if (epoch === toolEpoch) fn(...args);
    }, ms);
  };
}

/**
 * Standard `.tool-card` with a `.card-head` row: `<h3>` title (raw HTML, e.g. a `<label>`)
 * and optional action buttons, followed by the card body.
 */
export const toolCard = (o: {
  title: string;
  titleId?: string;
  actions?: string;
  body: string;
  id?: string;
  className?: string;
}): string => `
    <div class="tool-card${o.className ? ` ${o.className}` : ''}"${o.id ? ` id="${o.id}"` : ''}>
        <div class="card-head">
            <h3${o.titleId ? ` id="${o.titleId}"` : ''}>${o.title}</h3>
            ${o.actions ?? ''}
        </div>
        ${o.body}
    </div>`;

export interface LiveToolWiring {
  /** Field whose `input` events trigger a (debounced) update. */
  input: HTMLInputElement | HTMLTextAreaElement;
  update: () => unknown;
  /** Debounce delay for typing (default 120ms). */
  delay?: number;
  /** Sample button: sets the input to `value` (or runs `apply`), then updates. */
  sample?: { button: string; value?: string | (() => string); apply?: () => void };
  /** Clear button: clears `fields` with an Undo toast, then runs `after` (default: update). */
  clear?: { button: string; fields: string[]; after?: () => void };
  /** What to do once wired: reset the status bar (default), run update, or nothing. */
  initial?: 'reset' | 'run' | 'none';
}

/** Wire the standard live input + Sample + Clear + initial status for a custom tool. */
export function wireLiveTool(o: LiveToolWiring): void {
  const run = (): void => {
    void o.update();
  };
  o.input.addEventListener('input', debounce(run, o.delay));
  const { sample, clear } = o;
  if (sample)
    $(sample.button).onclick = () => {
      if (sample.value !== undefined)
        o.input.value = typeof sample.value === 'function' ? sample.value() : sample.value;
      sample.apply?.();
      run();
    };
  if (clear) $(clear.button).onclick = () => clearWithUndo(clear.fields, clear.after ?? run);
  if (o.initial === 'run') run();
  else if (o.initial !== 'none') resetStatus();
}

const icon = (name: string): string => `<i class="material-icons icon-sm" aria-hidden="true">${name}</i>`;

/**
 * Input card action buttons in the fixed order Paste, Sample, Clear.
 * `paste` is the field id (declarative data-paste); `sample`/`clear` are button ids wired by the tool.
 */
export function inputActions(opts: { paste?: string; sample?: string; clear?: string }): string {
  const parts: string[] = [];
  if (opts.paste)
    parts.push(
      `<button type="button" class="btn-icon btn-sm" data-paste="${opts.paste}">${icon('content_paste')} Paste</button>`,
    );
  if (opts.sample)
    parts.push(`<button type="button" class="btn-icon btn-sm" id="${opts.sample}">${icon('science')} Sample</button>`);
  if (opts.clear)
    parts.push(`<button type="button" class="btn-icon btn-sm" id="${opts.clear}">${icon('clear')} Clear</button>`);
  return `<div class="flex gap-1">${parts.join('')}</div>`;
}

/** Text "Copy" button for a card head. */
export const copyButton = (target: string): string =>
  `<button type="button" class="btn-icon btn-sm" data-copy="${target}">${icon('content_copy')} Copy</button>`;

/** Icon-only copy button with an accessible name. */
export const copyIconButton = (target: string, label: string): string =>
  `<button type="button" class="btn-icon btn-sm" data-copy="${target}" aria-label="Copy ${label}">${icon('content_copy')}</button>`;

/** Read-only copyable output row: caption span + icon copy button + readonly input labelled by the caption. */
export const readonlyField = (id: string, label: string): string => `
    <div class="result-item">
        <div class="field-label">
            <span id="${id}-label">${label}</span>
            ${copyIconButton(id, label)}
        </div>
        <input type="text" class="form-control cursor-pointer" id="${id}" readonly data-copy-self aria-labelledby="${id}-label">
    </div>`;

/** Direction bar markup for two-way tools; place between the panes' header area (above .grid-2). */
export const directionBar = (prefix: string): string => `
    <div class="direction-bar">
        <span class="direction-chip" id="${prefix}-dir" aria-live="polite"></span>
        <button type="button" class="btn-icon btn-sm" id="${prefix}-swap" aria-label="Swap input and output" title="Swap input and output">${icon('swap_horiz')}</button>
    </div>`;

/**
 * Track the source side of a two-way tool. Shows the direction chip, marks the target
 * pane label "output", and wires Swap.
 *
 * Direction only follows user edits (typing, Paste button), never the app's own writes
 * (session restore / handoff / history pick, see `setValueProgrammatically`), which
 * previously flipped the direction and labelled the user's own pane "output".
 *
 * Swap moves the source pane to the left (the two cards trade places, so both values
 * visibly swap position), flips the direction and recomputes from the new source.
 * `forward`/`backward` are plain verbs (e.g. "Encode"); the arrow is derived from layout.
 */
export function twoWay(opts: {
  prefix: string;
  a: { field: string; label: string; run: () => void };
  b: { field: string; label: string; run: () => void };
  forward: string;
  backward: string;
}): { set: (side: 'a' | 'b') => void } {
  const fa = $<HTMLTextAreaElement>(opts.a.field);
  const fb = $<HTMLTextAreaElement>(opts.b.field);
  const chip = $(`${opts.prefix}-dir`);
  const cardA = fa.closest<HTMLElement>('.tool-card');
  const cardB = fb.closest<HTMLElement>('.tool-card');
  let side: 'a' | 'b' = 'a';
  const mark = (labelId: string, on: boolean): void => {
    const l = document.getElementById(labelId);
    if (!l) return;
    l.querySelector('.output-marker')?.remove();
    if (on) l.insertAdjacentHTML('beforeend', '<span class="output-marker">output</span>');
  };
  const aIsLeft = (): boolean =>
    !cardA || !cardB || !!(cardA.compareDocumentPosition(cardB) & Node.DOCUMENT_POSITION_FOLLOWING);
  const set = (s: 'a' | 'b'): void => {
    side = s;
    const verb = s === 'a' ? opts.forward : opts.backward;
    const sourceLeft = (s === 'a') === aIsLeft();
    chip.textContent = verb.includes('\u2192') ? verb : sourceLeft ? `${verb} \u2192` : `\u2190 ${verb}`;
    chip.dataset.direction = s === 'a' ? 'forward' : 'backward';
    mark(opts.a.label, s === 'b');
    mark(opts.b.label, s === 'a');
  };
  const userEdit =
    (s: 'a' | 'b') =>
    (e: Event): void => {
      if (isUserEdit(e)) set(s);
    };
  fa.addEventListener('input', userEdit('a'));
  fb.addEventListener('input', userEdit('b'));
  $(`${opts.prefix}-swap`).onclick = () => {
    const next = side === 'a' ? 'b' : 'a';
    // Put the new source pane on the left: the cards (and their values) trade places.
    const parent = cardA?.parentElement;
    if (cardA && cardB && parent && parent === cardB.parentElement) {
      const [first, second] = aIsLeft() ? [cardA, cardB] : [cardB, cardA];
      parent.insertBefore(second, first);
    }
    set(next);
    (next === 'a' ? opts.a : opts.b).run();
  };
  set('a');
  return { set };
}

/**
 * Quiet one-line empty state for an output region, with an optional "Try sample" text button
 * that clicks the tool's existing Sample button (by id).
 */
export const emptyState = (message: string, sampleBtnId?: string): string =>
  `<div class="empty-state" data-empty-state><span>${message}</span>${
    sampleBtnId
      ? `<button type="button" class="btn-icon btn-ghost" data-try-sample="${sampleBtnId}">Try sample</button>`
      : ''
  }</div>`;

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-try-sample]');
  const id = btn?.dataset.trySample;
  if (id) document.getElementById(id)?.click();
});

/**
 * Decode standard or URL-safe base64 (padding optional, whitespace ignored).
 * Returns raw bytes, or throws Error on invalid input.
 */
export function decodeBase64Url(str: string): Uint8Array {
  let s = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Invalid base64 characters');
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error('Invalid base64 length');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** decodeBase64Url + strict UTF-8 decode. Throws on invalid base64 or invalid UTF-8. */
export const decodeBase64UrlText = (str: string): string =>
  new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(str));
