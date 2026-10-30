import { esc } from '../ui';
import { getHelp } from '../tools/help';
import { state } from './state';
import { modKey } from './sidebar';

// --- Tool help popover (button + F1) ---

export function closeHelp(): void {
  const pop = document.getElementById('helpPopover');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  document.getElementById('helpBtn')?.setAttribute('aria-expanded', 'false');
}

function toggleHelp(): void {
  const pop = document.getElementById('helpPopover');
  const btn = document.getElementById('helpBtn');
  const tool = state.currentTool;
  if (!pop || !btn || !tool) return;
  if (!pop.hidden) {
    closeHelp();
    return;
  }
  const help = getHelp(tool.id);
  const rows = help?.rows?.length
    ? `<table class="help-table">${help.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  const keys: [string, string][] = [
    [`${modKey()}+K`, 'Switch tools'],
    [`${modKey()}+Shift+C`, 'Copy output'],
    [`${modKey()}+Shift+Backspace`, 'Clear tool session'],
    ['P', 'Pin focused tool row'],
    ['F1', 'Toggle help'],
    ['Esc', 'Close'],
  ];
  pop.innerHTML =
    `<p class="help-tip">${esc(help?.tip ?? tool.description)}</p>${rows}` +
    `<div class="help-foot"><p class="help-foot-line">Runs offline.</p><dl class="help-keys">` +
    keys.map(([k, v]) => `<dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd>`).join('') +
    `</dl></div>`;
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  pop.focus();
}

export function setupHelp(): void {
  document.getElementById('helpBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHelp();
  });
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('helpPopover');
    if (pop && !pop.hidden && e.target instanceof Node && !pop.contains(e.target)) closeHelp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      toggleHelp();
    } else if (e.key === 'Escape') {
      const pop = document.getElementById('helpPopover');
      const wasInside = !!pop && pop.contains(document.activeElement);
      closeHelp();
      if (wasInside) document.getElementById('helpBtn')?.focus();
    }
  });
}
