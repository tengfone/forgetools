import type { Tool } from '../types/tools';
import { detect, type Candidate } from '../detect';
import { scoreTool } from '../search';
import { esc } from '../ui';
import { CATEGORY_ORDER } from '../tools';
import { debounce } from './cache';
import { state, allTools, toolById, nav } from './state';
import { getPinned, getRecent, togglePin, syncPinButton } from './pins';

/** Home search: detection/filter debounce (growing the box is immediate). */
const HOME_SEARCH_DEBOUNCE_MS = 150;
const HOME_SEARCH_MAX_LINES = 6;
const MAX_DETECTIONS = 3;

/** Text pasted on the welcome screen, waiting for its tool to render. */
let pendingHandoff: { toolId: string; text: string } | null = null;
/** Take the pending handoff for `toolId`, if any. */
export function takeHandoff(toolId: string): string | null {
  const h = pendingHandoff;
  if (!h || h.toolId !== toolId) return null;
  pendingHandoff = null;
  return h.text;
}

/** Detection only kicks in when the box holds data, not a tool name being typed. */
function looksLikeData(raw: string, top: Candidate | undefined): boolean {
  const s = raw.trim();
  if (!s || !top) return false;
  return s.length > 12 || /\n/.test(s) || top.confidence >= 0.9;
}

/** Home's single box: filters the tool grid as you type, and offers a tool for pasted data. */
export function setupHomeSearch(): void {
  const box = document.getElementById('homeSearch');
  const line = document.getElementById('homeDetect');
  if (!(box instanceof HTMLTextAreaElement) || !line) return;
  let top: Candidate[] = [];
  /** Query the grid is currently filtered by ('' = unfiltered). */
  let activeQuery = '';
  const visibleTiles = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('#homeGrid .home-tile')).filter((x) => x.offsetParent !== null);
  /** Tile that Enter / Arrow Down target: the best match for the typed filter, else the first tile. */
  const bestTile = (): HTMLElement | undefined => {
    const tiles = visibleTiles();
    const q = activeQuery;
    if (!q) return tiles[0];
    const score = (el: HTMLElement): number => {
      const t = toolById(el.dataset.toolTile);
      return t ? scoreTool(t, q) : 0;
    };
    // Stable on ties: grid (category) order decides between equal matches
    return tiles.reduce<HTMLElement | undefined>(
      (best, el) => (!best || score(el) > score(best) ? el : best),
      undefined,
    );
  };

  const grow = (): void => {
    const cs = getComputedStyle(box);
    const lh = parseFloat(cs.lineHeight) || 20;
    const borders = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = lh * HOME_SEARCH_MAX_LINES + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + borders;
    box.style.height = 'auto';
    const want = box.scrollHeight + borders;
    box.style.height = `${Math.min(want, max)}px`;
    box.style.overflowY = want > max ? 'auto' : 'hidden';
  };

  const filter = (q: string): void => {
    activeQuery = q;
    let total = 0;
    document.querySelectorAll<HTMLElement>('#homeGrid .home-cat').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll<HTMLElement>('.home-tile-wrap').forEach((w) => {
        const t = toolById(w.dataset.toolTileWrap);
        const ok = !q || (!!t && scoreTool(t, q) > 0);
        w.hidden = !ok;
        if (ok) n++;
      });
      sec.hidden = n === 0;
      total += n;
    });
    const empty = document.getElementById('homeEmpty');
    if (empty) empty.hidden = total > 0;
    const count = document.getElementById('homeCount');
    if (count) count.textContent = q ? `${total} match${total === 1 ? '' : 'es'}` : '';
  };

  const open = (c: Candidate): void => {
    const text = box.value.trim();
    if (!text || !toolById(c.toolId)) return;
    pendingHandoff = { toolId: c.toolId, text };
    clear();
    nav.openTool(c.toolId);
  };

  const render = (): void => {
    const raw = box.value;
    const found = detect(raw)
      .filter((c) => toolById(c.toolId))
      .slice(0, MAX_DETECTIONS);
    top = looksLikeData(raw, found[0]) ? found : [];
    box.classList.toggle('is-data', top.length > 0 || /\n/.test(raw));
    // Pasted data is not a tool name: keep the whole grid instead of filtering it to nothing
    filter(top.length || /\n/.test(raw.trim()) ? '' : raw.trim());
    line.textContent = '';
    top.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const title = toolById(c.toolId)?.title ?? c.toolId;
      if (i === 0) {
        b.className = 'btn-primary';
        b.dataset.detectTop = c.toolId;
        b.innerHTML = `Looks like ${esc(c.label)} <span aria-hidden="true">&rarr;</span> Open in ${esc(title)} <kbd class="welcome-detect-kbd" aria-hidden="true">&crarr;</kbd>`;
      } else {
        b.className = 'welcome-detect-alt';
        b.textContent = `or ${title}`;
      }
      b.onclick = () => open(c);
      line.appendChild(b);
    });
    grow();
  };

  const clear = (): void => {
    box.value = '';
    render();
  };

  const debouncedRender = debounce(render, HOME_SEARCH_DEBOUNCE_MS);
  box.addEventListener('input', () => {
    grow();
    debouncedRender();
  });
  box.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      render(); // flush the debounced detection so Enter acts on the current text
      if (top[0]) {
        open(top[0]);
        return;
      }
      const id = bestTile()?.dataset.toolTile;
      if (id && box.value.trim()) {
        clear();
        nav.openTool(id);
      }
    } else if (e.key === 'Escape' && box.value) {
      e.preventDefault();
      e.stopPropagation();
      clear();
    } else if (e.key === 'ArrowDown') {
      // Leave the textarea only from its last line, so multi-line pastes stay editable
      if (box.value.slice(box.selectionEnd).includes('\n')) return;
      render();
      const target = line.querySelector<HTMLElement>('button') ?? bestTile();
      if (target) {
        e.preventDefault();
        target.focus();
      }
    }
  });
  // Arrow Down from the detection row continues into the grid
  line.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      const t = bestTile();
      if (t) {
        e.preventDefault();
        t.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      box.focus();
    }
  });
  render();
}

export function focusHomeSearch(select = true): void {
  const box = document.getElementById('homeSearch');
  if (!(box instanceof HTMLTextAreaElement)) return;
  box.focus({ preventScroll: true });
  if (select) box.select();
}

function materialIcon(className: string, name: string): HTMLElement {
  const i = document.createElement('i');
  i.className = className;
  i.setAttribute('aria-hidden', 'true');
  i.textContent = name;
  return i;
}

/** Home: Pinned + Recent chip rows, then every tool as a tile grouped by CATEGORY_ORDER. */
export function renderWelcome(): void {
  const quick = document.getElementById('homeQuick');
  if (quick) {
    quick.textContent = '';
    const pinned = getPinned();
    const recent = getRecent()
      .filter((id) => !pinned.includes(id))
      .slice(0, 6);
    const row = (label: string, ids: string[]): void => {
      const list = ids.map(toolById).filter((t): t is Tool => !!t);
      if (!list.length) return;
      const r = document.createElement('div');
      r.className = 'home-chips';
      r.setAttribute('role', 'group');
      r.setAttribute('aria-label', label);
      const h = document.createElement('span');
      h.className = 'welcome-section home-chips-label';
      h.setAttribute('aria-hidden', 'true');
      h.textContent = label;
      r.appendChild(h);
      list.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'home-chip';
        b.dataset.chipTool = t.id;
        const s = document.createElement('span');
        s.textContent = t.title;
        b.append(materialIcon('material-icons', t.icon), s);
        b.onclick = () => nav.openTool(t.id);
        r.appendChild(b);
      });
      quick.appendChild(r);
    };
    row('Pinned', pinned);
    row('Recent', recent);
  }
  const grid = document.getElementById('homeGrid');
  if (grid && !grid.firstChild) {
    const byCat = new Map<string, Tool[]>();
    CATEGORY_ORDER.forEach((c) => byCat.set(c, []));
    allTools().forEach((t) => {
      const list = byCat.get(t.category) ?? [];
      list.push(t);
      byCat.set(t.category, list);
    });
    let gi = 0;
    byCat.forEach((list, cat) => {
      if (!list.length) return;
      const sec = document.createElement('section');
      sec.className = 'home-cat';
      const hid = `home-cat-${gi++}`;
      sec.setAttribute('aria-labelledby', hid);
      const h = document.createElement('h3');
      h.className = 'welcome-section home-cat-title';
      h.id = hid;
      h.textContent = cat;
      const tiles = document.createElement('div');
      tiles.className = 'home-tiles';
      list.forEach((t) => tiles.appendChild(makeTile(t)));
      sec.append(h, tiles);
      grid.appendChild(sec);
    });
  }
  syncHomePins();
}

function makeTile(t: Tool): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'home-tile-wrap';
  wrap.dataset.toolTileWrap = t.id;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'home-tile';
  b.dataset.toolTile = t.id;
  const title = document.createElement('span');
  title.className = 'home-tile-title';
  title.textContent = t.title;
  const desc = document.createElement('span');
  desc.className = 'home-tile-desc';
  desc.textContent = t.description;
  b.append(materialIcon('material-icons home-tile-icon', t.icon), title, desc);
  b.onclick = () => nav.openTool(t.id);
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'nav-pin home-tile-pin';
  pin.dataset.pinTool = t.id;
  pin.appendChild(materialIcon('material-icons', 'push_pin'));
  pin.onclick = (e) => {
    e.stopPropagation();
    togglePin(t.id);
  };
  wrap.append(b, pin);
  return wrap;
}

export function syncHomePins(): void {
  const pinned = getPinned();
  document.querySelectorAll<HTMLElement>('#homeGrid .home-tile-pin').forEach((pin) => {
    const id = pin.dataset.pinTool;
    if (id) syncPinButton(pin, id, pinned.includes(id), true);
  });
  // Chips reflect pin changes immediately when Home is showing
  const quick = document.getElementById('homeQuick');
  if (!state.currentTool && quick) {
    const sig = pinned.join(',') + '|' + getRecent().join(',');
    if (quick.dataset.sig !== sig) {
      quick.dataset.sig = sig;
      renderWelcome();
    }
  }
}
