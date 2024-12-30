// Configure Monaco loader
require.config({ paths: { vs: window.monacoPath } });

// Wait for Monaco to be loaded before initializing
require(["vs/editor/editor.main"], function () {
  initializeApp();
});

let inputEditor, outputEditor;
let currentTool = null;
let isEncodeMode = true;

// Tool Implementations
const tools = {
  json: {
    format: (input) => {
      try {
        // First validate JSON using ajv
        const parsed = JSON.parse(input);
        const isValid = window.electronAPI.ajv.validate({ type: "object" }, parsed);
        if (!isValid) {
          throw new Error("Invalid JSON structure");
        }

        // Then format it nicely
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        throw new Error("Invalid JSON: " + e.message);
      }
    },
    language: "json",
    showModeButtons: false,
    formatButtonText: "Format JSON",
    placeholder: '{\n  "example": "Paste your JSON here"\n}',
  },
  xml: {
    format: (input) => {
      try {
        // Use HTML beautifier with XML-specific options
        return window.electronAPI.beautify.html(input, {
          indent_size: 2,
          indent_char: " ",
          wrap_line_length: 80,
          preserve_newlines: true,
          unformatted: [], // Format all tags
          content_unformatted: ["pre"], // Preserve content in pre tags
          indent_inner_html: true,
          extra_liners: [], // No extra newlines around specific tags
        });
      } catch (e) {
        throw new Error("Invalid XML: " + e.message);
      }
    },
    language: "xml",
    showModeButtons: false,
    formatButtonText: "Format XML",
    placeholder:
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <example>Paste your XML here</example>\n</root>',
  },
  sql: {
    format: (input) => {
      // Custom SQL formatter with better formatting rules
      const formatted = input
        .replace(/\s+/g, " ") // Normalize whitespace
        .replace(/\s*([,()])\s*/g, "$1 ") // Space after commas and parentheses
        .replace(/\bSELECT\b/gi, "\nSELECT") // Main clauses on new lines
        .replace(/\bFROM\b/gi, "\nFROM")
        .replace(/\bWHERE\b/gi, "\nWHERE")
        .replace(/\bLEFT\s+JOIN\b/gi, "\nLEFT JOIN") // JOIN clauses
        .replace(/\bRIGHT\s+JOIN\b/gi, "\nRIGHT JOIN")
        .replace(/\bINNER\s+JOIN\b/gi, "\nINNER JOIN")
        .replace(/\bOUTER\s+JOIN\b/gi, "\nOUTER JOIN")
        .replace(/\bJOIN\b/gi, "\nJOIN")
        .replace(/\bON\b/gi, "\n  ON") // Join conditions indented
        .replace(/\bAND\b/gi, "\n  AND") // Conditions indented
        .replace(/\bOR\b/gi, "\n  OR")
        .replace(/\bGROUP\s+BY\b/gi, "\nGROUP BY") // Additional clauses
        .replace(/\bHAVING\b/gi, "\nHAVING")
        .replace(/\bORDER\s+BY\b/gi, "\nORDER BY")
        .replace(/\bLIMIT\b/gi, "\nLIMIT")
        .replace(/\bOFFSET\b/gi, "\nOFFSET")
        .replace(/\bUNION\b/gi, "\n\nUNION\n") // Set operations with extra spacing
        .replace(/\bUNION\s+ALL\b/gi, "\n\nUNION ALL\n")
        .replace(/\bINTERSECT\b/gi, "\n\nINTERSECT\n")
        .replace(/\bEXCEPT\b/gi, "\n\nEXCEPT\n")
        .trim();

      // Indent subqueries
      const lines = formatted.split("\n");
      let indent = 0;
      return lines
        .map((line) => {
          line = line.trim();
          if (line.includes("(")) indent++;
          if (line.includes(")")) indent--;
          return "  ".repeat(Math.max(0, indent)) + line;
        })
        .join("\n");
    },
    language: "sql",
    showModeButtons: false,
    formatButtonText: "Format SQL",
    placeholder: "SELECT column1, column2\nFROM table\nWHERE condition;",
  },
  base64: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          // For encoding, handle both text and URLs
          return btoa(unescape(encodeURIComponent(input)));
        } else {
          // For decoding, try to handle both standard and URL-safe base64
          const cleaned = input.trim().replace(/-/g, "+").replace(/_/g, "/");
          return decodeURIComponent(escape(atob(cleaned)));
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to encode text to Base64"
            : "Invalid Base64 string: Make sure the input is a valid Base64 string"
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    placeholder: isEncodeMode
      ? "Enter text to encode as Base64"
      : "Enter Base64 string to decode",
  },
  url: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          // Handle special characters and spaces properly
          return encodeURIComponent(input)
            .replace(/%20/g, "+") // Use + for spaces
            .replace(/%3A/g, ":") // Keep colons readable
            .replace(/%2F/g, "/"); // Keep slashes readable
        } else {
          // Handle both space encodings (+ and %20)
          return decodeURIComponent(input.replace(/\+/g, "%20"));
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to encode URL"
            : "Invalid URL encoding: The input contains invalid characters"
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    placeholder: isEncodeMode
      ? "Enter text to URL encode"
      : "Enter URL encoded string to decode",
  },
  html: {
    format: (input) => {
      try {
        return window.electronAPI.beautify.html(input, {
          indent_size: 2,
          wrap_line_length: 80,
          preserve_newlines: true,
          max_preserve_newlines: 2,
          unformatted: ["code", "pre", "em", "strong", "span"],
          content_unformatted: ["pre", "code"],
          indent_inner_html: true,
          indent_handlebars: true,
          indent_scripts: "keep",
          extra_liners: ["head", "body", "/html"],
        });
      } catch (e) {
        throw new Error("Invalid HTML: " + e.message);
      }
    },
    language: "html",
    showModeButtons: false,
    formatButtonText: "Format HTML",
    placeholder:
      "<!DOCTYPE html>\n<html>\n<head>\n  <title>Example</title>\n</head>\n<body>\n  <div>Paste your HTML here</div>\n</body>\n</html>",
  },
  yaml2json: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          // YAML to JSON
          const obj = window.electronAPI.yaml.parse(input);
          return JSON.stringify(obj, null, 2);
        } else {
          // JSON to YAML
          const obj = JSON.parse(input);
          return window.electronAPI.yaml.stringify(obj);
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Invalid YAML: " + e.message
            : "Invalid JSON: " + e.message
        );
      }
    },
    language: isEncodeMode ? "yaml" : "json",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "YAML → JSON",
    decodeText: "JSON → YAML",
    placeholder: isEncodeMode
      ? "name: John\nage: 30\nhobbies:\n  - reading\n  - coding"
      : '{\n  "name": "John",\n  "age": 30,\n  "hobbies": ["reading", "coding"]\n}',
  },
  timestamp: {
    format: (input) => {
      try {
        const timestamp = parseInt(input);
        if (!isNaN(timestamp)) {
          // If input is a number, treat as timestamp
          const date = new Date(timestamp * (input.length === 10 ? 1000 : 1));
          if (isNaN(date.getTime())) throw new Error();
          return `Date: ${date.toLocaleString()}\nUNIX (seconds): ${Math.floor(
            date.getTime() / 1000
          )}\nUNIX (milliseconds): ${date.getTime()}\nISO: ${date.toISOString()}\nUTC: ${date.toUTCString()}`;
        } else {
          // Try to parse as date string
          const date = new Date(input);
          if (isNaN(date.getTime())) {
            throw new Error();
          }
          return `Date: ${date.toLocaleString()}\nUNIX (seconds): ${Math.floor(
            date.getTime() / 1000
          )}\nUNIX (milliseconds): ${date.getTime()}\nISO: ${date.toISOString()}\nUTC: ${date.toUTCString()}`;
        }
      } catch (e) {
        throw new Error(
          "Invalid input: Please enter a UNIX timestamp or a valid date string"
        );
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Convert",
    placeholder:
      'Enter a UNIX timestamp (e.g., 1640995200)\nor a date string (e.g., "2022-01-01" or "now")',
  },
  base64image: {
    format: async (input) => {
      try {
        if (isEncodeMode) {
          // For encoding, handle file input
          return new Promise((resolve, reject) => {
            const file = document.getElementById("base64ImageFileInput")
              .files[0];
            if (!file) throw new Error("Please select an image file");

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });
        } else {
          // For decoding, validate base64 image
          if (!input.startsWith("data:image/")) {
            throw new Error("Invalid base64 image format");
          }
          return input;
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to encode image: " + e.message
            : "Invalid base64 image: " + e.message
        );
      }
    },
    useSimpleInterface: true,
    initializeInterface: () => {
      const base64ImageFileInput = document.getElementById(
        "base64ImageFileInput"
      );
      const base64ImageTextInput = document.getElementById(
        "base64ImageTextInput"
      );
      const base64ImagePreview = document.getElementById("base64ImagePreview");
      const base64ImageEncodeBtn = document.getElementById(
        "base64ImageEncodeBtn"
      );
      const base64ImageDecodeBtn = document.getElementById(
        "base64ImageDecodeBtn"
      );
      const base64ImageCopyBtn = document.getElementById("base64ImageCopyBtn");
      const fileInputWrapper = document.querySelector(".file-input-wrapper");

      if (
        !base64ImageFileInput ||
        !base64ImageTextInput ||
        !base64ImagePreview ||
        !fileInputWrapper
      ) {
        return;
      }

      let currentBase64 = "";

      // Handle drag and drop
      fileInputWrapper.addEventListener("dragover", (e) => {
        e.preventDefault();
        fileInputWrapper.style.borderColor = "var(--primary-color)";
        fileInputWrapper.style.background = "#f0f7ff";
      });

      fileInputWrapper.addEventListener("dragleave", (e) => {
        e.preventDefault();
        fileInputWrapper.style.borderColor = "";
        fileInputWrapper.style.background = "";
      });

      // Add click handler for the wrapper
      fileInputWrapper.addEventListener("click", () => {
        base64ImageFileInput.click();
      });

      fileInputWrapper.addEventListener("drop", (e) => {
        e.preventDefault();
        fileInputWrapper.style.borderColor = "";
        fileInputWrapper.style.background = "";

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
          base64ImageFileInput.files = e.dataTransfer.files;
          handleImageFile(file);
        }
      });

      // Handle file selection
      base64ImageFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          handleImageFile(file);
        }
      });

      // Handle text input for decoding
      base64ImageTextInput.addEventListener("input", (e) => {
        const input = e.target.value.trim();
        try {
          if (input.startsWith("data:image/")) {
            // Create image element
            const img = document.createElement("img");
            img.alt = "Decoded image";
            img.style.maxWidth = "100%";
            img.style.maxHeight = "400px";

            // Set up load and error handlers before setting src
            img.onload = () => {
              base64ImagePreview.innerHTML = "";
              base64ImagePreview.appendChild(img);
              currentBase64 = input;
            };

            img.onerror = () => {
              base64ImagePreview.innerHTML =
                '<div class="error">Invalid image data</div>';
              currentBase64 = "";
            };

            // Set the source
            img.src = input;
          } else {
            base64ImagePreview.innerHTML =
              '<div class="error">Invalid base64 image format</div>';
            currentBase64 = "";
          }
        } catch (error) {
          base64ImagePreview.innerHTML =
            '<div class="error">Failed to process image data</div>';
          currentBase64 = "";
          console.error("Image processing error:", error);
        }
      });

      // Handle mode switching
      base64ImageEncodeBtn.addEventListener("click", () => {
        isEncodeMode = true;
        base64ImageEncodeBtn.classList.add("active");
        base64ImageDecodeBtn.classList.remove("active");
        document.getElementById("base64ImageFileSection").style.display =
          "block";
        document.getElementById("base64ImageTextSection").style.display =
          "none";
        base64ImagePreview.innerHTML = "";
        currentBase64 = "";
      });

      base64ImageDecodeBtn.addEventListener("click", () => {
        isEncodeMode = false;
        base64ImageDecodeBtn.classList.add("active");
        base64ImageEncodeBtn.classList.remove("active");
        document.getElementById("base64ImageFileSection").style.display =
          "none";
        document.getElementById("base64ImageTextSection").style.display =
          "block";
        base64ImagePreview.innerHTML = "";
        currentBase64 = "";
      });

      // Handle copy button
      base64ImageCopyBtn.addEventListener("click", () => {
        if (currentBase64) {
          window.electronAPI.clipboard
            .writeText(currentBase64)
            .then(() => {
              showToast("Copied to clipboard", "success");
            })
            .catch((err) => {
              console.error("Failed to copy:", err);
              showToast("Failed to copy to clipboard", "error");
            });
        }
      });

      function handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target.result;
          try {
            // Create image element
            const img = document.createElement("img");
            img.alt = "Converted image";
            img.style.maxWidth = "100%";
            img.style.maxHeight = "400px";

            // Set up load and error handlers before setting src
            img.onload = () => {
              base64ImagePreview.innerHTML = "";
              base64ImagePreview.appendChild(img);
              currentBase64 = base64;
            };

            img.onerror = () => {
              base64ImagePreview.innerHTML =
                '<div class="error">Failed to load image</div>';
              currentBase64 = "";
            };

            // Set the source
            img.src = base64;
          } catch (error) {
            base64ImagePreview.innerHTML =
              '<div class="error">Failed to process image</div>';
            currentBase64 = "";
            console.error("Image processing error:", error);
          }
        };

        reader.onerror = () => {
          base64ImagePreview.innerHTML =
            '<div class="error">Failed to read image file</div>';
          currentBase64 = "";
          console.error("FileReader error:", reader.error);
        };

        try {
          reader.readAsDataURL(file);
        } catch (error) {
          base64ImagePreview.innerHTML =
            '<div class="error">Failed to read file</div>';
          currentBase64 = "";
          console.error("File reading error:", error);
        }
      }
    },
  },
  jwt: {
    format: (input) => {
      try {
        const token = input.trim();
        if (!token) {
          throw new Error("Please enter a JWT token");
        }

        // Split the token into parts
        const parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error("Invalid JWT token format. Expected 3 parts: header.payload.signature");
        }

        // Decode header and payload
        const header = JSON.parse(window.electronAPI.base64.decode(parts[0]));
        const payload = JSON.parse(window.electronAPI.base64.decode(parts[1]));

        // Format the result
        return JSON.stringify({
          header,
          payload,
          signature: parts[2]
        }, null, 2);
      } catch (e) {
        throw new Error("Failed to decode JWT: " + e.message);
      }
    },
    language: "json",
    showModeButtons: false,
    formatButtonText: "Decode JWT",
    placeholder: "Paste your JWT token here",
  },
  urlParser: {
    format: (input) => {
      try {
        const url = new URL(input);
        const params = {};
        url.searchParams.forEach((value, key) => {
          if (params[key]) {
            if (!Array.isArray(params[key])) {
              params[key] = [params[key]];
            }
            params[key].push(value);
          } else {
            params[key] = value;
          }
        });

        return JSON.stringify(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            params: params,
          },
          null,
          2
        );
      } catch (e) {
        throw new Error("Invalid URL: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Parse URL",
    placeholder:
      "Enter a URL to parse (e.g., https://example.com/path?param=value)",
  },
  htmlEntity: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          return input.replace(
            /[\u00A0-\u9999<>\&]/g,
            (i) => `&#${i.charCodeAt(0)};`
          );
        } else {
          const textarea = document.createElement("textarea");
          textarea.innerHTML = input;
          return textarea.value;
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to encode HTML entities"
            : "Failed to decode HTML entities"
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "Text → HTML Entities",
    decodeText: "HTML Entities → Text",
    placeholder: isEncodeMode
      ? "Enter text to encode HTML entities"
      : "Enter HTML entities to decode",
  },
  backslash: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          return input.replace(/[\\\"\'\t\n\r]/g, (match) => {
            const escapes = {
              "\\": "\\\\",
              '"': '\\"',
              "'": "\\'",
              "\t": "\\t",
              "\n": "\\n",
              "\r": "\\r",
            };
            return escapes[match];
          });
        } else {
          return input.replace(/\\([\\\"\'\t\n\r])/g, (_, char) => {
            const unescapes = {
              "\\": "\\",
              '"': '"',
              "'": "'",
              t: "\t",
              n: "\n",
              r: "\r",
            };
            return unescapes[char] || char;
          });
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to escape characters"
            : "Failed to unescape characters"
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "Escape",
    decodeText: "Unescape",
    placeholder: isEncodeMode
      ? "Enter text to escape backslashes"
      : "Enter escaped text to unescape",
  },
  textDiff: {
    format: (input) => {
      try {
        const [oldText, newText] = input.split("---\n");
        if (!oldText || !newText) {
          throw new Error(
            "Please provide both old and new text separated by ---"
          );
        }

        const diff = window.electronAPI.diff.create(
          oldText.trim(),
          newText.trim()
        );
        let leftHtml = "",
          rightHtml = "";

        diff.forEach((part) => {
          if (part.removed) {
            leftHtml += `<div class="diff-line removed">${part.value
              .split("\n")
              .map((line) => `<div class="line">- ${line}</div>`)
              .join("")}</div>`;
          } else if (part.added) {
            rightHtml += `<div class="diff-line added">${part.value
              .split("\n")
              .map((line) => `<div class="line">+ ${line}</div>`)
              .join("")}</div>`;
          } else {
            leftHtml += `<div class="diff-line unchanged">${part.value
              .split("\n")
              .map((line) => `<div class="line"> ${line}</div>`)
              .join("")}</div>`;
            rightHtml += `<div class="diff-line unchanged">${part.value
              .split("\n")
              .map((line) => `<div class="line"> ${line}</div>`)
              .join("")}</div>`;
          }
        });

        return `
                    <div class="diff-container">
                        <div class="diff-panel">
                            <div class="diff-header">Original</div>
                            <div class="diff-content">${leftHtml}</div>
                        </div>
                        <div class="diff-panel">
                            <div class="diff-header">Modified</div>
                            <div class="diff-content">${rightHtml}</div>
                        </div>
                    </div>
                `;
      } catch (e) {
        throw new Error("Failed to generate diff: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Compare",
    placeholder: "Enter old text here\n---\nEnter new text here",
    customOutput: true,
  },
  htmlPreview: {
    format: (input) => {
      try {
        // Sanitize HTML to prevent XSS
        const sanitized = input
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/on\w+="[^"]*"/g, "")
          .replace(/javascript:/g, "");
        return `<div class="html-preview">${sanitized}</div>`;
      } catch (e) {
        throw new Error("Failed to generate HTML preview: " + e.message);
      }
    },
    language: "html",
    showModeButtons: false,
    formatButtonText: "Preview",
    placeholder: "<h1>Hello World</h1>\n<p>Enter your HTML here to preview</p>",
  },
  loremIpsum: {
    format: (input) => {
      try {
        const params = JSON.parse(input);
        const words = [
          "lorem",
          "ipsum",
          "dolor",
          "sit",
          "amet",
          "consectetur",
          "adipiscing",
          "elit",
          "sed",
          "do",
          "eiusmod",
          "tempor",
          "incididunt",
          "ut",
          "labore",
          "et",
          "dolore",
          "magna",
          "aliqua",
          "enim",
          "ad",
          "minim",
          "veniam",
          "quis",
          "nostrud",
          "exercitation",
          "ullamco",
          "laboris",
          "nisi",
          "ut",
          "aliquip",
          "ex",
          "ea",
          "commodo",
          "consequat",
        ];

        const generateWord = () =>
          words[Math.floor(Math.random() * words.length)];
        const generateSentence = () => {
          const length = 5 + Math.floor(Math.random() * 15);
          return (
            Array.from({ length }, (_, i) =>
              i === 0
                ? generateWord().charAt(0).toUpperCase() +
                  generateWord().slice(1)
                : generateWord()
            ).join(" ") + "."
          );
        };
        const generateParagraph = () => {
          const length = 3 + Math.floor(Math.random() * 5);
          return Array.from({ length }, () => generateSentence()).join(" ");
        };

        const paragraphs = Array.from(
          { length: params.paragraphs || 1 },
          generateParagraph
        );
        return paragraphs.join("\n\n");
      } catch (e) {
        throw new Error(
          'Invalid parameters. Expected format: {"paragraphs": number}'
        );
      }
    },
    language: "json",
    showModeButtons: false,
    formatButtonText: "Generate",
    placeholder: '{\n  "paragraphs": 3\n}',
  },
  qrcode: {
    format: async (input) => {
      try {
        if (isEncodeMode) {
          if (!input.trim()) {
            throw new Error("Please enter text to generate QR code");
          }
          const dataUrl = await window.electronAPI.qrcode.generate(input, {
            errorCorrectionLevel: "M",
            margin: 4,
            scale: 8,
            width: 300,
            height: 300,
          });
          return `<img src="${dataUrl}" alt="QR Code">`;
        } else {
          if (!input.startsWith("data:image/")) {
            throw new Error("Please provide a valid image data URL");
          }
          const result = await window.electronAPI.qrcode.read(input);
          return result || "No QR code found in image";
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Failed to generate QR code: " + e.message
            : "Failed to read QR code: " + e.message
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "Text → QR Code",
    decodeText: "QR Code → Text",
    placeholder: isEncodeMode
      ? "Enter text to generate QR code"
      : "Select or drag & drop a QR code image",
  },
  stringInspector: {
    format: (input) => {
      try {
        const length = input.length;
        const lines = input.split("\n").length;
        const words = input.trim().split(/\s+/).length;
        const chars = {};
        const bytes = new TextEncoder().encode(input).length;

        for (let char of input) {
          chars[char] = (chars[char] || 0) + 1;
        }

        const charStats = Object.entries(chars)
          .sort(([, a], [, b]) => b - a)
          .map(([char, count]) => ({
            char,
            count,
            hex: char.charCodeAt(0).toString(16).padStart(4, "0"),
            dec: char.charCodeAt(0),
            percent: ((count / length) * 100).toFixed(2),
          }));

        return JSON.stringify(
          {
            length,
            lines,
            words,
            bytes,
            charStats: charStats.slice(0, 10), // Show top 10 most frequent chars
          },
          null,
          2
        );
      } catch (e) {
        throw new Error("Failed to analyze string: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Analyze",
    placeholder: "Enter text to analyze its properties",
  },
  csvJson: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          // CSV to JSON
          const result = window.electronAPI.csv.toJSON(input);
          return JSON.stringify(result.data, null, 2);
        } else {
          // JSON to CSV
          const data = JSON.parse(input);
          return window.electronAPI.csv.fromJSON(data);
        }
      } catch (e) {
        throw new Error(
          isEncodeMode
            ? "Invalid CSV: " + e.message
            : "Invalid JSON: " + e.message
        );
      }
    },
    language: isEncodeMode ? "plaintext" : "json",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "CSV → JSON",
    decodeText: "JSON → CSV",
    placeholder: isEncodeMode
      ? "name,age\nJohn,30\nJane,25"
      : '[\n  {"name": "John", "age": 30},\n  {"name": "Jane", "age": 25}\n]',
  },
  htmlJsx: {
    format: (input) => {
      try {
        return window.electronAPI.htmlToJsx.convert(input);
      } catch (e) {
        throw new Error("Failed to convert HTML to JSX: " + e.message);
      }
    },
    language: "html",
    showModeButtons: false,
    formatButtonText: "Convert to JSX",
    placeholder:
      '<div class="example">\n  <h1>Hello World</h1>\n  <p>Enter your HTML here</p>\n</div>',
  },
  markdownPreview: {
    format: (input) => {
      try {
        const html = window.electronAPI.marked.parse(input);
        return `<div class="markdown-preview-container">${html}</div>`;
      } catch (e) {
        throw new Error("Failed to render markdown: " + e.message);
      }
    },
    language: "markdown",
    showModeButtons: false,
    formatButtonText: "Preview",
    placeholder:
      "# Hello World\n\nEnter your **Markdown** here.\n\n- List item 1\n- List item 2",
    customOutput: true,
  },
  stringCase: {
    format: (input) => {
      try {
        return JSON.stringify(
          {
            camelCase: window.electronAPI.string.cases.toCamelCase(input),
            pascalCase: window.electronAPI.string.cases.toPascalCase(input),
            snakeCase: window.electronAPI.string.cases.toSnakeCase(input),
            kebabCase: window.electronAPI.string.cases.toKebabCase(input),
            constantCase: window.electronAPI.string.cases.toConstantCase(input),
          },
          null,
          2
        );
      } catch (e) {
        throw new Error("Failed to convert case: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Convert Cases",
    placeholder: "Enter text to convert to different cases",
  },
  cronParser: {
    format: (input) => {
      try {
        return JSON.stringify(window.electronAPI.cron.parse(input), null, 2);
      } catch (e) {
        throw new Error("Invalid cron expression: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Parse Cron",
    placeholder: "Enter cron expression (e.g., */5 * * * *)",
  },
  randomString: {
    format: (input) => {
      try {
        const options = JSON.parse(input);
        return window.electronAPI.string.generateRandom(options.length || 32, {
          lowercase: options.lowercase !== false,
          uppercase: options.uppercase === true,
          numbers: options.numbers === true,
          special: options.special === true,
        });
      } catch (e) {
        throw new Error(
          'Invalid options. Expected format: {"length": number, "lowercase": boolean, "uppercase": boolean, "numbers": boolean, "special": boolean}'
        );
      }
    },
    language: "json",
    showModeButtons: false,
    formatButtonText: "Generate",
    placeholder:
      '{\n  "length": 32,\n  "lowercase": true,\n  "uppercase": true,\n  "numbers": true,\n  "special": false\n}',
  },
  certificate: {
    format: (input) => {
      try {
        return JSON.stringify(window.electronAPI.x509.decode(input), null, 2);
      } catch (e) {
        throw new Error("Failed to decode certificate: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Decode Certificate",
    placeholder:
      "-----BEGIN CERTIFICATE-----\nPaste your X.509 certificate here\n-----END CERTIFICATE-----",
  },
  hexAscii: {
    format: (input) => {
      try {
        if (isEncodeMode) {
          return window.electronAPI.string.toHex(input);
        } else {
          return window.electronAPI.string.toAscii(input);
        }
      } catch (e) {
        throw new Error(
          isEncodeMode ? "Failed to convert to hex" : "Invalid hex string"
        );
      }
    },
    language: "plaintext",
    showModeButtons: true,
    formatButtonText: "Convert",
    encodeText: "ASCII → HEX",
    decodeText: "HEX → ASCII",
    placeholder: isEncodeMode
      ? "Enter ASCII text to convert to hex"
      : "Enter hex string to convert to ASCII",
  },
  lineSortDedupe: {
    format: (input) => {
      try {
        const lines = input
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        // Remove duplicates if requested
        const uniqueLines = [...new Set(lines)];

        // Sort lines
        return uniqueLines.sort().join("\n");
      } catch (e) {
        throw new Error("Failed to sort/dedupe lines: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Sort & Dedupe",
    placeholder: "Enter lines to sort and remove duplicates",
  },
  hash: {
    format: (input) => {
      try {
        const text = input.trim();
        return {
          md5: window.electronAPI.crypto.md5(text),
          sha1: window.electronAPI.crypto.sha1(text),
          sha256: window.electronAPI.crypto.sha256(text),
          sha512: window.electronAPI.crypto.sha512(text),
        };
      } catch (e) {
        throw new Error("Failed to generate hashes: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Generate Hashes",
    placeholder: "Enter text to generate hashes",
  },
  number: {
    format: (input) => {
      try {
        const value = parseFloat(input);
        if (isNaN(value)) {
          throw new Error("Invalid number");
        }
        return value.toString();
      } catch (e) {
        throw new Error("Failed to format number: " + e.message);
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Format Number",
    placeholder: "Enter a number",
  },
  regex: {
    format: (input) => {
      try {
        const pattern = input.trim();
        const testString = document
          .getElementById("regexTestInput")
          .value.trim();

        if (!pattern || !testString) {
          return "Please enter both a pattern and a test string";
        }

        const regex = new RegExp(pattern);
        const matches = [];

        let match;
        while ((match = regex.exec(testString)) !== null) {
          matches.push({
            text: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }

        let html = testString;

        matches.forEach((match) => {
          const before = html.slice(0, match.index);
          const after = html.slice(match.index + match.text.length);
          html =
            before + `<span class="regex-match">${match.text}</span>` + after;
        });

        return html;
      } catch (e) {
        return "Error: " + e.message;
      }
    },
    language: "plaintext",
    showModeButtons: false,
    formatButtonText: "Test Regex",
    placeholder: "Enter a pattern and a test string",
  },
  color: {
    format: (input) => {
      try {
        const color = input.trim();
        if (!color) {
          throw new Error("Please enter a color value");
        }

        let rgb, hex, hsl, hsv, cmyk, ansi256, lab;

        // Try to determine input format and convert
        if (color.startsWith('#')) {
          // HEX input
          hex = color.replace('#', '');
          rgb = window.electronAPI.color.convert.hex.rgb(hex);
        } else if (color.startsWith('rgb')) {
          // RGB input
          const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) throw new Error("Invalid RGB format");
          rgb = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          hex = window.electronAPI.color.convert.rgb.hex(rgb);
        } else if (color.startsWith('hsl')) {
          // HSL input
          const match = color.match(/^hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?/);
          if (!match) throw new Error("Invalid HSL format");
          hsl = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          rgb = window.electronAPI.color.convert.hsl.rgb(hsl);
          hex = window.electronAPI.color.convert.rgb.hex(rgb);
        } else {
          throw new Error("Unsupported color format. Use HEX, RGB, or HSL");
        }

        // Convert to all formats
        if (!hsl) hsl = window.electronAPI.color.convert.rgb.hsl(rgb);
        hsv = window.electronAPI.color.convert.rgb.hsv(rgb);
        cmyk = window.electronAPI.color.convert.rgb.cmyk(rgb);
        ansi256 = window.electronAPI.color.convert.rgb.ansi256(rgb);
        lab = window.electronAPI.color.convert.rgb.lab(rgb);

        // Generate color variations
        const variations = {
          lighter: window.electronAPI.color.convert.rgb.hex(
            window.electronAPI.color.convert.hsl.rgb([
              hsl[0],
              hsl[1],
              Math.min(100, hsl[2] + 20)
            ])
          ),
          darker: window.electronAPI.color.convert.rgb.hex(
            window.electronAPI.color.convert.hsl.rgb([
              hsl[0],
              hsl[1],
              Math.max(0, hsl[2] - 20)
            ])
          ),
          saturated: window.electronAPI.color.convert.rgb.hex(
            window.electronAPI.color.convert.hsl.rgb([
              hsl[0],
              Math.min(100, hsl[1] + 20),
              hsl[2]
            ])
          ),
          desaturated: window.electronAPI.color.convert.rgb.hex(
            window.electronAPI.color.convert.hsl.rgb([
              hsl[0],
              Math.max(0, hsl[1] - 20),
              hsl[2]
            ])
          ),
          complement: window.electronAPI.color.convert.rgb.hex(
            window.electronAPI.color.convert.hsl.rgb([
              (hsl[0] + 180) % 360,
              hsl[1],
              hsl[2]
            ])
          ),
        };

        return {
          preview: `#${hex}`,
          formats: {
            hex: `#${hex}`,
            rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
            hsl: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`,
            hsv: `hsv(${hsv[0]}, ${hsv[1]}%, ${hsv[2]}%)`,
            cmyk: `cmyk(${cmyk[0]}%, ${cmyk[1]}%, ${cmyk[2]}%, ${cmyk[3]}%)`,
            lab: `lab(${Math.round(lab[0])}, ${Math.round(lab[1])}, ${Math.round(lab[2])})`,
            ansi256: ansi256.toString()
          },
          variations
        };
      } catch (e) {
        throw new Error("Failed to process color: " + e.message);
      }
    },
    useSimpleInterface: true,
    initializeInterface: () => {
      const colorInput = document.getElementById('colorInput');
      const colorPickerInput = document.getElementById('colorPickerInput');
      const colorPreview = document.querySelector('.color-preview');
      const colorOutputs = document.querySelector('.color-outputs');
      const paletteColors = document.querySelectorAll('.palette-color');

      function updateColorOutputs(input) {
        try {
          const result = tools.color.format(input);
          
          // Update preview
          colorPreview.style.backgroundColor = result.preview;
          
          // Update color picker
          colorPickerInput.value = result.formats.hex;
          
          // Clear existing outputs
          colorOutputs.innerHTML = '';

          // Add color formats section
          const formatsSection = document.createElement('div');
          formatsSection.className = 'color-section';
          formatsSection.innerHTML = '<h4>Color Formats</h4>';
          
          Object.entries(result.formats).forEach(([format, value]) => {
            const outputGroup = document.createElement('div');
            outputGroup.className = 'output-group';
            outputGroup.innerHTML = `
              <label>${format.toUpperCase()}</label>
              <div class="output-row">
                <input type="text" value="${value}" readonly>
                <button class="copy-btn" data-value="${value}">Copy</button>
              </div>
            `;
            formatsSection.appendChild(outputGroup);
          });
          colorOutputs.appendChild(formatsSection);

          // Add color variations section
          const variationsSection = document.createElement('div');
          variationsSection.className = 'color-section';
          variationsSection.innerHTML = '<h4>Color Variations</h4>';
          
          Object.entries(result.variations).forEach(([name, value]) => {
            const variation = document.createElement('div');
            variation.className = 'color-variation';
            variation.innerHTML = `
              <div class="variation-preview" style="background-color: #${value}"></div>
              <div class="variation-info">
                <span>${name}</span>
                <button class="copy-btn" data-value="#${value}">Copy</button>
              </div>
            `;
            variationsSection.appendChild(variation);
          });
          colorOutputs.appendChild(variationsSection);

          // Add copy button event listeners
          colorOutputs.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const value = btn.dataset.value;
              window.electronAPI.clipboard.writeText(value)
                .then(() => showToast('Copied to clipboard'))
                .catch(err => showToast('Failed to copy', 'error'));
            });
          });

          colorInput.classList.remove('error');
        } catch (error) {
          colorInput.classList.add('error');
          colorPreview.style.backgroundColor = '';
          colorOutputs.innerHTML = `<div class="error">${error.message}</div>`;
        }
      }

      // Update on text input
      colorInput.addEventListener('input', (e) => {
        updateColorOutputs(e.target.value);
      });

      // Update on color picker change
      colorPickerInput.addEventListener('input', (e) => {
        colorInput.value = e.target.value;
        updateColorOutputs(e.target.value);
      });

      // Handle palette color clicks
      paletteColors.forEach(color => {
        color.addEventListener('click', () => {
          const hexColor = color.dataset.color;
          colorInput.value = hexColor;
          updateColorOutputs(hexColor);
        });
      });

      // Initialize with a default color
      colorInput.value = '#1E90FF';
      updateColorOutputs('#1E90FF');
    }
  },
};

function createEditors() {
  inputEditor = monaco.editor.create(document.getElementById("inputEditor"), {
    value: "",
    language: "plaintext",
    theme: "vs",
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: "on",
    renderWhitespace: "boundary",
    rulers: [80],
    bracketPairColorization: {
      enabled: true,
    },
  });

  outputEditor = monaco.editor.create(document.getElementById("outputEditor"), {
    value: "",
    language: "plaintext",
    theme: "vs",
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    readOnly: true,
    wordWrap: "on",
    renderWhitespace: "boundary",
    rulers: [80],
    bracketPairColorization: {
      enabled: true,
    },
  });
}

// Utility Functions
function setActiveButton(toolName) {
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.tool === toolName) {
      btn.classList.add("active");
    }
  });
}

function showInterface(toolName) {
  // Hide all interfaces
  document.querySelectorAll(".tool-interface").forEach((interface) => {
    interface.classList.remove("active");
  });

  // Show the selected interface
  if (toolName) {
    const isEditorTool = document
      .querySelector(`.tool-btn[data-tool="${toolName}"]`)
      .classList.contains("editor-tool");
    if (isEditorTool) {
      document.querySelector(".editor-interface").classList.add("active");
    } else {
      document.querySelector(`.${toolName}-interface`).classList.add("active");
    }
  }
}

function handleToolClick(toolName) {
  // Hide all interfaces first
  document.querySelectorAll(".tool-interface").forEach((interface) => {
    interface.classList.remove("active");
  });

  currentTool = toolName;
  setActiveButton(toolName);

  // Check if it's a simple tool or editor tool
  const isSimpleTool = document
    .querySelector(`.tool-btn[data-tool="${toolName}"]`)
    .classList.contains("simple-tool");

  // Clear custom output container
  const customOutputContainer = document.getElementById(
    "customOutputContainer"
  );
  if (customOutputContainer) {
    customOutputContainer.style.display = "none";
    customOutputContainer.innerHTML = "";
  }

  if (isSimpleTool) {
    // Show the specific simple tool interface
    document.querySelector(`.${toolName}-interface`).classList.add("active");
    // Initialize interface if needed
    const tool = tools[toolName];
    if (tool && tool.initializeInterface) {
      tool.initializeInterface();
    }
  } else {
    // Show the editor interface and update it
    document.querySelector(".editor-interface").classList.add("active");
    if (inputEditor) inputEditor.setValue("");
    if (outputEditor) outputEditor.setValue("");
    updateEditorUI();
  }
}

function updateEditorUI() {
  const tool = tools[currentTool];
  if (!tool) return;

  // Update mode buttons visibility
  const modeButtons = document.querySelector(".mode-buttons");
  modeButtons.style.display = tool.showModeButtons ? "inline-flex" : "none";

  // Update format button text
  const formatBtn = document.getElementById("formatBtn");
  formatBtn.textContent = tool.formatButtonText || "Format";

  // Update encode/decode button text if custom text exists
  if (tool.encodeText && tool.decodeText) {
    document.getElementById("encodeBtn").textContent = tool.encodeText;
    document.getElementById("decodeBtn").textContent = tool.decodeText;
  } else {
    document.getElementById("encodeBtn").textContent = "Encode";
    document.getElementById("decodeBtn").textContent = "Decode";
  }

  // Update editor languages
  monaco.editor.setModelLanguage(inputEditor.getModel(), tool.language);
  monaco.editor.setModelLanguage(outputEditor.getModel(), tool.language);

  // Set placeholder text
  if (tool.placeholder && inputEditor.getValue() === "") {
    inputEditor.setValue(tool.placeholder);
    // Select all text so it's easy to replace
    inputEditor.setSelection(inputEditor.getModel().getFullModelRange());
  }
}

function processInput() {
  const input = inputEditor.getValue();
  const tool = tools[currentTool];

  try {
    const result = tool.format(input);
    if (tool.customOutput) {
      // For tools with custom HTML output
      document.getElementById("outputEditor").style.display = "none";
      let customOutputContainer = document.getElementById(
        "customOutputContainer"
      );
      if (!customOutputContainer) {
        customOutputContainer = document.createElement("div");
        customOutputContainer.id = "customOutputContainer";
        document
          .querySelector(".output-panel")
          .appendChild(customOutputContainer);
      }
      customOutputContainer.style.display = "block";
      customOutputContainer.innerHTML = result;
    } else {
      // For regular Monaco editor output
      document.getElementById("outputEditor").style.display = "block";
      let customOutputContainer = document.getElementById(
        "customOutputContainer"
      );
      if (customOutputContainer) {
        customOutputContainer.style.display = "none";
      }
      outputEditor.setValue(result);
    }
  } catch (error) {
    outputEditor.setValue("Error: " + error.message);
  }
}

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Trigger reflow to enable transition
  toast.offsetHeight;
  toast.classList.add("show");

  // Remove toast after animation
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toastContainer.removeChild(toast);
    }, 300);
  }, 3000);
}

function initializeHashGenerator() {
  const hashInput = document.getElementById("hashInput");
  const md5Output = document.getElementById("md5Output");
  const sha1Output = document.getElementById("sha1Output");
  const sha256Output = document.getElementById("sha256Output");
  const sha512Output = document.getElementById("sha512Output");

  // Add event listener for input changes
  hashInput.addEventListener("input", () => {
    const text = hashInput.value;
    try {
      // Generate hashes using the electronAPI
      md5Output.value = window.electronAPI.crypto.md5(text);
      sha1Output.value = window.electronAPI.crypto.sha1(text);
      sha256Output.value = window.electronAPI.crypto.sha256(text);
      sha512Output.value = window.electronAPI.crypto.sha512(text);
    } catch (error) {
      console.error("Hash generation error:", error);
      md5Output.value = "";
      sha1Output.value = "";
      sha256Output.value = "";
      sha512Output.value = "";
    }
  });

  // Add event listeners for copy buttons
  document.querySelectorAll(".hash-output .copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const text = document.getElementById(targetId).value;
      if (text) {
        window.electronAPI.clipboard
          .writeText(text)
          .then(() => {
            showToast("Copied to clipboard", "success");
          })
          .catch((err) => {
            console.error("Failed to copy:", err);
            showToast("Failed to copy to clipboard", "error");
          });
      }
    });
  });
}

function initializeApp() {
  // Check if electronAPI is available
  if (!window.electronAPI) {
    console.error(
      "electronAPI not found. Make sure preload script is working."
    );
    return;
  }

  createEditors();

  // Initialize collapsible sidebar
  document.querySelectorAll('.tool-category').forEach(category => {
    const header = category.querySelector('h3');
    const buttons = category.querySelector('.tool-buttons');
    
    // Set initial height for transition
    buttons.style.maxHeight = buttons.scrollHeight + 'px';
    
    header.addEventListener('click', () => {
      category.classList.toggle('collapsed');
      if (!category.classList.contains('collapsed')) {
        buttons.style.maxHeight = buttons.scrollHeight + 'px';
      }
    });
  });

  // Tool buttons
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      handleToolClick(tool);

      // Initialize specific tool if needed
      if (tool === "hash") {
        initializeHashGenerator();
      } else if (tool === "timestamp") {
        initializeTimestampTool();
      } else if (tool === "number") {
        initializeNumberTool();
      } else if (tool === "regex") {
        initializeRegexTool();
      } else if (tool === "qrcode") {
        initializeQRCodeTool();
      }
    });
  });

  // Initialize editor interface elements only if they exist
  const encodeBtn = document.getElementById("encodeBtn");
  const decodeBtn = document.getElementById("decodeBtn");
  const formatBtn = document.getElementById("formatBtn");
  const clearBtn = document.getElementById("clearBtn");
  const copyBtn = document.getElementById("copyBtn");

  if (encodeBtn && decodeBtn) {
    encodeBtn.addEventListener("click", () => {
      isEncodeMode = true;
      encodeBtn.classList.add("active");
      decodeBtn.classList.remove("active");
      updateEditorUI();
      processInput();
    });

    decodeBtn.addEventListener("click", () => {
      isEncodeMode = false;
      decodeBtn.classList.add("active");
      encodeBtn.classList.remove("active");
      updateEditorUI();
      processInput();
    });
  }

  if (formatBtn) {
    formatBtn.addEventListener("click", processInput);
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = outputEditor.getValue();
      window.electronAPI.clipboard
        .writeText(text)
        .then(() => {
          showToast("Copied to clipboard");
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          showToast("Failed to copy to clipboard", "error");
        });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (inputEditor) inputEditor.setValue("");
      if (outputEditor) outputEditor.setValue("");

      // Clear custom output container if it exists
      const customOutputContainer = document.getElementById(
        "customOutputContainer"
      );
      if (customOutputContainer) {
        customOutputContainer.innerHTML = "";
      }

      // Reset editor display states
      const outputEditorElement = document.getElementById("outputEditor");
      if (outputEditorElement) {
        outputEditorElement.style.display = "block";
      }
      if (customOutputContainer) {
        customOutputContainer.style.display = "none";
      }

      updateEditorUI(); // Show placeholder
      showToast("Cleared all content");
    });
  }

  // Set initial tool
  handleToolClick("json");
}

function initializeTimestampTool() {
  const timestampInput = document.getElementById("timestampInput");
  const nowBtn = document.getElementById("nowBtn");
  const localDateOutput = document.getElementById("localDateOutput");
  const utcDateOutput = document.getElementById("utcDateOutput");
  const unixSecondsOutput = document.getElementById("unixSecondsOutput");
  const unixMillisOutput = document.getElementById("unixMillisOutput");
  const isoOutput = document.getElementById("isoOutput");

  function updateTimestampOutputs(input) {
    try {
      let date;
      if (input === "") {
        // If input is empty, use current time
        date = new Date();
      } else if (!isNaN(input)) {
        // If input is a number, treat as timestamp
        date = new Date(input.length === 10 ? input * 1000 : Number(input));
      } else {
        // Try to parse as date string
        date = new Date(input);
      }

      if (isNaN(date.getTime())) {
        throw new Error("Invalid date");
      }

      localDateOutput.value = date.toLocaleString();
      utcDateOutput.value = date.toUTCString();
      unixSecondsOutput.value = Math.floor(date.getTime() / 1000);
      unixMillisOutput.value = date.getTime();
      isoOutput.value = date.toISOString();

      // Clear error styling
      timestampInput.classList.remove("error");
    } catch (error) {
      // Show error styling
      timestampInput.classList.add("error");
      localDateOutput.value = "";
      utcDateOutput.value = "";
      unixSecondsOutput.value = "";
      unixMillisOutput.value = "";
      isoOutput.value = "";
    }
  }

  // Update on input
  timestampInput.addEventListener("input", (e) => {
    updateTimestampOutputs(e.target.value);
  });

  // Now button
  nowBtn.addEventListener("click", () => {
    const now = new Date();
    timestampInput.value = now.getTime();
    updateTimestampOutputs(now.getTime());
  });

  // Add copy functionality to outputs
  document.querySelectorAll(".timestamp-output input").forEach((input) => {
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      if (input.value) {
        window.electronAPI.clipboard
          .writeText(input.value)
          .then(() => {
            showToast("Copied to clipboard", "success");
          })
          .catch((err) => {
            console.error("Failed to copy:", err);
            showToast("Failed to copy to clipboard", "error");
          });
      }
    });
    input.parentElement.appendChild(copyBtn);
  });

  // Initialize with current time
  updateTimestampOutputs(new Date().getTime());
}

function initializeNumberTool() {
  const binaryInput = document.getElementById("binaryInput");
  const octalInput = document.getElementById("octalInput");
  const decimalInput = document.getElementById("decimalInput");
  const hexadecimalInput = document.getElementById("hexadecimalInput");

  function updateAllInputs(value, sourceBase) {
    try {
      // Convert to decimal first
      let decimal;
      if (sourceBase === 10) {
        decimal = parseInt(value);
      } else {
        decimal = parseInt(value, sourceBase);
      }

      if (isNaN(decimal)) {
        throw new Error("Invalid number");
      }

      // Update all inputs except source
      if (sourceBase !== 2) binaryInput.value = decimal.toString(2);
      if (sourceBase !== 8) octalInput.value = decimal.toString(8);
      if (sourceBase !== 10) decimalInput.value = decimal.toString(10);
      if (sourceBase !== 16)
        hexadecimalInput.value = decimal.toString(16).toUpperCase();

      // Clear error styling
      [binaryInput, octalInput, decimalInput, hexadecimalInput].forEach(
        (input) => {
          input.classList.remove("error");
        }
      );
    } catch (error) {
      // Show error styling on source input
      const sourceInput = [
        binaryInput,
        octalInput,
        decimalInput,
        hexadecimalInput,
      ][[2, 8, 10, 16].indexOf(sourceBase)];
      sourceInput.classList.add("error");

      // Clear other inputs
      if (sourceBase !== 2) binaryInput.value = "";
      if (sourceBase !== 8) octalInput.value = "";
      if (sourceBase !== 10) decimalInput.value = "";
      if (sourceBase !== 16) hexadecimalInput.value = "";
    }
  }

  // Add input event listeners
  binaryInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/[^01]/g, "");
    e.target.value = value; // Clean input
    updateAllInputs(value, 2);
  });

  octalInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/[^0-7]/g, "");
    e.target.value = value; // Clean input
    updateAllInputs(value, 8);
  });

  decimalInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/[^0-9]/g, "");
    e.target.value = value; // Clean input
    updateAllInputs(value, 10);
  });

  hexadecimalInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    e.target.value = value; // Clean input
    updateAllInputs(value, 16);
  });

  // Add copy functionality
  document.querySelectorAll(".number-inputs .copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const text = document.getElementById(targetId).value;
      if (text) {
        window.electronAPI.clipboard
          .writeText(text)
          .then(() => {
            showToast("Copied to clipboard", "success");
          })
          .catch((err) => {
            console.error("Failed to copy:", err);
            showToast("Failed to copy to clipboard", "error");
          });
      }
    });
  });
}

function initializeRegexTool() {
  const regexInput = document.getElementById("regexInput");
  const regexTestInput = document.getElementById("regexTestInput");
  const regexMatches = document.getElementById("regexMatches");
  const flagCheckboxes = document.querySelectorAll(
    ".regex-flags input[type='checkbox']"
  );

  function updateRegexMatches() {
    try {
      const pattern = regexInput.value;
      const testString = regexTestInput.value;

      if (!pattern || !testString) {
        regexMatches.innerHTML = "";
        return;
      }

      // Get selected flags
      const flags = Array.from(flagCheckboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.flag)
        .join("");

      // Create RegExp object
      const regex = new RegExp(pattern, flags);

      // Test the string and highlight matches
      let html = testString;
      let matches = [];

      if (flags.includes("g")) {
        // Global flag: find all matches
        let match;
        while ((match = regex.exec(testString)) !== null) {
          matches.push({
            text: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      } else {
        // No global flag: find first match only
        const match = regex.exec(testString);
        if (match) {
          matches.push({
            text: match[0],
            index: match.index,
            groups: match.slice(1),
          });
        }
      }

      // Sort matches by index in reverse order to prevent position shifts
      matches.sort((a, b) => b.index - a.index);

      // Highlight matches in the text
      matches.forEach((match) => {
        const before = html.slice(0, match.index);
        const after = html.slice(match.index + match.text.length);
        html =
          before +
          '<span class="regex-match">' +
          match.text +
          "</span>" +
          after;
      });

      // Show results
      let resultsHtml = '<div class="matches-text">' + html + "</div>";

      if (matches.length > 0) {
        resultsHtml += '<div class="matches-details">';
        resultsHtml += `<h5>Found ${matches.length} match${
          matches.length === 1 ? "" : "es"
        }</h5>`;
        matches.forEach((match, i) => {
          resultsHtml += `<div class="match-detail">
            <div>Match ${i + 1}: "${match.text}"</div>
            <div>Index: ${match.index}</div>`;
          if (match.groups.length > 0) {
            resultsHtml += "<div>Groups:</div>";
            match.groups.forEach((group, j) => {
              resultsHtml += `<div>  ${j + 1}: "${group}"</div>`;
            });
          }
          resultsHtml += "</div>";
        });
        resultsHtml += "</div>";
      } else {
        resultsHtml += '<div class="no-matches">No matches found</div>';
      }

      regexMatches.innerHTML = resultsHtml;
      regexInput.classList.remove("error");
    } catch (error) {
      regexInput.classList.add("error");
      regexMatches.innerHTML = `<div class="error">${error.message}</div>`;
    }
  }

  // Add event listeners
  regexInput.addEventListener("input", updateRegexMatches);
  regexTestInput.addEventListener("input", updateRegexMatches);
  flagCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", updateRegexMatches);
  });
}

function initializeQRCodeTool() {
  const qrcodeInput = document.getElementById("qrcodeInput");
  const qrcodePreview = document.getElementById("qrcodePreview");
  const qrcodeEncodeBtn = document.getElementById("qrcodeEncodeBtn");
  const qrcodeDecodeBtn = document.getElementById("qrcodeDecodeBtn");
  const qrcodeConvertBtn = document.getElementById("qrcodeConvertBtn");
  const qrcodeSaveBtn = document.getElementById("qrcodeSaveBtn");
  const qrcodeFileInput = document.getElementById("qrcodeFileInput");
  const fileInputWrapper = document.querySelector(".qrcode-interface .file-input-wrapper");
  let isEncodeMode = true;
  let currentQRImage = null;

  async function handleQRCode() {
    try {
      if (isEncodeMode) {
        const input = qrcodeInput.value.trim();
        if (!input) {
          throw new Error("Please enter text to generate QR code");
        }
        const dataUrl = await window.electronAPI.qrcode.generate(input, {
          errorCorrectionLevel: "M",
          margin: 4,
          scale: 8,
          width: 300,
          height: 300,
        });
        currentQRImage = dataUrl;
        qrcodePreview.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
        qrcodeSaveBtn.style.display = "block";
      }
      qrcodeInput.classList.remove("error");
    } catch (error) {
      qrcodeInput.classList.add("error");
      qrcodePreview.innerHTML = `<div class="error">${error.message}</div>`;
      qrcodeSaveBtn.style.display = "none";
      currentQRImage = null;
    }
  }

  // Handle save button click
  if (qrcodeSaveBtn) {
    qrcodeSaveBtn.addEventListener("click", () => {
      if (currentQRImage) {
        // Create a temporary link element
        const link = document.createElement("a");
        link.href = currentQRImage;
        link.download = "qrcode.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    });
  }

  // Handle file input for QR code reading
  async function handleQRCodeFile(file) {
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      qrcodePreview.innerHTML = '<div class="loading">Processing QR code...</div>';
      qrcodeSaveBtn.style.display = "none";
      currentQRImage = null;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = await window.electronAPI.qrcode.read(e.target.result);
          qrcodeInput.value = result;
          qrcodePreview.innerHTML = `
            <div class="qr-result success">
              <img src="${e.target.result}" alt="Uploaded QR Code">
              <div class="result-text">Successfully decoded QR code</div>
            </div>`;
        } catch (error) {
          qrcodePreview.innerHTML = `
            <div class="qr-result error">
              <img src="${e.target.result}" alt="Failed QR Code">
              <div class="error-text">${error.message}</div>
            </div>`;
        }
      };
      reader.onerror = () => {
        qrcodePreview.innerHTML = '<div class="error">Failed to read image file</div>';
        qrcodeSaveBtn.style.display = "none";
        currentQRImage = null;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      qrcodePreview.innerHTML = `<div class="error">${error.message}</div>`;
      qrcodeSaveBtn.style.display = "none";
      currentQRImage = null;
    }
  }

  // File input click handler
  if (fileInputWrapper) {
    fileInputWrapper.addEventListener("click", () => {
      qrcodeFileInput.click();
    });

    // Handle drag and drop
    fileInputWrapper.addEventListener("dragover", (e) => {
      e.preventDefault();
      fileInputWrapper.style.borderColor = "var(--primary-color)";
      fileInputWrapper.style.background = "#f0f7ff";
    });

    fileInputWrapper.addEventListener("dragleave", (e) => {
      e.preventDefault();
      fileInputWrapper.style.borderColor = "";
      fileInputWrapper.style.background = "";
    });

    fileInputWrapper.addEventListener("drop", (e) => {
      e.preventDefault();
      fileInputWrapper.style.borderColor = "";
      fileInputWrapper.style.background = "";

      const file = e.dataTransfer.files[0];
      if (file) {
        handleQRCodeFile(file);
      }
    });
  }

  // Handle file selection
  if (qrcodeFileInput) {
    qrcodeFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        handleQRCodeFile(file);
      }
    });
  }

  // Mode switching
  qrcodeEncodeBtn.addEventListener("click", () => {
    isEncodeMode = true;
    qrcodeEncodeBtn.classList.add("active");
    qrcodeDecodeBtn.classList.remove("active");
    document.getElementById("qrcodeTextSection").style.display = "block";
    document.getElementById("qrcodeFileSection").style.display = "none";
    qrcodeInput.value = "";
    qrcodeInput.placeholder = "Enter text to generate QR code";
    qrcodePreview.innerHTML = "";
    qrcodeConvertBtn.style.display = "block";
    qrcodeSaveBtn.style.display = "none";
    currentQRImage = null;
  });

  qrcodeDecodeBtn.addEventListener("click", () => {
    isEncodeMode = false;
    qrcodeDecodeBtn.classList.add("active");
    qrcodeEncodeBtn.classList.remove("active");
    document.getElementById("qrcodeTextSection").style.display = "none";
    document.getElementById("qrcodeFileSection").style.display = "block";
    qrcodeInput.value = "";
    qrcodePreview.innerHTML = "";
    qrcodeConvertBtn.style.display = "none";
    qrcodeSaveBtn.style.display = "none";
    currentQRImage = null;
  });

  // Convert button
  qrcodeConvertBtn.addEventListener("click", handleQRCode);

  // Initialize with encode mode
  qrcodeEncodeBtn.click();
}

// Window controls
document.getElementById('minimizeBtn').addEventListener('click', () => {
    window.electronAPI.window.minimize();
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
    window.electronAPI.window.maximize();
});

document.getElementById('closeBtn').addEventListener('click', () => {
    window.electronAPI.window.close();
});
