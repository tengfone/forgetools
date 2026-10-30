# Changelog

All notable changes to ForgeTools are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-30

### Changed

- **Rewritten on Tauri v2.** ForgeTools moves from Electron to a Rust shell on the
  system WebView (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). Every tool
  from 0.2.1 is kept, and their outputs are checked against 0.2.1 by parity tests.
- **Much smaller downloads**: the portable Windows exe is about 5 MB (0.2.1: 104 MB), and the
  macOS zips and Linux `.deb`/`.rpm` are a few MB.
- **Faster startup and less memory**: the window appears in about 0.6 s on a Windows 11
  test machine, and libraries load only when you open a tool.
- **Native tray, global shortcut and start at login**: closing the window keeps ForgeTools
  in the tray (menu bar on macOS), with an optional global shortcut and launch at login.
- **Monaco editor** is now bundled as ES modules with only the features and languages the
  tools use, so the editor tools load faster and the app ships no separate editor folder.
- **Stricter security**: no Node.js in the UI, least-privilege Tauri permissions, and a
  strict Content Security Policy (no inline scripts, no `blob:` workers).
- New app identifier `com.tengfone.forgetools`. Logs are written to the OS log folder
  (see README, "Reporting bugs").
- Releases are now published by hand from a CI-built draft.

### Removed

- **Settings from 0.x are not carried over.** Theme, pinned tools, input history and other
  preferences start fresh in 1.0.0.

## [0.2.1] - 2026-10-29

### Added

- Sectioned Settings dialog with an About section and an opt-in update check.

### Changed

- Libraries are lazy-loaded per tool, with smaller fonts and package size.
- CI publishes a release after a green build and keeps only the 10 newest.

## [0.2.0] - 2026-10-29

### Added

- 30+ new offline tools, pipeline chaining, a sample button in every tool and opt-in input
  history.
- Unit tests and end-to-end coverage for the new tools and history.

### Changed

- CI builds on Node 26 with pinned runners and newer actions; demo GIF re-recorded.

## [0.1.0] - 2026-10-29

- First release (Electron).

[1.0.0]: https://github.com/tengfone/forgetools/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/tengfone/forgetools/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tengfone/forgetools/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tengfone/forgetools/releases/tag/v0.1.0
