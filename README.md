# ForgeTools

ForgeTools is a comprehensive desktop application built with Electron that provides a suite of essential development tools for software engineers. It offers a collection of formatters, encoders/decoders, converters, and other utilities that work entirely offline.

> This project was developed with assistance from Anthropic's Claude AI, which helped with code generation, optimization, and documentation.

## Features

### Formatters

- JSON Formatter & Validator
- XML Formatter
- SQL Formatter
- HTML Formatter
- HTML to JSX Converter
- Markdown Preview

### Encoders/Decoders

- Base64 Text Encoder/Decoder
- Base64 Image Converter
- URL Encoder/Decoder
- JWT Decoder
- HTML Entity Encoder/Decoder
- Backslash Escape/Unescape
- HEX ↔ ASCII Converter

### Converters

- YAML ↔ JSON Converter
- CSV ↔ JSON Converter
- Timestamp Converter
- Color Converter & Picker
- Number Base Converter

### Analyzers

- URL Parser
- String Inspector
- Certificate Decoder
- Cron Expression Parser

### Generators

- Hash Generator (MD5, SHA1, SHA256, SHA512)
- QR Code Generator/Reader
- Lorem Ipsum Generator
- Random String Generator

### Text Tools

- Text Diff Viewer
- String Case Converter
- Line Sorter & Deduplicator
- Regular Expression Tester

## Installation

### Prerequisites

- Node.js (v18 or higher)
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
   ```

### Building for Production

1. Build the application:

   ```bash
   npm run build
   ```

2. The built application will be available in the `dist` directory.

## Project Structure

```
forgetools/
├── src/                    # Source code
│   ├── main.js            # Main process (Electron entry point)
│   ├── preload.js         # Preload script for secure IPC
│   └── renderer/          # Renderer process
│       ├── index.html     # Main HTML file
│       ├── js/            # JavaScript files
│       │   └── app.js     # Main application logic
│       └── styles/        # CSS styles
│           └── main.css   # Main stylesheet
├── assets/                # Application assets
│   └── icons/            # Application icons
├── dist/                  # Built application
├── node_modules/         # Dependencies
├── package.json          # Project configuration
├── package-lock.json     # Dependency lock file
└── README.md            # Project documentation
```

## CI/CD and Releases

ForgeTools uses GitHub Actions for continuous integration and automated releases. The workflow includes:

1. **Automated Testing**:

   - Runs Playwright end-to-end tests in a headless environment
   - Tests are executed on Ubuntu with Node.js 18
   - Test artifacts are uploaded for debugging

2. **Automated Versioning**:

   - Automatically bumps version numbers
   - Creates Git tags for releases
   - Generates detailed changelogs

3. **Multi-Platform Builds**:

   - Builds for macOS (Intel and Apple Silicon)
   - Builds for Windows (x64)
   - Builds for Linux (x64)

4. **Release Process**:
   - Triggered on pushes to main branch
   - Creates GitHub releases with changelogs
   - Uploads platform-specific binaries
   - Includes SHA-256 checksums for verification

### Available Downloads

Each release includes:

- macOS: Universal DMG (Intel & Apple Silicon)
- Windows: Portable EXE
- Linux: AppImage

### Release Notes

Release notes are automatically generated and include:

- ✨ New Features
- 🐛 Bug Fixes
- 📝 Documentation Updates
- ⚡️ Performance Improvements

### Release Cycles

#### Automated Release Process

1. **Trigger**:

   - Pushes to the `main` branch
   - Creation of version tags (e.g., `v1.2.3`)

2. **Version Management**:

   - Automatic version bumping based on commit types:
     - `feat:` → Minor version (1.2.0 → 1.3.0)
     - `fix:`, `docs:`, `perf:` → Patch version (1.2.0 → 1.2.1)
     - `BREAKING CHANGE` → Major version (1.2.0 → 2.0.0)

3. **Build Pipeline**:

   - Runs test suite on Ubuntu with Node.js 18
   - Generates platform-specific builds in parallel:
     - macOS (x64, arm64)
     - Windows (x64)
     - Linux (x64)

4. **Release Artifacts**:
   - Platform-specific binaries
   - SHA-256 checksums
   - Detailed changelog
   - Installation instructions

#### Release Schedule

- **Patch Releases**: As needed for bug fixes and minor improvements
- **Feature Releases**: When new features are ready and tested
- **Major Releases**: Planned for significant changes or breaking updates

#### Quality Gates

Each release must pass:

1. Automated test suite
2. Build verification for all platforms
3. Artifact generation and checksum verification

#### Hotfix Process

For critical issues:

1. Fix is applied directly to `main`
2. Triggers immediate patch release
3. Release notes mark it as a hotfix

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

1. Install test dependencies:

   ```bash
   npm install
   ```

2. Run the tests:

   ```bash
   npm test
   ```

3. To view the test report:
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
```

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
