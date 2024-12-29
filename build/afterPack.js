const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const { appOutDir, packager, electronPlatformName } = context;

  // Paths to clean up
  const pathsToRemove = [
    'node_modules/@playwright',
    'node_modules/@types',
    'node_modules/typescript',
    'node_modules/**/*.d.ts',
    'node_modules/**/*.map',
    'node_modules/**/*.md',
    'node_modules/**/test',
    'node_modules/**/tests',
    'node_modules/**/docs',
    'node_modules/**/.bin',
    'node_modules/**/.github'
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
    const fullPath = path.join(appDir, pattern);
    if (fs.existsSync(fullPath)) {
      if (fs.lstatSync(fullPath).isDirectory()) {
        removeDir(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  });
}; 