import { $, $f, esc, reportOk, resetStatus, clearWithUndo } from '../../ui';
import { debounce, inputActions, copyButton } from './common';
import { RULES, redact, restore } from '../lib/redact';

const SAMPLE = `Hi support, our deploy fails since this morning.

Logs from 10.20.4.17:
  POST https://admin:S3cretPass@db.internal.example.com/migrate -> 401
  Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzQyIn0.dGhpc2lzbm90YXJlYWxzaWc
  OPENAI_API_KEY=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z

Contact me at dana.lee@acme.io or +65 9123 4567. Card on file 4111 1111 1111 1111.`;

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar flex-wrap">
                <span class="text-[12px] text-text-secondary" id="red-rules-label">Redact</span>
                <div class="chip-set" role="group" aria-labelledby="red-rules-label" id="red-rules">
                    ${RULES.map((r) => `<label class="check-chip"><input type="checkbox" value="${r.id}" checked>${esc(r.label)}</label>`).join('')}
                </div>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="red-input-label">Original</h3>
                        ${inputActions({ paste: 'red-input', sample: 'red-sample', clear: 'red-clear' })}
                    </div>
                    <textarea class="form-control font-mono" id="red-input" rows="12" spellcheck="false" aria-labelledby="red-input-label" placeholder="Paste logs, a support ticket or code before sending it to an AI chat..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="red-output-label">Redacted (safe to share)</h3>
                        ${copyButton('red-output')}
                    </div>
                    <textarea class="form-control font-mono" id="red-output" rows="12" aria-labelledby="red-output-label" readonly data-output spellcheck="false"></textarea>
                </div>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="red-reply-label">AI reply (with placeholders)</h3>
                        ${inputActions({ paste: 'red-reply' })}
                    </div>
                    <textarea class="form-control font-mono" id="red-reply" rows="6" spellcheck="false" aria-labelledby="red-reply-label" placeholder="Paste the model's answer here to put the real values back..."></textarea>
                </div>
                <div class="tool-card">
                    <div class="card-head">
                        <h3 id="red-restored-label">Restored</h3>
                        ${copyButton('red-restored')}
                    </div>
                    <textarea class="form-control font-mono" id="red-restored" rows="6" aria-labelledby="red-restored-label" readonly data-output spellcheck="false"></textarea>
                </div>
            </div>
            <p class="ui-meta">Pattern-based: it catches common formats but is not a guarantee. Review the result before sharing. The mapping stays in memory only.</p>
        </div>`;

  const input = $f('red-input');
  const reply = $f('red-reply');
  const rules = $('red-rules');
  let map: Record<string, string> = {};
  const update = (): void => {
    const enabled = new Set(Array.from(rules.querySelectorAll<HTMLInputElement>('input:checked')).map((c) => c.value));
    const r = redact(input.value, enabled);
    map = r.map;
    $f('red-output').value = r.text;
    $f('red-restored').value = reply.value ? restore(reply.value, map) : '';
    const total = Object.keys(r.map).length;
    if (!input.value) resetStatus();
    else
      reportOk(
        total ? `Redacted ${total} value(s)` : 'Nothing to redact',
        Object.entries(r.counts)
          .map(([k, n]) => `${k.toLowerCase()} ${n}`)
          .join(' · '),
      );
  };
  const live = debounce(update);
  input.addEventListener('input', live);
  reply.addEventListener('input', live);
  rules.addEventListener('change', update);
  $('red-sample').onclick = () => {
    input.value = SAMPLE;
    reply.value =
      'The 401 comes from <URL_CREDS_1> being rejected by the DB host. Rotate <API_KEY_1> too, since it was in the logs, and email <EMAIL_1> once done.';
    update();
  };
  $('red-clear').onclick = () => clearWithUndo(['red-input', 'red-reply'], update);
  resetStatus();
}
