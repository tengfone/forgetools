// PROVENANCE ONLY. Does not run on this branch or any later commit: it needs the v0.2.1
// (pre-Tauri) app and its test dependencies, which no longer exist here.
// It captured golden outputs from the v0.2.1 build (commit cbcd8b9, tag v0.2.1) by calling
// the app's own bridge in the running window. To reproduce, check out that commit, then:
//   npm ci && npm run build && node tests/fixtures/capture-v0.2.1.cjs
// The parity unit tests read the committed result, tests/fixtures/golden-v0.2.1.json.
const { _electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');
const SAMPLE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  ...'MIIBZjCCAQygAwIBAgIIEcBl3aNnzGMwCgYIKoZIzj0EAwIwOTEaMBgGA1UEChMRRm9yZ2VUb29scyBTYW1wbGUxGzAZBgNVBAMTEmZvcmdldG9vbHMuZXhhbXBsZTAeFw0yNTAxMDEwMDAwMDBaFw0zNTAxMDEwMDAwMDBaMDkxGjAYBgNVBAoTEUZvcmdlVG9vbHMgU2FtcGxlMRswGQYDVQQDExJmb3JnZXRvb2xzLmV4YW1wbGUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQMXZBm9vug99sUWouBXZ7COPT6TBRcm4jp9fL5v1O9UQwIWAVQ8Ej4lu/vm8b/i5LpS3UNmw5uXW4i3J6OAmpuMAoGCCqGSM49BAMCA0gAMEUCIQDiy7FOmMV/nRLm/gY6KIekXla7ooTHCGiKilb9I+HiJQIgWWPMBd1DmfKrnwgaLQWjaj+NRjocp3e7KHcHCtIc72s='.match(
    /.{1,64}/g,
  ),
  '-----END CERTIFICATE-----',
].join('\n');

const certs = { sample: SAMPLE_PEM };
for (const f of fs
  .readdirSync(certDir)
  .filter((f) => f.endsWith('.pem'))
  .sort()) {
  certs[f.replace(/\.pem$/, '')] = fs.readFileSync(path.join(certDir, f), 'utf8').trim();
}

const hashInputs = ['The quick brown fox jumps over the lazy dog', 'héllo wörld 🔥\nline2\r\n', ' ', 'a'.repeat(1000)];
const qrInputs = [
  ['https://example.com', { width: 256, margin: 2 }],
  ['https://example.com', { width: 512, margin: 2 }],
  ['Hello, 世界! ünïcödé', { width: 128, margin: 2 }],
];
const barcodeInputs = [
  ['123456789012', 'EAN13'],
  ['1234567890128', 'EAN13'],
  ['12345678901', 'UPC'],
  ['FORGE-123', 'CODE39'],
  ['ForgeTools 128', 'CODE128'],
];
const svgInputs = [
  `<?xml version="1.0" encoding="UTF-8"?>
<!-- Sample icon -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <g>
        <circle cx="12.000" cy="12.000" r="10.000" fill="#72cd42" />
    </g>
</svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <defs><linearGradient id="g1"><stop offset="0%" stop-color="#ff0000"/><stop offset="100%" stop-color="#0000ff"/></linearGradient></defs>
  <title>Test</title>
  <rect x="10.00000" y="10.0000" width="80" height="80" fill="url(#g1)" style="stroke: #000000; stroke-width: 2px"/>
  <path d="M 10 10 L 20 20 L 30 10 Z" fill="none" stroke="black"/>
  <g transform="translate(0,0)"><g><text x="50" y="50">Hi &amp; bye</text></g></g>
</svg>`,
];

(async () => {
  const app = await _electron.launch({
    args: [path.join(__dirname, '../../out/main/main.js')],
    env: { ...process.env, FORGE_E2E: '1' },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('#toolsNav [data-tool-id]');
  const out = await win.evaluate(
    async ({ certs, hashInputs, qrInputs, barcodeInputs, svgInputs }) => {
      const api = globalThis.electronAPI; // runs in the v0.2.1 Electron page
      const res = { hash: [], x509: {}, qrcode: [], barcode: [], svg: [] };
      for (const text of hashInputs) {
        res.hash.push({
          text,
          md5: await api.crypto.md5(text),
          sha1: await api.crypto.sha1(text),
          sha256: await api.crypto.sha256(text),
          sha512: await api.crypto.sha512(text),
        });
      }
      for (const [name, pem] of Object.entries(certs)) res.x509[name] = { pem, decoded: await api.x509.decode(pem) };
      for (const [text, options] of qrInputs)
        res.qrcode.push({ text, options, dataUrl: await api.qrcode.generate(text, options) });
      for (const [text, format] of barcodeInputs) {
        const options = { format, width: 2, height: 100, displayValue: true };
        res.barcode.push({ text, options, svg: await api.barcode.generate(text, options) });
      }
      for (const input of svgInputs) res.svg.push({ input, output: await api.svg.optimize(input) });
      return res;
    },
    { certs, hashInputs, qrInputs, barcodeInputs, svgInputs },
  );
  await app.close();
  const file = path.join(__dirname, 'golden-v0.2.1.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ source: 'ForgeTools v0.2.1 (cbcd8b9), captured through the running app', ...out }, null, 2) + '\n',
  );
  console.log('wrote', file);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
