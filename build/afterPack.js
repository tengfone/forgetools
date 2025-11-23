const fs = require('fs');
const path = require('path');

// Recursive function to find and remove files/dirs matching patterns
function removeMatchingFiles(dir, basePattern, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.lstatSync(filePath);
        
        // Check if this file/dir matches the pattern
        const relativePath = path.relative(dir, filePath);
        if (matchesPattern(relativePath, basePattern)) {
          fileList.push(filePath);
        }
        
        // Recurse into directories
        if (stat.isDirectory()) {
          removeMatchingFiles(filePath, basePattern, fileList);
        }
      } catch (err) {
        // Skip files we can't access
      }
    });
  } catch (err) {
    // Skip directories we can't read
  }
  
  return fileList;
}

// Simple pattern matching for common glob patterns
function matchesPattern(filePath, pattern) {
  // Handle common patterns
  if (pattern.includes('**/*.d.ts')) {
    return filePath.endsWith('.d.ts');
  }
  if (pattern.includes('**/*.map')) {
    return filePath.endsWith('.map');
  }
  if (pattern.includes('**/*.md')) {
    return filePath.endsWith('.md');
  }
  if (pattern.includes('**/*.spec.js') || pattern.includes('**/*.test.js')) {
    return /\.(spec|test)\.js$/.test(filePath);
  }
  if (pattern.includes('**/*.spec.ts') || pattern.includes('**/*.test.ts')) {
    return /\.(spec|test)\.ts$/.test(filePath);
  }
  if (pattern.includes('**/CHANGELOG*')) {
    return /CHANGELOG/i.test(filePath);
  }
  if (pattern.includes('**/LICENSE*')) {
    return /^LICENSE/i.test(path.basename(filePath));
  }
  if (pattern.includes('**/README*')) {
    return /^README/i.test(path.basename(filePath));
  }
  // For directory patterns, check if path contains the directory name
  if (pattern.includes('/test') || pattern.includes('/tests') || pattern.includes('/__tests__')) {
    return /(^|\/)(test|tests|__tests__)(\/|$)/.test(filePath);
  }
  if (pattern.includes('/docs')) {
    return /(^|\/)docs(\/|$)/.test(filePath);
  }
  if (pattern.includes('/.bin')) {
    return /(^|\/)\.bin(\/|$)/.test(filePath);
  }
  if (pattern.includes('/.github')) {
    return /(^|\/)\.github(\/|$)/.test(filePath);
  }
  if (pattern.includes('/examples') || pattern.includes('/example')) {
    return /(^|\/)(example|examples)(\/|$)/.test(filePath);
  }
  if (pattern.includes('/samples') || pattern.includes('/sample')) {
    return /(^|\/)(sample|samples)(\/|$)/.test(filePath);
  }
  if (pattern.includes('/coverage') || pattern.includes('/.nyc_output')) {
    return /(^|\/)(coverage|\.nyc_output)(\/|$)/.test(filePath);
  }
  
  return false;
}

exports.default = async function(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  // Paths to clean up - more aggressive cleanup
  const pathsToRemove = [
    'node_modules/@playwright',
    'node_modules/@types',
    'node_modules/typescript',
    'node_modules/**/*.d.ts',
    'node_modules/**/*.map',
    'node_modules/**/*.md',
    'node_modules/**/test',
    'node_modules/**/tests',
    'node_modules/**/__tests__',
    'node_modules/**/docs',
    'node_modules/**/.bin',
    'node_modules/**/.github',
    'node_modules/**/examples',
    'node_modules/**/example',
    'node_modules/**/samples',
    'node_modules/**/sample',
    'node_modules/**/CHANGELOG*',
    'node_modules/**/LICENSE*',
    'node_modules/**/README*',
    'node_modules/**/*.spec.js',
    'node_modules/**/*.test.js',
    'node_modules/**/*.spec.ts',
    'node_modules/**/*.test.ts',
    'node_modules/**/.eslintrc*',
    'node_modules/**/.prettierrc*',
    'node_modules/**/tsconfig.json',
    'node_modules/**/jest.config*',
    'node_modules/**/.nyc_output',
    'node_modules/**/coverage'
  ];

  // Function to recursively remove directories
  const removeDir = (dir) => {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach((file) => {
        const curPath = path.join(dir, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          removeDir(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dir);
    }
  };

  // Get the app directory based on platform
  let appDir = appOutDir;
  if (electronPlatformName === 'darwin') {
    appDir = path.join(appOutDir, `${packager.appInfo.productName}.app`, 'Contents', 'Resources', 'app.asar.unpacked');
  } else if (electronPlatformName === 'win32') {
    appDir = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  } else {
    appDir = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  }

  // Remove unnecessary files
  pathsToRemove.forEach(pattern => {
    try {
      // Handle glob patterns by finding matching files recursively
      if (pattern.includes('**') || pattern.includes('*')) {
        // Extract base directory from pattern (e.g., 'node_modules' from 'node_modules/**/*.d.ts')
        const basePath = pattern.split('/')[0];
        const searchDir = path.join(appDir, basePath);
        
        if (fs.existsSync(searchDir)) {
          // Find all files/dirs matching the pattern
          const matches = removeMatchingFiles(searchDir, pattern);
          matches.forEach(match => {
            try {
              const stat = fs.lstatSync(match);
              if (stat.isDirectory()) {
                removeDir(match);
              } else {
                fs.unlinkSync(match);
              }
            } catch (err) {
              // Ignore errors for individual files
            }
          });
        }
      } else {
        // Simple path without glob
        const fullPath = path.join(appDir, pattern);
        if (fs.existsSync(fullPath)) {
          try {
            if (fs.lstatSync(fullPath).isDirectory()) {
              removeDir(fullPath);
            } else {
              fs.unlinkSync(fullPath);
            }
          } catch (err) {
            // Ignore errors
          }
        }
      }
    } catch (err) {
      // Ignore errors for patterns that can't be processed
      // This prevents the build from failing if cleanup has issues
    }
  });
}; 