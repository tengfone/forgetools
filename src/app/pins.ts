import { showToast } from '../ui';
import { toolById } from './state';

// Tool ids only in localStorage (never inputs).
export const COLLAPSED_KEY = 'nav-collapsed';
const PINNED_KEY = 'pinned-tools';
const RECENT_KEY = 'recent-tools';
const MAX_RECENT = 6;

export const readList = (key: string): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const getCollapsed = (): string[] => readList(COLLAPSED_KEY);
/** Mark a sidebar category expanded in the persisted collapse list. */
export const forgetCollapsed = (category: string | undefined): void => {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(getCollapsed().filter((c) => c !== category)));
};

export const getPinned = (): string[] => readList(PINNED_KEY).filter((id) => toolById(id));
export const isPinned = (id: string): boolean => getPinned().includes(id);

/** Listeners re-render pin/recent surfaces (sidebar quick groups, home chips). */
let onPinsChanged: () => void = () => {};
export const setPinsListener = (fn: () => void): void => {
  onPinsChanged = fn;
};

export function togglePin(id: string): void {
  const list = getPinned();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  onPinsChanged();
  const title = toolById(id)?.title ?? id;
  showToast(next.includes(id) ? `Pinned ${title}` : `Unpinned ${title}`);
}

export const getRecent = (): string[] => readList(RECENT_KEY).filter((id) => toolById(id));

export function rememberRecent(id: string): void {
  const list = [id, ...getRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/** Pin button state shared by sidebar rows and home tiles. */
export function syncPinButton(pin: HTMLElement, id: string, on: boolean, pressed = false): void {
  const title = toolById(id)?.title ?? id;
  pin.classList.toggle('is-pinned', on);
  if (pressed) pin.setAttribute('aria-pressed', String(on));
  pin.setAttribute('aria-label', on ? `Unpin ${title}` : `Pin ${title}`);
  pin.title = on ? 'Unpin' : 'Pin';
}
