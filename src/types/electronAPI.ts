import { QRCodeGenerateOptions, BarcodeGenerateOptions, BackgroundSettings, ShortcutResult, AppInfo, ExternalLinkId, UpdateCheckResult, UpdatePrefs } from './ipc';

export interface X509Decoded {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  signatureAlgorithm: string;
  fingerprint: {
    sha1: string;
    sha256: string;
  };
}

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    /** Sync the native title bar overlay (Windows/Linux) with the app theme. */
    setTitleBarTheme: (theme: 'dark' | 'light') => void;
  };
  app: {
    getInfo: () => Promise<AppInfo>;
    /** Opens one of the allowlisted EXTERNAL_LINKS in the default browser. */
    openLink: (id: ExternalLinkId) => Promise<void>;
  };
  updates: {
    /** Manual check: always asks GitHub, rejects on failure. */
    check: () => Promise<UpdateCheckResult>;
    /** Startup check: only hits the network when opted in and >24h since the last check. */
    auto: () => Promise<UpdateCheckResult | null>;
    getPrefs: () => Promise<UpdatePrefs>;
    setPrefs: (patch: Partial<UpdatePrefs>) => Promise<UpdatePrefs>;
  };
  background: {
    getBackgroundSettings: () => Promise<BackgroundSettings>;
    setBackgroundSettings: (patch: Partial<BackgroundSettings>) => Promise<BackgroundSettings>;
    setGlobalShortcut: (accel: string | null) => Promise<ShortcutResult>;
    /** Global shortcut brought the window back: show Home with the search box focused. */
    onGoHome: (cb: () => void) => void;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
    readText: () => Promise<string>;
  };
  /** Hashes run in the main process (MD5 is not available in Web Crypto). */
  crypto: {
    md5: (text: string) => Promise<string>;
    sha1: (text: string) => Promise<string>;
    sha256: (text: string) => Promise<string>;
    sha512: (text: string) => Promise<string>;
  };
  qrcode: {
    generate: (text: string, options?: QRCodeGenerateOptions) => Promise<string>;
  };
  svg: {
    optimize: (svg: string) => Promise<string>;
  };
  x509: {
    decode: (cert: string) => Promise<X509Decoded>;
  };
  barcode: {
    generate: (text: string, options?: BarcodeGenerateOptions) => Promise<string>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      platform: string;
    };
  }
}
