import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, session } from 'electron';
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
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { IPC_CHANNELS, type QRCodeGenerateOptions, type BarcodeGenerateOptions } from '../types/ipc';
import { attachWindow, claimSingleInstance, initBackground, showWindow, startHidden } from './background';

if (!claimSingleInstance()) app.quit();

let mainWindow: BrowserWindow | null = null;

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
  // Same path as the native close button: hides to the tray when background mode is on
  BrowserWindow.getFocusedWindow()?.close();
});

// Title bar overlay (Windows/Linux): keep the native caption buttons in our palette
const TITLEBAR_HEIGHT = 40;
const overlayFor = (dark: boolean) => dark
  ? { color: '#0b0b0c', symbolColor: '#a1a1aa', height: TITLEBAR_HEIGHT }
  : { color: '#f4f4f2', symbolColor: '#52525b', height: TITLEBAR_HEIGHT };

ipcMain.on(IPC_CHANNELS.WINDOW.SET_THEME, (event, theme: unknown) => {
  if (process.platform === 'darwin') return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  try {
    win.setTitleBarOverlay(overlayFor(theme === 'dark'));
  } catch {
    // Overlay not supported on this platform/window: nothing to sync
  }
});

// Minimal hidden menu on Windows/Linux: no visible menu bar, but the role
// accelerators (undo/redo/cut/copy/paste/select all, reload, devtools) keep working.
function installMenu(): void {
  if (process.platform === 'darwin') return; // keep the default macOS app menu
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
    ] },
  ]));
}

// QR code handlers
// Clipboard goes through the main process: navigator.clipboard needs
// permissions that the deny-all permission handler refuses.
const CLIPBOARD_MAX = 20 * 1024 * 1024;
ipcMain.handle('clipboard:write', (_event, text: unknown): void => {
  if (typeof text !== 'string') throw new Error('clipboard:write expects a string');
  if (text.length > CLIPBOARD_MAX) throw new Error('Text too large for clipboard');
  clipboard.writeText(text);
});
ipcMain.handle('clipboard:read', (): string => {
  const t = clipboard.readText();
  return t.length > CLIPBOARD_MAX ? t.slice(0, CLIPBOARD_MAX) : t;
});

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
  
  mainWindow = new BrowserWindow({
    show: false,
    width: 1000,
    height: 600,
    minWidth: 720,
    minHeight: 500,
    center: true,
    // No native title bar on any platform; the renderer draws its own 40px bar.
    // macOS: hiddenInset keeps the traffic lights inset into our bar.
    // Windows/Linux: 'hidden' + titleBarOverlay keeps the REAL native caption
    // buttons (minimise / maximise / close, snap layouts) drawn over our bar.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: overlayFor(nativeTheme.shouldUseDarkColors) }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: true,
      sandbox: false, // Allow access to node modules
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0c' : '#f4f4f2', // match theme to avoid white flash
  });

  if (!isMac) { mainWindow.setAutoHideMenuBar(false); mainWindow.setMenuBarVisibility(false); }
  const win = mainWindow;
  attachWindow(win);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  if (!startHidden()) win.once('ready-to-show', () => win.show());

  // Set proper CSP headers
  // Note: 'unsafe-eval' is required for Monaco Editor workers (AMD/RequireJS)
  // This warning will not appear in production builds (only in development)
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
              "img-src 'self' data: blob:;" +
              "script-src 'self' 'unsafe-eval';" + // unsafe-eval needed for Monaco AMD loader
              "style-src 'self' 'unsafe-inline';" + // inline style attributes set at runtime (Monaco, tools)
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

  // Navigation hardening: never leave the app, never open new windows.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const isAppUrl = (url: string): boolean =>
    url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

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
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  installMenu();
  createWindow();
  initBackground(() => mainWindow);

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // Only reached when background mode is off (the close handler hides otherwise): quit for real
  app.quit();
});

