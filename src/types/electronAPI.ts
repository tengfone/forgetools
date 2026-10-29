import { QRCodeGenerateOptions, BarcodeGenerateOptions, BackgroundSettings, ShortcutResult } from './ipc';

export interface ULIDDecoded {
  timestamp: number;
  date: string;
}

export interface CSVParseResult {
  data: Record<string, unknown>[];
  errors: unknown[];
  meta: unknown;
}

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
  background: {
    getBackgroundSettings: () => Promise<BackgroundSettings>;
    setBackgroundSettings: (patch: Partial<BackgroundSettings>) => Promise<BackgroundSettings>;
    setGlobalShortcut: (accel: string | null) => Promise<ShortcutResult>;
    /** Global shortcut brought the window back: show Home with the search box focused. */
    onGoHome: (cb: () => void) => void;
  };
  beautify: {
    html: (html: string, options?: unknown) => string;
  };
  yaml: {
    parse: (str: string) => unknown;
  };
  marked: {
    parse: (markdown: string) => string;
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
  ulid: {
    generate: () => string;
    decode: (str: string) => ULIDDecoded;
  };
  csv: {
    toJSON: (csv: string) => CSVParseResult;
    /** Throws unless `json` is an array of plain objects. */
    fromJSON: (json: unknown) => string;
  };
  htmlToJsx: {
    convert: (html: string) => string;
  };
  svg: {
    optimize: (svg: string) => Promise<string>;
  };
  x509: {
    decode: (cert: string) => Promise<X509Decoded>;
  };
  string: {
    /** Hex bytes -> text, decoded as UTF-8. */
    toAscii: (hex: string) => string;
    /** Text -> hex of its UTF-8 bytes. */
    toHex: (text: string) => string;
    cases: {
      toCamelCase: (str: string) => string;
      toPascalCase: (str: string) => string;
      toSnakeCase: (str: string) => string;
      toKebabCase: (str: string) => string;
      toConstantCase: (str: string) => string;
    };
  };
  barcode: {
    generate: (text: string, options?: BarcodeGenerateOptions) => Promise<string>;
  };
}

export interface CronParserAPI {
  getNextOccurrences: (expression: string, count?: number) => string[];
}

export interface DiffAPI {
  diffLines: (oldStr: string, newStr: string) => DiffPart[];
  diffWords: (oldStr: string, newStr: string) => DiffPart[];
  diffChars: (oldStr: string, newStr: string) => DiffPart[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    cronParser: CronParserAPI;
    Diff: DiffAPI;
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      platform: string;
    };
  }
}
