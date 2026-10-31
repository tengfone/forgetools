import { $, $f, reportError, reportOk, resetStatus, toolEpoch } from '../../ui';
import { copyButton, icon, select, jsonPretty } from './common';
import { generateKeyPair, type KeyType } from '../lib/crypto';

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            <div class="tool-toolbar">
                ${select(
                  'kp-type',
                  'Type',
                  [
                    ['ed25519', 'Ed25519'],
                    ['ec-p256', 'EC P-256'],
                    ['ec-p384', 'EC P-384'],
                    ['rsa-2048', 'RSA 2048'],
                    ['rsa-3072', 'RSA 3072'],
                    ['rsa-4096', 'RSA 4096'],
                  ],
                  'ed25519',
                )}
                ${select(
                  'kp-fmt',
                  'Format',
                  [
                    ['pem', 'PEM + OpenSSH'],
                    ['jwk', 'JWK'],
                  ],
                  'pem',
                )}
                <label class="flex items-center gap-2 text-[12px]">
                    <span class="text-text-secondary whitespace-nowrap" id="kp-input-label">SSH comment</span>
                    <input type="text" class="form-control py-1" id="kp-input" aria-labelledby="kp-input-label" placeholder="you@host" spellcheck="false">
                </label>
                <button type="button" class="btn-primary" id="kp-generate">${icon('key')} Generate</button>
            </div>
            <div class="grid-2">
                <div class="tool-card">
                    <div class="card-head"><h3 id="kp-public-label">Public key</h3><div class="flex gap-2"><button type="button" class="btn-icon btn-sm" id="kp-sample">${icon('science')} Sample</button>${copyButton('kp-public')}</div></div>
                    <textarea class="form-control font-mono" id="kp-public" rows="8" readonly data-output aria-labelledby="kp-public-label" placeholder="Press Generate"></textarea>
                    <div id="kp-ssh-wrap">
                        <div class="card-head mt-3"><h3 id="kp-ssh-label">OpenSSH (authorized_keys)</h3>${copyButton('kp-ssh')}</div>
                        <textarea class="form-control font-mono" id="kp-ssh" rows="3" readonly aria-labelledby="kp-ssh-label"></textarea>
                    </div>
                </div>
                <div class="tool-card">
                    <div class="card-head"><h3 id="kp-private-label">Private key <span class="secret-tag"><i class="material-icons" aria-hidden="true">lock</i>Secret: don't share</span></h3>${copyButton('kp-private')}</div>
                    <textarea class="form-control font-mono secret-blur" id="kp-private" rows="14" readonly aria-labelledby="kp-private-label" aria-describedby="kp-private-hint"></textarea>
                    <p class="ui-hint mt-1" id="kp-private-hint">Blurred until you hover or focus it. Copy works either way.</p>
                </div>
            </div>
        </div>`;

  const btn = $<HTMLButtonElement>('kp-generate');
  let sshBase = ''; // "ssh-xxx BASE64" without the comment
  const withComment = (): string => {
    const c = $f('kp-input').value.trim();
    return sshBase ? (c ? `${sshBase} ${c}` : sshBase) : '';
  };
  const syncFormat = (): void => {
    $('kp-ssh-wrap').hidden = $f('kp-fmt').value === 'jwk';
  };

  let seq = 0;
  const idle = (): void => {
    btn.disabled = false;
    $<HTMLButtonElement>('kp-sample').disabled = false;
    btn.innerHTML = `${icon('key')} Generate`;
  };
  const generate = async (): Promise<void> => {
    const mine = ++seq;
    const epoch = toolEpoch;
    const live = (): boolean => mine === seq && epoch === toolEpoch && btn.isConnected;
    const type = $f('kp-type').value as KeyType;
    btn.disabled = true;
    $<HTMLButtonElement>('kp-sample').disabled = true;
    btn.innerHTML = `${icon('hourglass_top')} Generating…`;
    reportOk(type.startsWith('rsa') ? 'Generating RSA key (can take a few seconds)…' : 'Generating…');
    try {
      const kp = await generateKeyPair(type, 'x');
      if (!live()) return;
      const jwk = $f('kp-fmt').value === 'jwk';
      sshBase = kp.ssh ? kp.ssh.split(' ').slice(0, 2).join(' ') : '';
      $f('kp-public').value = jwk ? jsonPretty(kp.publicJwk) : kp.publicPem;
      $f('kp-private').value = jwk ? jsonPretty(kp.privateJwk) : kp.privatePem;
      $f('kp-ssh').value = withComment();
      syncFormat();
      reportOk('Generated locally; never leaves this machine');
    } catch (e) {
      if (live()) reportError(e);
    } finally {
      if (live()) idle();
    }
  };
  // The comment only changes the SSH line: never regenerate the key for it
  $('kp-input').addEventListener('input', () => {
    $f('kp-ssh').value = withComment();
  });
  // Changing type/format invalidates the shown key; the user decides when to generate
  for (const id of ['kp-type', 'kp-fmt'])
    $(id).addEventListener('change', () => {
      seq++; // drop any in-flight generation of the old type/format
      idle();
      sshBase = '';
      for (const o of ['kp-public', 'kp-private', 'kp-ssh']) $f(o).value = '';
      syncFormat();
      resetStatus();
    });
  btn.onclick = () => void generate();
  $('kp-sample').onclick = () => {
    $f('kp-type').value = 'ed25519';
    $f('kp-fmt').value = 'pem';
    $f('kp-input').value = 'me@laptop';
    void generate();
  };
  syncFormat();
  resetStatus();
}
