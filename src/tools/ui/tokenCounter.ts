import { $, $f, reportOk, resetStatus } from '../../ui';
import { inputActions, toolCard, wireLiveTool } from './common';
import { estimateTokens } from '../lib/ai';

const SAMPLE = `You are a helpful assistant. Summarise the following support ticket in three bullet points, then suggest a reply.

Ticket #4821: Hi, since yesterday's update the export button in the dashboard does nothing. I tried Chrome and Firefox and cleared my cache. We need the CSV for our monthly report by Friday. Thanks, Dana`;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({
              title: 'Text',
              titleId: 'tok-input-label',
              actions: inputActions({ paste: 'tok-input', sample: 'tok-sample', clear: 'tok-clear' }),
              body: `<textarea class="form-control font-mono" id="tok-input" rows="16" spellcheck="false" aria-labelledby="tok-input-label" placeholder="Paste a prompt, document or chat transcript..."></textarea>
                <div class="tok-stats mt-2" aria-live="polite">
                    <span><b class="font-mono" id="tok-count">0</b> tokens (est.)</span>
                    <span><b class="font-mono" id="tok-chars">0</b> chars</span>
                    <span><b class="font-mono" id="tok-words">0</b> words</span>
                    <span><b class="font-mono" id="tok-lines">0</b> lines</span>
                    <span class="ui-meta">approximate, about &plusmn;10% for GPT / Claude / Gemini tokenizers</span>
                </div>`,
            })}
        </div>`;

  const input = $f('tok-input');
  const update = (): void => {
    const text = input.value;
    const tokens = estimateTokens(text);
    $('tok-count').textContent = tokens.toLocaleString();
    $('tok-chars').textContent = text.length.toLocaleString();
    $('tok-words').textContent = (text.trim() ? text.trim().split(/\s+/).length : 0).toLocaleString();
    $('tok-lines').textContent = (text ? text.split(/\r?\n/).length : 0).toLocaleString();
    if (text) reportOk(`~${tokens.toLocaleString()} tokens`);
    else resetStatus();
  };
  wireLiveTool({
    input,
    update,
    sample: { button: 'tok-sample', value: SAMPLE },
    clear: { button: 'tok-clear', fields: ['tok-input'] },
    initial: 'none',
  });
  update();
}
