const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const QRCode = require("qrcode");
const {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  GlobalHistogramBinarizer,
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

    // Create a Uint8ClampedArray from the buffer
    const length = buffer.length;
    const rgbaData = new Uint8ClampedArray(length);
    
    // Copy buffer data to Uint8ClampedArray
    for (let i = 0; i < length; i++) {
      rgbaData[i] = buffer[i];
    }

    // Calculate dimensions from the buffer size
    // Assuming RGBA format (4 bytes per pixel)
    const pixelCount = length / 4;
    const width = Math.sqrt(pixelCount);
    const height = width;

    // Create RGB data (3 bytes per pixel)
    const rgbData = new Uint8ClampedArray(width * height * 3);
    for (let i = 0, j = 0; i < length; i += 4, j += 3) {
      rgbData[j] = rgbaData[i];     // R
      rgbData[j + 1] = rgbaData[i + 1]; // G
      rgbData[j + 2] = rgbaData[i + 2]; // B
    }

    // Create luminance source and try different approaches
    const luminanceSource = new RGBLuminanceSource(rgbData, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    // Set up hints for QR code reading
    const hints = new Map();
    hints.set(2, true); // TRY_HARDER
    hints.set(3, true); // PURE_BARCODE
    hints.set(7, true); // TRY_ROTATE

    const reader = new MultiFormatReader();

    try {
      // First attempt: normal read
      const result = reader.decode(binaryBitmap, hints);
      if (result) {
        return result.getText();
      }
    } catch (firstError) {
      try {
        // Second attempt: inverted image
        const inverted = luminanceSource.invert();
        const invertedBitmap = new BinaryBitmap(new HybridBinarizer(inverted));
        const result = reader.decode(invertedBitmap, hints);
        if (result) {
          return result.getText();
        }
      } catch (secondError) {
        try {
          // Third attempt: try with global histogram binarizer
          const globalBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
          const result = reader.decode(globalBitmap, hints);
          if (result) {
            return result.getText();
          }
        } catch (thirdError) {
          // All attempts failed
          throw new Error("Could not detect a valid QR code. Please ensure the image is clear and try again.");
        }
      }
    }

    throw new Error("No QR code found in the image.");
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
