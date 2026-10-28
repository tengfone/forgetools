import { toolEpoch } from '../../ui';
// Shared building blocks for custom tool UIs so every tool looks and behaves the same.

/** Debounce live updates (default 120ms). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 120): (...args: A) => void {
    let t: ReturnType<typeof setTimeout> | undefined;
    return (...args: A) => {
        clearTimeout(t);
        const epoch = toolEpoch;
        t = setTimeout(() => { if (epoch === toolEpoch) fn(...args); }, ms);
    };
}

const icon = (name: string): string => `<i class="material-icons icon-sm" aria-hidden="true">${name}</i>`;

/**
 * Input card action buttons in the fixed order Paste, Sample, Clear.
 * `paste` is the field id (declarative data-paste); `sample`/`clear` are button ids wired by the tool.
 */
export function inputActions(opts: { paste?: string; sample?: string; clear?: string }): string {
    const parts: string[] = [];
    if (opts.paste) parts.push(`<button type="button" class="btn-icon btn-sm" data-paste="${opts.paste}">${icon('content_paste')} Paste</button>`);
    if (opts.sample) parts.push(`<button type="button" class="btn-icon btn-sm" id="${opts.sample}">${icon('science')} Sample</button>`);
    if (opts.clear) parts.push(`<button type="button" class="btn-icon btn-sm" id="${opts.clear}">${icon('clear')} Clear</button>`);
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
 * Direction only follows real user edits (trusted input events or the Paste button),
 * never synthetic `input` events from session restore / handoff / programmatic writes,
 * which previously flipped the direction and labelled the user's own pane "output".
 *
 * Swap moves the source pane to the left (the two cards trade places, so both values
 * visibly swap position), flips the direction and recomputes from the new source.
 * `forward`/`backward` are plain verbs (e.g. "Encode"); the arrow is derived from layout.
 */
export function twoWay(opts: {
    prefix: string;
    a: { field: string; label: string; run: () => void };
    b: { field: string; label: string; run: () => void };
    forward: string; backward: string;
}): { set: (side: 'a' | 'b') => void } {
    const fa = document.getElementById(opts.a.field) as HTMLTextAreaElement;
    const fb = document.getElementById(opts.b.field) as HTMLTextAreaElement;
    const chip = document.getElementById(`${opts.prefix}-dir`)!;
    const cardA = fa.closest<HTMLElement>('.tool-card');
    const cardB = fb.closest<HTMLElement>('.tool-card');
    let side: 'a' | 'b' = 'a';
    const mark = (labelId: string, on: boolean): void => {
        const l = document.getElementById(labelId);
        if (!l) return;
        l.querySelector('.output-marker')?.remove();
        if (on) l.insertAdjacentHTML('beforeend', '<span class="output-marker">output</span>');
    };
    const aIsLeft = (): boolean => !cardA || !cardB || !!(cardA.compareDocumentPosition(cardB) & Node.DOCUMENT_POSITION_FOLLOWING);
    const set = (s: 'a' | 'b'): void => {
        side = s;
        const verb = s === 'a' ? opts.forward : opts.backward;
        const sourceLeft = (s === 'a') === aIsLeft();
        chip.textContent = verb.includes('\u2192') ? verb : sourceLeft ? `${verb} \u2192` : `\u2190 ${verb}`;
        chip.dataset.direction = s === 'a' ? 'forward' : 'backward';
        mark(opts.a.label, s === 'b');
        mark(opts.b.label, s === 'a');
    };
    const userEdit = (s: 'a' | 'b') => (e: Event): void => {
        if (e.isTrusted || (e as Event & { fromPaste?: boolean }).fromPaste) set(s);
    };
    fa.addEventListener('input', userEdit('a'));
    fb.addEventListener('input', userEdit('b'));
    document.getElementById(`${opts.prefix}-swap`)!.onclick = () => {
        const next = side === 'a' ? 'b' : 'a';
        // Put the new source pane on the left: the cards (and their values) trade places.
        if (cardA && cardB && cardA.parentElement === cardB.parentElement) {
            const parent = cardA.parentElement!;
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
    `<div class="empty-state" data-empty-state><span>${message}</span>${sampleBtnId
        ? `<button type="button" class="btn-icon btn-ghost" data-try-sample="${sampleBtnId}">Try sample</button>` : ''}</div>`;

document.addEventListener('click', e => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-try-sample]');
    if (btn) document.getElementById(btn.dataset.trySample!)?.click();
});
