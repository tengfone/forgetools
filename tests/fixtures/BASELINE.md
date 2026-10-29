# v0.2.1 baseline (Electron, commit cbcd8b9)

Captured on `main` before the Tauri port, on the Windows dev machine
(Windows x64, Node 26, `npm run build` + `electron-builder --win`).

## Size

| Artifact | Size |
|---|---|
| `ForgeTools-Portable-0.2.1.exe` (download) | 103,991,687 B (99.2 MiB / 104.0 MB) |
| `win-unpacked/` (installed footprint) | 335.7 MiB |
| Published v0.2.1 downloads (GitHub release) | Win 103.9 MB, mac arm64 119.3 MB, mac x64 123.1 MB, AppImage 100.8 MB |

## Runtime (`node scripts/measure.cjs dist/win-unpacked/ForgeTools.exe 5`, median of 5)

Memory is the whole process tree (4 processes: main, GPU, utility, renderer).

| Metric | Value |
|---|---|
| Cold start to visible window | 782 ms |
| Cold start to tools rendered (`#toolsNav [data-tool-id]`) | 844 ms |
| Idle working set / private bytes (5 s after ready) | 335.0 MB / 184.8 MB |
| After opening 5 tools (json, base64, hash, jwt, textDiff) | 389.8 MB / 236.3 MB |

macOS and Linux were not measured (no machines available); the published download sizes above stand in for them.

## Tests on v0.2.1

- Vitest: 8 files, 114 tests passed.
- Playwright e2e: 81 passed (6 spec files).

## Golden fixtures

`golden-v0.2.1.json` was captured from the running v0.2.1 app through its own bridge
(`tests/fixtures/capture-v0.2.1.cjs`): MD5/SHA-1/SHA-256/SHA-512 of 4 inputs, X.509 decode of the
bundled sample cert plus 3 extra certs in `certs/` (RSA-2048 with a long serial and 7-RDN subject,
EC P-384 with an escaped comma in O, Ed25519), QR data URLs, barcode SVGs (EAN-13, UPC, CODE39,
CODE128) and SVGO output for 2 inputs. Parity unit tests compare the Tauri implementation against it.
