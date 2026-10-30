# CLAUDE.md

ForgeTools: an offline desktop app of developer utilities. Tauri v2 (Rust shell, system WebView) + Vite + TypeScript + Tailwind, with Monaco for the editor tools.

## Commands

```bash
npm run dev        # hot reload
npm run build      # frontend to out/renderer
npm run test:unit  # Vitest
npm run test:e2e   # builds the wdio test binary, then WebdriverIO e2e (tests/e2e/*.spec.mjs)
npm run dist       # tauri build (installers in src-tauri/target/release/bundle)
npm run lint:gate  # fails if the old desktop runtime is mentioned anywhere
npm run report:size  # binary/installer/frontend sizes (informational)
npm run test:smoke # release binary smoke test (after `tauri build`)
npm run demo       # re-record assets/demo.gif (after build:e2e; needs ffmpeg)
```

Always run `npm run test:unit`, `npm run test:e2e` and `cargo test --lib` (in src-tauri) before saying a change works.

## Layout

- `src-tauri/`: Rust shell. `src/lib.rs` (plugins, window events), `src/background.rs` (tray, close-to-tray, global shortcut, start at login). CSP and window config in `tauri.conf.json`; permissions in `capabilities/default.json`.
- `src/renderer/src/native.ts`: the only bridge to native code (Tauri APIs, official plugins, our Rust commands). Add new native calls here and grant the permission in the capability.
- `src/renderer/src/updates.ts`: the opt-in update check. `tools/lib/media.ts`: hash, X.509, QR, barcode, SVG (run in the webview).
- `src/renderer/src/app.ts`: shell (sidebar, command palette, welcome screen, theme, tool loading)
- `src/renderer/src/tools/index.ts`: **tool registry**. Every tool is declared here.
- `src/renderer/src/tools/ui/*.ts`: custom tool UIs, each lazily loaded and exporting `render(container)`
- `src/renderer/src/ui.ts` and `tools/ui/common.ts`: shared helpers (status bar, toasts, copy, input actions, `twoWay`, `emptyState`)
- `src/renderer/src/monaco.ts`: Monaco, bundled by Vite as ESM and loaded lazily (`loadMonaco()`/`getMonaco()` in `monacoEnv.ts`). Only the editor core, the real `editor.worker`, and the tokenizers the tools use are imported. Add a language there before using it as a tool's `language`.
- `DESIGN.md` and `PRODUCT.md`: the visual system and product principles. Follow them for any UI work.
- `tests/e2e/`: WebdriverIO specs in plain WDIO (`$`, `$$`, `browser.keys`, expect-webdriverio matchers). `helpers/tauriApp.mjs` does app-ready, error capture and Tauri window/clipboard calls; `helpers/input.mjs` holds the few documented workarounds for the embedded driver (`<select>` choice, trusted text input, focus on clicking non-focusable elements). Use native commands everywhere else.

## Adding a tool

1. Add an entry in `tools/index.ts` with `id`, `title`, `description`, `category` (one of `ToolCategory` in `src/types/tools.ts`), `icon` (a Material Icons name) and `keywords`.
2. Simple text-in/text-out tool: provide `format()` (and optionally `modes`); the shared Monaco editor UI is used.
3. Custom UI: set `useCustomUI: true`, `load: () => import('./ui/<id>')` and `primaryInput` (so the welcome "paste anything" box can hand off text).
4. The e2e smoke test opens every tool and fails on any page error, so check that it passes.

## Conventions

- **Offline only.** No network requests, telemetry or CDN assets. Fonts and icons are bundled. The single exception is the update check (`src/renderer/src/updates.ts`): one GET to `api.github.com/repos/tengfone/forgetools/releases/latest`, run only when the user clicks "Check for updates" or has turned on the opt-in daily check (off by default, skipped under `FORGE_E2E`). External links open in the OS browser through the allowlist in `EXTERNAL_LINKS` (`src/renderer/src/native.ts`, also scoped in the opener capability).
- **Settings** is one dialog with sections (Editor, Privacy, Background, About; `app/settingsDialog.ts`). Add new options as `.setting-row`s in an existing section, or add a section. Don't make one section scroll.
- Errors go to the shared status bar (`reportError` / `reportOk` / `resetStatus`), not `alert()` or console-only.
- No inline styles or inline event handlers in tool markup (a test enforces this). Use Tailwind/CSS classes and `addEventListener`.
- Prefix element ids with the tool's own prefix (e.g. `b64-plain`, `jwt-input`).
- Escape user content with `esc()` before putting it in `innerHTML`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `perf:`, `docs:`, `chore:`). Release notes are generated from them.

## Releases

CI (`.github/workflows/release.yml`) runs **only on `v*` tags**; pushing to `main` builds nothing.
Release with `npm run release:patch|minor|major` (requires a clean working tree). That bumps the version, tags it and pushes, then CI tests, builds Win/macOS/Linux and creates a **draft** release to publish by hand.
Don't tag or release unless asked.

## Gotchas

- Windows dev machine: use PowerShell syntax (no `&&` in older shells; use `;`).
- macOS builds are unsigned.
