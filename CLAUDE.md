# CLAUDE.md

ForgeTools: an offline desktop app of developer utilities. Electron + electron-vite + TypeScript + Tailwind, with Monaco for the editor tools.

## Commands

```bash
npm run dev        # hot reload
npm run build      # build to out/ (required before tests)
npm test           # Playwright e2e against out/main/main.js
npm run dist       # package into dist/
node scripts/record-demo.js   # re-record assets/demo.gif (needs build + ffmpeg)
```

Always run `npm run build && npm test` before saying a change works.

## Layout

- `src/main/main.ts`: Electron main process (window, CSP, IPC handlers for QR/barcode decoding etc.)
- `src/preload/index.ts`: the only bridge to the renderer (`window.electronAPI`). `contextIsolation: true`, `nodeIntegration: false`.
- `src/types/ipc.ts`: IPC channel names. Add new channels here, then wire them in main, preload and the `ElectronAPI` type.
- `src/renderer/src/app.ts`: shell (sidebar, command palette, welcome screen, theme, tool loading)
- `src/renderer/src/tools/index.ts`: **tool registry**. Every tool is declared here.
- `src/renderer/src/tools/ui/*.ts`: custom tool UIs, each lazily loaded and exporting `render(container)`
- `src/renderer/src/ui.ts` and `tools/ui/common.ts`: shared helpers (status bar, toasts, copy, input actions, `twoWay`, `emptyState`)
- `src/renderer/vs/`: Monaco files **generated** by `scripts/setup-monaco.js` on postinstall. Don't edit them by hand.
- `DESIGN.md` and `PRODUCT.md`: the visual system and product principles. Follow them for any UI work.

## Adding a tool

1. Add an entry in `tools/index.ts` with `id`, `title`, `description`, `category` (one of `ToolCategory` in `src/types/tools.ts`), `icon` (a Material Icons name) and `keywords`.
2. Simple text-in/text-out tool: provide `format()` (and optionally `modes`); the shared Monaco editor UI is used.
3. Custom UI: set `useCustomUI: true`, `load: () => import('./ui/<id>')` and `primaryInput` (so the welcome "paste anything" box can hand off text).
4. The e2e smoke test opens every tool and fails on any page error, so check that it passes.

## Conventions

- **Offline only.** No network requests, telemetry or CDN assets. Fonts and icons are bundled. The single exception is the update check (`src/main/updates.ts`): one GET to `api.github.com/repos/tengfone/forgetools/releases/latest`, run from the main process only when the user clicks "Check for updates" or has turned on the opt-in daily check (off by default, skipped under `FORGE_E2E`). External links open in the OS browser through the allowlist in `EXTERNAL_LINKS` (`src/types/ipc.ts`).
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
- Playwright `recordVideo` hangs with this Electron app. `record-demo.js` uses a CDP screencast instead.
- macOS builds are unsigned.
