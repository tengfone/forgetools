const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const QRCode = require("qrcode");
const {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} = require("@zxing/library");

// Window control handlers
ipcMain.on('window:minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

// QR code handlers
ipcMain.handle("qrcode:generate", async (event, text, options) => {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 8,
    ...options,
  });
});

ipcMain.handle("qrcode:read", async (event, dataUrl) => {
  try {
    // Convert data URL to image data
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Get image dimensions by reading the first few bytes
    // This avoids needing the canvas library
    let width = 0;
    let height = 0;

    // Try to get dimensions from PNG header
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      // PNG magic number
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    } else {
      // Assume a reasonable default size if we can't detect
      width = 400;
      height = 400;
    }

    // Create luminance source from RGB data
    const rgbData = new Uint8ClampedArray(width * height * 3);
    for (
      let i = 0, j = 0;
      i < buffer.length && j < rgbData.length;
      i += 4, j += 3
    ) {
      rgbData[j] = buffer[i]; // R
      rgbData[j + 1] = buffer[i + 1]; // G
      rgbData[j + 2] = buffer[i + 2]; // B
    }

    const luminanceSource = new RGBLuminanceSource(rgbData, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    // Create QR code reader
    const reader = new MultiFormatReader();
    const result = reader.decode(binaryBitmap);

    if (result) {
      return result.getText();
    }
    throw new Error("No QR code found in image");
  } catch (error) {
    throw new Error(`Failed to read QR code: ${error.message}`);
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 1000,
    minHeight: 500,
    center: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
      sandbox: false, // Allow access to node modules
    },
    backgroundColor: "#ffffff",
  });

  // Enable window dragging on the custom titlebar
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      document.body.style.appRegion = 'drag';
    `);
  });

  // Set proper CSP headers
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self';" +
              "img-src 'self' data: blob:;" +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
              "style-src 'self' 'unsafe-inline';" +
              "connect-src 'self';" +
              "font-src 'self';" +
              "object-src 'none';" +
              "base-uri 'self';" +
              "form-action 'self';" +
              "frame-ancestors 'none';",
          ],
        },
      });
    }
  );

  mainWindow.loadFile(path.join(__dirname, "./renderer/index.html"));

  // Open DevTools in development
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
