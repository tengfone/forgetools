const fs = require('fs-extra');
const path = require('path');

const monacoSourcePath = path.join(__dirname, '../node_modules/monaco-editor/min/vs');
const monacoTargetPath = path.join(__dirname, '../src/renderer/vs');

// Clean target directory
fs.emptyDirSync(monacoTargetPath);

// Define what to copy - only essential files
const includes = [
    'loader.js',
    'base',
    'editor',
    // Only include language workers that are actually used
    'language/json',
    'language/typescript',
    'language/css',
    'language/html',
    // Only include basic languages that are actually used in the app
    'basic-languages/xml',
    'basic-languages/sql',
    'basic-languages/yaml',
    'basic-languages/markdown',
    'basic-languages/javascript',
    'basic-languages/typescript',
    'basic-languages/css',
    'basic-languages/less',
    'basic-languages/scss',
    'basic-languages/html',
    'basic-languages/mysql',
    'basic-languages/pgsql',
    'basic-languages/shell',
    'basic-languages/ini'
];

// Copy specific files/directories
includes.forEach(item => {
    const src = path.join(monacoSourcePath, item);
    const dest = path.join(monacoTargetPath, item);
    
    if (fs.existsSync(src)) {
        fs.copySync(src, dest, { overwrite: true });
    } else {
        console.warn(`Warning: Monaco file/dir not found: ${item}`);
    }
});

// Remove any extra language files that shouldn't be there
// This ensures we only have what we need
const basicLanguagesPath = path.join(monacoTargetPath, 'basic-languages');
if (fs.existsSync(basicLanguagesPath)) {
    const allowedLanguages = includes
        .filter(item => item.startsWith('basic-languages/'))
        .map(item => item.replace('basic-languages/', ''));
    
    const existingLanguages = fs.readdirSync(basicLanguagesPath);
    existingLanguages.forEach(lang => {
        if (!allowedLanguages.includes(lang)) {
            const langPath = path.join(basicLanguagesPath, lang);
            try {
                fs.removeSync(langPath);
                console.log(`Removed unused Monaco language: ${lang}`);
            } catch (err) {
                console.warn(`Failed to remove ${lang}:`, err.message);
            }
        }
    });
}

// Remove unused NLS (localization) files - keep only English
const nlsPaths = [
    path.join(monacoTargetPath, 'base/common/worker'),
    path.join(monacoTargetPath, 'editor')
];

nlsPaths.forEach(nlsPath => {
    if (fs.existsSync(nlsPath)) {
        const files = fs.readdirSync(nlsPath);
        files.forEach(file => {
            // Keep only English (no .nls.* suffix or .nls.js)
            if (file.includes('.nls.') && !file.endsWith('.nls.js')) {
                const filePath = path.join(nlsPath, file);
                try {
                    fs.removeSync(filePath);
                    console.log(`Removed unused localization: ${file}`);
                } catch (err) {
                    console.warn(`Failed to remove ${file}:`, err.message);
                }
            }
        });
    }
});

console.log('Monaco Editor files (optimized) copied successfully!'); 