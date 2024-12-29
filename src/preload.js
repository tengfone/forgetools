const { contextBridge, ipcRenderer } = require("electron");
const beautify = require("js-beautify");
const yaml = require("yaml");
const hljs = require("highlight.js");
const { marked } = require("marked");
const crypto = require("crypto");
const colorConvert = require("color-convert");
const QRCode = require("qrcode");
const { KJUR, KEYUTIL, X509 } = require("jsrsasign");
const { v4: uuidv4 } = require("uuid");
const { ulid } = require("ulid");
const { createDiff } = require("diff");
const cronParser = require("cron-parser");
const Papa = require("papaparse");
const HTMLtoJSX = require("htmltojsx");
const { serialize, unserialize } = require("php-serialize");
const { optimize } = require("svgo");
const { jwtDecode } = require("jwt-decode");
const sass = require("sass");
const less = require("less");
const forge = require("node-forge");
const Ajv = require("ajv");
const ajv = new Ajv();

// Initialize HTML to JSX converter
const htmlToJSXConverter = new HTMLtoJSX({
  createClass: false,
  indent: "  ",
});

// Expose required Node.js modules to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  beautify: {
    html: beautify.html,
    css: beautify.css,
    js: beautify.js,
    sql: (str) => {
      // Basic SQL formatting since js-beautify doesn't include SQL
      return str
        .replace(/\s+/g, " ")
        .replace(/\s*([,()])\s*/g, "$1 ")
        .replace(/\bSELECT\b/gi, "\nSELECT")
        .replace(/\bFROM\b/gi, "\nFROM")
        .replace(/\bWHERE\b/gi, "\nWHERE")
        .replace(/\bAND\b/gi, "\n  AND")
        .replace(/\bOR\b/gi, "\n  OR")
        .replace(/\bGROUP BY\b/gi, "\nGROUP BY")
        .replace(/\bORDER BY\b/gi, "\nORDER BY")
        .replace(/\bHAVING\b/gi, "\nHAVING")
        .replace(/\bLIMIT\b/gi, "\nLIMIT")
        .trim();
    },
  },
  yaml: {
    parse: (str) => yaml.parse(str),
    stringify: (obj) => yaml.stringify(obj),
  },
  hljs: {
    highlight: hljs.highlight,
    highlightAuto: hljs.highlightAuto,
  },
  ajv: {
    validate: (schema, data) => {
      try {
        const validate = ajv.compile(schema);
        const valid = validate(data);
        return {
          valid,
          errors: validate.errors || null
        };
      } catch (e) {
        throw new Error("Schema validation error: " + e.message);
      }
    }
  },
  marked: {
    parse: marked.parse,
  },
  clipboard: {
    writeText: (text) => navigator.clipboard.writeText(text),
  },
  crypto: {
    md5: (text) => crypto.createHash("md5").update(text).digest("hex"),
    sha1: (text) => crypto.createHash("sha1").update(text).digest("hex"),
    sha256: (text) => crypto.createHash("sha256").update(text).digest("hex"),
    sha512: (text) => crypto.createHash("sha512").update(text).digest("hex"),
  },
  color: {
    convert: {
      rgb: {
        hex: (rgb) => colorConvert.rgb.hex(rgb),
        hsl: (rgb) => colorConvert.rgb.hsl(rgb),
        hsv: (rgb) => colorConvert.rgb.hsv(rgb),
        cmyk: (rgb) => colorConvert.rgb.cmyk(rgb),
        ansi256: (rgb) => colorConvert.rgb.ansi256(rgb),
        lab: (rgb) => colorConvert.rgb.lab(rgb),
      },
      hex: {
        rgb: (hex) => colorConvert.hex.rgb(hex),
      },
      hsl: {
        rgb: (hsl) => colorConvert.hsl.rgb(hsl),
      },
    },
  },
  qrcode: {
    generate: async (text, options = {}) => {
      try {
        return await ipcRenderer.invoke('qrcode:generate', text, options);
      } catch (e) {
        throw new Error("Failed to generate QR code: " + e.message);
      }
    },
    read: async (dataUrl) => {
      try {
        return await ipcRenderer.invoke('qrcode:read', dataUrl);
      } catch (e) {
        throw new Error("Failed to read QR code: " + e.message);
      }
    }
  },
  jwt: {
    decode: (token) => jwtDecode(token),
  },
  uuid: {
    generate: () => uuidv4(),
    validate: (str) => {
      try {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          str
        );
      } catch (e) {
        return false;
      }
    },
  },
  ulid: {
    generate: () => ulid(),
    decode: (str) => {
      try {
        const time = ulid.decodeTime(str);
        return {
          timestamp: time,
          date: new Date(time).toISOString(),
        };
      } catch (e) {
        throw new Error("Invalid ULID");
      }
    },
  },
  diff: {
    create: (oldStr, newStr) => {
      const diff = require("diff");
      return diff.diffLines(oldStr, newStr).map((part) => ({
        value: part.value,
        added: part.added,
        removed: part.removed,
      }));
    },
  },
  cron: {
    parse: (expression) => {
      try {
        const interval = cronParser.parseExpression(expression);
        return {
          next: interval.next().toString(),
          prev: interval.prev().toString(),
          description:
            "Next 5 occurrences:\n" +
            Array.from({ length: 5 }, () => interval.next().toString()).join(
              "\n"
            ),
        };
      } catch (e) {
        throw new Error("Invalid cron expression");
      }
    },
  },
  csv: {
    toJSON: (csv) => Papa.parse(csv, { header: true }),
    fromJSON: (json) => Papa.unparse(json),
  },
  htmlToJsx: {
    convert: (html) => htmlToJSXConverter.convert(html),
  },
  php: {
    serialize: (data) => serialize(data),
    unserialize: (str) => unserialize(str),
  },
  svg: {
    optimize: (svg) => optimize(svg).data,
  },
  x509: {
    decode: (cert) => {
      try {
        const certificate = forge.pki.certificateFromPem(cert);
        return {
          subject: certificate.subject.attributes
            .map((attr) => `${attr.shortName}=${attr.value}`)
            .join(", "),
          issuer: certificate.issuer.attributes
            .map((attr) => `${attr.shortName}=${attr.value}`)
            .join(", "),
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
        throw new Error("Invalid certificate: " + e.message);
      }
    },
  },
  string: {
    toAscii: (hex) => {
      return hex.replace(/[0-9A-Fa-f]{2}/g, (match) =>
        String.fromCharCode(parseInt(match, 16))
      );
    },
    toHex: (ascii) => {
      return ascii
        .split("")
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("");
    },
    generateRandom: (length, options = {}) => {
      const charset = {
        lowercase: "abcdefghijklmnopqrstuvwxyz",
        uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        numbers: "0123456789",
        special: "!@#$%^&*()_+-=[]{}|;:,.<>?",
      };
      let chars = "";
      if (options.lowercase) chars += charset.lowercase;
      if (options.uppercase) chars += charset.uppercase;
      if (options.numbers) chars += charset.numbers;
      if (options.special) chars += charset.special;
      if (!chars)
        chars = charset.lowercase + charset.uppercase + charset.numbers;

      let result = "";
      const array = new Uint8Array(length);
      crypto.randomFillSync(array);
      for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
      }
      return result;
    },
    cases: {
      toCamelCase: (str) =>
        str.replace(/[-_\s](.)/g, (_, c) => c.toUpperCase()),
      toPascalCase: (str) =>
        str.replace(/(^|[-_\s])(.)/g, (_, __, c) => c.toUpperCase()),
      toSnakeCase: (str) =>
        str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, ""),
      toKebabCase: (str) =>
        str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, ""),
      toConstantCase: (str) => str.toUpperCase().replace(/[-\s]/g, "_"),
    },
  },
  preprocessors: {
    sass: {
      compile: (scss) => sass.compileString(scss).css,
    },
    less: {
      compile: async (lessCode) => {
        const output = await less.render(lessCode);
        return output.css;
      },
    },
  },
  base64: {
    encode: (str) => Buffer.from(str).toString("base64"),
    decode: (b64) => {
      try {
        // Handle URL-safe base64
        const cleaned = b64.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(cleaned, "base64").toString("utf-8");
      } catch (e) {
        throw new Error("Invalid base64 string");
      }
    },
  },
  validateJson: (str) => {
    try {
      const parsed = JSON.parse(str);
      return { valid: true, parsed };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  },
});

