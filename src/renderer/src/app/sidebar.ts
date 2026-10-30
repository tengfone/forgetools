import type { Tool } from '../../../types/tools';
import { isMac } from '../native';
import { state, allTools, toolById, nav } from './state';
import { getCollapsed, getPinned, isPinned, togglePin, forgetCollapsed, syncPinButton, COLLAPSED_KEY } from './pins';

// ---- Sidebar: one navigation surface ----
// Wide (>= 900px): docked sidebar; the header toggle (Ctrl+B) collapses it to a
// 56px icon rail (Home, pinned tools, category icons). State is persisted.
// Narrow (< 900px): the same sidebar is a drawer opened from the titlebar menu button.
export const narrowMq = window.matchMedia('(max-width: 899px)');
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const CATEGORY_ICONS: Record<string, string> = {
  Format: 'format_align_left',
  Convert: 'swap_horiz',
  'Inspect & Decode': 'manage_search',
  Compare: 'compare_arrows',
  Generate: 'auto_fix_high',
  'Text & Utilities': 'text_fields',
};

/** Platform modifier label: \u2318 on macOS, Ctrl elsewhere. */
export const modKey = (): string => (isMac() ? '\u2318' : 'Ctrl');

const isCollapsed = (): boolean => !narrowMq.matches && document.body.classList.contains('sidebar-collapsed');

export function syncSidebarToggle(): void {
  const btn = document.getElementById('sidebarToggle');
  const menu = document.getElementById('navMenuBtn');
  const drawerOpen = document.body.classList.contains('drawer-open');
  if (btn) {
    const label = narrowMq.matches ? 'Close sidebar' : isCollapsed() ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-label', label);
    btn.title = `${label} (${modKey()}+B)`;
    btn.setAttribute('aria-expanded', String(narrowMq.matches ? drawerOpen : !isCollapsed()));
    const icon = btn.querySelector('.material-icons');
    if (icon) icon.textContent = narrowMq.matches ? 'close' : isCollapsed() ? 'menu' : 'menu_open';
  }
  menu?.setAttribute('aria-expanded', String(drawerOpen));
  // Collapsed rail: labels move to tooltips
  document.querySelectorAll<HTMLElement>('#sidebar .nav-item').forEach((el) => {
    const label = el.querySelector('.nav-label')?.textContent ?? '';
    if (isCollapsed()) el.setAttribute('aria-label', label);
    else el.removeAttribute('aria-label');
  });
}

export function setDrawer(open: boolean, focusSearch = false): void {
  const scrim = document.getElementById('sidebarScrim');
  document.body.classList.toggle('drawer-open', open && narrowMq.matches);
  if (scrim) scrim.hidden = !(open && narrowMq.matches);
  syncSidebarToggle();
  if (open && focusSearch) document.getElementById('sidebarSearch')?.focus();
}

/** Close the drawer if the narrow layout is active. */
export const closeDrawerIfNarrow = (): void => {
  if (narrowMq.matches) setDrawer(false);
};

function setCollapsed(collapsed: boolean): void {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  syncSidebarToggle();
}

function toggleSidebar(): void {
  if (narrowMq.matches) setDrawer(!document.body.classList.contains('drawer-open'), true);
  else setCollapsed(!isCollapsed());
}

export function setGroupExpanded(group: HTMLElement, expanded: boolean): void {
  const toggle = group.querySelector<HTMLElement>('.category-toggle');
  const list = group.querySelector<HTMLElement>('.nav-list');
  if (!toggle || !list) return;
  toggle.setAttribute('aria-expanded', String(expanded));
  list.hidden = !expanded;
}

/** Collapsed rail: one icon per category; clicking expands the sidebar to that category. */
function renderCategoryIcons(categories: string[]): void {
  const wrap = document.getElementById('sideCats');
  if (!wrap) return;
  wrap.textContent = '';
  categories.forEach((cat) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-item side-cat';
    b.dataset.category = cat;
    b.title = cat;
    b.setAttribute('aria-label', `Show ${cat}`);
    b.innerHTML = `<i class="material-icons nav-icon" aria-hidden="true">${CATEGORY_ICONS[cat] ?? 'folder'}</i>`;
    b.onclick = () => {
      setCollapsed(false);
      const group = document.querySelector<HTMLElement>(`#toolsNav .nav-group[data-category="${CSS.escape(cat)}"]`);
      if (!group) return;
      setGroupExpanded(group, true);
      forgetCollapsed(cat);
      group.scrollIntoView({ block: 'start' });
      group.querySelector<HTMLElement>('.category-toggle')?.focus();
    };
    wrap.appendChild(b);
  });
}

export function setupDrawer(): void {
  document.body.classList.toggle('sidebar-collapsed', localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  syncSidebarToggle();
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    const wasDrawer = narrowMq.matches;
    toggleSidebar();
    if (wasDrawer) document.getElementById('navMenuBtn')?.focus();
  });
  document
    .getElementById('navMenuBtn')
    ?.addEventListener('click', () => setDrawer(!document.body.classList.contains('drawer-open'), true));
  document.getElementById('sidebarScrim')?.addEventListener('click', () => {
    setDrawer(false);
    document.getElementById('navMenuBtn')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) {
      setDrawer(false);
      document.getElementById('navMenuBtn')?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
      // Ctrl+B has no meaning in our fields or editors, so always toggle.
      e.preventDefault();
      toggleSidebar();
    }
  });
  narrowMq.addEventListener('change', () => setDrawer(false));
  document.getElementById('railHome')?.addEventListener('click', () => nav.goHome());
  setupNavKeys();
}

/** Sidebar search trigger opens the palette; arrow keys move through rows; P pins the focused row. */
function setupNavKeys(): void {
  const searchBtn = document.getElementById('sidebarSearch');
  if (!searchBtn) return;
  searchBtn.addEventListener('click', () => nav.openPalette());
  document.getElementById('railSearch')?.addEventListener('click', () => nav.openPalette());
  document.getElementById('toolsNav')?.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return;
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && el.classList.contains('nav-item')) {
      const id = el.getAttribute('data-tool-id') ?? el.getAttribute('data-tool-ref');
      if (id) {
        e.preventDefault();
        togglePin(id);
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('#toolsNav .nav-item, #toolsNav .category-toggle'),
    ).filter((x) => x.offsetParent !== null);
    const i = items.indexOf(el);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) {
      searchBtn.focus();
      return;
    }
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  });
}

/** Home row active state (the sidebar no longer lists recent tools, so nothing reorders). */
export function renderRail(): void {
  const home = document.getElementById('railHome');
  const onHome = !state.currentTool;
  home?.classList.toggle('active', onHome);
  if (onHome) home?.setAttribute('aria-current', 'page');
  else home?.removeAttribute('aria-current');
  // Collapsed rail: the current tool's category icon carries the active marker
  document
    .querySelectorAll<HTMLElement>('#sideCats .side-cat')
    .forEach((b) => b.classList.toggle('active', b.dataset.category === state.currentTool?.category));
}

function icon(className: string, name: string): HTMLElement {
  const i = document.createElement('i');
  i.className = className;
  i.setAttribute('aria-hidden', 'true');
  i.textContent = name;
  return i;
}

function makeNavRow(tool: Tool, attr: 'data-tool-id' | 'data-tool-ref'): HTMLElement {
  const row = document.createElement('div');
  row.className = 'nav-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-item';
  btn.setAttribute(attr, tool.id);
  btn.title = tool.title;
  // Only the canonical category row shows the active state; Pinned/Recent refs never do.
  if (attr === 'data-tool-id' && state.currentTool?.id === tool.id) {
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
  }
  const label = document.createElement('span');
  label.className = 'nav-label truncate';
  label.textContent = tool.title;
  btn.append(icon('material-icons nav-icon', tool.icon), label);
  btn.onclick = () => {
    nav.openTool(tool.id);
    closeDrawerIfNarrow();
  };
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'nav-pin';
  syncPinButton(pin, tool.id, isPinned(tool.id));
  pin.appendChild(icon('material-icons', 'push_pin'));
  pin.onclick = (e) => {
    e.stopPropagation();
    togglePin(tool.id);
  };
  row.append(btn, pin);
  return row;
}

function makeNavGroup(
  id: string,
  name: string,
  items: Tool[],
  attr: 'data-tool-id' | 'data-tool-ref',
  collapsible = true,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'nav-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', id);
  const header = document.createElement('h2');
  header.className = 'category-header';
  const list = document.createElement('div');
  list.className = 'nav-list';
  list.id = `${id}-list`;
  if (collapsible) {
    // role=button (not <button>): the first real button in #toolsNav must stay a tool row
    const toggle = document.createElement('div');
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    toggle.className = 'category-toggle';
    toggle.id = id;
    toggle.setAttribute('aria-controls', list.id);
    toggle.setAttribute('aria-expanded', 'true');
    const label = document.createElement('span');
    label.textContent = name;
    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = String(items.length);
    count.setAttribute('aria-label', `${items.length} tools`);
    toggle.append(label, count, icon('material-icons category-chevron', 'expand_more'));
    toggle.onclick = () => {
      const expand = toggle.getAttribute('aria-expanded') !== 'true';
      setGroupExpanded(group, expand);
      const set = new Set(getCollapsed());
      if (expand) set.delete(name);
      else set.add(name);
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
    };
    toggle.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle.click();
      }
    };
    header.appendChild(toggle);
  } else {
    header.id = id;
    header.textContent = name;
  }
  group.appendChild(header);
  items.forEach((t) => list.appendChild(makeNavRow(t, attr)));
  group.appendChild(list);
  return group;
}

export function renderSidebar(): void {
  const navEl = document.getElementById('toolsNav');
  if (!navEl) return;

  const fragment = document.createDocumentFragment();
  // Pinned lives in its own container so it can refresh without rebuilding
  // (and losing focus in) the category list.
  const quick = document.createElement('div');
  quick.id = 'navQuick';
  fragment.appendChild(quick);

  const categories = new Map<string, Tool[]>();
  allTools().forEach((tool) => {
    const list = categories.get(tool.category) ?? [];
    list.push(tool);
    categories.set(tool.category, list);
  });
  const collapsed = getCollapsed();
  let gi = 0;
  categories.forEach((categoryTools, category) => {
    const group = makeNavGroup(`nav-cat-${gi++}`, category, categoryTools, 'data-tool-id');
    group.dataset.category = category;
    setGroupExpanded(group, !collapsed.includes(category));
    fragment.appendChild(group);
  });

  navEl.textContent = '';
  navEl.appendChild(fragment);
  renderCategoryIcons([...categories.keys()]);
  renderQuickGroups();
}

/** Pinned group + pin state on category rows. */
export function renderQuickGroups(): void {
  const quick = document.getElementById('navQuick');
  if (!quick) return;
  const pinned = getPinned();

  const active = document.activeElement;
  const focusedRef =
    active instanceof HTMLElement && active.closest('#navQuick') ? active.getAttribute('data-tool-ref') : null;
  quick.textContent = '';
  const pinnedTools = pinned.map(toolById).filter((t): t is Tool => !!t);
  if (pinnedTools.length) quick.appendChild(makeNavGroup('nav-pinned', 'Pinned', pinnedTools, 'data-tool-ref', false));

  // Pin state shows on category rows too
  document.querySelectorAll<HTMLElement>('#toolsNav .nav-row').forEach((row) => {
    const id = row.querySelector('.nav-item')?.getAttribute('data-tool-id');
    const pin = row.querySelector<HTMLElement>('.nav-pin');
    if (id && pin) syncPinButton(pin, id, pinned.includes(id));
  });
  if (focusedRef) quick.querySelector<HTMLElement>(`[data-tool-ref="${CSS.escape(focusedRef)}"]`)?.focus();
  renderRail();
  syncSidebarToggle();
}

/** Mark the open tool's row active and reveal its category if collapsed. */
export function markActiveTool(tool: Tool | null): void {
  document.querySelectorAll('#toolsNav .nav-item').forEach((btn) => {
    // Only the canonical category row is active / the "current page"
    const isActive = !!tool && btn.getAttribute('data-tool-id') === tool.id;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (!tool) return;
  const group = document
    .querySelector<HTMLElement>(`#toolsNav [data-tool-id="${CSS.escape(tool.id)}"]`)
    ?.closest<HTMLElement>('.nav-group');
  if (group && group.querySelector('.category-toggle')?.getAttribute('aria-expanded') === 'false') {
    setGroupExpanded(group, true);
    forgetCollapsed(group.dataset.category);
  }
}
