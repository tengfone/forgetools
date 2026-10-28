---
name: ForgeTools
description: Offline developer utilities. A native-feeling workbench, fast and exact.
colors:
  accent: "#007aff"
  accent-hover: "#0062cc"
  accent-dark: "#0a84ff"
  accent-hover-dark: "#409cff"
  canvas: "#f2f2f7"
  surface: "#ffffff"
  well: "#e5e5ea"
  ink: "#000000"
  ink-secondary: "rgba(60, 60, 67, 0.6)"
  ink-tertiary: "rgba(60, 60, 67, 0.3)"
  hairline: "#d1d1d6"
  hairline-hover: "#aeaeb2"
  canvas-dark: "#1c1c1e"
  surface-dark: "#2c2c2e"
  well-dark: "#3a3a3c"
  ink-dark: "#ffffff"
  ink-secondary-dark: "rgba(235, 235, 245, 0.6)"
  ink-tertiary-dark: "rgba(235, 235, 245, 0.3)"
  hairline-dark: "#38383a"
  hairline-hover-dark: "#636366"
  success: "#34c759"
  error: "#ff3b30"
  warning: "#ffcc00"
  jwt-payload: "#bf5af2"
  barcode-paper: "#ffffff"
  barcode-hint: "#6e6e73"
  sample-green: "#72cd42"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.6px"
  tool-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.4px"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  section-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
  code:
    fontFamily: "'SF Mono', 'Segoe UI Mono', 'JetBrains Mono', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "'SF Mono', 'Segoe UI Mono', 'JetBrains Mono', Menlo, monospace"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
  icon:
    fontFamily: "'Material Icons'"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1
  icon-sm:
    fontFamily: "'Material Icons'"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1
  icon-md:
    fontFamily: "'Material Icons'"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  header: "52px"
  sidebar: "260px"
components:
  button-toolbar:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
    height: "28px"
  button-toolbar-hover:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
  input-field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  input-field-focus:
    backgroundColor: "{colors.canvas}"
  tool-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  nav-item-active:
    backgroundColor: "rgba(0, 0, 0, 0.06)"
    textColor: "{colors.ink}"
  command-palette:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    width: "600px"
  toast:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
---

# Design System: ForgeTools

## Overview

**Creative North Star: "The Native Workbench"**

ForgeTools should feel like a precision bench that has always lived on the developer's machine. It is quiet, familiar, and exact, and it's ready the instant you paste something. Today the system is built on Apple's system palette and type: grey canvas, white or graphite surfaces, hairline borders, a single blue accent, and dense 13px text. That native foundation stays. It's why the app feels fast and trustworthy.

The direction is **more distinctive ForgeTools, with speed and craft as the priority.** Distinctiveness comes from precise details rather than decoration: a confident tool-title treatment, an exact monospace voice for data, a meaningful color-coding vocabulary (as in the JWT parts), crisp focus states, and immediate feedback. It should look gorgeous to a developer the way a great editor theme does, through rhythm, contrast, and restraint, never through heavy effects that cost frames.

Density is high and chrome is low. The data the user pasted is the hero, and the interface recedes around it.

**Key Characteristics:**
- Native macOS foundations: system font, system colors, and matched light and dark themes via a `.dark` class.
- A fixed three-zone frame: 52px titlebar, 260px sidebar, and a split input/output workspace.
- Flat tonal layering with hairline borders, plus a single sparing blue accent.
- Monospace for every piece of user data; sans for every piece of interface.
- Motion is short and functional (100–300ms) and never blocks input.

## Colors

The palette is a native neutral system with one blue accent and semantic status hues. All color is theme-aware through CSS custom properties (`--bg-*`, `--text-*`, `--accent-*`, `--border-*`) in `src/renderer/src/main.css`.

### Primary
- **Workbench Blue** (accent / accent-dark): primary actions, focus borders, the active command-palette row, stat values, and the loading bar. Hover deepens in light mode and brightens in dark mode.

### Neutral
- **Canvas** (canvas / canvas-dark): the app background and editor panes.
- **Surface** (surface / surface-dark): the sidebar, cards, the command palette, settings, and toasts.
- **Well** (well / well-dark): recessed fills for inputs, selects, and JWT parts. Inputs sit *into* the bench rather than on top of it.
- **Ink, Secondary Ink, Tertiary Ink**: primary text, then labels and descriptions, then placeholder and disabled text. Secondary and tertiary are translucent, so they adapt to any surface.
- **Hairline** (hairline / hairline-dark): every structural divider and card border. The hover variant marks interactive edges.

### Semantic
- **Success, Error, Warning**: the system green, red, and yellow, used only for validation and status.
- **Data-part hues**: JWT header (error red), payload (jwt-payload violet), and signature (accent-dark blue) appear as 4px left rules. This is the seed of ForgeTools' own visual vocabulary.

### Named Rules
**The One Blue Rule.** Blue means "interactive or focused". Never use it for decoration, and keep it under about 10% of any screen.

**The Paired Theme Rule.** Every color is defined twice, once for light and once for dark. Never hard-code a hex in a component, with the documented data-part hues as the only exception.

## Typography

**Interface Font:** the system stack (-apple-system, SF Pro Text, Segoe UI, Roboto, then fallbacks)
**Data Font:** SF Mono (then Segoe UI Mono, JetBrains Mono, Menlo, monospace)

**Character:** The native sans keeps the chrome invisible and instant, because there is no webfont to load. The monospace face carries everything the user owns. The contrast between them is the main typographic idea.

### Hierarchy
Ramp: 11 / 12 / 13 / 16 / 22 / 28px. Every heading step is at least 1.25× the one below it.
- **Display** (h1, 600, 28px, -0.6px tracking): the welcome title.
- **Tool Title** (h2, 600, 22px, -0.4px tracking): the tool name in the workspace header.
- **Title** (h3, 600, 16px): panel headings such as Editor Settings.
- **Body** (400, 13px, line-height 1.4): the base app text, nav items, and descriptions.
- **Label** (500, 12px): buttons, form labels, and selects.
- **Section Label** (600, 11–12px, uppercase, wide tracking): sidebar category headers and tool-card headings.
- **Code** (400, 13px, line-height 1.5): inputs, results, and Monaco editors.
- **Figure** (mono 700, 32px, tabular): single big numbers such as String Inspector stats (`.big-num`).

Icon sizes (Material Icons, not text): 12, 14, 16, 18, 24 and 32px for empty-state glyphs. These are glyph sizes and sit outside the text ramp.

### Named Rules
**The One Blue Rule.** Blue means "interactive or focused". Never use it for decoration, and keep it under about 10% of any screen.

**The Paired Theme Rule.** Every color is defined twice, once for light and once for dark. Never hard-code a hex in a component, with the documented data-part hues as the only exception.

## Typography

**Interface Font:** the system stack (-apple-system, SF Pro Text, Segoe UI, Roboto, then fallbacks)
**Data Font:** SF Mono (then Segoe UI Mono, JetBrains Mono, Menlo, monospace)

**Character:** The native sans keeps the chrome invisible and instant, because there is no webfont to load. The monospace face carries everything the user owns. The contrast between them is the main typographic idea.

### Hierarchy
- **Tool Title** (600, 20px, -0.5px tracking): the tool name in the workspace header.
- **Title** (600, 16px): panel headings such as Editor Settings.
- **Body** (400, 13px, line-height 1.4): the base app text, nav items, and descriptions.
- **Label** (500, 12px): buttons, form labels, and selects.
- **Section Label** (700, 11px, uppercase, wide tracking): sidebar category headers and card headings at 12px/600.
- **Code** (400, 13px, line-height 1.5): inputs, results, and Monaco editors.

### Named Rules
**The Data-Is-Mono Rule.** Anything the user pasted, generated, or will copy is set in the mono stack. Interface text never is.

**The No-Webfont Rule.** Text uses system fonts only, to protect startup speed and offline integrity. The one exception is **Material Icons**, an icon font bundled locally (`src/renderer/fonts`), used only for glyphs and never for text.

## Layout

The frame is fixed: a 52px draggable titlebar, then a 260px sidebar (search plus categorized nav) and a flexible main area. Editor tools use a 50/50 split view with 44px pane headers (label and pill actions on the left, settings on the right) above full-bleed Monaco editors. Form-style tools use a centered container (max 1000px, 16px padding) of stacked tool cards, with 2-column grids (12px gap) and auto-fit stat grids (min 150px).

The spacing rhythm is 4/8/12/16/24px, and it is dense by design. Overlays include a top-anchored command palette (15vh from top) and a right-docked 320px settings sheet, both over a 60% black scrim with a light blur.

## Elevation & Depth

The system is flat with tonal layering. Depth comes from canvas → surface → well and from 1px hairlines, not from shadows. Shadows are minimal and appear only where an object truly floats.

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.2)`): a barely-there lift on tool cards.
- **Floating** (Tailwind `shadow-lg`): the command palette, settings sheet, and toast.
- **Swatch** (`box-shadow: 0 4px 12px rgba(0,0,0,0.3)`): the color preview only.
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(10,132,255,0.15)`): a focus ring on fields with an accent border.

### Named Rules
**The Flat Bench Rule.** Surfaces are flat at rest. Shadow is earned by floating (overlays, toasts) or focus, never used for decoration.

## Shapes

The form language is softly rounded and consistent. Small (6px) covers controls, nav items, and inputs. Medium (10px) covers cards, toasts, JWT parts, and swatches. Large (14px) is reserved for the command palette. Borders are 1px hairlines, and controls use a transparent border so that focus never shifts layout. Left rules (4px) encode data type.

## Components

### Buttons
- **Shape:** gently rounded (6px), 28px tall, with a 16px icon and 12px/500 label.
- **Toolbar / pill (default):** a transparent ghost with secondary-ink text.
- **Hover / Active:** a subtle fill with text promoted to primary ink. On press, the button nudges down 1px. Transitions take 100ms.
- **Primary:** reserved for the single main action and filled with Workbench Blue. Use it sparingly.

### Cards / Containers
- **Corner Style:** 10px
- **Background:** surface with a hairline border and a resting-card shadow
- **Internal Padding:** 16px, with a 16px gap between cards
- **Heading:** 12px/600 uppercase in secondary ink

### Inputs / Fields
- **Style:** a well fill with a transparent border, 6px radius, and mono 13px text.
- **Focus:** the fill lifts to canvas, the border turns accent, and a 3px focus halo appears.
- **Read-only:** 80% opacity with a default cursor.

### Navigation
- **Sidebar items:** 13px body text, 6px radius, 6×8px padding, and an 18px icon at 70% opacity.
- **Active:** weight 500 on a 6% ink tint in light mode or an 8% white tint in dark mode. The icon rises to 90% opacity.
- **Categories:** 11px bold uppercase section labels.

### Command Palette
A 600px floating sheet with a 14px radius and an 18px borderless input. Rows are 16×12px padding, and the hovered row fills with accent and white text. It's the fastest route to any tool, so treat it as a first-class surface.

### Toast
Bottom-right with a surface fill, hairline border, and 10px radius. It slides up 300ms ease-out and confirms copies and errors.

### JWT Parts (signature)
Recessed well blocks with a 10px radius and a 4px colored left rule per part. This is the model for how ForgeTools color-codes structured data.

## Do's and Don'ts

### Do:
- **Do** route every color through the theme custom properties and check both light and dark themes.
- **Do** set user data in the mono stack and interface text in the system sans.
- **Do** keep feedback instant: transitions of 100–200ms for controls and at most 300ms for overlays and toasts, using only transform and opacity.
- **Do** grow distinctiveness through data color-coding, type precision, and crisp states, extending the JWT left-rule vocabulary to other structured tools.
- **Do** make every action reachable by keyboard and the command palette.

### Don't:
- **Don't** use emoji as the brand mark (the current 🛠️ on the loading and welcome screens). Replace it with a real ForgeTools glyph when one exists.
- **Don't** load webfonts, remote assets, or anything over the network. Offline is a product promise.
- **Don't** add blur, gradients, glow, or heavy shadow for decoration. They cost frames and fight the Flat Bench Rule.
- **Don't** use white-tint hovers in light mode or black-tint hovers in dark mode. The current `.btn-*` and `.nav-item` hover tints are inverted and nearly invisible, so tint toward ink.
- **Don't** hard-code accent-dark blue values in light-mode code. Use `var(--accent-color)`.

## Implementation Notes (2026-10 overhaul)

- **Shared primitives** (`main.css` components layer): `.card-head`, `.field-label`, `.ui-label`, `.ui-section`, `.ui-meta`, `.copy-chip`, `.panel-well`, `.drop-zone`, `.big-num`, `.empty-glyph`, `.btn-primary`, `.btn-block`, `.btn-sm`, `.icon-sm`, `.diff-line`/`.diff-inline` with `.is-add`/`.is-del`, `.regex-hit`, `.match-card`. Tool templates use these instead of inline `style=""`.
- **Clipboard actions are declarative**: `data-copy="id"`, `data-copy-self`, `data-copy-text="…"`, `data-paste="id"`. A single delegated listener in `src/renderer/src/ui.ts` handles them and confirms with a toast. Inline `onclick` is not allowed.
- **JWT parts** use a coloured dot plus a tinted header (`--part`), never a coloured side stripe.
- **Flat Bench enforced**: tool cards and colour previews have no shadow; only the palette, toasts and overlays float.
- **Blockquotes** in markdown preview use a neutral 2px rule, since blue is reserved for interactive elements.

- **One error surface**: every tool, editor-based or custom, reports problems through the shared status bar (`reportError` / `reportOk` / `resetStatus` in `ui.ts`). Tool bodies never print red error text. Invalid fields get `.is-invalid` + `aria-invalid`. The bar resets to Ready on every tool switch.
- **Validate before running**: tools with known input grammars (barcode formats, number bases) check input up front and name the rule that failed.
- **Action vocabulary**: Paste, Sample, Clear, Copy, Generate, Download, Swap. No variants ("Clipboard", "Copy Base64", "Generate QR Code").
- **Tool modules**: `src/renderer/src/tools/index.ts` holds the registry; each custom UI lives in `tools/ui/<id>.ts` exporting `render(container)` and is loaded on first open via `load: () => import(...)`.
- **Barcode canvas** is literal white (`#fff`) with `#6e6e73` hint text in both themes, because scanners need a white quiet zone. This is the only theme-independent surface.
- **Colour converter default** `#72cd42` is sample data, not a UI colour.
- **Destructive actions are undoable**: every Clear (and the colour reset) snapshots its fields and shows a toast with an **Undo** action for 5s; Ctrl/Cmd+Z outside a text field triggers it too. The editor Clear goes through Monaco edits, so the editor's own undo history works as well. Use `clearWithUndo(ids, after)` from `ui.ts`.
- **Tool help**: each tool has a one-line tip and an optional syntax table in `tools/help.ts`, shown in a popover from the `?` button in the tool header or F1. The popover floats, so it is allowed a shadow.
