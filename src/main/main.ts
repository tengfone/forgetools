import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import QRCode from 'qrcode';
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  GlobalHistogramBinarizer,
} from '@zxing/library';
import JsBarcode from 'jsbarcode';
import { DOMImplementation, XMLSerializer } from 'xmldom';
import { IPC_CHANNELS, type QRCodeGenerateOptions, type BarcodeGenerateOptions } from '../types/ipc';

// Window control handlers
ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, () => {
  // On macOS, closing the window should quit the app (not keep it running in background)
  // This provides a more intuitive experience for users
  app.quit();
});

// QR code handlers
ipcMain.handle(IPC_CHANNELS.QRCODE.GENERATE, async (_event, text: string, options?: QRCodeGenerateOptions) => {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 4,
    scale: 8,
    ...options,
  });
});

ipcMain.handle(IPC_CHANNELS.QRCODE.READ, async (_event, dataUrl: string): Promise<string> => {
  try {
    // Convert data URL to image data
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Optimize: Use Buffer directly instead of copying to Uint8ClampedArray
    const length = buffer.length;
    
    // Validate buffer size (must be RGBA, 4 bytes per pixel)
    if (length % 4 !== 0) {
      throw new Error('Invalid image format: expected RGBA data');
    }

    // Calculate dimensions from the buffer size
    const pixelCount = length / 4;
    const width = Math.sqrt(pixelCount);
    const height = width;

    // Validate dimensions
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error('Invalid image dimensions');
    }

    // Create RGB data (3 bytes per pixel) - optimized loop
    const rgbData = new Uint8ClampedArray(width * height * 3);
    for (let i = 0, j = 0; i < length; i += 4, j += 3) {
      rgbData[j] = buffer[i]!;     // R
      rgbData[j + 1] = buffer[i + 1]!; // G
      rgbData[j + 2] = buffer[i + 2]!; // B
    }

    // Create luminance source
    const luminanceSource = new RGBLuminanceSource(rgbData, width, height);
    
    // Set up hints for QR code reading
    const hints = new Map();
    hints.set(2, true); // TRY_HARDER
    hints.set(3, true); // PURE_BARCODE

    const reader = new MultiFormatReader();

    // Try with HybridBinarizer first (most common case)
    try {
      const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      const result = reader.decode(binaryBitmap, hints);
      if (result) {
        return result.getText();
      }
    } catch {
      // Fall through to next attempt
    }

    // Try with inverted image (for dark QR codes on light backgrounds)
    try {
      const inverted = luminanceSource.invert();
      const invertedBitmap = new BinaryBitmap(new HybridBinarizer(inverted));
      const result = reader.decode(invertedBitmap, hints);
      if (result) {
        return result.getText();
      }
    } catch {
      // Fall through to next attempt
    }

    // Last attempt: global histogram binarizer (for low contrast images)
    try {
      const globalBitmap = new BinaryBitmap(new GlobalHistogramBinarizer(luminanceSource));
      hints.set(7, true); // TRY_ROTATE
      const result = reader.decode(globalBitmap, hints);
      if (result) {
        return result.getText();
      }
    } catch {
      // All attempts failed
    }

    throw new Error('Could not detect a valid QR code. Please ensure the image is clear and try again.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read QR code: ${errorMessage}`);
  }
});

// Barcode handler
ipcMain.handle(IPC_CHANNELS.BARCODE.GENERATE, async (_event, text: string, options?: BarcodeGenerateOptions): Promise<string> => {
  try {
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    JsBarcode(svgNode, text, {
      xmlDocument: document,
      ...options
    });

    return xmlSerializer.serializeToString(svgNode);
  } catch (error) {
    // Error logging handled by Electron's error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate barcode: ${errorMessage}`);
  }
});

function createWindow(): void {
  const isMac = process.platform === 'darwin';
  
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 1000,
    minHeight: 500,
    center: true,
    // Use native window controls on all platforms
    // macOS: hiddenInset gives native controls with custom titlebar area
    // Windows/Linux: frame: true gives native titlebar with controls
    frame: true, // Native frame on all platforms
    titleBarStyle: isMac ? 'hiddenInset' : undefined, // Native macOS controls with inset
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: true,
      sandbox: false, // Allow access to node modules
    },
    backgroundColor: '#ffffff',
  });

  // Set proper CSP headers
  // Note: 'unsafe-eval' is required for Monaco Editor workers (AMD/RequireJS)
  // 'unsafe-inline' is required for Tailwind CSS JIT mode
  // This warning will not appear in production builds (only in development)
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
              "img-src 'self' data: blob:;" +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval';" + // unsafe-eval needed for Monaco workers
              "style-src 'self' 'unsafe-inline';" + // unsafe-inline needed for Tailwind JIT
              "worker-src 'self' blob:;" + // Allow web workers for Monaco Editor
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

  // Suppress CSP warning in development (it won't appear in production anyway)
  // The warning is expected because Monaco Editor requires 'unsafe-eval' for its RequireJS loader
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.webContents.on('console-message', (event, level, message) => {
      if (typeof message === 'string' && (
        message.includes('Insecure Content-Security-Policy') ||
        message.includes('unsafe-eval')
      )) {
        event.preventDefault(); // Suppress the warning
      }
    });
  }

  // Electron-Vite automatically sets VITE_DEV_SERVER_URL in dev mode
  // In production/test, load from the built file
  if (process.env.VITE_DEV_SERVER_URL) {
    // Development mode - use Vite dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Production/Test mode - load from built file
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // DevTools can be opened manually with Cmd+Option+I (macOS) or Ctrl+Shift+I (Windows/Linux)
  // if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  //   mainWindow.webContents.openDevTools();
  // }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit the app when all windows are closed, even on macOS
  // This ensures the app doesn't stay running in the background
  app.quit();
});

