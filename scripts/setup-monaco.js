const fs = require('fs-extra');
const path = require('path');

const monacoSourcePath = path.join(__dirname, '../node_modules/monaco-editor/min/vs');
const monacoTargetPath = path.join(__dirname, '../src/renderer/vs');

// Create target directory if it doesn't exist
fs.ensureDirSync(path.dirname(monacoTargetPath));

// Copy Monaco Editor files to our app directory
fs.copySync(monacoSourcePath, monacoTargetPath, { overwrite: true });

console.log('Monaco Editor files copied successfully!'); 