// Settings dialog: section tabs (Editor, Privacy, Background, About), one pane visible at a time.
// Opened from the titlebar ⚙ (last-used section) and the command palette (About).

export type SettingsSection = 'editor' | 'privacy' | 'background' | 'about';
const SECTIONS: SettingsSection[] = ['editor', 'privacy', 'background', 'about'];
const LAST_KEY = 'settings-section';

/** Wire tabs + arrow-key navigation. Returns a function that selects a section. */
export function setupSettingsTabs(): (section?: SettingsSection) => SettingsSection {
  const tabs = SECTIONS.map((s) => document.getElementById(`stab-${s}`) as HTMLButtonElement | null);
  const panes = SECTIONS.map((s) => document.getElementById(`spane-${s}`));

  const select = (section?: SettingsSection): SettingsSection => {
    const saved = localStorage.getItem(LAST_KEY) as SettingsSection | null;
    const target = section ?? (saved && SECTIONS.includes(saved) ? saved : 'editor');
    SECTIONS.forEach((s, i) => {
      const on = s === target;
      tabs[i]?.setAttribute('aria-selected', String(on));
      if (tabs[i]) tabs[i].tabIndex = on ? 0 : -1;
      if (panes[i]) {
        panes[i].hidden = !on;
        if (on) panes[i].scrollTop = 0;
      }
    });
    localStorage.setItem(LAST_KEY, target);
    return target;
  };

  tabs.forEach((tab, i) => {
    if (!tab) return;
    tab.addEventListener('click', () => select(SECTIONS[i]));
    tab.addEventListener('keydown', (e) => {
      const k = e.key;
      let next = -1;
      if (k === 'ArrowDown' || k === 'ArrowRight') next = (i + 1) % SECTIONS.length;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') next = (i - 1 + SECTIONS.length) % SECTIONS.length;
      else if (k === 'Home') next = 0;
      else if (k === 'End') next = SECTIONS.length - 1;
      if (next < 0) return;
      e.preventDefault();
      select(SECTIONS[next]);
      tabs[next]?.focus();
    });
  });
  select();
  return select;
}
