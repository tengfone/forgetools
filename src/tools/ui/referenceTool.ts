// Shared UI for searchable reference tools: a search box (plus optional toolbar) over a
// grouped table where clicking a row copies its key. Used by HTTP status codes and Cheat Sheets.
import { $, $f, esc, reportError, reportOk, resetStatus } from '../../ui';
import { debounce, icon } from './common';

/** Searchable reference: search box + grouped table; clicking a row copies its key. */
export function referenceTool(opts: {
  prefix: string;
  placeholder: string;
  sample: string;
  toolbar?: string;
  rows: (q: string) => Array<{ group: string; key: string; name?: string; desc: string; copy: string }>;
  onReady?: (update: () => void) => void;
}): (container: HTMLElement) => void {
  const p = opts.prefix;
  return (container: HTMLElement): void => {
    container.innerHTML = `
            <div class="custom-interface">
                <div class="tool-toolbar">
                    <input type="search" class="form-control py-1 max-w-[360px]" id="${p}-input" aria-label="Search" placeholder="${esc(opts.placeholder)}" spellcheck="false">
                    ${opts.toolbar ?? ''}
                    <button type="button" class="btn-icon btn-sm" id="${p}-sample">${icon('science')} Sample</button>
                </div>
                <div class="tool-card">
                    <div id="${p}-output" class="overflow-auto" role="region" aria-label="Results"></div>
                </div>
            </div>`;
    const out = $(`${p}-output`);
    const update = (): void => {
      const rows = opts.rows($f(`${p}-input`).value.trim());
      if (!rows.length) {
        out.innerHTML =
          '<p class="text-[13px] text-text-secondary">No matches. Try fewer words or clear the search.</p>';
        reportError('No matches');
        return;
      }
      reportOk(`${rows.length} match${rows.length === 1 ? '' : 'es'}`, 'Enter copies the first · ↑↓ to move');
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const g = groups.get(r.group) ?? [];
        g.push(r);
        groups.set(r.group, g);
      }
      out.innerHTML = [...groups]
        .map(
          ([g, rs]) => `
                <h3 class="ref-group">${esc(g)}</h3>
                <table class="ref-table"><tbody>${rs
                  .map(
                    (r) => `
                    <tr>
                        <td${/^[1-5]\d\d$/.test(r.key) ? ` data-code-class="${r.key[0]}"` : ''}><button type="button" class="ref-copy" data-copy-text="${esc(r.copy)}" title="Copy ${esc(r.copy)}" aria-label="Copy ${esc(r.copy)}">${esc(r.key)}<i class="material-icons ref-copy-icon" aria-hidden="true">content_copy</i></button></td>
                        <td>${r.name ? `<span class="ref-name">${esc(r.name)}</span> · ` : ''}${esc(r.desc)}</td>
                    </tr>`,
                  )
                  .join('')}</tbody></table>`,
        )
        .join('');
    };
    $(`${p}-input`).addEventListener('input', debounce(update, 60));
    $(`${p}-input`).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      update();
      out.querySelector<HTMLButtonElement>('.ref-copy')?.click();
    });
    // ↑/↓ move between copy buttons; ↑ from the first returns to the search box
    container.querySelector<HTMLElement>('.custom-interface')!.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const t = e.target as HTMLElement;
      const btns = Array.from(out.querySelectorAll<HTMLButtonElement>('.ref-copy'));
      const i = t.id === `${p}-input` ? -1 : btns.indexOf(t as HTMLButtonElement);
      if (i === -1 && t.id !== `${p}-input`) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? btns[i + 1] : i <= 0 ? $(`${p}-input`) : btns[i - 1];
      next?.focus();
      next?.scrollIntoView({ block: 'nearest' });
    });
    $(`${p}-sample`).onclick = () => {
      $f(`${p}-input`).value = opts.sample;
      update();
    };
    opts.onReady?.(update);
    resetStatus();
    update();
  };
}
