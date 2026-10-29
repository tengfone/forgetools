---
name: ForgeTools
description: Offline developer utilities. Forge, instrument dark � precise, quiet, exact.
colors:
  canvas-dark: "#0b0b0c"
  panel-dark: "#111113"
  float-dark: "#141416"
  control-dark: "#17171a"
  control-hover-dark: "#1c1c20"
  hairline-dark: "#1f1f22"
  control-border-dark: "#26262b"
  ink-dark: "#ededef"
  ink-secondary-dark: "#a0a0a8"
  ink-label-dark: "#8a8a92"
  canvas: "#f4f4f2"
  panel: "#ffffff"
  control: "#f7f7f5"
  hairline: "#e4e4e0"
  ink: "#18181b"
  ink-secondary: "#52525b"
  ink-label: "#6b6b73"
  accent: "#ff8a3d"
  accent-hover: "#ff9d5c"
  accent-light-line: "#e5670f"
  accent-text-light: "#a84a06"
  on-accent: "#1a0e05"
  success-dark: "#3ddc84"
  error-dark: "#ff6b6b"
  success-text-light: "#1a7f45"
  error-text-light: "#b4434a"
  part-header-dark: "#f08a8a"
  part-payload-dark: "#93bf9e"
  part-signature-dark: "#8fadd6"
  part-header: "#b4434a"
  part-payload: "#3d7650"
  part-signature: "#3a5d8c"
  barcode-paper: "#ffffff"
  barcode-hint: "#6e6e73"
  sample-green: "#72cd42"
typography:
  wordmark:
    fontFamily: "'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas, monospace"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
  tool-title:
    fontFamily: "Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  section-label:
    fontFamily: "'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  code:
    fontFamily: "'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  icon:
    fontFamily: Material Icons
    fontSize: "16px"
    note: "glyph sizes: 16px default (nav, palette, buttons), 14px .icon-sm / pins / titlebar, 18px emphasis; glyphs are not text and sit outside the type ramp"
  figure:
    fontFamily: "'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas, monospace"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.1
rounded:
  hairline: "1px"
  kbd: "4px"
  control: "6px"
  float: "8px"
  panel: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  titlebar: "36px"
  toolbar: "44px"
  status: "24px"
  sidebar: "232px"
components:
  button:
    backgroundColor: "{colors.control-dark}"
    textColor: "{colors.ink-secondary-dark}"
    rounded: "{rounded.control}"
    height: "28px"
  button-sm:
    height: "26px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
  input-field:
    backgroundColor: "{colors.control-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.code}"
    rounded: "{rounded.control}"
  tool-panel:
    backgroundColor: "{colors.panel-dark}"
    rounded: "{rounded.panel}"
  command-palette:
    backgroundColor: "{colors.float-dark}"
    rounded: "{rounded.panel}"
    width: "640px"
  toast:
    backgroundColor: "{colors.float-dark}"
    rounded: "{rounded.float}"
---

# Design System: ForgeTools

## Overview

**Creative North Star: "Forge � instrument dark"**

A precision instrument, not a native-app clone. Dark first (Linear/Raycast lineage): a near-black canvas, one inset tool panel, hairline structure, mono for everything measured, and a single molten-amber accent that only marks where you are and what you will do next. Light mode is a paired, equally careful theme selected by the System/Light/Dark switch (`.dark` class on `<html>`).

## Colors

All colour flows through CSS custom properties in `src/renderer/src/main.css` (`--bg-*`, `--text-*`, `--accent-*`, `--border-color`, `--field-border`, `--success-*`, `--error-*`, `--part-*`). Monaco themes are rebuilt from the same variables (`--bg-panel` background, `--selection` amber at 25%).

- **Canvas ? panel ? control**: `#0b0b0c` ? `#111113` (1px `#1f1f22`, 10px radius, 8px inset from the window) ? `#17171a` (border `#26262b`, hover `#1c1c20`).
- **Ink**: primary `#ededef`, secondary `#a0a0a8`, label `#8a8a92` (the brief's `#6e6e76` measured 3.7:1 and was raised).
- **The One Amber Rule**: `#ff8a3d` appears only on the focus ring, the active nav/palette marker, text selection, the wordmark dot and the one primary action (dark text `#1a0e05`). In light mode, amber used as text is `#a84a06`.
- **Status**: success `#3ddc84` / error `#ff6b6b` in dark; text-safe `#1a7f45` / `#c62828` in light.

### Measured contrast (WCAG)
| Pair | Ratio |
|---|---|
| ink #ededef on panel #111113 | 16.1 |
| secondary #a0a0a8 on panel / control | 7.3 / 6.9 |
| label #8a8a92 on panel / control | 5.5 / 5.2 |
| on-accent #1a0e05 on #ff8a3d / #ff9d5c | 8.1 / 9.2 |
| success #3ddc84 / error #ff6b6b on panel | 10.6 / 6.8 |
| light ink #18181b on #fff | 17.7 |
| light secondary #52525b on #fff / canvas | 7.7 / 7.0 |
| light label #6b6b73 on canvas / control | 4.8 / 4.9 |
| light accent text #a84a06 on #fff / canvas | 5.8 / 5.2 |
| light success #1a7f45 / error #c62828 on #fff | 5.0 / 5.6 |

## Typography

UI: `Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui` (no bundled webfont; offline promise). Mono: `'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas`. Base 13px / 1.5. Tool title 15px/600 inside the breadcrumb. Section labels, values, tags, kbd, status bar, palette groups and help foot are mono; labels are 11px uppercase with 0.06em tracking. No large display headers; the welcome wordmark (mono 20px) is the largest text.

## Layout

40px canvas-coloured titlebar (`-webkit-app-region: drag`; buttons/selects/inputs `no-drag`). The `forge` wordmark is a button (aria-label "Home"). Platform class on `<html>`: `platform-mac` reserves 78px left for traffic lights (`hiddenInset`); `platform-win`/`platform-linux` use `titleBarStyle: hidden` + `titleBarOverlay` (dark `#0b0b0c`/`#a1a1aa`, light `#f4f4f2`/`#52525b`, 40px) and reserve right padding from `env(titlebar-area-*)` (fallback 140px). The renderer syncs overlay colours via `electronAPI.window.setTitleBarTheme` on every theme change, including system changes. A hidden role-based menu keeps Ctrl+C/V/Z, reload and DevTools accelerators. Then a 56px **rail** (toolbar, arrow keys, roving tabindex): Home, Search (palette), hairline, pinned tool icons, recent tool icons, and an "All tools" toggle at the bottom. Rail buttons are 36px, 8px radius, with a title tooltip and aria-label; active = tint + 2px amber marker at the rail edge. "All tools" docks the 240px categorized list (`#toolsNav`, collapsible groups, persisted as `nav-expanded`) beside the rail; below 900px the same list opens as an overlay drawer beside the rail. Inset tool panel with a 44px header toolbar, then the 24px mono status bar.

Inside tools, sections are flat (`.tool-card` = 20px�16px padding, 1px hairline between sections); side-by-side sections (`.grid-2`) are split by a vertical hairline. Editor tools split input/output panes with a 1px border and mono pane labels.

## Elevation

Flat. Only floating layers (command palette, help popover, settings dialog, toasts, drawer) get `--float-shadow` (offset, soft) plus a 1px border. Scrim `rgba(0,0,0,.5)`, no blur.

## Components

- **Nav row**: 28px, 6px radius, 16px secondary-ink icon; active = primary ink + tint + 2px amber marker inset at the left (nav and palette only � never on cards).
- **Buttons**: secondary by default (control fill + border), `.btn-ghost` for toolbar actions, `.btn-sm` 26px, `.btn-primary` amber.
- **Range sliders** use neutral ink (`--text-secondary`); checkboxes keep amber (selection). Placeholders use `--text-tertiary` (4.9:1 light / 5.2:1 dark on `--bg-input`). Radii are on the 4/6/8/10 scale (scrollbar thumbs and colour swatches 6px).
- **Inputs**: control fill, 1px control border, 6px radius, mono for data; focus = amber border + 2px amber/25% ring. Read-only fields drop to transparent.
- **Command palette**: 640px at 18vh, 48px borderless search with a hairline, results grouped (Recent, then categories) under mono labels, 36px rows `icon � title � Category`, footer kbd hints.
- **Home (tool browser)**: wordmark, purpose line, palette button, Paste anything; then Pinned and Recent chip rows (28px, hairline-bordered); then "All tools" with a live filter (`scoreTool`) and every tool as a flat tile (icon, title, one-line description, hover pin) grouped by `CATEGORY_ORDER` in an auto-fill grid (min 260px). Tiles are not cards: no border or fill until hover. Reached from the logo, the rail Home button, or the palette command "Go home"; going home snapshots the open tool's session and deselects it.
- **Kbd**: mono 11px, 1px border, 4px radius, control fill.
- **JWT parts**: header rose `#f08a8a`/`#b4434a`, payload sage `#93bf9e`/`#3d7650`, signature steel `#8fadd6`/`#3a5d8c` (dark/light; all >=5.3:1 on panel, chosen to stay clear of the amber accent); flat sections with a coloured 6px dot + coloured mono label (`--part-*`), never a stripe.

## Motion

120�160ms ease-out on colour, opacity and small translate only. `prefers-reduced-motion` collapses all durations.

## Don'ts

- No SF system blue, Apple greys (#f2f2f7 / #1c1c1e), grouped-inset lists, frosted blur or soft-shadowed rounded cards.
- No coloured side stripes on cards, callouts or list items.
- No webfonts or network assets.
## Implementation Notes 

- **Shared primitives** (`main.css` components layer): `.card-head`, `.field-label`, `.ui-label`, `.ui-section`, `.ui-meta`, `.copy-chip`, `.panel-well`, `.drop-zone`, `.big-num`, `.empty-glyph`, `.btn-primary`, `.btn-block`, `.btn-sm`, `.icon-sm`, `.diff-line`/`.diff-inline` with `.is-add`/`.is-del`, `.regex-hit`, `.match-card`. Tool templates use these instead of inline `style=""`.
- **Clipboard actions are declarative**: `data-copy="id"`, `data-copy-self`, `data-copy-text="…"`, `data-paste="id"`. A single delegated listener in `src/renderer/src/ui.ts` handles them and confirms with a toast. Inline `onclick` is not allowed.
- **JWT parts** use a coloured dot plus a tinted header (`--part`), never a coloured side stripe.
- **Flat Bench enforced**: tool cards and colour previews have no shadow; only the palette, toasts and overlays float.
- **Blockquotes** in markdown preview use a neutral 2px rule, since amber is reserved for focus, selection and the primary action.

- **One error surface**: every tool, editor-based or custom, reports problems through the shared status bar (`reportError` / `reportOk` / `resetStatus` in `ui.ts`). Tool bodies never print red error text. Invalid fields get `.is-invalid` + `aria-invalid`. The bar resets to Ready on every tool switch.
- **Validate before running**: tools with known input grammars (barcode formats, number bases) check input up front and name the rule that failed.
- **Action vocabulary**: Paste, Sample, Clear, Copy, Generate, Download, Swap. No variants ("Clipboard", "Copy Base64", "Generate QR Code").
- **Tool modules**: `src/renderer/src/tools/index.ts` holds the registry; each custom UI lives in `tools/ui/<id>.ts` exporting `render(container)` and is loaded on first open via `load: () => import(...)`.
- **Barcode canvas** is literal white (`#fff`) with `#6e6e73` hint text in both themes, because scanners need a white quiet zone. This is the only theme-independent surface.
- **Colour converter default** `#72cd42` is sample data, not a UI colour.
- **Destructive actions are undoable**: every Clear (and the colour reset) snapshots its fields and shows a toast with an **Undo** action for 5s; Ctrl/Cmd+Z outside a text field triggers it too. The editor Clear goes through Monaco edits, so the editor's own undo history works as well. Use `clearWithUndo(ids, after)` from `ui.ts`.
- **Tool help**: each tool has a one-line tip and an optional syntax table in `tools/help.ts`, shown in a floating popover from the `?` button in the tool header or F1. The popover floats, so it is allowed a shadow.
- **Status text tokens**: use `--success-text` / `--error-text` for status *text*; they are tuned to meet WCAG AA in both themes. The bright system hues (`success`, `error`, `warning`) are for dots, fills and icons only.
- **Secondary text contrast**: secondary ink is raised above the stock 60% system value so labels and descriptions pass AA (4.5:1) in both themes. Tertiary ink stays reserved for placeholders and disabled text.
- **Sidebar categories** come from `CATEGORY_ORDER` in `tools/index.ts`, in this order: **Inspect & Decode**, **Format**, **Convert**, **Text & Utilities** (case, regex, string inspection, hashing, cron), **Generate**, **Compare**. Registry insertion order matches it, and every tool has a distinct Material Icons ligature.
- **Copy output shortcut**: Ctrl/Cmd+Shift+C copies the current tool's output.
- **Modals trap focus**: the command palette, settings dialog and help popover keep Tab inside, close on Esc, and restore focus to the element that opened them.
- **Settings dialog**: 680×460 centered float. Left section tabs (Editor, Privacy, Background, About) with the 2px amber active marker and the version at the foot; one pane at a time, so nothing hides below a fold. Rows are `.setting-row`: name (13px/500) + hint (12px secondary) on the left, control on the right, hairline between rows. Booleans use `.setting-switch` (amber when on). The titlebar ⚙ opens it on the last-used section (`Ctrl+K` "about" opens About); an available update puts an amber dot on ⚙ and the About tab.
- **Live tools by default**: tools recompute as you type (debounced); explicit Generate buttons are only for random or expensive actions.
- **Formatter indent**: editor tools expose `format(input, indent?)`; indent defaults to 2.



## Home search & background mode
- Home has one box, "Search tools or paste anything": typing filters the grid; data (len > 12, multi-line, or detection confidence = 0.9) switches the box to mono and shows the detection row (amber primary = top match, text alternatives). Enter opens the top detection, else the top grid match; ? moves into the grid; Esc clears. Ctrl/?+K focuses the box on Home and opens the palette inside a tool.
- Close hides to the tray/menu bar (setting, default on; one-time notification). Tray menu: Open, Global shortcut (read-only), Start at login, Quit. Global shortcut is user-recorded in Settings, validated by registration ("Shortcut is in use by another app"). Prefs live in userData/background.json. FORGE_E2E disables tray, close-to-tray and the single-instance lock.
