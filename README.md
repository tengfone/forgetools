# ForgeTools

ForgeTools is a comprehensive desktop application built with Electron, TypeScript, and Tailwind CSS that provides a suite of essential development tools for software engineers. It offers a collection of formatters, encoders/decoders, converters, and other utilities that work entirely **offline**.

> This project was developed with assistance from Anthropic's Claude AI, which helped with code generation, optimization, and documentation.

## Tech Stack

- **Electron-Vite** - Fast build tool for Electron applications
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Monaco Editor** - VS Code's editor for code editing
- **Playwright** - End-to-end testing

![ForgeTools Demo](assets/demo.gif)

## Features

### Formatters

- JSON Formatter & Validator
- XML Formatter
- SQL Formatter
- HTML Formatter
- HTML to JSX Converter
- Markdown to HTML Converter
- Markdown Preview
- YAML Formatter
- SVG Optimizer

### Encoders/Decoders

- Base64 Text Encoder/Decoder
- URL Encoder/Decoder
- JWT Decoder
- Backslash Escape/Unescape
- HEX ↔ ASCII Converter
- Certificate Decoder (X.509)
- Hash Generator (MD5, SHA-1, SHA-256, SHA-512)

### Converters

- YAML ↔ JSON Converter
- CSV ↔ JSON Converter
- Timestamp Converter
- Color Converter & Picker
- Number Base Converter
- Image to Base64 Converter

### Generators

- UUID/ULID Generator
- QR Code Generator
- Barcode Generator (EAN-13, UPC, CODE128, CODE39)
- Lorem Ipsum Generator
- Random String Generator

### Text Tools

- Text Diff Viewer
- String Case Converter (Camel, Pascal, Snake, Kebab, Constant)
- String Inspector
- Cron Expression Parser
- Regular Expression Tester

## Installation

### Prerequisites

- Node.js (v22 or higher)
- npm (v6 or higher)
- Git

### Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/tengfone/forgetools.git
   cd forgetools
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   # or
   npm start
   ```

4. Build the application (required before running tests):

   ```bash
   npm run build
   ```

### Building for Production

1. Build the application:

   ```bash
   npm run build
   ```

   This compiles TypeScript and bundles the application to the `out/` directory.

2. Create distribution packages:

   ```bash
   npm run dist
   ```

   This builds the application and creates platform-specific installers in the `dist/` directory.

3. Preview the production build (without packaging):

   ```bash
   npm run preview
   ```

## Project Structure

```
forgetools/
├── src/                    # Source code
│   ├── main/              # Main process (Electron entry point)
│   │   └── main.ts        # Main process TypeScript
│   ├── preload/           # Preload script for secure IPC
│   │   └── index.ts       # Preload script TypeScript
│   ├── renderer/          # Renderer process
│   │   ├── index.html     # Main HTML file
│   │   └── src/           # Renderer source files
│   │       ├── app.ts     # Main application logic
│   │       ├── tools.ts    # Tool definitions
│   │       └── main.css    # Tailwind CSS styles
│   ├── types/             # TypeScript type definitions
│   │   ├── electronAPI.ts # Electron API types
│   │   ├── ipc.ts         # IPC channel types
│   │   └── tools.ts       # Tool type definitions
│   └── renderer/          # Renderer assets
│       ├── vs/            # Monaco Editor files
│       └── fonts/         # Font files
├── out/                    # Build output (generated)
│   ├── main/              # Compiled main process
│   ├── preload/           # Compiled preload script
│   └── renderer/          # Compiled renderer
├── tests/                  # Test files
│   └── e2e/               # End-to-end tests
├── assets/                 # Application assets
├── dist/                   # Distribution builds (generated)
├── electron.vite.config.ts # Electron-Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project configuration
```

## CI/CD and Releases

ForgeTools uses GitHub Actions (`.github/workflows/release.yml`) to build and publish releases. **The pipeline runs only when a version tag (`v*`) is pushed.** Pushing commits to `main` does not trigger a build.

### How to Cut a Release

1. Make sure your working tree is clean (everything committed) and `main` is up to date:

   ```bash
   git checkout main
   git pull
   ```

2. Run one of the release scripts:

   ```bash
   npm run release:patch   # 2.1.0 → 2.1.1  (bug fixes)
   npm run release:minor   # 2.1.0 → 2.2.0  (new features)
   npm run release:major   # 2.1.0 → 3.0.0  (breaking changes)
   ```

   Each script bumps the version in `package.json`, commits `chore(release): vX.Y.Z`, creates the `vX.Y.Z` tag and pushes the commit and tag together (`git push --follow-tags`).

3. Watch the **Release** workflow under the repository's **Actions** tab.

4. When it finishes, go to **Releases** on GitHub, review the **draft** release and click **Publish**.

> You can also tag manually: `git tag v2.1.1 && git push origin v2.1.1`. The build uses the tag as the version, so keep `package.json` in sync.

### Pipeline Stages

1. **Test**: builds the app and runs the Playwright end-to-end suite on Ubuntu with Node.js 22 (headless via `xvfb`). The Playwright report is uploaded as an artifact. **If any test fails, the release stops.**
2. **Build** (in parallel, Node.js 22):
   - macOS: x64 and arm64 zips, from one job
   - Windows: x64 portable EXE
   - Linux: x64 AppImage

   Files are always named after the tag version, and electron-builder runs with `--publish never`.
3. **Release**: collects the build files, generates release notes from commits since the previous tag and creates a **draft** GitHub release with SHA-256 checksums.

### Available Downloads

Each release includes:

| Platform              | File                                 |
| --------------------- | ------------------------------------ |
| Windows               | `ForgeTools-Portable-X.Y.Z.exe`      |
| macOS (Intel)         | `ForgeTools-X.Y.Z-mac-x64.zip`       |
| macOS (Apple Silicon) | `ForgeTools-X.Y.Z-mac-arm64.zip`     |
| Linux                 | `ForgeTools-X.Y.Z.AppImage`          |

### Release Notes

Release notes are generated automatically from [Conventional Commit](https://www.conventionalcommits.org/) messages between the previous tag and the new one. Sections with no commits are left out:

- ✨ New Features (`feat:`)
- 🐛 Bug Fixes (`fix:`)
- ⚡️ Performance (`perf:`)
- 📝 Documentation (`docs:`)

### Quality Gates

Each release must pass:

1. The automated Playwright test suite
2. Successful builds on all platforms (a build that produces no files fails the run)
3. Checksum generation for all files

### Hotfix Process

1. Commit the fix to `main` (e.g. `fix: ...`)
2. Run `npm run release:patch`
3. Publish the draft release once the pipeline finishes

### Editing Release Notes

The changelog is automatically generated from commit messages using the following rules:

1. **Commit Categories**:

   - `feat:` commits appear under "✨ New Features"
   - `fix:` commits appear under "🐛 Bug Fixes"
   - `docs:` commits appear under "📝 Documentation"
   - `perf:` commits appear under "⚡️ Performance"

2. **Writing Good Commit Messages**:

   ```bash
   # For features
   git commit -m "feat: add new JSON formatter with syntax highlighting"

   # For bug fixes
   git commit -m "fix: resolve memory leak in base64 encoder"

   # For documentation
   git commit -m "docs: update installation instructions for macOS"

   # For performance
   git commit -m "perf: optimize XML parsing algorithm"
   ```

3. **Manual Edits**:

   - Changelogs can be edited after generation
   - Navigate to the release on GitHub
   - Click "Edit" on the release
   - Modify the release notes
   - Click "Update release"

4. **Best Practices**:
   - Keep commit messages clear and concise
   - Start with a verb in present tense
   - Describe the change, not the work done
   - Reference issues when applicable: "fix: resolve memory leak (#123)"

## Testing

ForgeTools uses Playwright for end-to-end testing of the Electron application. The tests run in headless mode, making them suitable for CI/CD environments.

### Running Tests

1. Build the application first (required):

   ```bash
   npm run build
   ```

2. Run the tests:

   ```bash
   npm test
   ```

3. Run tests with UI (interactive mode):

   ```bash
   npm run test:ui
   ```

4. To view the test report:

   ```bash
   npx playwright show-report
   ```

### Test Structure

Tests are located in the `tests/e2e` directory:

```
tests/
├── e2e/                   # End-to-end tests
│   ├── app.spec.js        # Main application tests
│   └── helpers/           # Test helpers
│       └── electronApp.js # Electron app launch helper
└── globalSetup.js          # Test setup (Monaco Editor files)
```

### Test Coverage

The test suite covers:

- Application launch and basic UI rendering
- Sidebar navigation and tool loading
- Core application functionality

Tests are kept minimal and focused on essential functionality to ensure reliability.

## Development

### Key Features

- **Native Window Controls**: Uses platform-native window controls (macOS traffic lights, Windows/Linux standard controls)
- **Dark Mode**: System-aware dark/light theme switching
- **Offline-First**: All functionality works without internet connection
- **Type-Safe**: Full TypeScript implementation for better code quality
- **Modern UI**: Built with Tailwind CSS for a clean, responsive interface

### Development Commands

```bash
npm run dev      # Start development server with hot reload
npm run build    # Build for production
npm run preview  # Preview production build
npm test         # Run end-to-end tests
npm run test:ui  # Run tests with interactive UI
```

### Code Structure

- **Main Process** (`src/main/`): Electron main process with IPC handlers
- **Preload** (`src/preload/`): Secure bridge between main and renderer
- **Renderer** (`src/renderer/`): UI and application logic
- **Types** (`src/types/`): Shared TypeScript type definitions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes (following conventional commits)
4. Push to the branch
5. Create a Pull Request

### Commit Message Format

Follow the Conventional Commits specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `perf:` Performance improvements
- `chore:` Maintenance tasks

## License

This project is licensed under the MIT License - see the LICENSE file for details.
