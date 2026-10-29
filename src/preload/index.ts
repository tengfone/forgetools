// Sandboxed preload (webPreferences.sandbox: true): only `electron` may be required at
// runtime. Kept deliberately tiny: it runs before every page load, so pure-JS libraries
// live in the renderer's lazily loaded tool chunks instead. Anything that needs Node
// (crypto, X509, svgo, QR, barcode) lives in the main process behind validated ipcMain.handle channels.
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../types/electronAPI';
import { IPC_CHANNELS, type QRCodeGenerateOptions, type BarcodeGenerateOptions, type BackgroundSettings } from '../types/ipc';

const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
    setTitleBarTheme: (theme: 'dark' | 'light') => ipcRenderer.send(IPC_CHANNELS.WINDOW.SET_THEME, theme === 'dark' ? 'dark' : 'light'),
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP.INFO),
    openLink: (id) => ipcRenderer.invoke(IPC_CHANNELS.APP.OPEN_LINK, String(id)),
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES.CHECK),
    auto: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES.AUTO),
    getPrefs: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES.GET_PREFS),
    setPrefs: (patch) => ipcRenderer.invoke(IPC_CHANNELS.UPDATES.SET_PREFS,
      typeof patch?.autoCheck === 'boolean' ? { autoCheck: patch.autoCheck } : {}),
  },
  background: {
    getBackgroundSettings: () => ipcRenderer.invoke(IPC_CHANNELS.BACKGROUND.GET),
    setBackgroundSettings: (patch: Partial<BackgroundSettings>) => ipcRenderer.invoke(IPC_CHANNELS.BACKGROUND.SET, {
      ...(typeof patch.keepInBackground === 'boolean' ? { keepInBackground: patch.keepInBackground } : {}),
      ...(typeof patch.openAtLogin === 'boolean' ? { openAtLogin: patch.openAtLogin } : {}),
    }),
    setGlobalShortcut: (accel: string | null) => ipcRenderer.invoke(IPC_CHANNELS.BACKGROUND.SET_SHORTCUT, typeof accel === 'string' ? accel : null),
    onGoHome: (cb: () => void) => { ipcRenderer.on(IPC_CHANNELS.BACKGROUND.GO_HOME, () => cb()); },
  },
  clipboard: {
    writeText: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD.WRITE, text),
    readText: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD.READ),
  },
  crypto: {
    md5: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CRYPTO.HASH, 'md5', text),
    sha1: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CRYPTO.HASH, 'sha1', text),
    sha256: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CRYPTO.HASH, 'sha256', text),
    sha512: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.CRYPTO.HASH, 'sha512', text),
  },
  qrcode: {
    generate: async (text: string, options?: QRCodeGenerateOptions): Promise<string> => {
      try {
        return await ipcRenderer.invoke(IPC_CHANNELS.QRCODE.GENERATE, text, options) as string;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Failed to generate QR code: ' + error.message);
      }
    },
  },
  svg: {
    optimize: (svg: string) => ipcRenderer.invoke(IPC_CHANNELS.SVG.OPTIMIZE, svg),
  },
  x509: {
    decode: (cert: string) => ipcRenderer.invoke(IPC_CHANNELS.X509.DECODE, cert),
  },
  barcode: {
    generate: (text: string, options?: BarcodeGenerateOptions): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.BARCODE.GENERATE, text, options) as Promise<string>,
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  platform: process.platform,
});
