import type { Tool } from '../types/tools';
import { openModal, closeModal } from '../ui';
import { scoreTool } from '../search';
import { state, allTools, toolById, nav } from './state';
import { getRecent, isPinned, togglePin } from './pins';
import { closeDrawerIfNarrow } from './sidebar';
import { focusHomeSearch } from './home';
import { clearToolSession } from './session';

/** A palette row: a tool to open, or a command to run. */
export type PaletteItem =
  | { kind: 'tool'; tool: Tool }
  | { kind: 'command'; id: string; title: string; icon: string; run: () => void };

const MAX_PIN_COMMANDS = 6;

const itemTitle = (x: PaletteItem): string => (x.kind === 'tool' ? x.tool.title : x.title);
const itemIcon = (x: PaletteItem): string => (x.kind === 'tool' ? x.tool.icon : x.icon);
const itemCategory = (x: PaletteItem): string => (x.kind === 'tool' ? x.tool.category : 'Commands');

/** Commands matching the query `t` (lower-cased, trimmed, non-empty). */
function commandsFor(t: string): PaletteItem[] {
  const cmds: PaletteItem[] = [];
  const cmd = (id: string, title: string, icon: string, run: () => void): void => {
    cmds.push({ kind: 'command', id, title, icon, run });
  };
  const cur = state.currentTool;
  if (cur) {
    const label = `Clear session for ${cur.title}`;
    if (label.toLowerCase().includes(t) || 'clear session'.startsWith(t))
      cmd('clear-session', label, 'backspace', clearToolSession);
  }
  if ('go home'.includes(t) || 'home'.startsWith(t) || t.startsWith('go h'))
    cmd('go-home', 'Go home', 'home', () => nav.goHome());
  if ('open settings'.includes(t) || 'settings'.startsWith(t) || t.startsWith('sett'))
    cmd('open-settings', 'Open settings', 'tune', () => nav.openSettings());
  if (
    'about forgetools'.includes(t) ||
    ['version', 'support', 'github', 'coffee', 'donate'].some((w) => w.startsWith(t))
  ) {
    cmd('about', 'About ForgeTools', 'info', () => nav.openAbout());
  }
  // "pin json" / "unpin jwt": a pin command per matching tool
  const pinMatch = /^(un)?pin(?:\s+(.*))?$/.exec(t);
  if (pinMatch) {
    const rest = (pinMatch[2] ?? '').trim();
    const pool = rest
      ? allTools().filter((x) => x.title.toLowerCase().includes(rest) || x.id.toLowerCase().includes(rest))
      : cur
        ? [cur]
        : [];
    pool.slice(0, MAX_PIN_COMMANDS).forEach((x) => {
      const pinned = isPinned(x.id);
      if (pinMatch[1] && !pinned) return;
      cmd(`pin-${x.id}`, `${pinned ? 'Unpin' : 'Pin'} ${x.title}`, 'push_pin', () => togglePin(x.id));
    });
  }
  return cmds;
}

function highlight(text: string, term: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const idx = term ? text.toLowerCase().indexOf(term) : -1;
  if (idx < 0) {
    frag.append(text);
    return frag;
  }
  const mark = document.createElement('mark');
  mark.textContent = text.slice(idx, idx + term.length);
  frag.append(text.slice(0, idx), mark, text.slice(idx + term.length));
  return frag;
}

export function setupCommandPalette(): void {
  const palette = document.getElementById('cmdPalette');
  const inputEl = document.getElementById('cmdInput');
  const results = document.getElementById('cmdResults');
  if (!palette || !(inputEl instanceof HTMLInputElement) || !results) return;
  const input: HTMLInputElement = inputEl;

  let matches: PaletteItem[] = [];
  let selected = 0;
  const dialog = palette.querySelector<HTMLElement>('[role="dialog"]') ?? palette;
  const isOpen = (): boolean => palette.classList.contains('visible');

  const open = (): void => {
    if (isOpen()) return;
    palette.classList.add('visible');
    input.setAttribute('aria-expanded', 'true');
    input.value = '';
    renderResults('');
    openModal(dialog, { initialFocus: input, onEscape: () => close() });
  };
  const close = (restoreFocus = true): void => {
    if (!isOpen()) return;
    palette.classList.remove('visible');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    closeModal(dialog, restoreFocus);
  };
  nav.openPalette = open;

  const choose = (item: PaletteItem | undefined): void => {
    if (!item) return;
    if (item.kind === 'command') {
      close();
      item.run();
      return;
    }
    // Focus moves into the opened tool rather than back to the opener
    close(false);
    closeDrawerIfNarrow();
    nav.openTool(item.tool.id);
  };

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isOpen()) close();
      else if (!state.currentTool && !document.querySelector('.settings-overlay.visible')) focusHomeSearch();
      else open();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      selected = (selected + step + matches.length) % matches.length;
      updateSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[selected]);
    }
  });
  palette.addEventListener('click', (e) => {
    if (e.target === palette) close();
  });
  // No debounce: filtering a few dozen tools is instant, and lag here is felt
  input.addEventListener('input', () => renderResults(input.value));

  function updateSelection(): void {
    results?.querySelectorAll<HTMLElement>('.cmd-item').forEach((el, i) => {
      const on = i === selected;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
      if (on) {
        el.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', el.id);
      }
    });
  }

  function renderResults(term: string): void {
    if (!results) return;
    const t = term.trim().toLowerCase();
    const all = allTools();
    let tools: Tool[];
    if (!t) {
      const recent = getRecent()
        .map(toolById)
        .filter((x): x is Tool => !!x);
      tools = [...recent, ...all.filter((x) => !recent.includes(x))];
    } else {
      // Rank: prefix > word-start > substring > subsequence across title/keywords/id; then description
      tools = all
        .map((x) => [x, scoreTool(x, t)] as const)
        .filter(([, sc]) => sc > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([x]) => x);
    }
    // Commands come first when they match
    const items: PaletteItem[] = [
      ...(t ? commandsFor(t) : []),
      ...tools.map((tool): PaletteItem => ({ kind: 'tool', tool })),
    ];
    // Group by section (Recent first when browsing); groups appear in order of their best match
    const recentIds = t ? [] : getRecent();
    const groupOf = (x: PaletteItem): string =>
      x.kind === 'command' ? 'Commands' : recentIds.includes(x.tool.id) ? 'Recent' : x.tool.category;
    const order: string[] = [];
    items.forEach((x) => {
      const g = groupOf(x);
      if (!order.includes(g)) order.push(g);
    });
    matches = order.flatMap((g) => items.filter((x) => groupOf(x) === g));
    selected = 0;

    const fragment = document.createDocumentFragment();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'cmd-empty';
      empty.textContent = `No tool matches "${term.trim()}"`;
      fragment.appendChild(empty);
      input.removeAttribute('aria-activedescendant');
    }
    let lastGroup = '';
    matches.forEach((entry, i) => {
      const g = groupOf(entry);
      if (g !== lastGroup) {
        lastGroup = g;
        const label = document.createElement('div');
        label.className = 'cmd-group-label';
        label.setAttribute('role', 'presentation');
        label.textContent = g;
        fragment.appendChild(label);
      }
      const item = document.createElement('div');
      item.className = 'cmd-item';
      item.id = `cmd-opt-${i}`;
      item.setAttribute('role', 'option');
      const icon = document.createElement('i');
      icon.className = 'material-icons';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = itemIcon(entry);
      const title = document.createElement('span');
      title.className = 'truncate shrink-0 max-w-[60%]';
      title.appendChild(highlight(itemTitle(entry), t));
      const category = itemCategory(entry);
      const cat = document.createElement('span');
      cat.className = 'cmd-meta';
      cat.textContent = `\u2014 ${category}`;
      // Category is redundant under its own group heading; keep it only under Recent/Commands.
      if (g === category) item.append(icon, title);
      else item.append(icon, title, cat);
      item.onmousemove = () => {
        if (selected !== i) {
          selected = i;
          updateSelection();
        }
      };
      item.onclick = () => choose(entry);
      fragment.appendChild(item);
    });
    results.textContent = '';
    results.appendChild(fragment);
    updateSelection();
  }
}
