import { errorMessage, $, $f, reportError, reportOk, resetStatus, setFieldInvalid } from '../../ui';
import { emptyState, inputActions, readonlyField, wireLiveTool, toolCard } from './common';

/** Self-signed sample (CN=forgetools.example, EC P-256, 2025-2035). */
const SAMPLE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  ...'MIIBZjCCAQygAwIBAgIIEcBl3aNnzGMwCgYIKoZIzj0EAwIwOTEaMBgGA1UEChMRRm9yZ2VUb29scyBTYW1wbGUxGzAZBgNVBAMTEmZvcmdldG9vbHMuZXhhbXBsZTAeFw0yNTAxMDEwMDAwMDBaFw0zNTAxMDEwMDAwMDBaMDkxGjAYBgNVBAoTEUZvcmdlVG9vbHMgU2FtcGxlMRswGQYDVQQDExJmb3JnZXRvb2xzLmV4YW1wbGUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQMXZBm9vug99sUWouBXZ7COPT6TBRcm4jp9fL5v1O9UQwIWAVQ8Ej4lu/vm8b/i5LpS3UNmw5uXW4i3J6OAmpuMAoGCCqGSM49BAMCA0gAMEUCIQDiy7FOmMV/nRLm/gY6KIekXla7ooTHCGiKilb9I+HiJQIgWWPMBd1DmfKrnwgaLQWjaj+NRjocp3e7KHcHCtIc72s='.match(
    /.{1,64}/g,
  )!,
  '-----END CERTIFICATE-----',
].join('\n');

export function render(container: HTMLElement): void {
  container.innerHTML = `
        <div class="custom-interface">
            ${toolCard({ title: 'PEM Certificate', titleId: 'cert-input-label', actions: inputActions({ paste: 'cert-input', sample: 'cert-sample', clear: 'cert-clear' }), body: '<textarea class="form-control" id="cert-input" rows="5" aria-labelledby="cert-input-label" placeholder="-----BEGIN CERTIFICATE-----..."></textarea>' })}
            <div class="tool-card" id="cert-empty">${emptyState('Subject, issuer, validity and fingerprint appear here once a PEM is pasted.', 'cert-sample')}</div>
            <div class="tool-card hidden" id="cert-details">
                <h3>Certificate Details</h3>
                <div class="result-grid !grid-cols-1">
                    ${readonlyField('cert-subject', 'Subject')}
                    ${readonlyField('cert-issuer', 'Issuer')}
                    <div class="grid-2">
                        ${readonlyField('cert-valid-from', 'Valid From')}
                        ${readonlyField('cert-valid-to', 'Valid To')}
                    </div>
                    ${readonlyField('cert-serial', 'Serial Number')}
                    ${readonlyField('cert-fingerprint', 'Fingerprint (SHA-256)')}
                </div>
            </div>
        </div>
    `;
  const input = $f('cert-input');
  const details = $('cert-details');

  let seq = 0;
  const update = async (): Promise<void> => {
    const mine = ++seq;
    const val = input.value.trim();
    if (!val) {
      details.classList.add('hidden');
      $('cert-empty').classList.remove('hidden');
      setFieldInvalid('cert-input', false);
      resetStatus();
      return;
    }
    try {
      if (!val.includes('-----BEGIN CERTIFICATE-----'))
        throw new Error('PEM must start with -----BEGIN CERTIFICATE-----');
      const decoded = await (await import('../lib/media')).decodeX509(val);
      if (mine !== seq) return;
      if (!decoded) throw new Error('Could not decode the certificate body');
      $f('cert-subject').value = decoded.subject || '';
      $f('cert-issuer').value = decoded.issuer || '';
      $f('cert-valid-from').value = decoded.notBefore || '';
      $f('cert-valid-to').value = decoded.notAfter || '';
      $f('cert-serial').value = decoded.serialNumber || '';
      $f('cert-fingerprint').value = decoded.fingerprint?.sha256 || '';
      details.classList.remove('hidden');
      $('cert-empty').classList.add('hidden');
      setFieldInvalid('cert-input', false);
      reportOk('Certificate decoded');
    } catch (e) {
      if (mine !== seq) return;
      details.classList.add('hidden');
      $('cert-empty').classList.remove('hidden');
      setFieldInvalid('cert-input', true, errorMessage(e));
      reportError(e);
    }
  };

  wireLiveTool({
    input,
    update,
    sample: { button: 'cert-sample', value: SAMPLE_PEM },
    clear: { button: 'cert-clear', fields: ['cert-input'] },
  });
}
