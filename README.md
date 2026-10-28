# ForgeTools

Offline developer utilities in one desktop app. Format, decode, convert and generate without anything you paste leaving your machine.

![ForgeTools Demo](assets/demo.gif)

## Highlights

- **100% offline**: everything runs locally, and inputs stay in memory.
- **Paste anything**: drop a JWT, JSON, timestamp or colour on the home screen and ForgeTools opens the right tool.
- **Keyboard-first**: `Ctrl/Cmd+K` to jump to any tool, `Ctrl/Cmd+Shift+C` to copy output, `F1` for tool help.
- **Light and dark themes** that follow your system.
- Runs on **Windows, macOS (Intel & Apple Silicon) and Linux**.

## Tools

| Category | Tools |
| --- | --- |
| **Inspect & Decode** | JWT Decoder, Certificate Decoder (X.509), Base64, URL Encode/Decode, Backslash Escape, HEX ↔ ASCII |
| **Format** | JSON, XML, SQL, HTML, YAML, SVG Optimizer, HTML to JSX, Markdown to HTML, Markdown Preview |
| **Convert** | CSV ↔ JSON, Timestamp, Color, Number Base, Image to Base64 |
| **Text & Utilities** | String Case, RegExp Tester, String Inspector, Hash Generator (MD5/SHA-1/SHA-256/SHA-512), Cron Parser |
| **Generate** | UUID/ULID, QR Code, Barcode (EAN-13, UPC, CODE128, CODE39), Lorem Ipsum, Random String |
| **Compare** | Text Diff (line, word, char) |

## Download

Get the latest build from [Releases](https://github.com/tengfone/forgetools/releases/latest):

| Platform | File |
| --- | --- |
| Windows | `ForgeTools-Portable-X.Y.Z.exe` |
| macOS (Intel) | `ForgeTools-X.Y.Z-mac-x64.zip` |
| macOS (Apple Silicon) | `ForgeTools-X.Y.Z-mac-arm64.zip` |
| Linux | `ForgeTools-X.Y.Z.AppImage` |

> The macOS build is unsigned. On first launch, right-click the app and choose **Open**.

## Development

Requires Node.js 22+.

```bash
git clone https://github.com/tengfone/forgetools.git
cd forgetools
npm install
npm run dev        # run with hot reload
npm run dist       # package for your platform into dist/
```

To release, run `npm run release:patch` (or `release:minor` / `release:major`). It tags the version and CI builds a draft GitHub release.

## License

[MIT](LICENSE)

---

Built with Electron, TypeScript, Tailwind CSS and Monaco Editor. Developed with assistance from Anthropic's Claude.
## Background mode

Closing the window keeps ForgeTools running in the system tray (menu bar on macOS); quit from the tray menu or with Cmd+Q. Turn this off in Settings ? "Keep running in background". Settings also offer **Start at login** (launches hidden) and a user-defined **global shortcut** (none by default; suggestions Ctrl+Alt+Space / Ctrl+Shift+Alt+F) that shows ForgeTools on Home with the search box focused, or hides it when focused.
