import { copyButton, decodeBase64UrlText, emptyState, inputActions, wireLiveTool } from './common';
import { errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';

const b64urlDecode = (s: string): string => {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new Error('contains characters outside base64url');
  return decodeBase64UrlText(s);
};

const decodePart = (part: string, name: string): string => {
  let text: string;
  try {
    text = b64urlDecode(part);
  } catch (e) {
    throw new Error(`${name} is not valid base64url: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    throw new Error(`${name} decoded but is not valid JSON`);
  }
};

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-card">
                <div class="card-head">
                    <h3><label for="jwt-input">Encoded Token</label></h3>
                    ${inputActions({ paste: 'jwt-input', sample: 'jwt-sample', clear: 'jwt-clear' })}
                </div>
                <textarea class="form-control" id="jwt-input" rows="4" aria-label="Encoded JWT" placeholder="Paste JWT here (header.payload.signature)..."></textarea>
                <div class="ui-meta mt-2">Decoded locally, signature not verified</div>
            </div>
            <div class="tool-card" id="jwt-empty">${emptyState('Header, payload and signature appear here once a token is pasted.', 'jwt-sample')}</div>
            <div class="jwt-parts hidden" id="jwt-parts">
                <div class="jwt-part jwt-header">
                    <div class="card-head">
                        <h3>Header</h3>
                        ${copyButton('jwt-header-out')}
                    </div>
                    <pre id="jwt-header-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
                <div class="jwt-part jwt-payload">
                    <div class="card-head">
                        <h3>Payload</h3>
                        ${copyButton('jwt-payload-out')}
                    </div>
                    <pre id="jwt-payload-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
                <div class="jwt-part jwt-signature">
                    <div class="card-head">
                        <h3>Signature</h3>
                        ${copyButton('jwt-sig-out')}
                    </div>
                    <pre id="jwt-sig-out" class="result-box cursor-pointer" data-copy-self></pre>
                </div>
            </div>
        </div>
    `;

  const outs = ['jwt-header-out', 'jwt-payload-out', 'jwt-sig-out'];
  const showParts = (on: boolean): void => {
    $('jwt-parts').classList.toggle('hidden', !on);
    $('jwt-empty').classList.toggle('hidden', on);
  };
  const clearOuts = (): void => {
    outs.forEach((id) => {
      $f(id).textContent = '';
    });
    showParts(false);
  };

  const input = $f('jwt-input');
  const update = (): void => {
    const val = input.value.trim();
    if (!val) {
      clearOuts();
      setFieldInvalid('jwt-input', false);
      resetStatus();
      return;
    }
    try {
      const parts = val.split('.');
      const [h, p, sig] = parts;
      if (parts.length !== 3 || h === undefined || p === undefined || sig === undefined)
        throw new Error(`JWT must have 3 dot-separated parts (found ${parts.length})`);
      const header = decodePart(h, 'Header');
      const payload = decodePart(p, 'Payload');
      if (!/^[A-Za-z0-9_-]*$/.test(sig)) throw new Error('Signature is not valid base64url');
      $f('jwt-header-out').textContent = header;
      $f('jwt-payload-out').textContent = payload;
      $f('jwt-sig-out').textContent = sig;
      showParts(true);
      setFieldInvalid('jwt-input', false);
      reportOk('Token decoded', 'signature not verified');
    } catch (err) {
      clearOuts();
      setFieldInvalid('jwt-input', true, errorMessage(err));
      reportError(err);
    }
  };
  // Sample/Clear call update directly (wireLiveTool) instead of faking an input event.
  wireLiveTool({
    input,
    update,
    sample: {
      button: 'jwt-sample',
      value:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    },
    clear: { button: 'jwt-clear', fields: ['jwt-input'] },
    initial: 'none',
  });
}
