const fs = require('fs-extra');
const path = require('path');

async function globalSetup() {
  try {
    // Clean up target directory first
    const monacoTargetPath = path.join(__dirname, '../src/renderer/vs');
    await fs.remove(monacoTargetPath);

    // Copy Monaco editor files
    const monacoSourcePath = path.join(__dirname, '../node_modules/monaco-editor/min/vs');
    
    // Create target directory
    await fs.ensureDir(path.dirname(monacoTargetPath));

    // Copy Monaco Editor files to our app directory
    await fs.copy(monacoSourcePath, monacoTargetPath, { 
      overwrite: true,
      errorOnExist: false
    });

    console.log('Test setup: Monaco Editor files copied successfully!');
  } catch (error) {
    console.error('Test setup failed:', error);
    throw error;
  }
}

module.exports = globalSetup; 