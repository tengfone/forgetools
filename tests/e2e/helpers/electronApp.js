const { _electron: electron } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

async function launchElectronApp() {
  try {
    console.log("Launching Electron app...");
    console.log("Current directory:", process.cwd());
    const mainPath = path.join(__dirname, "../../../src/main.js");
    console.log("Main.js path:", mainPath);
    console.log("Main.js exists:", fs.existsSync(mainPath));

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

    console.log("Launch environment:", env);

    const app = await electron.launch({
      args: [mainPath],
      env,
      timeout: 5000,
    });

    console.log("Electron app launched successfully");

    // Wait for the window with retries
    let window;
    let retries = 2;
    while (retries > 0) {
      try {
        window = await app.firstWindow();
        console.log("First window acquired");
        await window.waitForLoadState("domcontentloaded", { timeout: 2000 });
        console.log("Window loaded successfully");
        break;
      } catch (err) {
        console.log(`Retry ${3 - retries} failed:`, err);
        retries--;
        if (retries === 0) throw err;
        await new Promise((resolve) => setTimeout(resolve, 250));
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
