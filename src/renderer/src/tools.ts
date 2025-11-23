import type { ToolsRegistry, Tool } from '../../types/tools';
import { logger } from './logger';

// Tool Definitions
const tools: ToolsRegistry = {
    // Formatters (Keep Editor UI)
    json: {
        id: 'json',
        title: 'JSON Formatter',
        description: 'Format and validate JSON data',
        category: 'Formatters',
        icon: 'account_tree', // JSON tree structure
        language: 'json',
        format: (input: string): string => {
            if (!input.trim()) return '';
            try {
                const parsed = JSON.parse(input);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                throw new Error('Invalid JSON: ' + error.message);
            }
        },
        placeholder: '{\n  "key": "value"\n}',
        sampleData: '{\n  "store": {\n    "book": [\n      {\n        "category": "reference",\n        "author": "Nigel Rees",\n        "title": "Sayings of the Century",\n        "price": 8.95\n      },\n      {\n        "category": "fiction",\n        "author": "Evelyn Waugh",\n        "title": "Sword of Honour",\n        "price": 12.99\n      }\n    ],\n    "bicycle": {\n      "color": "red",\n      "price": 19.95\n    }\n  }\n}'
    },
    xml: {
        id: 'xml',
        title: 'XML Formatter',
        description: 'Beautify XML strings',
        category: 'Formatters',
        icon: 'code', // XML/markup
        language: 'xml',
        format: (input) => window.electronAPI.beautify.html(input, { indent_size: 2 }),
        placeholder: '<root><child>value</child></root>',
        sampleData: '<?xml version="1.0" encoding="UTF-8"?>\n<note>\n  <to>Tove</to>\n  <from>Jani</from>\n  <heading>Reminder</heading>\n  <body>Don\'t forget me this weekend!</body>\n</note>'
    },
    sql: {
        id: 'sql',
        title: 'SQL Formatter',
        description: 'Format SQL queries',
        category: 'Formatters',
        icon: 'table_view', // SQL table
        language: 'sql',
        format: (input: string): string => {
            return input
                .replace(/\s+/g, ' ')
                .replace(/\b(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|LIMIT|INSERT|UPDATE|DELETE)\b/gi, '\n$1')
                .trim();
        },
        placeholder: 'SELECT * FROM users WHERE id = 1',
        sampleData: 'SELECT id, name, email FROM users WHERE created_at > "2023-01-01" ORDER BY name ASC LIMIT 10'
    },
    html: {
        id: 'html',
        title: 'HTML Formatter',
        description: 'Beautify HTML code',
        category: 'Formatters',
        icon: 'web', // HTML
        language: 'html',
        format: (input) => window.electronAPI.beautify.html(input, { indent_size: 2 }),
        placeholder: '<div><p>Hello</p></div>',
        sampleData: '<!DOCTYPE html>\n<html>\n<head>\n<title>Page Title</title>\n</head>\n<body>\n<h1>My First Heading</h1>\n<p>My first paragraph.</p>\n</body>\n</html>'
    },
    htmlJsx: {
        id: 'htmlJsx',
        title: 'HTML to JSX',
        description: 'Convert HTML to JSX',
        category: 'Formatters',
        icon: 'javascript', // JS
        language: 'javascript',
        format: (input: string): string => window.electronAPI.htmlToJsx.convert(input),
        placeholder: '<div class="foo">Hello</div>',
        sampleData: '<div class="container">\n  <h1 style="color: red;">Hello World</h1>\n  <button onclick="alert(\'Click\')">Click Me</button>\n</div>'
    },
    markdownToHtml: {
        id: 'markdownToHtml',
        title: 'Markdown to HTML',
        description: 'Convert Markdown to HTML source',
        category: 'Formatters',
        icon: 'css', // CSS
        language: 'html',
        format: (input: string): string => window.electronAPI.marked.parse(input),
        placeholder: '# Hello\n\n- Item 1\n- Item 2',
        sampleData: '# Welcome to Markdown\n\n## Features\n\n- **Bold text**\n- *Italic text*\n- `Code blocks`\n\n```javascript\nconst greeting = "Hello World";\n```\n\n[Link to Google](https://google.com)'
    },
    markdownPreview: {
        id: 'markdownPreview',
        title: 'Markdown Preview',
        description: 'Live preview of rendered Markdown',
        category: 'Converters',
        icon: 'description', // Markdown preview
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <h3>Markdown Source</h3>
                            <textarea class="form-control" id="md-source" rows="20" placeholder="# Enter markdown here..."># Welcome

Write your **markdown** here and see the preview!</textarea>
                        </div>
                        <div class="tool-card">
                            <h3>Preview</h3>
                            <div id="md-preview" class="p-4 min-h-[400px] bg-bg-input dark:bg-bg-input rounded-sm overflow-y-auto text-text-primary dark:text-text-primary markdown-preview"></div>
                        </div>
                    </div>
                </div>
            `;
            const source = document.getElementById('md-source') as HTMLTextAreaElement | null;
            const preview = document.getElementById('md-preview') as HTMLDivElement | null;
            
            if (!source || !preview) return;
            
            const update = (): void => {
                try {
                    const html = window.electronAPI.marked.parse(source.value);
                    preview.innerHTML = html;
                } catch (e) {
                    const error = e instanceof Error ? e : new Error(String(e));
                    preview.innerHTML = `<div class="text-error dark:text-error">Error: ${error.message}</div>`;
                }
            };
            
            source.addEventListener('input', update);
            update();
        }
    },


    // Encoders / Decoders
    base64: {
        id: 'base64',
        title: 'Base64 Encoder/Decoder',
        description: 'Convert text to/from Base64',
        category: 'Encoders',
        icon: 'description', // Markdown to HTML
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Plain Text</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('b64-plain').value = text).then(() => document.getElementById('b64-plain').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="b64-plain" rows="12" placeholder="Type or paste text here..."></textarea>
                        </div>
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Base64 Encoded</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('b64-encoded').value)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <textarea class="form-control" id="b64-encoded" rows="12" placeholder="Base64 output..."></textarea>
                        </div>
                    </div>
                </div>
            `;
            const plain = document.getElementById('b64-plain') as HTMLTextAreaElement | null;
            const encoded = document.getElementById('b64-encoded') as HTMLTextAreaElement | null;

            if (!plain || !encoded) return;

            plain.addEventListener('input', () => {
                try {
                    encoded.value = btoa(unescape(encodeURIComponent(plain.value)));
                } catch {
                    encoded.value = 'Error encoding';
                }
            });

            encoded.addEventListener('input', () => {
                try {
                    plain.value = decodeURIComponent(escape(atob(encoded.value.trim())));
                } catch {
                    plain.value = 'Error decoding';
                }
            });
        }
    },
    url: {
        id: 'url',
        title: 'URL Encoder/Decoder',
        description: 'Encode or decode URL components',
        category: 'Encoders',
        icon: 'link', // URL encode/decode
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Decoded URL</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('url-decoded').value = text).then(() => document.getElementById('url-decoded').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="url-decoded" rows="12" placeholder="https://example.com/path?query=..."></textarea>
                        </div>
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Encoded URL</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('url-encoded').value)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <textarea class="form-control" id="url-encoded" rows="12" placeholder="https%3A%2F%2Fexample.com..."></textarea>
                        </div>
                    </div>
                </div>
            `;
            const decoded = document.getElementById('url-decoded') as HTMLTextAreaElement | null;
            const encoded = document.getElementById('url-encoded') as HTMLTextAreaElement | null;

            if (!decoded || !encoded) return;

            decoded.addEventListener('input', () => {
                encoded.value = encodeURIComponent(decoded.value);
            });

            encoded.addEventListener('input', () => {
                try {
                    decoded.value = decodeURIComponent(encoded.value);
                } catch {
                    decoded.value = 'Error decoding';
                }
            });
        }
    },
    hexAscii: {
        id: 'hexAscii',
        title: 'HEX ↔ ASCII',
        description: 'Convert between HEX and ASCII',
        category: 'Encoders',
        icon: 'swap_horiz', // Base64 encode/decode
        language: 'plaintext',
        hasMode: true,
        encodeText: 'ASCII → HEX',
        decodeText: 'HEX → ASCII',
        format: (input) => {
            if (!input) return '';

            // Let's switch this to Custom UI for consistency with Base64/URL
            return "Use Custom UI implementation below"; 
        },
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">ASCII Text</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('hex-ascii').value = text).then(() => document.getElementById('hex-ascii').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="hex-ascii" rows="10" placeholder="Type text here..."></textarea>
                        </div>
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">HEX Output</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('hex-output').value)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <textarea class="form-control" id="hex-output" rows="10" placeholder="HEX output..."></textarea>
                        </div>
                    </div>
                </div>
            `;
            const ascii = document.getElementById('hex-ascii');
            const hex = document.getElementById('hex-output');

            ascii.addEventListener('input', () => {
                hex.value = window.electronAPI.string.toHex(ascii.value);
            });

            hex.addEventListener('input', () => {
                hex.value = hex.value.replace(/[^0-9A-Fa-f\s]/g, ''); // Clean input
                ascii.value = window.electronAPI.string.toAscii(hex.value);
            });
        }
    },
    certificate: {
        id: 'certificate',
        title: 'Certificate Decoder',
        description: 'Decode X.509 Certificates',
        category: 'Encoders',
        icon: 'security', // Certificate
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">PEM Certificate</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('cert-input').value = text).then(() => document.getElementById('cert-input').dispatchEvent(new Event('input')))">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="cert-input" rows="5" placeholder="-----BEGIN CERTIFICATE-----..."></textarea>
                    </div>
                    <div class="tool-card" id="cert-details" style="display:none;">
                        <h3>Certificate Details</h3>
                        <div class="result-grid" style="grid-template-columns: 1fr;">
                            <div class="result-item">
                                <label style="display: flex; justify-content: space-between; align-items: center;">
                                    <span>Subject</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-subject').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="cert-subject" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="result-item">
                                <label style="display: flex; justify-content: space-between; align-items: center;">
                                    <span>Issuer</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-issuer').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="cert-issuer" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="grid-2">
                                <div class="result-item">
                                    <label style="display: flex; justify-content: space-between; align-items: center;">
                                        <span>Valid From</span>
                                        <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-valid-from').value)">
                                            <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                        </button>
                                    </label>
                                    <input type="text" class="form-control" id="cert-valid-from" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                                </div>
                                <div class="result-item">
                                    <label style="display: flex; justify-content: space-between; align-items: center;">
                                        <span>Valid To</span>
                                        <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-valid-to').value)">
                                            <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                        </button>
                                    </label>
                                    <input type="text" class="form-control" id="cert-valid-to" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                                </div>
                            </div>
                            <div class="result-item">
                                <label style="display: flex; justify-content: space-between; align-items: center;">
                                    <span>Serial Number</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-serial').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="cert-serial" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="result-item">
                                <label style="display: flex; justify-content: space-between; align-items: center;">
                                    <span>Fingerprint (SHA-1)</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('cert-fingerprint').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="cert-fingerprint" readonly style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const input = document.getElementById('cert-input');
            const details = document.getElementById('cert-details');
            
            input.addEventListener('input', () => {
                try {
                    const val = input.value.trim();
                    if (!val.includes('BEGIN CERTIFICATE')) return;
                    
                    const decoded = window.electronAPI.x509.decode(val);
                    if (decoded) {
                        details.style.display = 'block';
                        document.getElementById('cert-subject').value = decoded.subject || '';
                        document.getElementById('cert-issuer').value = decoded.issuer || '';
                        document.getElementById('cert-valid-from').value = decoded.notBefore || '';
                        document.getElementById('cert-valid-to').value = decoded.notAfter || '';
                        document.getElementById('cert-serial').value = decoded.serial || '';
                        document.getElementById('cert-fingerprint').value = decoded.fingerprint || '';
                    }
                } catch (e) {
                    // Invalid cert
                }
            });
        }
    },
    csvJson: {
        id: 'csvJson',
        title: 'CSV ↔ JSON',
        description: 'Convert between CSV and JSON',
        category: 'Converters',
        icon: 'grid_on', // CSV to JSON
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">CSV</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('csv-input').value = text).then(() => document.getElementById('csv-input').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="csv-input" rows="12" placeholder="id,name\n1,John"></textarea>
                        </div>
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">JSON</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('json-output').value)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <textarea class="form-control" id="json-output" rows="12" placeholder="[\n  {\n    &quot;id&quot;: &quot;1&quot;,\n    &quot;name&quot;: &quot;John&quot;\n  }\n]"></textarea>
                        </div>
                    </div>
                </div>
            `;
            const csv = document.getElementById('csv-input');
            const json = document.getElementById('json-output');

            csv.addEventListener('input', () => {
                try {
                    const result = window.electronAPI.csv.toJSON(csv.value);
                    json.value = JSON.stringify(result.data, null, 2);
                } catch (e) {}
            });

            json.addEventListener('input', () => {
                try {
                    const data = JSON.parse(json.value);
                    csv.value = window.electronAPI.csv.fromJSON(data);
                } catch (e) {}
            });
        }
    },

    // Specialized UIs (From previous step)
    jwt: {
        id: 'jwt',
        title: 'JWT Decoder',
        description: 'Decode JSON Web Tokens',
        category: 'Encoders',
        icon: 'vpn_key', // JWT
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Encoded Token</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('jwt-input').value = text).then(() => document.getElementById('jwt-input').dispatchEvent(new Event('input')))">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="jwt-input" rows="4" placeholder="Paste JWT here (header.payload.signature)..."></textarea>
                    </div>
                    <div class="jwt-parts">
                        <div class="jwt-part jwt-header">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Header</h3>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('jwt-header-out').textContent)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <pre id="jwt-header-out" class="result-box" style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.textContent)">{}</pre>
                        </div>
                        <div class="jwt-part jwt-payload">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Payload</h3>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('jwt-payload-out').textContent)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <pre id="jwt-payload-out" class="result-box" style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.textContent)">{}</pre>
                        </div>
                        <div class="jwt-part jwt-signature">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Signature</h3>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('jwt-sig-out').textContent)">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy
                                </button>
                            </div>
                            <pre id="jwt-sig-out" class="result-box" style="cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.textContent)">Signature</pre>
                        </div>
                    </div>
                </div>
            `;
            
            const input = document.getElementById('jwt-input');
            input.addEventListener('input', (e) => {
                try {
                    const val = e.target.value.trim();
                    if (!val) return;
                    const parts = val.split('.');
                    if (parts.length !== 3) throw new Error('Invalid JWT format');
                    
                    document.getElementById('jwt-header-out').textContent = JSON.stringify(JSON.parse(atob(parts[0])), null, 2);
                    document.getElementById('jwt-payload-out').textContent = JSON.stringify(JSON.parse(atob(parts[1])), null, 2);
                    document.getElementById('jwt-sig-out').textContent = parts[2];
                } catch (err) {
                    // Silent fail or show error toast
                }
            });
        }
    },
    timestamp: {
        id: 'timestamp',
        title: 'Timestamp Converter',
        description: 'Convert Unix timestamps and dates',
        category: 'Converters',
        icon: 'access_time', // Timestamp
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Unix Timestamp (seconds)</h3>
                            <button class="btn-icon" id="ts-now-btn" style="background: var(--accent-color); color: white; padding: 6px 12px;"><i class="material-icons">update</i> Now</button>
                        </div>
                        <input type="number" class="form-control" id="ts-unix" placeholder="Enter Unix timestamp..." style="font-family: var(--mono-font); font-size: 14px;">
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Formatted Dates</h3>
                            <div style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                                <i class="material-icons" style="font-size: 14px;">info</i>
                                Click any date to copy
                            </div>
                        </div>
                        <div class="result-grid">
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>ISO 8601</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('ts-iso').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="ts-iso" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>UTC</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('ts-utc').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="ts-utc" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Local Time</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('ts-local').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="ts-local" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Relative</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('ts-relative').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="ts-relative" readonly style="font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText(this.value)">
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const unixInput = document.getElementById('ts-unix');
            const update = (ts) => {
                if (!ts) return;
                const date = new Date(ts * 1000);
                if (isNaN(date.getTime())) return;
                document.getElementById('ts-iso').value = date.toISOString();
                document.getElementById('ts-utc').value = date.toUTCString();
                document.getElementById('ts-local').value = date.toLocaleString();
                
                // Relative time
                const now = Date.now();
                const diff = now - (ts * 1000);
                const seconds = Math.floor(Math.abs(diff) / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                
                let relative;
                if (days > 0) relative = `${diff > 0 ? '' : 'in '}${days} day${days > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
                else if (hours > 0) relative = `${diff > 0 ? '' : 'in '}${hours} hour${hours > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
                else if (minutes > 0) relative = `${diff > 0 ? '' : 'in '}${minutes} minute${minutes > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
                else relative = `${diff > 0 ? '' : 'in '}${seconds} second${seconds > 1 ? 's' : ''}${diff > 0 ? ' ago' : ''}`;
                
                document.getElementById('ts-relative').value = relative;
            };
            unixInput.addEventListener('input', (e) => update(parseInt(e.target.value)));
            document.getElementById('ts-now-btn').onclick = () => {
                const now = Math.floor(Date.now() / 1000);
                unixInput.value = now;
                update(now);
            };
            document.getElementById('ts-now-btn').click();
        }
    },
    color: {
        id: 'color',
        title: 'Color Converter',
        description: 'Convert between all color formats with code presets',
        category: 'Converters',
        icon: 'colorize', // Color
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <h3>Input</h3>
                            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                <button class="btn-icon" id="color-clipboard-btn"><i class="material-icons">content_paste</i> Clipboard</button>
                                <button class="btn-icon" id="color-sample-btn"><i class="material-icons">colorize</i> Sample</button>
                                <button class="btn-icon" id="color-clear-btn"><i class="material-icons">clear</i> Clear</button>
                            </div>
                            
                            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                                <div style="flex: 1;">
                                    <div class="color-preview" id="color-preview" style="background: #72cd42; height: 120px; margin-bottom: 0;"></div>
                                </div>
                                <div style="flex: 1;">
                                    <label style="display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary);">Color Picker</label>
                                    <input type="color" id="color-picker" value="#72cd42" style="width: 100%; height: 100px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">
                                </div>
                            </div>
                            
                            <div class="input-group">
                                <label>Hex</label>
                                <input type="text" class="form-control" id="color-hex" value="#72cd42" placeholder="#RRGGBB">
                            </div>
                            <div class="input-group">
                                <label>Hex with alpha</label>
                                <input type="text" class="form-control" id="color-hex-alpha" value="#72cd42ff" placeholder="#RRGGBBAA">
                            </div>
                            <div class="input-group">
                                <label>RGB</label>
                                <input type="text" class="form-control" id="color-rgb" value="rgb(114, 205, 66)" placeholder="rgb(r, g, b)">
                            </div>
                            <div class="input-group">
                                <label>RGBA</label>
                                <input type="text" class="form-control" id="color-rgba" value="rgba(114, 205, 66, 1)" placeholder="rgba(r, g, b, a)">
                            </div>
                            <div class="input-group">
                                <label>HSL</label>
                                <input type="text" class="form-control" id="color-hsl" value="hsl(99, 58%, 53%)" placeholder="hsl(h, s%, l%)">
                            </div>
                            <div class="input-group">
                                <label>HSLA</label>
                                <input type="text" class="form-control" id="color-hsla" value="hsla(99, 58%, 53%, 100%)" placeholder="hsla(h, s%, l%, a%)">
                            </div>
                            <div class="input-group">
                                <label>HSV (HSB)</label>
                                <input type="text" class="form-control" id="color-hsv" value="hsv(99, 68%, 80%)" placeholder="hsv(h, s%, v%)">
                            </div>
                            <div class="input-group">
                                <label>Opacity</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="range" id="color-opacity" min="0" max="100" value="100" style="flex: 1;">
                                    <span id="color-opacity-label" style="min-width: 45px; font-family: var(--mono-font); font-size: 13px;">100%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tool-card">
                            <h3>Code Presets</h3>
                            <div id="color-code-presets" style="font-family: var(--mono-font); font-size: 12px;">
                                <div style="margin-bottom: 16px;">
                                    <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">CSS Level 4 Color Module:</div>
                                    <div class="result-item" style="margin-bottom: 8px;">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">rgb(114 205 66)</div>
                                    </div>
                                    <div class="result-item" style="margin-bottom: 8px;">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">rgb(114 205 66 / 100%)</div>
                                    </div>
                                    <div class="result-item">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">hsl(99deg 58% 53%)</div>
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 16px;">
                                    <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Swift:</div>
                                    <div class="result-item">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">NSColor(calibratedRed: 0.4459, green: 0.8035, blue: 0.2577, alpha: 1)</div>
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 16px;">
                                    <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">.NET:</div>
                                    <div class="result-item">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">Color.FromRgb(114, 205, 66)</div>
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 16px;">
                                    <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Java:</div>
                                    <div class="result-item">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">new Color(114, 205, 66)</div>
                                    </div>
                                </div>
                                
                                <div>
                                    <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Android:</div>
                                    <div class="result-item">
                                        <div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">Color.argb(255, 114, 205, 66)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const preview = document.getElementById('color-preview');
            const picker = document.getElementById('color-picker');
            const hexInput = document.getElementById('color-hex');
            const hexAlphaInput = document.getElementById('color-hex-alpha');
            const rgbInput = document.getElementById('color-rgb');
            const rgbaInput = document.getElementById('color-rgba');
            const hslInput = document.getElementById('color-hsl');
            const hslaInput = document.getElementById('color-hsla');
            const hsvInput = document.getElementById('color-hsv');
            const opacityInput = document.getElementById('color-opacity');
            const opacityLabel = document.getElementById('color-opacity-label');
            
            let currentColor = { r: 114, g: 205, b: 66, a: 1 };
            
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16),
                    a: result[4] ? parseInt(result[4], 16) / 255 : 1
                } : null;
            };
            
            const rgbToHsl = (r, g, b) => {
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h, s, l = (max + min) / 2;
                if (max === min) { h = s = 0; }
                else {
                    const d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch (max) {
                        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                        case g: h = ((b - r) / d + 2) / 6; break;
                        case b: h = ((r - g) / d + 4) / 6; break;
                    }
                }
                return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
            };
            
            const rgbToHsv = (r, g, b) => {
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                const d = max - min;
                let h, s = max === 0 ? 0 : d / max, v = max;
                if (max === min) { h = 0; }
                else {
                    switch (max) {
                        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                        case g: h = ((b - r) / d + 2) / 6; break;
                        case b: h = ((r - g) / d + 4) / 6; break;
                    }
                }
                return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
            };
            
            const updateAll = () => {
                const { r, g, b, a } = currentColor;
                const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                const hexAlpha = hex + Math.round(a * 255).toString(16).padStart(2, '0');
                const hsl = rgbToHsl(r, g, b);
                const hsv = rgbToHsv(r, g, b);
                
                preview.style.background = `rgba(${r}, ${g}, ${b}, ${a})`;
                picker.value = hex;
                hexInput.value = hex;
                hexAlphaInput.value = hexAlpha;
                rgbInput.value = `rgb(${r}, ${g}, ${b})`;
                rgbaInput.value = `rgba(${r}, ${g}, ${b}, ${a})`;
                hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
                hslaInput.value = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${Math.round(a * 100)}%)`;
                hsvInput.value = `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
                opacityInput.value = Math.round(a * 100);
                opacityLabel.textContent = Math.round(a * 100) + '%';
                
                // Update code presets
                document.getElementById('color-code-presets').innerHTML = `
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">CSS Level 4 Color Module:</div>
                        <div class="result-item" style="margin-bottom: 8px;"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">rgb(${r} ${g} ${b})</div></div>
                        <div class="result-item" style="margin-bottom: 8px;"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">rgb(${r} ${g} ${b} / ${Math.round(a * 100)}%)</div></div>
                        <div class="result-item"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">hsl(${hsl.h}deg ${hsl.s}% ${hsl.l}%)</div></div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Swift:</div>
                        <div class="result-item"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">NSColor(calibratedRed: ${(r/255).toFixed(4)}, green: ${(g/255).toFixed(4)}, blue: ${(b/255).toFixed(4)}, alpha: ${a})</div></div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">.NET:</div>
                        <div class="result-item"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">Color.FromRgb(${r}, ${g}, ${b})</div></div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Java:</div>
                        <div class="result-item"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">new Color(${r}, ${g}, ${b})</div></div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary); font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase;">Android:</div>
                        <div class="result-item"><div style="padding: 8px; background: var(--bg-input); border-radius: 4px;cursor: pointer;" onclick="navigator.clipboard.writeText(this.textContent)">Color.argb(${Math.round(a * 255)}, ${r}, ${g}, ${b})</div></div>
                    </div>
                `;
            };
            
            picker.addEventListener('input', (e) => {
                const rgb = hexToRgb(e.target.value);
                if (rgb) {
                    currentColor = { ...rgb, a: currentColor.a };
                    updateAll();
                }
            });
            
            hexInput.addEventListener('input', (e) => {
                const rgb = hexToRgb(e.target.value);
                if (rgb) {
                    currentColor = { ...rgb, a: currentColor.a };
                    updateAll();
                }
            });
            
            opacityInput.addEventListener('input', (e) => {
                currentColor.a = parseInt(e.target.value) / 100;
                updateAll();
            });
            
            document.getElementById('color-sample-btn').onclick = () => {
                const colors = ['#72cd42', '#ff5733', '#3357ff', '#f0f000', '#ff1493'];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                const rgb = hexToRgb(randomColor);
                if (rgb) {
                    currentColor = { ...rgb, a: 1 };
                    updateAll();
                }
            };
            
            document.getElementById('color-clear-btn').onclick = () => {
                currentColor = { r: 0, g: 0, b: 0, a: 1 };
                updateAll();
            };
            
            document.getElementById('color-clipboard-btn').onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const rgb = hexToRgb(text.trim());
                    if (rgb) {
                        currentColor = rgb;
                        updateAll();
                    }
                } catch (e) {}
            };
            
            updateAll();
        }
    },
    uuid: {
        id: 'uuid',
        title: 'UUID/ULID Generator',
        description: 'Generate and decode UUIDs and ULIDs',
        category: 'Generators',
        icon: 'badge', // UUID/ULID
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <h3>Input</h3>
                            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                <button class="btn-icon" id="uuid-clipboard-btn"><i class="material-icons">content_paste</i> Clipboard</button>
                                <button class="btn-icon" id="uuid-sample-btn"><i class="material-icons">shuffle</i> Sample (v4)</button>
                                <button class="btn-icon" id="uuid-clear-btn"><i class="material-icons">clear</i> Clear</button>
                            </div>
                            <input type="text" class="form-control" id="uuid-input" placeholder="Paste UUID or ULID here..." style="margin-bottom: 12px;">
                            
                            <h3 style="margin-top: 20px;">Generate New IDs</h3>
                            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
                                <select id="uuid-type" class="toolbar-select" style="flex: 1;">
                                    <option value="uuid-v4">UUID v4</option>
                                    <option value="ulid">ULID</option>
                                </select>
                                <span style="color: var(--text-secondary); font-size: 12px;">×</span>
                                <input type="number" id="uuid-quantity" class="form-control" value="10" min="1" max="100" style="width: 80px;">
                                <button class="btn-icon" id="uuid-generate-btn" style="background: var(--accent-color); color: white;">Generate</button>
                            </div>
                            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                                <button class="btn-icon" id="uuid-copy-all-btn"><i class="material-icons">content_copy</i> Copy</button>
                                <button class="btn-icon" id="uuid-clear-list-btn"><i class="material-icons">delete_outline</i> Clear</button>
                                <label style="margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;">
                                    <input type="checkbox" id="uuid-lowercase">
                                    <span>lowercase</span>
                                </label>
                            </div>
                            <textarea id="uuid-list" class="form-control" rows="10" readonly placeholder="Generated IDs will appear here..."></textarea>
                        </div>
                        
                        <div class="tool-card">
                            <h3>Decoded Information</h3>
                            <div id="uuid-breakdown" style="color: var(--text-secondary); font-size: 13px;">
                                <p>Paste or generate a UUID/ULID to see details</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const input = document.getElementById('uuid-input');
            const breakdown = document.getElementById('uuid-breakdown');
            const generateBtn = document.getElementById('uuid-generate-btn');
            const typeSelect = document.getElementById('uuid-type');
            const quantityInput = document.getElementById('uuid-quantity');
            const list = document.getElementById('uuid-list');
            const lowercaseCheckbox = document.getElementById('uuid-lowercase');
            
            // Parse and display UUID/ULID breakdown
            const parseID = (id) => {
                if (!id) {
                    breakdown.innerHTML = '<p>Paste or generate a UUID/ULID to see details</p>';
                    return;
                }
                
                const cleanId = id.trim().replace(/-/g, '');
                
                // Check if it's a ULID
                if (cleanId.length === 26 && /^[0-9A-Z]+$/i.test(cleanId)) {
                    try {
                        const decoded = window.electronAPI.ulid.decode(id);
                        breakdown.innerHTML = `
                            <div class="result-item" style="margin-bottom: 12px;">
                                <label style="font-weight: 600; color: var(--text-primary);">Type</label>
                                <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">ULID</div>
                            </div>
                            <div class="result-item" style="margin-bottom: 12px;">
                                <label style="font-weight: 600; color: var(--text-primary);">Timestamp</label>
                                <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">${decoded.timestamp} ms</div>
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary);">Date</label>
                                <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">${decoded.date}</div>
                            </div>
                        `;
                    } catch (e) {
                        breakdown.innerHTML = '<p style="color: var(--error-color);">Invalid ULID format</p>';
                    }
                } else if ((cleanId.length === 32 && /^[0-9A-F]+$/i.test(cleanId)) || id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                    // UUID
                    const version = parseInt(cleanId[12], 16);
                    const variant = parseInt(cleanId[16], 16) >> 6;
                    breakdown.innerHTML = `
                        <div class="result-item" style="margin-bottom: 12px;">
                            <label style="font-weight: 600; color: var(--text-primary);">Type</label>
                            <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">UUID</div>
                        </div>
                        <div class="result-item" style="margin-bottom: 12px;">
                            <label style="font-weight: 600; color: var(--text-primary);">Standard String Format</label>
                            <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px; word-break: break-all;">${id.toLowerCase()}</div>
                        </div>
                        <div class="result-item" style="margin-bottom: 12px;">
                            <label style="font-weight: 600; color: var(--text-primary);">Raw Contents</label>
                            <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px; word-break: break-all;">${cleanId.match(/.{1,2}/g).join(':').toLowerCase()}</div>
                        </div>
                        <div class="result-item" style="margin-bottom: 12px;">
                            <label style="font-weight: 600; color: var(--text-primary);">Version</label>
                            <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">${version} (${version === 4 ? 'random' : version === 1 ? 'time-based' : 'unknown'})</div>
                        </div>
                        <div class="result-item">
                            <label style="font-weight: 600; color: var(--text-primary);">Variant</label>
                            <div style="padding: 8px; background: var(--bg-input); border-radius: 4px; font-family: var(--mono-font); margin-top: 4px;">${variant === 2 ? 'RFC 4122' : 'Other'}</div>
                        </div>
                    `;
                } else {
                    breakdown.innerHTML = '<p style="color: var(--error-color);">Invalid UUID or ULID format</p>';
                }
            };
            
            input.addEventListener('input', (e) => parseID(e.target.value));
            
            // Generate button
            generateBtn.onclick = () => {
                const type = typeSelect.value;
                const count = parseInt(quantityInput.value) || 1;
                const lowercase = lowercaseCheckbox.checked;
                const ids = [];
                
                for (let i = 0; i < count; i++) {
                    let id;
                    if (type === 'uuid-v4') {
                        id = crypto.randomUUID();
                    } else {
                        id = window.electronAPI.ulid.generate();
                    }
                    ids.push(lowercase ? id.toLowerCase() : id.toUpperCase());
                }
                
                list.value = ids.join('\n');
                if (ids.length > 0) {
                    input.value = ids[0];
                    parseID(ids[0]);
                }
            };
            
            // Toolbar buttons
            document.getElementById('uuid-clipboard-btn').onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    input.value = text;
                    parseID(text);
                } catch (e) {}
            };
            
            document.getElementById('uuid-sample-btn').onclick = () => {
                const sample = crypto.randomUUID();
                input.value = sample;
                parseID(sample);
            };
            
            document.getElementById('uuid-clear-btn').onclick = () => {
                input.value = '';
                parseID('');
            };
            
            document.getElementById('uuid-copy-all-btn').onclick = () => {
                if (list.value) {
                    navigator.clipboard.writeText(list.value);
                }
            };
            
            document.getElementById('uuid-clear-list-btn').onclick = () => {
                list.value = '';
            };
            
            // Generate initial UUIDs
            generateBtn.click();
        }
    },
    qrcode: {
        id: 'qrcode',
        title: 'QR Code Generator',
        description: 'Generate QR codes from text or URLs',
        category: 'Generators',
        icon: 'qr_code_2', // QR Code
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2">
                        <div class="tool-card">
                            <h3>Input</h3>
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 12px;">Text or URL</label>
                                <input type="text" class="form-control" id="qr-input" placeholder="https://example.com">
                            </div>
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 12px;">Size (px)</label>
                                <input type="number" class="form-control" id="qr-size" value="256" min="128" max="512" step="64">
                            </div>
                            <button class="btn-icon" id="qr-generate" style="background: var(--accent-color); color: white; width: 100%;"><i class="material-icons">qr_code</i> Generate QR Code</button>
                        </div>
                        <div class="tool-card">
                            <h3>QR Code Preview</h3>
                            <div class="qr-preview" id="qr-preview" style="display: flex; align-items: center; justify-content: center; min-height: 280px; background: var(--bg-input); border-radius: var(--radius-sm); margin-bottom: 12px;">
                                <div style="color: var(--text-secondary);">QR Code will appear here</div>
                            </div>
                            <button class="btn-icon" id="qr-download" style="width: 100%; display: none;">
                                <i class="material-icons">download</i> Download QR Code
                            </button>
                        </div>
                    </div>
                </div>
            `;
            const input = document.getElementById('qr-input');
            const sizeInput = document.getElementById('qr-size');
            const preview = document.getElementById('qr-preview');
            const downloadBtn = document.getElementById('qr-download');
            let currentDataUrl = '';
            
            const generate = async () => {
                const text = input.value.trim();
                if (!text) {
                    preview.innerHTML = '<div style="color: var(--text-secondary);">Enter text to generate QR code</div>';
                    downloadBtn.style.display = 'none';
                    return;
                }
                const size = parseInt(sizeInput.value) || 256;
                try {
                    currentDataUrl = await window.electronAPI.qrcode.generate(text, { width: size, margin: 2 });
                   preview.innerHTML = `<img src="${currentDataUrl}" alt="QR Code" style="max-width: 100%; border-radius: var(--radius-sm);">`;
                    downloadBtn.style.display = 'block';
                } catch (e) {
                    preview.innerHTML = `<div style="color: var(--error-color);">Error: ${e.message}</div>`;
                    downloadBtn.style.display = 'none';
                }
            };
            
            document.getElementById('qr-generate').onclick = generate;
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') generate();
            });
            
            downloadBtn.onclick = () => {
                if (currentDataUrl) {
                    const a = document.createElement('a');
                    a.href = currentDataUrl;
                    a.download = 'qrcode.png';
                    a.click();
                }
            };
        }
    },
    hash: {
        id: 'hash',
        title: 'Hash Generator',
        description: 'Generate MD5, SHA-1, SHA-256, and SHA-512 hashes',
        category: 'Encoders',
        icon: 'fingerprint', // Hash
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Input Text</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('hash-input').value = text).then(() => document.getElementById('hash-input').dispatchEvent(new Event('input')))">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="hash-input" rows="6" placeholder="Enter text to hash..." style="resize: vertical;"></textarea>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Hash Results</h3>
                            <div style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                                <i class="material-icons" style="font-size: 14px;">info</i>
                                Click any hash to copy
                            </div>
                        </div>
                        <div id="hash-results"></div>
                    </div>
                </div>
            `;
            const input = document.getElementById('hash-input');
            const results = document.getElementById('hash-results');
            
            const update = async () => {
                const text = input.value;
                if (!text) {
                    results.innerHTML = '<div style="text-align: center; padding: 40px 0; color: var(--text-secondary);"><i class="material-icons" style="font-size: 48px; opacity: 0.3; display: block; margin-bottom: 12px;">tag</i>Enter text to generate hashes...</div>';
                    return;
                }
                const md5 = await window.electronAPI.crypto.md5(text);
                const sha1 = await window.electronAPI.crypto.sha1(text);
                const sha256 = await window.electronAPI.crypto.sha256(text);
                const sha512 = await window.electronAPI.crypto.sha512(text);
                results.innerHTML = `
                    <div class="result-grid">
                        <div class="result-item">
                            <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span>MD5</span>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText('${md5}')">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control" value="${md5}" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText('${md5}')">
                        </div>
                        <div class="result-item">
                            <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span>SHA-1</span>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText('${sha1}')">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control" value="${sha1}" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText('${sha1}')">
                        </div>
                        <div class="result-item">
                            <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span>SHA-256</span>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText('${sha256}')">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control" value="${sha256}" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText('${sha256}')">
                        </div>
                        <div class="result-item">
                            <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span>SHA-512</span>
                                <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText('${sha512}')">
                                    <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                </button>
                            </label>
                            <input type="text" class="form-control" value="${sha512}" readonly style="font-family: var(--mono-font); font-size: 12px; cursor: pointer;" onclick="this.select(); navigator.clipboard.writeText('${sha512}')">
                        </div>
                    </div>
                `;
            };
            input.addEventListener('input', update);
            update();
        }
    },
    stringCase: {
        id: 'stringCase',
        title: 'String Case Converter',
        description: 'Convert between different string cases',
        category: 'Text Tools',
        icon: 'title', // String case
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Input Text</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('case-input').value = text).then(() => document.getElementById('case-input').dispatchEvent(new Event('input')))" aria-label="Paste from clipboard">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="case-input" rows="6" placeholder="Enter or paste text to convert..." style="resize: vertical;"></textarea>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Converted Cases</h3>
                            <div style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                                <i class="material-icons" style="font-size: 14px;">info</i>
                                Click any output to copy
                            </div>
                        </div>
                        <div class="result-grid">
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>camelCase</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-camel').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-camel" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>PascalCase</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-pascal').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-pascal" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>snake_case</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-snake').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-snake" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>kebab-case</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-kebab').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-kebab" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>UPPER CASE</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-upper').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-upper" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>lower case</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('case-lower').value)"><i class="material-icons" style="font-size: 14px;">content_copy</i></button>
                                </label>
                                <input type="text" class="form-control" id="case-lower" readonly style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('case-input').addEventListener('input', (e) => {
                const val = e.target.value;
                if (!val) {
                    document.getElementById('case-camel').value = '';
                    document.getElementById('case-pascal').value = '';
                    document.getElementById('case-snake').value = '';
                    document.getElementById('case-kebab').value = '';
                    document.getElementById('case-upper').value = '';
                    document.getElementById('case-lower').value = '';
                    return;
                }
                document.getElementById('case-camel').value = window.electronAPI.string.cases.toCamelCase(val);
                document.getElementById('case-pascal').value = window.electronAPI.string.cases.toPascalCase(val);
                document.getElementById('case-snake').value = window.electronAPI.string.cases.toSnakeCase(val);
                document.getElementById('case-kebab').value = window.electronAPI.string.cases.toKebabCase(val);
                document.getElementById('case-upper').value = val.toUpperCase();
                document.getElementById('case-lower').value = val.toLowerCase();
            });
        }
    },
    stringInspector: {
        id: 'stringInspector',
        title: 'String Inspector',
        description: 'Analyze string properties and statistics',
        category: 'Text Tools',
        icon: 'insights', // String inspector
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Input Text</h3>
                           <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('insp-input').value = text).then(() => document.getElementById('insp-input').dispatchEvent(new Event('input')))">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="insp-input" rows="10" placeholder="Enter or paste text to analyze..." style="resize: vertical;"></textarea>
                    </div>
                    <div class="tool-card">
                        <h3 style="margin-bottom: 16px; font-size: 14px;">Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-card" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); text-align: center;">
                                <div class="stat-value" id="stat-chars" style="font-size: 32px; font-weight: 700; color: var(--accent-color); font-family: var(--mono-font);">0</div>
                                <div class="stat-label" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Characters</div>
                            </div>
                            <div class="stat-card" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); text-align: center;">
                                <div class="stat-value" id="stat-words" style="font-size: 32px; font-weight: 700; color: var(--success-color); font-family: var(--mono-font);">0</div>
                                <div class="stat-label" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Words</div>
                            </div>
                            <div class="stat-card" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); text-align: center;">
                                <div class="stat-value" id="stat-lines" style="font-size: 32px; font-weight: 700; color: var(--error-color); font-family: var(--mono-font);">0</div>
                                <div class="stat-label" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Lines</div>
                            </div>
                            <div class="stat-card" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); text-align: center;">
                                <div class="stat-value" id="stat-bytes" style="font-size: 32px; font-weight: 700; color: var(--text-primary); font-family: var(--mono-font);">0</div>
                                <div class="stat-label" style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Bytes</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const input = document.getElementById('insp-input');
            input.addEventListener('input', () => {
                const text = input.value;
                document.getElementById('stat-chars').textContent = text.length;
                document.getElementById('stat-words').textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
                document.getElementById('stat-lines').textContent = text ? text.split('\n').length : 0;
                document.getElementById('stat-bytes').textContent = new TextEncoder().encode(text).length;
            });
        }
    },
    cronParser: {
        id: 'cronParser',
        title: 'Cron Expression Parser',
        description: 'Parse and visualize cron expressions',
        category: 'Text Tools',
        icon: 'event_repeat', // Cron
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Cron Expression</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('cron-input').value = text).then(() => document.getElementById('cron-input').dispatchEvent(new Event('input')))">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <input type="text" class="form-control" id="cron-input" placeholder="*/5 * * * *" value="*/5 * * * *" style="font-family: var(--mono-font); margin-bottom: 12px;">
                        <div id="cron-desc" style="padding: 12px; background: var(--bg-input); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 13px;"></div>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Next 5 Scheduled Runs</h3>
                            <button class="btn-icon" id="cron-copy" style="padding: 2px 8px; font-size: 11px;" aria-label="Copy all scheduled dates">
                                <i class="material-icons" style="font-size: 14px;">content_copy</i> Copy All
                            </button>
                        </div>
                        <ul class="cron-next-runs" id="cron-next" style="list-style: none; padding: 0; margin: 0;"></ul>
                    </div>
                </div>
            `;
            
            const update = () => {
                const cronInput = document.getElementById('cron-input');
                const cronDesc = document.getElementById('cron-desc');
                const cronNext = document.getElementById('cron-next');

                const val = cronInput.value.trim();
                if (!val) {
                    cronDesc.textContent = 'Enter a cron expression';
                    cronDesc.style.color = 'var(--text-secondary)';
                    cronNext.innerHTML = '';
                    return;
                }

                try {
                    // Use the exposed electronAPI to get description
                    const result = window.electronAPI.cron.parse(val);
                    cronDesc.textContent = result.description;
                    cronDesc.style.color = 'var(--text-primary)';
                    
                    cronNext.innerHTML = '';
                    
                    // Use the exposed cronParser helper to get next occurrences
                    const nextDates = window.cronParser.getNextOccurrences(val, 5);
                    nextDates.forEach(dateStr => {
                        const li = document.createElement('li');
                        li.style.padding = '8px 12px';
                        li.style.background = 'var(--bg-input)';
                        li.style.borderRadius = 'var(--radius-sm)';
                        li.style.marginBottom = '6px';
                        li.style.fontFamily = 'var(--mono-font)';
                        li.style.fontSize = '12px';
                        li.style.cursor = 'pointer';
                        li.title = 'Click to copy';
                        li.textContent = dateStr;
                        li.onclick = () => {
                            navigator.clipboard.writeText(li.textContent);
                            li.style.background = 'var(--success-color)';
                            setTimeout(() => li.style.background = 'var(--bg-input)', 300);
                        };
                        cronNext.appendChild(li);
                    });
                } catch (e) {
                    cronDesc.textContent = `Invalid: ${e.message}`;
                    cronDesc.style.color = 'var(--error-color)';
                    cronNext.innerHTML = '';
                }
            };
            
            document.getElementById('cron-input').addEventListener('input', update);
            // Paste is handled by inline onclick in HTML to avoid ID dependency issues
            document.getElementById('cron-copy').onclick = () => {
                const times = Array.from(document.getElementById('cron-next').children).map(li => li.textContent).join('\n');
                if (times) navigator.clipboard.writeText(times);
            };
            
            // Initialize with default
            update();
        }
    },
    textDiff: {
        id: 'textDiff',
        title: 'Text Diff Checker',
        description: 'Compare two texts visually',
        category: 'Text Tools',
        icon: 'compare', // Text diff
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <!-- Options Bar -->
                    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; padding: 12px; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="diff-case-sensitive" style="cursor: pointer; width: 16px; height: 16px;">
                            <span style="color: var(--text-primary); font-weight: 500;">Case Sensitive</span>
                        </label>
                        <div style="width: 1px; height: 20px; background: var(--border-color);"></div>
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Compare Mode:</span>
                            <select id="diff-mode" class="toolbar-select" style="padding: 6px 12px; font-size: 13px; cursor: pointer;">
                                <option value="line">Line by Line</option>
                                <option value="word">Word by Word</option>
                                <option value="char">Character</option>
                            </select>
                        </label>
                        <div style="flex: 1;"></div>
                        <button class="btn-icon" id="diff-swap" style="padding: 6px 12px;" title="Swap texts">
                            <i class="material-icons">swap_horiz</i> Swap
                        </button>
                        <button class="btn-icon" id="diff-clear" style="padding: 6px 12px;">
                            <i class="material-icons">clear</i> Clear
                        </button>
                    </div>
                    
                    <!-- Input Panels -->
                    <div class="grid-2" style="gap: 16px; margin-bottom: 16px;">
                        <div class="tool-card" style="position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Original Text</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('diff-original').value = text).then(() => document.getElementById('diff-original').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="diff-original" rows="12" placeholder="Enter or paste original text..." style="font-family: var(--mono-font); resize: vertical;"></textarea>
                        </div>
                        <div class="tool-card" style="position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px; color: var(--text-primary);">Compared Text</h3>
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('diff-compared').value = text).then(() => document.getElementById('diff-compared').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                            </div>
                            <textarea class="form-control" id="diff-compared" rows="12" placeholder="Enter or paste compared text..." style="font-family: var(--mono-font); resize: vertical;"></textarea>
                        </div>
                    </div>
                    
                    <!-- Result Panel -->
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <h3 style="margin: 0; font-size: 14px;">Differences</h3>
                                <div id="diff-stats" style="font-size: 12px; color: var(--text-secondary);"></div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center; font-size: 11px;">
                                <span style="color: var(--success-color); display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 12px; height: 12px; background: rgba(0, 255, 0, 0.2); border-radius: 2px; display: inline-block;"></span>
                                    Added
                                </span>
                                <span style="color: var(--error-color); display: flex; align-items: center; gap: 4px;">
                                    <span style="width: 12px; height: 12px; background: rgba(255, 0, 0, 0.2); border-radius: 2px; display: inline-block;"></span>
                                    Removed
                                </span>
                            </div>
                        </div>
                        <div id="diff-result" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); min-height: 250px; max-height: 500px; overflow-y: auto; font-family: var(--mono-font); font-size: 13px; line-height: 1.8;"></div>
                    </div>
                </div>
            `;
            
            const originalInput = document.getElementById('diff-original');
            const comparedInput = document.getElementById('diff-compared');
            const resultDiv = document.getElementById('diff-result');
            const statsDiv = document.getElementById('diff-stats');
            const caseSensitive = document.getElementById('diff-case-sensitive');
            const diffMode = document.getElementById('diff-mode');
            
            const computeDiff = () => {
                let original = originalInput.value;
                let compared = comparedInput.value;
                
                if (!original && !compared) {
                    resultDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px 0;"><i class="material-icons" style="font-size: 48px; opacity: 0.3; display: block; margin-bottom: 12px;">difference</i>Enter text in both panels to compare...</div>';
                    statsDiv.textContent = '';
                    return;
                }
                
                // Case sensitivity
                const isCaseSensitive = caseSensitive.checked;
                const displayOriginal = original;
                const displayCompared = compared;
                
                if (!isCaseSensitive) {
                    original = original.toLowerCase();
                    compared = compared.toLowerCase();
                }
                
                const mode = diffMode.value;
                let result = '';
                let addedCount = 0;
                let removedCount = 0;
                let unchangedCount = 0;
                
                if (!window.Diff) {
                    resultDiv.innerHTML = '<div style="color: var(--error-color); padding: 20px; text-align: center;">Diff library not available</div>';
                    return;
                }
                
                try {
                    if (mode === 'line') {
                        const diff = window.Diff.diffLines(original, compared);
                        result = diff.map(part => {
                            const lines = part.value.split('\n').filter(l => l.length > 0 || part.value.endsWith('\n'));
                            if (part.added) addedCount += lines.length;
                            else if (part.removed) removedCount += lines.length;
                            else unchangedCount += lines.length;
                            
                            const color = part.added ? 'var(--success-color)' : 
                                         part.removed ? 'var(--error-color)' : 
                                         'var(--text-primary)';
                            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
                            const bg = part.added ? 'rgba(0, 255, 0, 0.08)' : 
                                      part.removed ? 'rgba(255, 0, 0, 0.08)' : 
                                      'transparent';
                            const border = part.added ? '2px solid rgba(0, 255, 0, 0.3)' : 
                                          part.removed ? '2px solid rgba(255, 0, 0, 0.3)' : 
                                          'none';
                            
                            return lines.map(line => 
                                `<div style="color: ${color}; background: ${bg}; padding: 4px 8px; margin: 2px 0; border-left: ${border}; border-radius: 2px;">${prefix}${line || ' '}</div>`
                            ).join('');
                        }).join('');
                    } else if (mode === 'word') {
                        const diff = window.Diff.diffWords(original, compared);
                        result = diff.map(part => {
                            const words = part.value.split(/(\s+)/).filter(w => w);
                            if (part.added) addedCount += words.filter(w => !/^\s+$/.test(w)).length;
                            else if (part.removed) removedCount += words.filter(w => !/^\s+$/.test(w)).length;
                            
                            const color = part.added ? 'var(--success-color)' : 
                                         part.removed ? 'var(--error-color)' : 
                                         'var(--text-primary)';
                            const bg = part.added ? 'rgba(0, 255, 0, 0.15)' : 
                                      part.removed ? 'rgba(255, 0, 0, 0.15)' : 
                                      'transparent';
                            const weight = part.added || part.removed ? '600' : '400';
                            return `<span style="color: ${color}; background: ${bg}; font-weight: ${weight}; padding: 2px 4px; border-radius: 3px; margin: 0 1px;">${part.value}</span>`;
                        }).join('');
                    } else {
                        const diff = window.Diff.diffChars(original, compared);
                        result = diff.map(part => {
                            if (part.added) addedCount++;
                            else if (part.removed) removedCount++;
                            
                            const color = part.added ? 'var(--success-color)' : 
                                         part.removed ? 'var(--error-color)' : 
                                         'var(--text-primary)';
                            const bg = part.added ? 'rgba(0, 255, 0, 0.2)' : 
                                      part.removed ? 'rgba(255, 0, 0, 0.2)' : 
                                      'transparent';
                            const weight = part.added || part.removed ? '700' : '400';
                            return `<span style="color: ${color}; background: ${bg}; font-weight: ${weight};">${part.value.replace(/\n/g, '↵\n')}</span>`;
                        }).join('');
                    }
                    
                    resultDiv.innerHTML = result || '<div style="text-align: center; color: var(--text-secondary); padding: 40px 0;"><i class="material-icons" style="font-size: 48px; opacity: 0.3; display: block; margin-bottom: 12px;">check_circle</i>No differences found - texts are identical!</div>';
                    
                    // Update stats
                    if (addedCount || removedCount) {
                        const total = addedCount + removedCount + unchangedCount;
                        statsDiv.innerHTML = `<span style="color: var(--success-color);">+${addedCount}</span> / <span style="color: var(--error-color);">-${removedCount}</span>`;
                    } else {
                        statsDiv.textContent = '';
                    }
                } catch (e) {
                    logger.error('Diff error:', e);
                    resultDiv.innerHTML = `<div style="color: var(--error-color); padding: 20px; text-align: center;">Error: ${e.message}</div>`;
                }
            };
            
            originalInput.addEventListener('input', computeDiff);
            comparedInput.addEventListener('input', computeDiff);
            caseSensitive.addEventListener('change', computeDiff);
            diffMode.addEventListener('change', computeDiff);
            
            document.getElementById('diff-clear').onclick = () => {
                originalInput.value = '';
                comparedInput.value = '';
                computeDiff();
            };
            
            document.getElementById('diff-swap').onclick = () => {
                const temp = originalInput.value;
                originalInput.value = comparedInput.value;
                comparedInput.value = temp;
                computeDiff();
            };
            
            // Initial state
            computeDiff();
        }
    },
    loremIpsum: {
        id: 'loremIpsum',
        title: 'Lorem Ipsum Generator',
        description: 'Generate placeholder text',
        category: 'Generators',
        icon: 'notes', // Lorem Ipsum
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <h3 style="margin-bottom: 12px; font-size: 14px;">Options</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                            <div>
                                <label style="font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; font-size: 12px;">Count</label>
                                <input type="number" class="form-control" id="lorem-count" value="3" min="1" max="50">
                            </div>
                            <div>
                                <label style="font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; font-size: 12px;">Type</label>
                                <select class="form-control" id="lorem-type" style="cursor: pointer;">
                                    <option value="paragraphs">Paragraphs</option>
                                    <option value="sentences">Sentences</option>
                                    <option value="words">Words</option>
                                </select>
                            </div>
                        </div>
                        <button class="btn-icon" id="lorem-generate" style="width: 100%; background: var(--accent-color); color: white; padding: 10px;"><i class="material-icons">refresh</i> Generate</button>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Generated Text</h3>
                            <button class="btn-icon" id="lorem-copy" style="padding: 4px 10px;"><i class="material-icons">content_copy</i> Copy</button>
                        </div>
                        <div id="lorem-result" style="background: var(--bg-input); padding: 20px; border-radius: var(--radius-sm); min-height: 200px; max-height: 500px; overflow-y: auto; line-height: 1.8; white-space: pre-wrap;"></div>
                    </div>
                </div>
            `;
            
            const generate = () => {
                const count = parseInt(document.getElementById('lorem-count').value);
                const type = document.getElementById('lorem-type').value;
                let text = "";
                
                const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");
                
                if (type === 'words') {
                    for(let i=0; i<count; i++) text += words[i % words.length] + " ";
                } else if (type === 'sentences') {
                    for(let i=0; i<count; i++) {
                        const sentenceWords = [];
                        const len = 8 + Math.floor(Math.random() * 8);
                        for (let j=0; j<len; j++) {
                            sentenceWords.push(words[Math.floor(Math.random() * words.length)]);
                        }
                        sentenceWords[0] = sentenceWords[0].charAt(0).toUpperCase() + sentenceWords[0].slice(1);
                        text += sentenceWords.join(' ') + '. ';
                    }
                } else {
                    for(let i=0; i<count; i++) {
                        text += "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\n";
                    }
                }
                
                document.getElementById('lorem-result').textContent = text.trim();
            };
            
            document.getElementById('lorem-generate').onclick = generate;
            document.getElementById('lorem-copy').onclick = () => {
                const text = document.getElementById('lorem-result').textContent;
                if (text) navigator.clipboard.writeText(text);
            };
            generate();
        }
    },

    // NEW TOOLS - High Priority Batch
    regexTester: {
        id: 'regexTester',
        title: 'RegExp Tester',
        description: 'Test regular expressions with live matching',
        category: 'Text Tools',
        icon: 'pattern',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Regular Expression</h3>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <label style="font-size: 12px; color: var(--text-secondary);"><input type="checkbox" id="regex-global" checked> g</label>
                                <label style="font-size: 12px; color: var(--text-secondary);"><input type="checkbox" id="regex-case"> i</label>
                                <label style="font-size: 12px; color: var(--text-secondary);"><input type="checkbox" id="regex-multiline"> m</label>
                            </div>
                        </div>
                        <input type="text" class="form-control" id="regex-pattern" placeholder="^[a-z0-9]+$" style="font-family: var(--mono-font); font-size: 14px;" value="\\w+">
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Test String</h3>
                            <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('regex-test').value = text).then(() => document.getElementById('regex-test').dispatchEvent(new Event('input')))" aria-label="Paste test string">
                                <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                            </button>
                        </div>
                        <textarea class="form-control" id="regex-test" rows="6" placeholder="Enter text to test..." style="resize: vertical;">Hello world 123</textarea>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Visual Preview</h3>
                            <div style="font-size: 11px; color: var(--text-secondary);">Hover matches to see groups</div>
                        </div>
                        <div id="regex-preview" style="font-family: var(--mono-font); white-space: pre-wrap; background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); min-height: 60px; max-height: 200px; overflow-y: auto; line-height: 1.5;"></div>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Match Details</h3>
                            <div id="regex-count" style="font-size: 12px; color: var(--text-secondary);"></div>
                        </div>
                        <div id="regex-matches" style="background: var(--bg-input); padding: 16px; border-radius: var(--radius-sm); min-height: 100px; max-height: 300px; overflow-y: auto;"></div>
                    </div>
                </div>
            `;
            
            const update = () => {
                try {
                    const pattern = document.getElementById('regex-pattern').value;
                    const testStr = document.getElementById('regex-test').value;
                    const flags = (document.getElementById('regex-global').checked ? 'g' : '') +
                                (document.getElementById('regex-case').checked ? 'i' : '') +
                                (document.getElementById('regex-multiline').checked ? 'm' : '');
                    
                    if (!pattern) {
                        document.getElementById('regex-matches').innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;"><i class="material-icons" style="font-size: 48px; opacity: 0.3; display: block; margin-bottom: 12px;">pattern</i>Enter a regex pattern...</div>';
                        document.getElementById('regex-count').textContent = '';
                        document.getElementById('regex-preview').textContent = testStr;
                        return;
                    }
                    
                    if (!testStr) {
                        document.getElementById('regex-matches').innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">Enter test string...</div>';
                        document.getElementById('regex-count').textContent = '';
                        document.getElementById('regex-preview').textContent = '';
                        return;
                    }
                    
                    const regex = new RegExp(pattern, flags);
                    const matches = [...testStr.matchAll(regex)];
                    
                    // Update Visual Preview with Highlights
                    let lastIndex = 0;
                    let previewHtml = '';
                    const fullText = testStr;
                    
                    // Sort matches by index to ensure correct reconstruction
                    matches.sort((a, b) => a.index - b.index);
                    
                    matches.forEach((match, i) => {
                        // Add non-matched text before this match
                        previewHtml += fullText.substring(lastIndex, match.index)
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");
                            
                        // Add matched text with highlight
                        const matchText = match[0]
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;");
                            
                        const groupsTooltip = match.length > 1 
                            ? match.slice(1).map((g, gi) => `Group ${gi+1}: ${g}`).join('\n')
                            : 'Full Match';
                            
                        previewHtml += `<span class="regex-match" data-tooltip="${groupsTooltip.replace(/"/g, '&quot;')}" style="background: rgba(0, 122, 255, 0.2); border-bottom: 2px solid var(--accent-color); cursor: help; position: relative;">${matchText}</span>`;
                        
                        lastIndex = match.index + match[0].length;
                    });
                    
                    // Add remaining text
                    previewHtml += fullText.substring(lastIndex)
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;");
                        
                    const previewEl = document.getElementById('regex-preview');
                    previewEl.innerHTML = previewHtml;
                    
                    // Add tooltip listeners
                    previewEl.querySelectorAll('.regex-match').forEach(el => {
                        el.addEventListener('mouseenter', (e) => {
                            const tooltip = document.createElement('div');
                            tooltip.className = 'custom-tooltip';
                            tooltip.textContent = e.target.getAttribute('data-tooltip');
                            tooltip.style.position = 'absolute';
                            tooltip.style.background = 'var(--bg-panel)';
                            tooltip.style.color = 'var(--text-primary)';
                            tooltip.style.padding = '8px';
                            tooltip.style.borderRadius = '4px';
                            tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                            tooltip.style.zIndex = '1000';
                            tooltip.style.fontSize = '12px';
                            tooltip.style.whiteSpace = 'pre';
                            tooltip.style.pointerEvents = 'none';
                            tooltip.style.border = '1px solid var(--border-color)';
                            
                            document.body.appendChild(tooltip);
                            
                            const rect = e.target.getBoundingClientRect();
                            tooltip.style.left = rect.left + 'px';
                            tooltip.style.top = (rect.bottom + 5) + 'px';
                            
                            e.target._tooltip = tooltip;
                        });
                        
                        el.addEventListener('mouseleave', (e) => {
                            if (e.target._tooltip) {
                                e.target._tooltip.remove();
                                e.target._tooltip = null;
                            }
                        });
                    });
                    
                    if (matches.length === 0) {
                        document.getElementById('regex-matches').innerHTML = '<div style="text-align: center; color: var(--error-color); padding: 20px;"><i class="material-icons" style="font-size: 36px; opacity: 0.5; display: block; margin-bottom: 8px;">error_outline</i>No matches found</div>';
                        document.getElementById('regex-count').textContent = '0 matches';
                    } else {
                        document.getElementById('regex-count').textContent = matches.length + ' match' + (matches.length > 1 ? 'es' : '');
                        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
                        matches.forEach((match, i) => {
                            html += `
                                <div style="background: var(--bg-panel); padding: 12px; border-radius: 4px; border-left: 3px solid var(--accent-color);">
                                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Match ${i + 1}</div>
                                    <div style="font-family: var(--mono-font); color: var(--success-color); margin-bottom: 8px;">${match[0]}</div>
                                    ${match.length > 1 ? '<div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Groups:</div>' : ''}
                                    ${match.slice(1).map((g, gi) => `<div style="font-size: 12px; font-family: var(--mono-font); margin-left: 12px;">Group ${gi + 1}: ${g || '<em>empty</em>'}</div>`).join('')}
                                </div>
                            `;
                        });
                        html += '</div>';
                        document.getElementById('regex-matches').innerHTML = html;
                    }
                } catch (e) {
                    document.getElementById('regex-matches').innerHTML = `<div style="color: var(--error-color); padding: 12px;"><i class="material-icons" style="vertical-align: middle;">error</i> Invalid regex: ${e.message}</div>`;
                    document.getElementById('regex-count').textContent = 'Error';
                    document.getElementById('regex-preview').textContent = document.getElementById('regex-test').value;
                }
            };
            
            document.getElementById('regex-pattern').addEventListener('input', update);
            document.getElementById('regex-test').addEventListener('input', update);
            document.getElementById('regex-global').addEventListener('change', update);
            document.getElementById('regex-case').addEventListener('change', update);
            document.getElementById('regex-multiline').addEventListener('change', update);
            update();
        }
    },

    yamlFormatter: {
        id: 'yamlFormatter',
        title: 'YAML Formatter',
        description: 'Format and validate YAML, convert to JSON',
        category: 'Formatters',
        icon: 'description',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">YAML Input</h3>
                            <div style="display: flex; gap: 4px;">
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('yaml-input').value = text).then(() => document.getElementById('yaml-input').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                                <button class="btn-icon" id="yaml-sample" style="padding: 2px 8px; font-size: 11px;">
                                    <i class="material-icons" style="font-size: 14px;">data_object</i> Sample
                                </button>
                                <button class="btn-icon" id="yaml-clear" style="padding: 2px 8px; font-size: 11px;">
                                    <i class="material-icons" style="font-size: 14px;">clear</i> Clear
                                </button>
                            </div>
                        </div>
                        <textarea class="form-control" id="yaml-input" rows="12" placeholder="name: John
age: 30
hobbies:
  - coding
  - music" style="font-family: var(--mono-font); resize: vertical;"></textarea>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">JSON Output</h3>
                            <button class="btn-icon" id="yaml-copy" style="padding: 4px 10px;">
                                <i class="material-icons">content_copy</i> Copy
                            </button>
                        </div>
                        <textarea class="form-control" id="yaml-output" rows="12" readonly style="font-family: var(--mono-font); background: var(--bg-input); resize: vertical;"></textarea>
                    </div>
                </div>
            `;
            
            const update = () => {
                try {
                    const input = document.getElementById('yaml-input').value;
                    const output = document.getElementById('yaml-output');
                    
                    if (!input.trim()) {
                        output.value = '';
                        output.style.color = 'var(--text-primary)';
                        return;
                    }
                    
                    const parsed = window.electronAPI.yaml.parse(input);
                    output.value = JSON.stringify(parsed, null, 2);
                    output.style.color = 'var(--text-primary)';
                } catch (e) {
                    document.getElementById('yaml-output').value = `Error: ${e.message}

Please check your YAML syntax.
Common issues:
 - Incorrect indentation
 - Missing colons or spaces
 - Invalid quotes`;
                    document.getElementById('yaml-output').style.color = 'var(--error-color)';
                }
            };
            
            document.getElementById('yaml-input').addEventListener('input', update);
            document.getElementById('yaml-sample').onclick = () => {
                document.getElementById('yaml-input').value = `name: John Doe
age: 30
email: john@example.com
address:
  street: 123 Main St
  city: San Francisco
  state: CA
skills:
  - JavaScript
  - Python
  - Go
active: true`;
                update();
            };
            document.getElementById('yaml-clear').onclick = () => {
                document.getElementById('yaml-input').value = '';
                update();
            };
            document.getElementById('yaml-copy').onclick = () => {
                navigator.clipboard.writeText(document.getElementById('yaml-output').value);
            };
        }
    },

    numberBaseConverter: {
        id: 'numberBaseConverter',
        title: 'Number Base Converter',
        description: 'Convert between Binary, Octal, Decimal, Hexadecimal',
        category: 'Converters',
        icon: 'calculate',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Number Bases</h3>
                            <div style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px;">
                                <i class="material-icons" style="font-size: 14px;">info</i>
                                Type in any field to convert
                            </div>
                        </div>
                        <div class="result-grid">
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Binary (Base 2)</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('num-binary').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="num-binary" placeholder="1010" style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Octal (Base 8)</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('num-octal').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="num-octal" placeholder="12" style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Decimal (Base 10)</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('num-decimal').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="num-decimal" placeholder="10" style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                            <div class="result-item">
                                <label style="font-weight: 600; color: var(--text-primary); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <span>Hexadecimal (Base 16)</span>
                                    <button class="btn-icon" style="padding: 2px 6px; font-size: 11px;" onclick="navigator.clipboard.writeText(document.getElementById('num-hex').value)">
                                        <i class="material-icons" style="font-size: 14px;">content_copy</i>
                                    </button>
                                </label>
                                <input type="text" class="form-control" id="num-hex" placeholder="A" style="font-family: var(--mono-font); font-size: 12px;">
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            let updating = false;
            const update = (sourceBase, sourceId) => {
                if (updating) return;
                updating = true;
                
                try {
                    const value = document.getElementById(sourceId).value.trim();
                    if (!value) {
                        document.getElementById('num-binary').value = '';
                        document.getElementById('num-octal').value = '';
                        document.getElementById('num-decimal').value = '';
                        document.getElementById('num-hex').value = '';
                        updating = false;
                        return;
                    }
                    
                    const decimal = parseInt(value, sourceBase);
                    if (isNaN(decimal)) throw new Error('Invalid number');
                    
                    if (sourceId !== 'num-binary') document.getElementById('num-binary').value = decimal.toString(2);
                    if (sourceId !== 'num-octal') document.getElementById('num-octal').value = decimal.toString(8);
                    if (sourceId !== 'num-decimal') document.getElementById('num-decimal').value = decimal.toString(10);
                    if (sourceId !== 'num-hex') document.getElementById('num-hex').value = decimal.toString(16).toUpperCase();
                } catch (e) {
                    // Invalid input, ignore
                }
                
                updating = false;
            };
            
            document.getElementById('num-binary').addEventListener('input', () => update(2, 'num-binary'));
            document.getElementById('num-octal').addEventListener('input', () => update(8, 'num-octal'));
            document.getElementById('num-decimal').addEventListener('input', () => update(10, 'num-decimal'));
            document.getElementById('num-hex').addEventListener('input', () => update(16, 'num-hex'));
        }
    },

    // Batch 2 Tools
    backslashEscape: {
        id: 'backslashEscape',
        title: 'Backslash Escape/Unescape',
        description: 'Escape and unescape special characters',
        category: 'Encoders',
        icon: 'code',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Input</h3>
                            <div style="display: flex; gap: 4px;">
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('escape-input').value = text).then(() => document.getElementById('escape-input').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                                <button class="btn-icon" id="escape-mode" style="padding: 2px 8px; font-size: 11px; background: var(--accent-color); color: white;">
                                    Escape
                                </button>
                            </div>
                        </div>
                        <textarea class="form-control" id="escape-input" rows="8" placeholder="Hello\nWorld" style="font-family: var(--mono-font); resize: vertical;"></textarea>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Output</h3>
                            <button class="btn-icon" style="padding: 4px 10px;" onclick="navigator.clipboard.writeText(document.getElementById('escape-output').value)">
                                <i class="material-icons">content_copy</i> Copy
                            </button>
                        </div>
                        <textarea class="form-control" id="escape-output" rows="8" readonly style="font-family: var(--mono-font); background: var(--bg-input); resize: vertical;"></textarea>
                    </div>
                </div>
            `;
            
            let mode = 'escape'; // 'escape' or 'unescape'
            
            const escapeString = (str) => {
                return str
                    .replace(/\\/g, '\\\\')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t')
                    .replace(/"/g, '\\"')
                    .replace(/'/g, "\\'");
            };
            
            const unescapeString = (str) => {
                return str
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\');
            };
            
            const update = () => {
                const input = document.getElementById('escape-input').value;
                const output = document.getElementById('escape-output');
                
                if (mode === 'escape') {
                    output.value = escapeString(input);
                } else {
                    output.value = unescapeString(input);
                }
            };
            
            document.getElementById('escape-input').addEventListener('input', update);
            document.getElementById('escape-mode').onclick = function() {
                mode = mode === 'escape' ? 'unescape' : 'escape';
                this.textContent = mode === 'escape' ? 'Escape' : 'Unescape';
                update();
            };
        }
    },

    randomStringGenerator: {
        id: 'randomStringGenerator',
        title: 'Random String Generator',
        description: 'Generate random strings and passwords',
        category: 'Generators',
        icon: 'shuffle',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <h3 style="margin-bottom: 12px; font-size: 14px;">Options</h3>
                        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                            <div>
                                <label style="font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; font-size: 12px;">Length: <span id="rand-length-val">16</span></label>
                                <input type="range" id="rand-length" min="4" max="128" value="16" class="form-control" style="width: 100%;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <label style="font-size: 12px; color: var(--text-secondary); cursor: pointer;"><input type="checkbox" id="rand-upper" checked> Uppercase (A-Z)</label>
                                <label style="font-size: 12px; color: var(--text-secondary); cursor: pointer;"><input type="checkbox" id="rand-lower" checked> Lowercase (a-z)</label>
                                <label style="font-size: 12px; color: var(--text-secondary); cursor: pointer;"><input type="checkbox" id="rand-numbers" checked> Numbers (0-9)</label>
                                <label style="font-size: 12px; color: var(--text-secondary); cursor: pointer;"><input type="checkbox" id="rand-symbols"> Symbols (!@#$...)</label>
                            </div>
                        </div>
                        <button class="btn-icon" id="rand-generate" style="width: 100%; background: var(--accent-color); color: white; padding: 10px;">
                            <i class="material-icons">refresh</i> Generate
                        </button>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Generated Strings</h3>
                            <div style="font-size: 11px; color: var(--text-secondary);">Click to copy</div>
                        </div>
                        <div id="rand-results" style="display: flex; flex-direction: column; gap: 8px;"></div>
                    </div>
                </div>
            `;
            
            const generate = () => {
                const length = parseInt(document.getElementById('rand-length').value);
                const useUpper = document.getElementById('rand-upper').checked;
                const useLower = document.getElementById('rand-lower').checked;
                const useNumbers = document.getElementById('rand-numbers').checked;
                const useSymbols = document.getElementById('rand-symbols').checked;
                
                let chars = '';
                if (useUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                if (useLower) chars += 'abcdefghijklmnopqrstuvwxyz';
                if (useNumbers) chars += '0123456789';
                if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
                
                if (!chars) {
                    document.getElementById('rand-results').innerHTML = '<div style="text-align: center; color: var(--error-color); padding: 20px;">Select at least one character set</div>';
                    return;
                }
                
                const results = [];
                for (let i = 0; i < 5; i++) {
                    let result = '';
                    for (let j = 0; j < length; j++) {
                        result += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    results.push(result);
                }
                
                const html = results.map(r => `
                    <div style="background: var(--bg-input); padding: 12px; border-radius: 4px; font-family: var(--mono-font); font-size: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;" 
                         onclick="navigator.clipboard.writeText('${r}'); this.style.borderColor='var(--success-color)';\setTimeout(() => this.style.borderColor='transparent', 500)">
                        ${r}
                    </div>
                `).join('');
                
                document.getElementById('rand-results').innerHTML = html;
            };
            
            document.getElementById('rand-length').addEventListener('input', (e) => {
                document.getElementById('rand-length-val').textContent = e.target.value;
            });
            document.getElementById('rand-generate').onclick = generate;
            generate();
        }
    },

    imageToBase64: {
        id: 'imageToBase64',
        title: 'Image to Base64',
        description: 'Convert images to Base64 data URLs',
        category: 'Converters',
        icon: 'image',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <h3 style="margin-bottom: 12px; font-size: 14px;">Upload Image</h3>
                        <div id="image-drop-zone" style="border: 2px dashed var(--border-color); border-radius: var(--radius-sm); padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s;">
                            <i class="material-icons" style="font-size: 48px; color: var(--text-secondary); opacity: 0.5; display: block; margin-bottom: 12px;">add_photo_alternate</i>
                            <div style="color: var(--text-secondary); margin-bottom: 8px;">Click to select or drag & drop image</div>
                            <div style="font-size: 11px; color: var(--text-tertiary);">Supports JPG, PNG, GIF, SVG</div>
                        </div>
                        <input type="file" id="image-input" accept="image/*" style="display: none;">
                    </div>
                    <div class="tool-card" id="image-result-card" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h3 style="margin: 0; font-size: 14px;">Preview & Base64</h3>
                            <button class="btn-icon" id="image-copy" style="padding: 4px 10px;">
                                <i class="material-icons">content_copy</i> Copy Base64
                            </button>
                        </div>
                        <div style="text-align: center; margin-bottom: 12px;">
                            <img id="image-preview" style="max-width: 100%; max-height: 200px; border-radius: 4px; border: 1px solid var(--border-color);">
                        </div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;" id="image-info"></div>
                        <textarea id="image-base64" readonly style="font-family: var(--mono-font); font-size: 11px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px; width: 100%; height: 150px; resize: vertical;"></textarea>
                    </div>
                </div>
            `;
            
            const dropZone = document.getElementById('image-drop-zone');
            const fileInput = document.getElementById('image-input');
            const resultCard = document.getElementById('image-result-card');
            
            const handleFile = (file) => {
                if (!file.type.startsWith('image/')) {
                    alert('Please select an image file');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    document.getElementById('image-preview').src = base64;
                    document.getElementById('image-base64').value = base64;
                    document.getElementById('image-info').textContent = `File: ${file.name} | Size: ${(file.size / 1024).toFixed(2)} KB | Type: ${file.type}`;
                    resultCard.style.display = 'block';
                };
                reader.readAsDataURL(file);
            };
            
            dropZone.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                if (e.target.files[0]) handleFile(e.target.files[0]);
            };
            
            dropZone.ondragover = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--accent-color)';
                dropZone.style.background = 'var(--bg-hover)';
            };
            
            dropZone.ondragleave = () => {
                dropZone.style.borderColor = 'var(--border-color)';
                dropZone.style.background = 'transparent';
            };
            
            dropZone.ondrop = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--border-color)';
                dropZone.style.background = 'transparent';
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            };
            
            document.getElementById('image-copy').onclick = () => {
                navigator.clipboard.writeText(document.getElementById('image-base64').value);
            };
        }
    },

    // Batch 3 - Final Tools
    svgOptimizer: {
        id: 'svgOptimizer',
        title: 'SVG Optimizer',
        description: 'Minify and optimize SVG code',
        category: 'Formatters',
        icon: 'polyline',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">SVG Input</h3>
                            <div style="display: flex; gap: 4px;">
                                <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('svg-input').value = text).then(() => document.getElementById('svg-input').dispatchEvent(new Event('input')))">
                                    <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                </button>
                                <button class="btn-icon" id="svg-clear" style="padding: 2px 8px; font-size: 11px;">
                                    <i class="material-icons" style="font-size: 14px;">clear</i> Clear
                                </button>
                            </div>
                        </div>
                        <textarea class="form-control" id="svg-input" rows="12" placeholder="<svg>...</svg>" style="font-family: var(--mono-font); resize: vertical;"></textarea>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;" id="svg-input-size"></div>
                    </div>
                    <div class="tool-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 14px;">Optimized Output</h3>
                            <button class="btn-icon" id="svg-copy" style="padding: 4px 10px;">
                                <i class="material-icons">content_copy</i> Copy
                            </button>
                        </div>
                        <textarea class="form-control" id="svg-output" rows="12" readonly style="font-family: var(--mono-font); background: var(--bg-input); resize: vertical;"></textarea>
                        <div id="svg-stats" style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;"></div>
                    </div>
                </div>
            `;
            
            const optimizeSVG = (svg) => {
                // Simple SVG optimization: remove comments, extra whitespace, unnecessary attributes
                return svg
                    .replace(/<!--[\\s\\S]*?-->/g, '') // Remove comments
                    .replace(/\\s+/g, ' ') // Collapse whitespace
                    .replace(/> </g, '><') // Remove spaces between tags
                    .replace(/\\s*=\\s*/g, '=') // Remove spaces around =
                    .trim();
            };
            
            const update = () => {
                const input = document.getElementById('svg-input').value;
                const output = document.getElementById('svg-output');
                
                if (!input.trim()) {
                    output.value = '';
                    document.getElementById('svg-input-size').textContent = '';
                    document.getElementById('svg-stats').textContent = '';
                    return;
                }
                
                const inputSize = new Blob([input]).size;
                document.getElementById('svg-input-size').textContent = `Size: ${(inputSize / 1024).toFixed(2)} KB`;
                
                const optimized = optimizeSVG(input);
                const outputSize = new Blob([optimized]).size;
                const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
                
                output.value = optimized;
                document.getElementById('svg-stats').textContent = `Size: ${(outputSize / 1024).toFixed(2)} KB | Reduced by ${reduction}%`;
                document.getElementById('svg-stats').style.color = reduction > 0 ? 'var(--success-color)' : 'var(--text-secondary)';
            };
            
            document.getElementById('svg-input').addEventListener('input', update);
            document.getElementById('svg-clear').onclick = () => {
                document.getElementById('svg-input').value = '';
                update();
            };
            document.getElementById('svg-copy').onclick = () => {
                navigator.clipboard.writeText(document.getElementById('svg-output').value);
            };
        }
    },

    barcodeGenerator: {
        id: 'barcodeGenerator',
        title: 'Barcode Generator',
        description: 'Generate barcodes in various formats',
        category: 'Generators',
        icon: 'qr_code',
        useCustomUI: true,
        render: (container: HTMLElement): void => {
            container.innerHTML = `
                <div class="custom-interface">
                    <div class="grid-2" style="gap: 16px; align-items: start;">
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <h3 style="margin: 0; font-size: 14px;">Input</h3>
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" id="barcode-reset" aria-label="Reset barcode generator">
                                        <i class="material-icons" style="font-size: 14px;">restart_alt</i> Reset
                                    </button>
                                    <button class="btn-icon" style="padding: 2px 8px; font-size: 11px;" onclick="navigator.clipboard.readText().then(text => document.getElementById('barcode-input').value = text)" aria-label="Paste content">
                                        <i class="material-icons" style="font-size: 14px;">content_paste</i> Paste
                                    </button>
                                </div>
                            </div>
                            <input type="text" class="form-control" id="barcode-input" placeholder="Enter text or number..." value="123456789012" style="margin-bottom: 12px;">
                            <label style="font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; font-size: 12px;">
                                Format
                                <i class="material-icons" style="font-size: 12px; color: var(--text-secondary); cursor: help;" title="EAN-13: 12/13 digits&#10;UPC: 11/12 digits&#10;CODE128: Alphanumeric&#10;CODE39: Alphanumeric (limited)">help_outline</i>
                            </label>
                            <select class="form-control" id="barcode-format" style="margin-bottom: 12px; cursor: pointer;">
                                <option value="CODE128">CODE128</option>
                                <option value="EAN13" selected>EAN-13</option>
                                <option value="UPC">UPC</option>
                                <option value="CODE39">CODE39</option>
                            </select>
                            <button class="btn-icon" id="barcode-generate" style="width: 100%; background: var(--accent-color); color: white; padding: 10px;">
                                <i class="material-icons">qr_code</i> Generate
                            </button>
                        </div>
                        <div class="tool-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <h3 style="margin: 0; font-size: 14px;">Preview</h3>
                                <button class="btn-icon" id="barcode-download" style="padding: 4px 10px;" disabled>
                                    <i class="material-icons">download</i> Download
                                </button>
                            </div>
                            <div id="barcode-preview" style="background: white; padding: 20px; border-radius: 4px; text-align: center; min-height: 150px; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                                <div style="color: #999;">Generate a barcode to preview</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const generate = () => {
                const input = document.getElementById('barcode-input').value;
                const format = document.getElementById('barcode-format').value;
                const preview = document.getElementById('barcode-preview');
                const downloadBtn = document.getElementById('barcode-download');
                
                if (!input) {
                    preview.innerHTML = '<div style="color: #999;">Enter text to generate barcode</div>';
                    downloadBtn.disabled = true;
                    return;
                }
                
                preview.innerHTML = '<svg id="barcode"></svg>';
                
                try {
                    if (window.electronAPI && window.electronAPI.barcode) {
                        window.electronAPI.barcode.generate(input, {
                            format: format,
                            width: 2,
                            height: 100,
                            displayValue: true
                        }).then(svgString => {
                            preview.innerHTML = svgString;
                            downloadBtn.disabled = false;
                            document.getElementById('barcode-download').style.display = 'inline-flex';
                        }).catch(err => {
                            throw err;
                        });
                    } else {
                        throw new Error("Barcode API not available");
                    }
                } catch (e) {
                    logger.error("Barcode error:", e);
                    preview.innerHTML = `
                        <div style="color: var(--error-color); text-align: center;">
                            <i class="material-icons" style="font-size: 32px; display: block; margin-bottom: 8px;">error_outline</i>
                            <div style="font-weight: 600; margin-bottom: 4px;">Failed to generate barcode</div>
                            <div style="font-size: 12px; opacity: 0.8;">${e.message.replace("JsBarcode Error: ", "")}</div>
                            <div style="font-size: 11px; margin-top: 8px; color: var(--text-secondary);">Check if the input is valid for ${format} format.</div>
                        </div>
                    `;
                    downloadBtn.disabled = true;
                }
            };
            
            document.getElementById('barcode-generate').onclick = generate;
            
            document.getElementById('barcode-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') generate();
            });

            document.getElementById('barcode-reset').onclick = () => {
                document.getElementById('barcode-input').value = '';
                document.getElementById('barcode-preview').innerHTML = '<div style="color: #999;">Generate a barcode to preview</div>';
                document.getElementById('barcode-download').disabled = true;
            };

            document.getElementById('barcode-download').onclick = () => {
                const svg = document.getElementById('barcode');
                if (svg) {
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const blob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `barcode-${document.getElementById('barcode-input').value}.svg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            };
            
            generate(); // Generate initial barcode
        }
    }
};

// Export tools to window
window.tools = tools;

export default tools;
