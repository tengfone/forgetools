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

export interface ShortcutResult { ok: boolean; error?: string; accelerator: string | null }
