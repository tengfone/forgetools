import { $, $f, esc, reportOk, reportError, resetStatus, setFieldInvalid } from '../../ui';
import { inputActions, toolCard, wireLiveTool, copyButton } from './common';
import { inspect, transcriptText, PROVIDER_LABEL, type Transcript, type Part } from '../lib/llm';
import { estimateTokens } from '../lib/ai';

const SAMPLE = JSON.stringify(
  {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a weather assistant. Answer in one sentence.' },
      { role: 'user', content: 'Do I need an umbrella in Paris tomorrow?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_9Xk',
            type: 'function',
            function: { name: 'get_forecast', arguments: '{"city":"Paris","days":1}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call_9Xk', content: '{"rain_chance":0.8,"high_c":17}' },
      { role: 'assistant', content: 'Yes, there is an 80% chance of rain in Paris tomorrow, so bring an umbrella.' },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_forecast',
          description: 'Daily forecast',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      },
    ],
  },
  null,
  2,
);

const ROLE_ICON: Record<string, string> = {
  system: 'settings',
  developer: 'settings',
  user: 'person',
  assistant: 'smart_toy',
  model: 'smart_toy',
  tool: 'build',
};

const partHtml = (p: Part): string => {
  const pre = (cls: string, head: string, body: string): string =>
    `<div class="llm-part ${cls}"><div class="llm-part-head">${head}</div><pre class="llm-pre">${esc(body)}</pre></div>`;
  switch (p.kind) {
    case 'text':
      return `<div class="llm-text">${esc(p.text)}</div>`;
    case 'tool_call':
      return pre(
        'is-call',
        `<i class="material-icons icon-sm" aria-hidden="true">call_made</i> ${esc(p.name ?? 'tool call')}${p.id ? ` <span class="ui-meta">${esc(p.id)}</span>` : ''}`,
        p.text,
      );
    case 'tool_result':
      return pre(
        'is-result',
        `<i class="material-icons icon-sm" aria-hidden="true">call_received</i> result${p.name ? ` ${esc(p.name)}` : ''}${p.id ? ` <span class="ui-meta">${esc(p.id)}</span>` : ''}`,
        p.text,
      );
    case 'thinking':
      return pre('is-thinking', 'thinking', p.text);
    case 'image':
      return `<div class="llm-part is-other"><i class="material-icons icon-sm" aria-hidden="true">image</i> ${esc(p.text)}</div>`;
    default:
      return pre('is-other', 'other', p.text);
  }
};

function transcriptHtml(t: Transcript): string {
  const meta: string[] = [
    `<span class="llm-chip">${esc(PROVIDER_LABEL[t.provider])}</span>`,
    `<span class="llm-chip">${t.source}</span>`,
  ];
  if (t.model) meta.push(`<span class="llm-chip font-mono">${esc(t.model)}</span>`);
  if (t.stopReason) meta.push(`<span class="llm-chip">stop: ${esc(t.stopReason)}</span>`);
  if (t.tools?.length) meta.push(`<span class="llm-chip">tools: ${esc(t.tools.join(', '))}</span>`);
  const usage = t.usage
    ? `<div class="llm-usage ui-meta">${Object.entries(t.usage)
        .map(([k, v]) => `${esc(k)} <b class="font-mono">${v.toLocaleString()}</b>`)
        .join(' · ')}</div>`
    : '';
  const notes = t.notes.length ? `<div class="ui-meta">${esc(t.notes.join(' · '))}</div>` : '';
  const turn = (role: string, body: string): string =>
    `<div class="llm-turn" data-role="${esc(role)}"><div class="llm-role"><i class="material-icons icon-sm" aria-hidden="true">${ROLE_ICON[role] ?? 'chat'}</i>${esc(role)}</div><div class="llm-body">${body}</div></div>`;
  const turns = [
    t.system !== undefined ? turn('system', `<div class="llm-text">${esc(t.system)}</div>`) : '',
    ...t.turns.map((x) => turn(x.role, x.parts.map(partHtml).join('') || '<span class="ui-meta">(empty)</span>')),
  ].join('');
  return `<div class="llm-meta">${meta.join('')}</div>${usage}${notes}<div class="llm-turns">${turns}</div>`;
}

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="grid-2">
                ${toolCard({
                  title: 'Payload',
                  titleId: 'llm-input-label',
                  actions: inputActions({ paste: 'llm-input', sample: 'llm-sample', clear: 'llm-clear' }),
                  body: '<textarea class="form-control font-mono" id="llm-input" rows="20" spellcheck="false" aria-labelledby="llm-input-label" placeholder="Paste a request or response body (OpenAI, Anthropic, Gemini), a messages array, or a raw stream (data: {...} lines)..."></textarea>',
                })}
                <div class="tool-card">
                    <div class="card-head">
                        <h3>Conversation</h3>
                        ${copyButton('llm-text')}
                    </div>
                    <textarea id="llm-text" class="sr-only" tabindex="-1" aria-hidden="true" readonly data-output></textarea>
                    <div id="llm-output" class="llm-view" aria-live="polite"></div>
                </div>
            </div>
        </div>`;
  const input = $f('llm-input');
  const out = $('llm-output');
  const text = $f('llm-text');
  const update = (): void => {
    const src = input.value;
    if (!src.trim()) {
      out.innerHTML = '<p class="ui-meta">Paste a payload or click Sample.</p>';
      text.value = '';
      setFieldInvalid('llm-input', false);
      resetStatus();
      return;
    }
    try {
      const t = inspect(src);
      out.innerHTML = transcriptHtml(t);
      text.value = transcriptText(t);
      setFieldInvalid('llm-input', false);
      const calls = t.turns.flatMap((x) => x.parts).filter((p) => p.kind === 'tool_call').length;
      reportOk(
        `${t.turns.length} turn(s)${calls ? `, ${calls} tool call(s)` : ''}`,
        `~${estimateTokens(text.value).toLocaleString()} tokens`,
      );
    } catch (e) {
      setFieldInvalid('llm-input', true);
      reportError(e);
    }
  };
  wireLiveTool({
    input,
    update,
    sample: { button: 'llm-sample', value: SAMPLE },
    clear: { button: 'llm-clear', fields: ['llm-input'] },
    initial: 'none',
  });
  update();
}
