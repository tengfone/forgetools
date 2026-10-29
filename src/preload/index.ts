// Sandboxed preload (webPreferences.sandbox: true): only `electron` may be required at
// runtime. The pure-JS libraries below are bundled into this file by electron-vite
// (see electron.vite.config.ts); anything that needs Node (crypto, X509, svgo) lives in
// the main process behind validated ipcMain.handle channels.
import { contextBridge, ipcRenderer } from 'electron';
import beautify from 'js-beautify';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { ulid, decodeTime } from 'ulid';
import { diffLines, diffWords, diffChars } from 'diff';
import cronParser from 'cron-parser';
import Papa from 'papaparse';
import { htmlToJsx } from 'html-to-jsx-transform';
import type { ElectronAPI, CronParserAPI, DiffAPI } from '../types/electronAPI';
import { IPC_CHANNELS, type QRCodeGenerateOptions, type BarcodeGenerateOptions, type BackgroundSettings } from '../types/ipc';

/**
 * Split an identifier/phrase into lower-case words: separators (space, _, -, ., /),
 * camelCase boundaries, acronym boundaries (XMLHttp -> xml http); digits stay attached
 * to the preceding word (version2Beta -> version2 beta).
 */
export function splitWords(str: string): string[] {
  return (str.match(/[A-Z]+\d*(?![a-z])|[A-Z]?[a-z]+\d*|\d+/g) ?? [])
    .map((w) => w.toLowerCase());
}
const cap = (w: string): string => (w ? w[0]!.toUpperCase() + w.slice(1) : w);

const utf8Encoder = new TextEncoder();

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
  beautify: {
    html: (html: string, options?: unknown) => beautify.html(html, options as Parameters<typeof beautify.html>[1]),
  },
  yaml: {
    parse: (str: string) => yaml.load(str),
  },
  marked: {
    parse: (md: string) => marked.parse(md, { async: false }) as string,
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
  ulid: {
    generate: () => ulid(),
    decode: (str: string) => {
      try {
        const time = decodeTime(str);
        return { timestamp: time, date: new Date(time).toISOString() };
      } catch {
        throw new Error('Invalid ULID');
      }
    },
  },
  csv: {
    toJSON: (csv: string) => Papa.parse(csv, { header: true }) as { data: Record<string, unknown>[]; errors: unknown[]; meta: unknown },
    fromJSON: (json: unknown) => {
      if (!Array.isArray(json)) throw new Error('JSON must be an array of objects');
      const bad = json.findIndex((row) => row === null || typeof row !== 'object' || Array.isArray(row));
      if (bad !== -1) throw new Error(`Item ${bad} is not an object: JSON must be an array of objects`);
      return Papa.unparse(json as Record<string, unknown>[]);
    },
  },
  htmlToJsx: {
    convert: (html: string) => htmlToJsx(html),
  },
  svg: {
    optimize: (svg: string) => ipcRenderer.invoke(IPC_CHANNELS.SVG.OPTIMIZE, svg),
  },
  x509: {
    decode: (cert: string) => ipcRenderer.invoke(IPC_CHANNELS.X509.DECODE, cert),
  },
  string: {
    // Hex is the UTF-8 byte sequence of the text, and decodes back the same way.
    toAscii: (hex: string): string => {
      const compact = hex.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
      const pairs = compact.match(/[0-9A-Fa-f]{2}/g) ?? [];
      const bytes = Uint8Array.from(pairs, (p) => parseInt(p, 16));
      return new TextDecoder('utf-8').decode(bytes);
    },
    toHex: (text: string): string =>
      Array.from(utf8Encoder.encode(text), (b) => b.toString(16).padStart(2, '0')).join(''),
    cases: {
      toCamelCase: (str: string): string => splitWords(str).map((w, i) => (i ? cap(w) : w)).join(''),
      toPascalCase: (str: string): string => splitWords(str).map(cap).join(''),
      toSnakeCase: (str: string): string => splitWords(str).join('_'),
      toKebabCase: (str: string): string => splitWords(str).join('-'),
      toConstantCase: (str: string): string => splitWords(str).join('_').toUpperCase(),
    },
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

// contextBridge cannot pass objects with methods (like .next()), so expose plain helpers.
const cronParserAPI: CronParserAPI = {
  getNextOccurrences: (expression: string, count = 5): string[] => {
    const n = Math.max(1, Math.min(50, Math.floor(Number(count) || 5)));
    const interval = cronParser.parseExpression(expression);
    const dates: string[] = [];
    for (let i = 0; i < n; i++) dates.push(interval.next().toDate().toString());
    return dates;
  },
};
contextBridge.exposeInMainWorld('cronParser', cronParserAPI);

const diffAPI: DiffAPI = { diffLines, diffWords, diffChars };
contextBridge.exposeInMainWorld('Diff', diffAPI);
