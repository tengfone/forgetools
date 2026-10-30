import { debounce, emptyState } from './common';

import { $f, esc, reportError, resetStatus, clearWithUndo } from '../../ui';
import type { ToolDispose } from '../../types/tools';

export function render(container: HTMLElement): ToolDispose {
  container.innerHTML = `
        <div class="custom-interface">
            <!-- Options Bar -->
            <div class="tool-toolbar">
                <label class="flex items-center gap-2 check-label">
                    <input class="cursor-pointer w-4 h-4" type="checkbox" id="diff-case-sensitive">
                    <span>Case sensitive</span>
                </label>
                <div class="w-px h-5 bg-border"></div>
                <label class="flex items-center gap-2 text-[12px]">
                    <span class="text-text-secondary">Compare</span>
                    <select id="diff-mode" class="toolbar-select cursor-pointer">
                        <option value="line">Line by Line</option>
                        <option value="word">Word by Word</option>
                        <option value="char">Character</option>
                    </select>
                </label>
                <div class="flex-1"></div>
                <button type="button" class="btn-icon btn-sm" id="diff-sample">
                    <i aria-hidden="true" class="material-icons icon-sm">science</i> Sample
                </button>
                <button type="button" class="btn-icon btn-sm" id="diff-swap" title="Swap texts">
                    <i aria-hidden="true" class="material-icons icon-sm">swap_horiz</i> Swap
                </button>
                <button type="button" class="btn-icon btn-sm" id="diff-clear">
                    <i aria-hidden="true" class="material-icons icon-sm">clear</i> Clear
                </button>
            </div>
            
            <!-- Input Panels -->
            <div class="grid-2">
                <div class="tool-card relative">
                    <div class="card-head">
                        <h3>Original Text</h3>
                        <button type="button" class="btn-icon btn-sm" data-paste="diff-original" aria-label="Paste original text">
                            <i aria-hidden="true" class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" aria-label="Original text" id="diff-original" rows="12" placeholder="Enter or paste original text..."></textarea>
                </div>
                <div class="tool-card relative">
                    <div class="card-head">
                        <h3>Compared Text</h3>
                        <button type="button" class="btn-icon btn-sm" data-paste="diff-compared" aria-label="Paste compared text">
                            <i aria-hidden="true" class="material-icons icon-sm">content_paste</i> Paste
                        </button>
                    </div>
                    <textarea class="form-control" aria-label="Compared text" id="diff-compared" rows="12" placeholder="Enter or paste compared text..."></textarea>
                </div>
            </div>
            
            <!-- Result Panel -->
            <div class="tool-card">
                <div class="card-head">
                    <div class="flex items-center gap-3">
                        <h3>Differences</h3>
                        <div class="text-xs text-text-secondary" id="diff-stats"></div>
                    </div>
                    <div class="flex items-center gap-3 text-[12px]">
                        <span class="text-success flex items-center gap-1">
                            <span class="legend-swatch is-add"></span>
                            Added
                        </span>
                        <span class="text-error flex items-center gap-1">
                            <span class="legend-swatch is-del"></span>
                            Removed
                        </span>
                    </div>
                </div>
                <div class="panel-well p-5 min-h-[250px] max-h-[500px] overflow-y-auto font-mono text-[13px] leading-[1.8]" id="diff-result"></div>
            </div>
        </div>
    `;

  const originalInput = $f('diff-original');
  const comparedInput = $f('diff-compared');
  const resultDiv = $f('diff-result');
  const statsDiv = $f('diff-stats');
  const caseSensitive = $f('diff-case-sensitive');
  const diffMode = $f('diff-mode');

  interface Part {
    value: string;
    added: boolean;
    removed: boolean;
  }
  interface Res {
    seq: number;
    parts?: Part[];
    error?: string;
  }
  /** jsdiff's own budget; the worker is terminated if it overruns this by DEADLINE_SLACK_MS. */
  const DIFF_TIMEOUT_MS = 2000;
  const DEADLINE_SLACK_MS = 1000;
  let worker: Worker | null = null;
  let seq = 0;
  let busy = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;

  const killWorker = (): void => {
    clearTimeout(killTimer);
    worker?.terminate();
    worker = null;
    busy = false;
  };
  const getWorker = (): Worker => {
    if (!worker) {
      worker = new Worker(new URL('./diffWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<Res>) => handle(e.data);
    }
    return worker;
  };

  let pendingMode = '';
  const handle = (res: Res): void => {
    if (res.seq !== seq) return; // stale
    busy = false;
    clearTimeout(killTimer);
    if (!resultDiv.isConnected) return;
    if (res.error !== undefined) {
      reportError(res.error, 'previous result kept');
      return;
    }
    const mode = pendingMode;
    let addedCount = 0;
    let removedCount = 0;
    const kind = (p: Part) => (p.added ? 'is-add' : p.removed ? 'is-del' : '');
    const parts = res.parts ?? [];
    const result =
      mode === 'line'
        ? parts
            .map((part) => {
              const lines = part.value.split('\n');
              if (lines[lines.length - 1] === '') lines.pop();
              if (part.added) addedCount += lines.length;
              else if (part.removed) removedCount += lines.length;
              const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
              return lines
                .map((line) => `<div class="diff-line ${kind(part)}">${prefix}${esc(line) || ' '}</div>`)
                .join('');
            })
            .join('')
        : parts
            .map((part) => {
              const n = mode === 'word' ? part.value.split(/\s+/).filter(Boolean).length : part.value.length;
              if (part.added) addedCount += n;
              else if (part.removed) removedCount += n;
              const text = mode === 'char' ? part.value.replace(/\n/g, '↵\n') : part.value;
              return `<span class="diff-inline ${kind(part)}">${esc(text)}</span>`;
            })
            .join('');

    resultDiv.innerHTML =
      result ||
      '<div class="tool-empty"><i aria-hidden="true" class="material-icons empty-glyph">check_circle</i>No differences. The texts are identical.</div>';
    if (addedCount || removedCount) {
      statsDiv.innerHTML = `<span class="text-success">+${addedCount}</span> / <span class="text-error">-${removedCount}</span>`;
    } else {
      statsDiv.textContent = '';
    }
  };

  const computeDiff = (): void => {
    const my = ++seq;
    if (busy) killWorker(); // a newer request supersedes a running diff
    const original = originalInput.value;
    const compared = comparedInput.value;

    if (!original && !compared) {
      resultDiv.innerHTML = emptyState('Differences appear here once both sides have text.');
      statsDiv.textContent = '';
      return;
    }

    const limit = diffMode.value === 'char' ? 50_000 : 500_000;
    if (original.length > limit || compared.length > limit) {
      reportError(
        `Input too large for ${diffMode.value} mode: limit is ${limit.toLocaleString()} characters per side`,
        'previous result kept',
      );
      return;
    }
    resetStatus();

    pendingMode = diffMode.value;
    // Case-insensitive compare via jsdiff ignoreCase keeps the original casing in the output.
    getWorker().postMessage({
      seq: my,
      mode: pendingMode,
      original,
      compared,
      ignoreCase: !caseSensitive.checked,
      timeout: DIFF_TIMEOUT_MS,
    });
    busy = true;
    killTimer = setTimeout(() => {
      if (my !== seq) return;
      killWorker(); // recreated on next run
      if (resultDiv.isConnected) reportError('Diff took too long; try Line by Line', 'previous result kept');
    }, DIFF_TIMEOUT_MS + DEADLINE_SLACK_MS);
  };

  const scheduleDiff = debounce(computeDiff, 250);
  originalInput.addEventListener('input', scheduleDiff);
  comparedInput.addEventListener('input', scheduleDiff);
  caseSensitive.addEventListener('change', computeDiff);
  diffMode.addEventListener('change', computeDiff);

  $f('diff-clear').onclick = () => clearWithUndo([originalInput.id, comparedInput.id], computeDiff);

  $f('diff-sample').onclick = () => {
    originalInput.value = 'name: forge\nversion: 1.2.0\nfeatures:\n  - json\n  - jwt';
    comparedInput.value = 'name: forge\nversion: 1.3.0\nfeatures:\n  - json\n  - jwt\n  - regex';
    computeDiff();
  };

  $f('diff-swap').onclick = () => {
    const temp = originalInput.value;
    originalInput.value = comparedInput.value;
    comparedInput.value = temp;
    computeDiff();
  };

  // Initial state
  computeDiff();
  return killWorker;
}
