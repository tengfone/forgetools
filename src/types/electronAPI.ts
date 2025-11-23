import { QRCodeGenerateOptions, BarcodeGenerateOptions } from './ipc';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface RandomStringOptions {
  lowercase?: boolean;
  uppercase?: boolean;
  numbers?: boolean;
  special?: boolean;
}

export interface ULIDDecoded {
  timestamp: number;
  date: string;
}

export interface CronParseResult {
  next: string;
  prev: string;
  description: string;
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

export interface AjvValidationResult {
  valid: boolean;
  errors: unknown[] | null;
}

export interface JSONValidationResult {
  valid: boolean;
  parsed?: unknown;
  error?: string;
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
  };
  beautify: {
    html: (html: string, options?: unknown) => string;
    css: (css: string, options?: unknown) => string;
    js: (js: string, options?: unknown) => string;
    sql: (sql: string) => string;
  };
  yaml: {
    parse: (str: string) => unknown;
    stringify: (obj: unknown) => string;
  };
  ajv: {
    validate: (schema: unknown, data: unknown) => AjvValidationResult;
  };
  marked: {
    parse: (markdown: string) => string;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
  crypto: {
    md5: (text: string) => string;
    sha1: (text: string) => string;
    sha256: (text: string) => string;
    sha512: (text: string) => string;
  };
  color: {
    convert: {
      rgb: {
        hex: (rgb: RGB | [number, number, number]) => string;
        hsl: (rgb: RGB | [number, number, number]) => HSL;
        hsv: (rgb: RGB | [number, number, number]) => unknown;
        cmyk: (rgb: RGB | [number, number, number]) => unknown;
        ansi256: (rgb: RGB | [number, number, number]) => number;
        lab: (rgb: RGB | [number, number, number]) => unknown;
      };
      hex: {
        rgb: (hex: string) => [number, number, number];
      };
      hsl: {
        rgb: (hsl: HSL | [number, number, number]) => [number, number, number];
      };
    };
  };
  qrcode: {
    generate: (text: string, options?: QRCodeGenerateOptions) => Promise<string>;
    read: (dataUrl: string) => Promise<string>;
  };
  jwt: {
    decode: (token: string) => unknown;
  };
  uuid: {
    generate: () => string;
    validate: (str: string) => boolean;
  };
  ulid: {
    generate: () => string;
    decode: (str: string) => ULIDDecoded;
  };
  diff: {
    create: (oldStr: string, newStr: string) => DiffPart[];
  };
  cron: {
    parse: (expression: string) => CronParseResult;
  };
  csv: {
    toJSON: (csv: string) => CSVParseResult;
    fromJSON: (json: unknown) => string;
  };
  htmlToJsx: {
    convert: (html: string) => string;
  };
  php: {
    serialize: (data: unknown) => string;
    unserialize: (str: string) => unknown;
  };
  svg: {
    optimize: (svg: string) => string;
  };
  x509: {
    decode: (cert: string) => X509Decoded;
  };
  string: {
    toAscii: (hex: string) => string;
    toHex: (ascii: string) => string;
    generateRandom: (length: number, options?: RandomStringOptions) => string;
    cases: {
      toCamelCase: (str: string) => string;
      toPascalCase: (str: string) => string;
      toSnakeCase: (str: string) => string;
      toKebabCase: (str: string) => string;
      toConstantCase: (str: string) => string;
    };
  };
  preprocessors: {
    sass: {
      compile: (scss: string) => string;
    };
    less: {
      compile: (lessCode: string) => Promise<string>;
    };
  };
  base64: {
    encode: (str: string) => string;
    decode: (b64: string) => string;
  };
  validateJson: (str: string) => JSONValidationResult;
  barcode: {
    generate: (text: string, options?: BarcodeGenerateOptions) => Promise<string>;
  };
}

export interface CronParserAPI {
  getNextOccurrences: (expression: string, count?: number) => string[];
  parseExpression: (expression: string) => { valid: boolean };
}

export interface DiffAPI {
  diffLines: (oldStr: string, newStr: string) => DiffPart[];
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    cronParser: CronParserAPI;
    Diff: DiffAPI;
    tools?: unknown;
    monaco?: unknown;
    MonacoEnvironment?: {
      getWorkerUrl?: (workerId: string, label: string) => string;
      getWorker?: (workerId: string, label: string) => Worker | Promise<Worker>;
    };
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      platform: string;
    };
  }
}

