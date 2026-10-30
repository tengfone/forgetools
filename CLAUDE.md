# CLAUDE.md

ForgeTools: an offline desktop app of developer utilities. Tauri v2 (Rust shell, system WebView) + Vite + TypeScript + Tailwind, with Monaco for the editor tools. App identifier `com.tengfone.forgetools`.

## Commands

```bash
npm run dev            # tauri dev with hot reload
npm run build          # frontend only, to out/
npm run typecheck      # tsc, no emit (web, node, tests)
npm run lint           # ESLint (typescript-eslint, type-aware)
npm run format         # prettier --write
npm run format:check   # prettier --check (CI)
npm run lint:gate      # fails if the old desktop runtime is mentioned in any tracked file
npm run test:unit      # Vitest (tests/unit)
npm run test:e2e       # builds the wdio test binary (build:e2e), then runs the WebdriverIO specs
npm run test:e2e:run   # runs the specs against an existing build:e2e binary (no rebuild)
npm run dist           # tauri build (bundles in src-tauri/target/release/bundle)
npm run test:smoke     # release-binary smoke test (after `npx tauri build --no-bundle`)
npm run report:size    # binary/bundle/frontend sizes (informational)
npm run demo           # re-record assets/demo.gif (after build:e2e; needs ffmpeg)
```

Before saying a change works, run `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e` and `cargo test --lib` (in `src-tauri`).

Windows-only dev probe (WebView2 CDP + PowerShell/taskkill; not run in CI): `node scripts/measure.cjs <exe> [runs]` measures cold start, idle memory and memory after 5 tools (the numbers in `tests/fixtures/BASELINE.md` and the README).

## Layout

- `src-tauri/`: Rust shell. `src/lib.rs` (plugins, logging, window events), `src/background.rs` (tray, close-to-tray, global shortcut, start at login). CSP and window config in `tauri.conf.json`; permissions in `capabilities/default.json`.
- `src/native.ts`: the only bridge to native code (Tauri APIs, official plugins, our Rust commands). Add new native calls here and grant the permission in the capability.
- `src/links.ts`: `EXTERNAL_LINKS`, the only URLs the app may open in the browser (dependency-free; also scoped in the opener capability).
- `src/updates.ts`: the opt-in update check. `tools/lib/media.ts`: hash, X.509, QR, barcode, SVG (run in the webview).
- `src/app.ts`: shell entry; wires up the `app/*` modules:
  - `app/state.ts` shared shell state; `app/windowShell.ts` reveal-after-first-paint, caption buttons, go-home event
  - `app/sidebar.ts`, `app/palette.ts`, `app/home.ts` (welcome / paste-anything), `app/pins.ts`, `app/session.ts`, `app/history.ts`
  - `app/toolView.ts` (tool loading), `app/editors.ts` (Monaco editor tools), `app/help.ts`, `app/theme.ts`, `app/cache.ts`
  - `app/settingsDialog.ts`, `app/backgroundSettings.ts`, `app/about.ts` (Settings sections)
- `src/tools/index.ts`: **tool registry**. Every tool is declared here.
- `src/tools/ui/*.ts`: custom tool UIs, each lazily loaded and exporting `render(container)`.
- `src/ui.ts` and `tools/ui/common.ts`: shared helpers (status bar, toasts, copy, input actions, `twoWay`, `emptyState`).
- `src/monaco.ts`: Monaco (0.57), bundled by Vite as ESM and loaded lazily (`loadMonaco()`/`getMonaco()` in `monacoEnv.ts`). Only the editor core, curated editor features, the `editor.worker` and the tokenizers the tools use are imported; there is no AMD loader, `vs/` folder or postinstall step. Add a language in `monaco.ts` before using it as a tool's `language`.
- `DESIGN.md` and `PRODUCT.md`: the visual system and product principles. Follow them for any UI work.

## Testing

- **Unit** (`tests/unit`, Vitest): pure tool logic, plus parity tests against `tests/fixtures/golden-v0.2.1.json` (captured from the v0.2.1 app, which no longer builds; see `tests/fixtures/BASELINE.md`).
- **E2E** (`tests/e2e/*.spec.mjs`): native WebdriverIO (`$`, `$$`, `browser.keys`, expect-webdriverio matchers) against a debug build with an embedded WebDriver server (`build:e2e`; never in release builds, `test:smoke` checks that). `helpers/tauriApp.mjs` does app-ready, error capture and Tauri window/clipboard calls; `helpers/input.mjs` holds the few documented workarounds for the embedded driver (`<select>` choice, trusted text input, focus on clicking non-focusable elements). Use native commands everywhere else. Tests do not resize the window. The E2E build runs under its own identifier `com.tengfone.forgetools.e2e` (`tauri.wdio.conf.json`), so its WebView storage and app data are separate from the installed app; `freshStart` refuses to clear storage under any other identifier. Failure logs and screenshots go to `test-results/`.
- **Manual** release checklist (tray, global shortcut, start at login, Gatekeeper/SmartScreen, per-OS): `tests/MANUAL_CHECKLIST.md`.

## Adding a tool

1. Add an entry in `tools/index.ts` with `id`, `title`, `description`, `category` (one of `ToolCategory` in `src/types/tools.ts`), `icon` (a Material Icons name) and `keywords`.
2. Simple text-in/text-out tool: provide `format()` (and optionally `modes`); the shared Monaco editor UI is used.
3. Custom UI: set `useCustomUI: true`, `load: () => import('./ui/<id>')` and `primaryInput` (so the welcome "paste anything" box can hand off text).
4. The e2e smoke test opens every tool and fails on any page error, so check that it passes.

## Conventions

- **Offline only.** No network requests, telemetry or CDN assets. Fonts and icons are bundled. The single exception is the update check (`src/updates.ts`): one GET to `api.github.com/repos/tengfone/forgetools/releases/latest`, run only when the user clicks "Check for updates" or has turned on the opt-in daily check (off by default, skipped under `FORGE_E2E`). External links open in the OS browser through `EXTERNAL_LINKS` (`links.ts`).
- **CSP** is strict (`tauri.conf.json`): no inline scripts, no `blob:` workers, `wasm-unsafe-eval` only. Don't loosen it. The E2E suite fails on CSP violations (`newtools.spec`) and checks that the regex and diff workers run (`tools.spec`).
- **Settings** is one dialog with sections (Editor, Privacy, Background, About; `app/settingsDialog.ts`). Add new options as `.setting-row`s in an existing section, or add a section. Don't make one section scroll.
- Errors go to the shared status bar (`reportError` / `reportOk` / `resetStatus`), not `alert()` or console-only.
- No inline styles or inline event handlers in tool markup (a test enforces this). Use Tailwind/CSS classes and `addEventListener`.
- Prefix element ids with the tool's own prefix (e.g. `b64-plain`, `jwt-input`).
- Escape user content with `esc()` before putting it in `innerHTML`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`). Release notes are generated from them.

## Releases

CI (`.github/workflows/release.yml`, workflow "CI") runs the test job (lint gate, typecheck, format check, audit, unit, Rust, e2e, release smoke) on every push to `main` and on PRs. A `v*` tag additionally builds Win/macOS/Linux and creates a **draft** GitHub release.

There is no changelog file: CI writes the release notes from the `feat:`/`fix:`/`perf:`/`docs:` commit subjects since the previous tag, so commit messages are the changelog.

1. `npm run release:patch|minor|major` (clean working tree). `npm version` runs `scripts/sync-version.cjs`, which copies the version into `src-tauri/Cargo.toml`/`Cargo.lock` in the same commit (`node scripts/sync-version.cjs --dry-run [version]` previews). CI fails if the tag, `package.json` and `Cargo.toml` disagree.
2. Review the draft release, then publish it with "Set as the latest release" ticked. Only the 10 newest published releases are kept (drafts are never pruned; tags always stay).

Don't tag or release unless asked.

## Gotchas

- Windows dev machine: use PowerShell syntax (no `&&` in older shells; use `;`).
- macOS and Windows builds are unsigned.
- Logs (tauri-plugin-log, `LogDir` target): Windows `%LOCALAPPDATA%\com.tengfone.forgetools\logs`, macOS `~/Library/Logs/com.tengfone.forgetools`, Linux `~/.local/share/com.tengfone.forgetools/logs`.
