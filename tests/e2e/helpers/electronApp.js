const { _electron: electron } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

async function launchElectronApp() {
  try {
    console.log("Launching Electron app...");
    console.log("Current directory:", process.cwd());
    
    // Use the compiled main.js from out directory (electron-vite output)
    const mainPath = path.join(__dirname, "../../../out/main/main.js");
    console.log("Main.js path:", mainPath);
    console.log("Main.js exists:", fs.existsSync(mainPath));

    if (!fs.existsSync(mainPath)) {
      throw new Error(`Main.js not found at ${mainPath}. Please run 'npm run build' first.`);
    }

    // Set appropriate environment variables for CI
    const env = {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: true,
      ELECTRON_ENABLE_STACK_DUMPING: true,
      NODE_ENV: "test",
      DISPLAY: process.env.DISPLAY || ":99.0",
      ELECTRON_NO_SANDBOX: "1",
      ELECTRON_DISABLE_SANDBOX: "1",
    };

    const app = await electron.launch({
      args: [mainPath],
      env,
      timeout: 10000,
    });

    console.log("Electron app launched successfully");

    // Wait for the window with retries
    let window;
    let retries = 3;
    while (retries > 0) {
      try {
        window = await app.firstWindow();
        console.log("First window acquired");
        
        // Wait for page to load
        await window.waitForLoadState("domcontentloaded", { timeout: 15000 });
        
        // Check what URL was loaded
        const url = window.url();
        console.log("Window URL:", url);
        
        // Collect console messages and errors
        const consoleMessages = [];
        const pageErrors = [];
        
        window.on('console', msg => {
          const type = msg.type();
          const text = msg.text();
          consoleMessages.push({ type, text });
          if (type === 'error') {
            console.log(`[Console Error] ${text}`);
          }
        });
        
        window.on('pageerror', error => {
          pageErrors.push(error);
          console.log(`[Page Error] ${error.message}`);
        });
        
        // Wait for network to be idle
        await window.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
          console.log("Network idle timeout, continuing...");
        });
        
        // Check if we have the basic HTML structure
        const hasBody = await window.locator('body').count() > 0;
        const hasTitlebar = await window.locator('.titlebar').count() > 0;
        console.log("Has body:", hasBody, "Has titlebar:", hasTitlebar);
        
        // Check if CSS is loaded
        const hasStyles = await window.evaluate(() => {
          const styleSheets = document.styleSheets.length;
          const computedStyle = window.getComputedStyle(document.body);
          return { styleSheets, backgroundColor: computedStyle.backgroundColor };
        });
        console.log("CSS loaded:", hasStyles);
        
        // Wait for app to initialize - check if window.tools exists and toolsNav is populated
        await window.waitForFunction(
          () => {
            // Check if tools are loaded
            if (typeof window.tools === 'undefined') return false;
            const toolsNav = document.getElementById('toolsNav');
            if (!toolsNav) return false;
            // Tools nav should have children (categories and tools)
            return toolsNav.children.length > 0;
          },
          { timeout: 20000 }
        ).catch(async () => {
          console.log("App initialization timeout - checking state...");
          
          // Check what's missing
          const state = await window.evaluate(() => {
            return {
              hasTools: typeof window.tools !== 'undefined',
              hasToolsNav: !!document.getElementById('toolsNav'),
              toolsNavChildren: document.getElementById('toolsNav')?.children.length || 0,
              loadingScreenVisible: document.getElementById('loadingScreen')?.offsetParent !== null
            };
          });
          console.log("App state:", JSON.stringify(state, null, 2));
          
          // If loading screen is stuck, hide it
          if (state.loadingScreenVisible) {
            await window.evaluate(() => {
              const el = document.getElementById('loadingScreen');
              if (el) el.style.display = 'none';
            });
          }
        });
        
        // Log any errors that occurred
        if (pageErrors.length > 0) {
          console.log(`Found ${pageErrors.length} page errors`);
        }
        const errorMessages = consoleMessages.filter(m => m.type === 'error');
        if (errorMessages.length > 0) {
          console.log(`Found ${errorMessages.length} console errors`);
        }
        
        // Give app time to fully initialize
        await window.waitForTimeout(1000);
        
        console.log("Window loaded successfully");
        break;
      } catch (err) {
        console.log(`Retry ${4 - retries} failed:`, err.message);
        retries--;
        if (retries === 0) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Additional checks to ensure window is ready
    const isReady = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win && !win.isDestroyed() && win.isVisible();
    });
    console.log("Window ready state:", isReady);

    if (!isReady) {
      throw new Error("Window is not in ready state");
    }

    return { app, window };
  } catch (error) {
    console.error("Failed to launch Electron app:", error);
    console.error("Error stack:", error.stack);
    if (error.stdout) console.error("Process stdout:", error.stdout);
    if (error.stderr) console.error("Process stderr:", error.stderr);
    throw error;
  }
}

module.exports = { launchElectronApp };
