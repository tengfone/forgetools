import { app, BrowserWindow, clipboard, Menu, nativeTheme, session, type MenuItemConstructorOptions } from 'electron';
import crypto from 'crypto';
import path from 'path';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { optimize as svgoOptimize } from 'svgo';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { IPC_CHANNELS } from '../types/ipc';
import type { X509Decoded } from '../types/electronAPI';
import { attachWindow, claimSingleInstance, initBackground, showWindow, startHidden } from './background';
import { DEV_SERVER_URL, handle, isAppUrl, on } from './ipcGuard';

if (!claimSingleInstance()) app.quit();

let mainWindow: BrowserWindow | null = null;

// ── Input validation helpers ─────────────────────────────────────────────────
const MAX_TEXT = 10 * 1024 * 1024; // generic tool input cap
const requireString = (v: unknown, name: string, max = MAX_TEXT): string => {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
  if (v.length > max) throw new Error(`${name} is too large`);
  return v;
};
const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const clampNum = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (v: unknown): string | undefined => (typeof v === 'string' && COLOR_RE.test(v) ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;
/** Drop undefined keys so library defaults apply. */
const defined = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ── Window controls (act on the sender's own window) ─────────────────────────
on(IPC_CHANNELS.WINDOW.MINIMIZE, (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

on(IPC_CHANNELS.WINDOW.MAXIMIZE, (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

on(IPC_CHANNELS.WINDOW.CLOSE, (event) => {
  // Same path as the native close button: hides to the tray when background mode is on
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// Title bar overlay (Windows/Linux): keep the native caption buttons in our palette
const TITLEBAR_HEIGHT = 40;
const overlayFor = (dark: boolean) => dark
  ? { color: '#0b0b0c', symbolColor: '#a1a1aa', height: TITLEBAR_HEIGHT }
  : { color: '#f4f4f2', symbolColor: '#52525b', height: TITLEBAR_HEIGHT };

on(IPC_CHANNELS.WINDOW.SET_THEME, (event, theme: unknown) => {
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
// accelerators keep working. Reload/devtools only in unpackaged (dev/test) builds.
function installMenu(): void {
  if (process.platform === 'darwin') return; // keep the default macOS app menu
  const devItems: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      ...devItems,
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
    ] },
  ]));
}

// ── Clipboard ────────────────────────────────────────────────────────────────
// Goes through the main process: navigator.clipboard needs permissions that the
// deny-all permission handler refuses.
const CLIPBOARD_MAX = 20 * 1024 * 1024;
handle(IPC_CHANNELS.CLIPBOARD.WRITE, async (_event, text: unknown): Promise<void> => {
  await clipboard.writeText(requireString(text, 'clipboard text', CLIPBOARD_MAX));
});
handle(IPC_CHANNELS.CLIPBOARD.READ, async (): Promise<string> => {
  const t = await clipboard.readText();
  return t.length > CLIPBOARD_MAX ? t.slice(0, CLIPBOARD_MAX) : t;
});

// ── QR code ──────────────────────────────────────────────────────────────────
const QR_MAX_TEXT = 4296; // max alphanumeric capacity of a version-40 QR code
handle(IPC_CHANNELS.QRCODE.GENERATE, async (_event, text: unknown, options: unknown): Promise<string> => {
  const t = requireString(text, 'QR text', QR_MAX_TEXT);
  const o = asObject(options);
  const c = asObject(o.color);
  return await QRCode.toDataURL(t, {
    errorCorrectionLevel: oneOf(o.errorCorrectionLevel, ['L', 'M', 'Q', 'H'] as const) ?? 'M',
    margin: clampNum(o.margin, 0, 16) ?? 4,
    ...defined({
      scale: clampNum(o.scale, 1, 32),
      width: clampNum(o.width, 32, 2048),
    }),
    color: defined({ dark: color(c.dark), light: color(c.light) }),
  });
});

// ── Barcode ──────────────────────────────────────────────────────────────────
const BARCODE_FORMATS = [
  'CODE128', 'CODE128A', 'CODE128B', 'CODE128C', 'EAN13', 'EAN8', 'EAN5', 'EAN2', 'UPC', 'UPCE',
  'CODE39', 'ITF', 'ITF14', 'MSI', 'MSI10', 'MSI11', 'MSI1010', 'MSI1110', 'pharmacode', 'codabar',
] as const;
handle(IPC_CHANNELS.BARCODE.GENERATE, async (_event, text: unknown, options: unknown): Promise<string> => {
  const t = requireString(text, 'Barcode text', 512);
  const o = asObject(options);
  try {
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, t, {
      xmlDocument: document,
      ...defined({
        format: oneOf(o.format, BARCODE_FORMATS),
        width: clampNum(o.width, 1, 10),
        height: clampNum(o.height, 10, 500),
        displayValue: typeof o.displayValue === 'boolean' ? o.displayValue : undefined,
        fontSize: clampNum(o.fontSize, 6, 72),
        textAlign: oneOf(o.textAlign, ['left', 'center', 'right'] as const),
        textPosition: oneOf(o.textPosition, ['bottom', 'top'] as const),
        textMargin: clampNum(o.textMargin, 0, 50),
        background: color(o.background),
        lineColor: color(o.lineColor),
        margin: clampNum(o.margin, 0, 100),
        marginTop: clampNum(o.marginTop, 0, 100),
        marginBottom: clampNum(o.marginBottom, 0, 100),
        marginLeft: clampNum(o.marginLeft, 0, 100),
        marginRight: clampNum(o.marginRight, 0, 100),
      }),
    } as Parameters<typeof JsBarcode>[2]);
    return xmlSerializer.serializeToString(svgNode);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate barcode: ${errorMessage}`);
  }
});

// ── Hashes (MD5 is not available in Web Crypto, so all run here) ─────────────
const HASH_ALGOS = ['md5', 'sha1', 'sha256', 'sha512'] as const;
handle(IPC_CHANNELS.CRYPTO.HASH, (_event, algo: unknown, text: unknown): string => {
  const a = oneOf(algo, HASH_ALGOS);
  if (!a) throw new Error('Unsupported hash algorithm');
  return crypto.createHash(a).update(requireString(text, 'Hash input'), 'utf8').digest('hex');
});

// ── X.509 ────────────────────────────────────────────────────────────────────
// Read the signatureAlgorithm OID from a DER-encoded X.509 certificate:
// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm SEQUENCE { OID, ... }, signature }
function readSignatureAlgorithmOid(der: Buffer): string {
  let pos = 0;
  const readHeader = (tag: number): number => {
    if (der[pos++] !== tag) throw new Error('Unexpected ASN.1 structure');
    let len = der[pos++]!;
    if (len & 0x80) {
      const bytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < bytes; i++) len = len * 256 + der[pos++]!;
    }
    return len;
  };
  readHeader(0x30); // Certificate
  const tbsLength = readHeader(0x30); // tbsCertificate
  pos += tbsLength;
  readHeader(0x30); // signatureAlgorithm
  const oidLength = readHeader(0x06);
  const oidEnd = Math.min(pos + oidLength, der.length);
  const arcs: number[] = [];
  let value = 0;
  for (; pos < oidEnd; pos++) {
    value = value * 128 + (der[pos]! & 0x7f);
    if (!(der[pos]! & 0x80)) {
      arcs.push(value);
      value = 0;
    }
  }
  const first = arcs.shift() ?? 0;
  const head = first < 40 ? [0, first] : first < 80 ? [1, first - 40] : [2, first - 80];
  return [...head, ...arcs].join('.');
}

handle(IPC_CHANNELS.X509.DECODE, (_event, cert: unknown): X509Decoded => {
  const pem = requireString(cert, 'Certificate', 1024 * 1024);
  try {
    const certificate = new crypto.X509Certificate(pem);
    const formatName = (name: string) => name.split('\n').filter(Boolean).join(', ');
    return {
      subject: formatName(certificate.subject),
      issuer: formatName(certificate.issuer),
      notBefore: new Date(certificate.validFrom).toISOString(),
      notAfter: new Date(certificate.validTo).toISOString(),
      serialNumber: certificate.serialNumber.toLowerCase(),
      signatureAlgorithm: readSignatureAlgorithmOid(certificate.raw),
      fingerprint: {
        sha1: crypto.createHash('sha1').update(certificate.raw).digest('hex'),
        sha256: crypto.createHash('sha256').update(certificate.raw).digest('hex'),
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    throw new Error('Invalid certificate: ' + error.message);
  }
});

// ── SVG optimisation ─────────────────────────────────────────────────────────
handle(IPC_CHANNELS.SVG.OPTIMIZE, (_event, svg: unknown): string =>
  svgoOptimize(requireString(svg, 'SVG', 20 * 1024 * 1024)).data);

// Must match the <meta http-equiv="Content-Security-Policy"> in src/renderer/index.html.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-eval'", // unsafe-eval needed for Monaco AMD loader
  "style-src 'self' 'unsafe-inline'", // inline style attributes set at runtime (Monaco, tools)
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // header-only directive (ignored in <meta>)
].join('; ');

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
      // Preload is a self-contained bundle (pure-JS libs only); Node work happens via IPC.
      sandbox: true,
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0c' : '#f4f4f2', // match theme to avoid white flash
  });

  if (!isMac) { mainWindow.setAutoHideMenuBar(false); mainWindow.setMenuBarVisibility(false); }
  const win = mainWindow;
  attachWindow(win);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  if (!startHidden()) win.once('ready-to-show', () => win.show());

  // CSP response header. NOTE: webRequest headers only apply to HTTP(S) responses,
  // i.e. the Vite dev server. Production loads file:// and relies on the <meta> CSP
  // in index.html, which this policy mirrors.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  // Suppress the expected 'unsafe-eval' CSP warning in dev (Monaco's AMD loader needs it).
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', (event) => {
      const message = event.message;
      if (typeof message === 'string' && (
        message.includes('Insecure Content-Security-Policy') ||
        message.includes('unsafe-eval')
      )) {
        event.preventDefault();
      }
    });
  }

  // Navigation hardening: only the app's own index.html (or dev server), never new windows.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
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
