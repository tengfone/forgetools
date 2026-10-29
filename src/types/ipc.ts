// IPC Channel Names
export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    SET_THEME: 'window:set-theme'
  },
  BACKGROUND: {
    GET: 'background:get',
    SET: 'background:set',
    SET_SHORTCUT: 'background:set-shortcut',
    GO_HOME: 'background:go-home'
  },
  APP: {
    INFO: 'app:info',
    OPEN_LINK: 'app:open-link'
  },
  UPDATES: {
    CHECK: 'updates:check',
    AUTO: 'updates:auto',
    GET_PREFS: 'updates:get-prefs',
    SET_PREFS: 'updates:set-prefs'
  },
  CLIPBOARD: {
    WRITE: 'clipboard:write',
    READ: 'clipboard:read'
  },
  QRCODE: {
    GENERATE: 'qrcode:generate'
  },
  BARCODE: {
    GENERATE: 'barcode:generate'
  },
  CRYPTO: {
    HASH: 'crypto:hash'
  },
  X509: {
    DECODE: 'x509:decode'
  },
  SVG: {
    OPTIMIZE: 'svg:optimize'
  }
} as const;

// IPC Handler Types
export interface QRCodeGenerateOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  scale?: number;
  width?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export interface BarcodeGenerateOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  textPosition?: 'bottom' | 'top';
  textMargin?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}


/** Main-process preferences for background/tray mode (persisted in userData). */
export interface BackgroundSettings {
  keepInBackground: boolean;
  openAtLogin: boolean;
  globalShortcut: string | null;
}

/** External links the renderer may ask the OS browser to open (allowlisted in main). */
export const EXTERNAL_LINKS = {
  github: 'https://github.com/tengfone/forgetools',
  releases: 'https://github.com/tengfone/forgetools/releases',
  issues: 'https://github.com/tengfone/forgetools/issues',
  coffee: 'https://www.buymeacoffee.com/tengfone'
} as const;
export type ExternalLinkId = keyof typeof EXTERNAL_LINKS | 'latestRelease';

export interface UpdatePrefs { autoCheck: boolean }
export interface UpdateCheckResult {
  current: string;
  /** Latest published version without the "v" (null when never checked). */
  latest: string | null;
  available: boolean;
  checkedAt: number;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
}

export interface ShortcutResult { ok: boolean; error?: string; accelerator: string | null }
