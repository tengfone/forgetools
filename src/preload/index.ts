import { contextBridge, ipcRenderer } from 'electron';
import beautify from 'js-beautify';
import { jwtDecode } from 'jwt-decode';
import yaml from 'js-yaml';
import { marked } from 'marked';
import crypto from 'crypto';
import colorConvert from 'color-convert';
import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import { diffLines } from 'diff';
import cronParser from 'cron-parser';
import Papa from 'papaparse';
import HTMLtoJSX from 'htmltojsx';
import { serialize, unserialize } from 'php-serialize';
import { optimize } from 'svgo';
import sass from 'sass';
import less from 'less';
import forge from 'node-forge';
import Ajv from 'ajv';
import type { ElectronAPI, CronParserAPI, DiffAPI } from '../types/electronAPI';
import { IPC_CHANNELS, type QRCodeGenerateOptions, type BarcodeGenerateOptions } from '../types/ipc';

const ajv = new Ajv();

// Initialize HTML to JSX converter
const htmlToJSXConverter = new HTMLtoJSX({
  createClass: false,
  indent: '  ',
});

// Define the electronAPI object
const electronAPI: ElectronAPI = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
  },
  beautify: {
    html: beautify.html,
    css: beautify.css,
    js: beautify.js,
    sql: (str: string): string => {
      // Basic SQL formatting since js-beautify doesn't include SQL
      return str
        .replace(/\s+/g, ' ')
        .replace(/\s*([,()])\s*/g, '$1 ')
        .replace(/\bSELECT\b/gi, '\nSELECT')
        .replace(/\bFROM\b/gi, '\nFROM')
        .replace(/\bWHERE\b/gi, '\nWHERE')
        .replace(/\bAND\b/gi, '\n  AND')
        .replace(/\bOR\b/gi, '\n  OR')
        .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
        .replace(/\bORDER BY\b/gi, '\nORDER BY')
        .replace(/\bHAVING\b/gi, '\nHAVING')
        .replace(/\bLIMIT\b/gi, '\nLIMIT')
        .trim();
    },
  },
  yaml: {
    parse: (str: string) => yaml.load(str),
    stringify: (obj: unknown) => yaml.dump(obj),
  },
  ajv: {
    validate: (schema: unknown, data: unknown) => {
      try {
        const validate = ajv.compile(schema);
        const valid = validate(data);
        return {
          valid,
          errors: validate.errors || null
        };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Schema validation error: ' + error.message);
      }
    }
  },
  marked: {
    parse: marked.parse,
  },
  clipboard: {
    writeText: async (text: string) => navigator.clipboard.writeText(text),
  },
  crypto: {
    md5: (text: string) => crypto.createHash('md5').update(text).digest('hex'),
    sha1: (text: string) => crypto.createHash('sha1').update(text).digest('hex'),
    sha256: (text: string) => crypto.createHash('sha256').update(text).digest('hex'),
    sha512: (text: string) => crypto.createHash('sha512').update(text).digest('hex'),
  },
  color: {
    convert: {
      rgb: {
        hex: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.hex(arr as [number, number, number]);
        },
        hsl: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.hsl(arr as [number, number, number]);
        },
        hsv: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.hsv(arr as [number, number, number]);
        },
        cmyk: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.cmyk(arr as [number, number, number]);
        },
        ansi256: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.ansi256(arr as [number, number, number]);
        },
        lab: (rgb: [number, number, number] | { r: number; g: number; b: number }) => {
          const arr = Array.isArray(rgb) ? rgb : [rgb.r, rgb.g, rgb.b];
          return colorConvert.rgb.lab(arr as [number, number, number]);
        },
      },
      hex: {
        rgb: (hex: string) => colorConvert.hex.rgb(hex) as [number, number, number],
      },
      hsl: {
        rgb: (hsl: [number, number, number] | { h: number; s: number; l: number }) => {
          const arr = Array.isArray(hsl) ? hsl : [hsl.h, hsl.s, hsl.l];
          return colorConvert.hsl.rgb(arr as [number, number, number]) as [number, number, number];
        },
      },
    },
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
    read: async (dataUrl: string): Promise<string> => {
      try {
        return await ipcRenderer.invoke(IPC_CHANNELS.QRCODE.READ, dataUrl) as string;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Failed to read QR code: ' + error.message);
      }
    }
  },
  jwt: {
    decode: (token: string) => jwtDecode(token),
  },
  uuid: {
    generate: () => uuidv4(),
    validate: (str: string): boolean => {
      try {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          str
        );
      } catch {
        return false;
      }
    },
  },
  ulid: {
    generate: () => ulid(),
    decode: (str: string) => {
      try {
        const time = ulid.decodeTime(str);
        return {
          timestamp: time,
          date: new Date(time).toISOString(),
        };
      } catch {
        throw new Error('Invalid ULID');
      }
    },
  },
  diff: {
    create: (oldStr: string, newStr: string) => {
      return diffLines(oldStr, newStr).map((part) => ({
        value: part.value,
        added: part.added,
        removed: part.removed,
      }));
    },
  },
  cron: {
    parse: (expression: string) => {
      try {
        const interval = cronParser.parseExpression(expression);
        return {
          next: interval.next().toString(),
          prev: interval.prev().toString(),
          description:
            'Next 5 occurrences:\n' +
            Array.from({ length: 5 }, () => interval.next().toString()).join(
              '\n'
            ),
        };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Invalid cron expression: ' + error.message);
      }
    },
  },
  csv: {
    toJSON: (csv: string) => Papa.parse(csv, { header: true }) as { data: Record<string, unknown>[]; errors: unknown[]; meta: unknown },
    fromJSON: (json: unknown) => Papa.unparse(json),
  },
  htmlToJsx: {
    convert: (html: string) => htmlToJSXConverter.convert(html),
  },
  php: {
    serialize: (data: unknown) => serialize(data),
    unserialize: (str: string) => unserialize(str),
  },
  svg: {
    optimize: (svg: string) => optimize(svg).data,
  },
  x509: {
    decode: (cert: string) => {
      try {
        const certificate = forge.pki.certificateFromPem(cert);
        return {
          subject: certificate.subject.attributes
            .map((attr) => `${attr.shortName}=${attr.value}`)
            .join(', '),
          issuer: certificate.issuer.attributes
            .map((attr) => `${attr.shortName}=${attr.value}`)
            .join(', '),
          notBefore: certificate.validity.notBefore.toISOString(),
          notAfter: certificate.validity.notAfter.toISOString(),
          serialNumber: certificate.serialNumber,
          signatureAlgorithm: certificate.signatureOid,
          fingerprint: {
            sha1: forge.md.sha1
              .create()
              .update(
                forge.asn1
                  .toDer(forge.pki.certificateToAsn1(certificate))
                  .getBytes()
              )
              .digest()
              .toHex(),
            sha256: forge.md.sha256
              .create()
              .update(
                forge.asn1
                  .toDer(forge.pki.certificateToAsn1(certificate))
                  .getBytes()
              )
              .digest()
              .toHex(),
          },
        };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Invalid certificate: ' + error.message);
      }
    },
  },
  string: {
    toAscii: (hex: string): string => {
      return hex.replace(/[0-9A-Fa-f]{2}/g, (match) =>
        String.fromCharCode(parseInt(match, 16))
      );
    },
    toHex: (ascii: string): string => {
      return ascii
        .split('')
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
    },
    generateRandom: (length: number, options: { lowercase?: boolean; uppercase?: boolean; numbers?: boolean; special?: boolean } = {}): string => {
      const charset = {
        lowercase: 'abcdefghijklmnopqrstuvwxyz',
        uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        numbers: '0123456789',
        special: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      };
      let chars = '';
      if (options.lowercase) chars += charset.lowercase;
      if (options.uppercase) chars += charset.uppercase;
      if (options.numbers) chars += charset.numbers;
      if (options.special) chars += charset.special;
      if (!chars)
        chars = charset.lowercase + charset.uppercase + charset.numbers;

      let result = '';
      const array = new Uint8Array(length);
      crypto.randomFillSync(array);
      for (let i = 0; i < length; i++) {
        result += chars[array[i]! % chars.length]!;
      }
      return result;
    },
    cases: {
      toCamelCase: (str: string): string => {
        // Handle various input formats: spaces, underscores, hyphens, camelCase, PascalCase
        return str
          .trim()
          .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^(.)/, (c) => c.toLowerCase());
      },
      toPascalCase: (str: string): string => {
        // Handle various input formats
        return str
          .trim()
          .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
          .replace(/^(.)/, (c) => c.toUpperCase());
      },
      toSnakeCase: (str: string): string => {
        // Convert camelCase/PascalCase to snake_case, handle existing separators
        return str
          .trim()
          .replace(/([a-z])([A-Z])/g, '$1_$2') // Insert _ before capitals in camelCase
          .replace(/[\s-]+/g, '_') // Replace spaces/hyphens with underscores
          .toLowerCase();
      },
      toKebabCase: (str: string): string => {
        // Convert camelCase/PascalCase to kebab-case, handle existing separators
        return str
          .trim()
          .replace(/([a-z])([A-Z])/g, '$1-$2') // Insert - before capitals in camelCase
          .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
          .toLowerCase();
      },
      toConstantCase: (str: string): string => str.toUpperCase().replace(/[-\s]/g, '_'),
    },
  },
  preprocessors: {
    sass: {
      compile: (scss: string): string => sass.compileString(scss).css,
    },
    less: {
      compile: async (lessCode: string): Promise<string> => {
        const output = await less.render(lessCode);
        return output.css;
      },
    },
  },
  base64: {
    encode: (str: string): string => Buffer.from(str).toString('base64'),
    decode: (b64: string): string => {
      try {
        // Handle URL-safe base64
        const cleaned = b64.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(cleaned, 'base64').toString('utf-8');
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        throw new Error('Invalid base64 string: ' + error.message);
      }
    },
  },
  validateJson: (str: string) => {
    try {
      const parsed = JSON.parse(str);
      return { valid: true, parsed };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { valid: false, error: error.message };
    }
  },
  barcode: {
    generate: (text: string, options?: BarcodeGenerateOptions): Promise<string> => {
      return ipcRenderer.invoke(IPC_CHANNELS.BARCODE.GENERATE, text, options) as Promise<string>;
    },
  },
};

// Expose electronAPI to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Expose platform information to renderer
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  platform: process.platform
});

// Expose cronParser helper because contextBridge cannot pass objects with methods (like .next())
const cronParserAPI: CronParserAPI = {
  getNextOccurrences: (expression: string, count = 5): string[] => {
    try {
      const interval = cronParser.parseExpression(expression);
      const dates: string[] = [];
      for (let i = 0; i < count; i++) {
        dates.push(interval.next().toDate().toString());
      }
      return dates;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      throw new Error(error.message);
    }
  },
  parseExpression: (expression: string) => {
    // Keep this for validation if needed, but return simple object
    try {
      cronParser.parseExpression(expression);
      return { valid: true };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      throw new Error(error.message);
    }
  }
};

contextBridge.exposeInMainWorld('cronParser', cronParserAPI);

// Expose Diff library for text diff tool
const diffAPI: DiffAPI = {
  diffLines: diffLines,
};

contextBridge.exposeInMainWorld('Diff', diffAPI);

