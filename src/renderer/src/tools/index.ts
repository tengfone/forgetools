import type { ToolsRegistry } from '../../../types/tools';

// Tool registry. Editor tools are defined inline; custom UIs are code-split
// and only fetched the first time the user opens them.
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
        load: () => import('./ui/markdownPreview'),
    },

    // Encoders / Decoders
    base64: {
        id: 'base64',
        title: 'Base64 Encoder/Decoder',
        description: 'Convert text to/from Base64',
        category: 'Encoders',
        icon: 'description', // Markdown to HTML
        useCustomUI: true,
        load: () => import('./ui/base64'),
    },
    url: {
        id: 'url',
        title: 'URL Encoder/Decoder',
        description: 'Encode or decode URL components',
        category: 'Encoders',
        icon: 'link', // URL encode/decode
        useCustomUI: true,
        load: () => import('./ui/url'),
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
        load: () => import('./ui/hexAscii'),
    },
    certificate: {
        id: 'certificate',
        title: 'Certificate Decoder',
        description: 'Decode X.509 Certificates',
        category: 'Encoders',
        icon: 'security', // Certificate
        useCustomUI: true,
        load: () => import('./ui/certificate'),
    },
    csvJson: {
        id: 'csvJson',
        title: 'CSV ↔ JSON',
        description: 'Convert between CSV and JSON',
        category: 'Converters',
        icon: 'grid_on', // CSV to JSON
        useCustomUI: true,
        load: () => import('./ui/csvJson'),
    },

    // Specialized UIs (From previous step)
    jwt: {
        id: 'jwt',
        title: 'JWT Decoder',
        description: 'Decode JSON Web Tokens',
        category: 'Encoders',
        icon: 'vpn_key', // JWT
        useCustomUI: true,
        load: () => import('./ui/jwt'),
    },
    timestamp: {
        id: 'timestamp',
        title: 'Timestamp Converter',
        description: 'Convert Unix timestamps and dates',
        category: 'Converters',
        icon: 'access_time', // Timestamp
        useCustomUI: true,
        load: () => import('./ui/timestamp'),
    },
    color: {
        id: 'color',
        title: 'Color Converter',
        description: 'Convert between all color formats with code presets',
        category: 'Converters',
        icon: 'colorize', // Color
        useCustomUI: true,
        load: () => import('./ui/color'),
    },
    uuid: {
        id: 'uuid',
        title: 'UUID/ULID Generator',
        description: 'Generate and decode UUIDs and ULIDs',
        category: 'Generators',
        icon: 'badge', // UUID/ULID
        useCustomUI: true,
        load: () => import('./ui/uuid'),
    },
    qrcode: {
        id: 'qrcode',
        title: 'QR Code Generator',
        description: 'Generate QR codes from text or URLs',
        category: 'Generators',
        icon: 'qr_code_2', // QR Code
        useCustomUI: true,
        load: () => import('./ui/qrcode'),
    },
    hash: {
        id: 'hash',
        title: 'Hash Generator',
        description: 'Generate MD5, SHA-1, SHA-256, and SHA-512 hashes',
        category: 'Encoders',
        icon: 'fingerprint', // Hash
        useCustomUI: true,
        load: () => import('./ui/hash'),
    },
    stringCase: {
        id: 'stringCase',
        title: 'String Case Converter',
        description: 'Convert between different string cases',
        category: 'Text Tools',
        icon: 'title', // String case
        useCustomUI: true,
        load: () => import('./ui/stringCase'),
    },
    stringInspector: {
        id: 'stringInspector',
        title: 'String Inspector',
        description: 'Analyze string properties and statistics',
        category: 'Text Tools',
        icon: 'insights', // String inspector
        useCustomUI: true,
        load: () => import('./ui/stringInspector'),
    },
    cronParser: {
        id: 'cronParser',
        title: 'Cron Expression Parser',
        description: 'Parse and visualize cron expressions',
        category: 'Text Tools',
        icon: 'event_repeat', // Cron
        useCustomUI: true,
        load: () => import('./ui/cronParser'),
    },
    textDiff: {
        id: 'textDiff',
        title: 'Text Diff Checker',
        description: 'Compare two texts visually',
        category: 'Text Tools',
        icon: 'compare', // Text diff
        useCustomUI: true,
        load: () => import('./ui/textDiff'),
    },
    loremIpsum: {
        id: 'loremIpsum',
        title: 'Lorem Ipsum Generator',
        description: 'Generate placeholder text',
        category: 'Generators',
        icon: 'notes', // Lorem Ipsum
        useCustomUI: true,
        load: () => import('./ui/loremIpsum'),
    },

    // NEW TOOLS - High Priority Batch
    regexTester: {
        id: 'regexTester',
        title: 'RegExp Tester',
        description: 'Test regular expressions with live matching',
        category: 'Text Tools',
        icon: 'pattern',
        useCustomUI: true,
        load: () => import('./ui/regexTester'),
    },

    yamlFormatter: {
        id: 'yamlFormatter',
        title: 'YAML Formatter',
        description: 'Format and validate YAML, convert to JSON',
        category: 'Formatters',
        icon: 'description',
        useCustomUI: true,
        load: () => import('./ui/yamlFormatter'),
    },

    numberBaseConverter: {
        id: 'numberBaseConverter',
        title: 'Number Base Converter',
        description: 'Convert between Binary, Octal, Decimal, Hexadecimal',
        category: 'Converters',
        icon: 'calculate',
        useCustomUI: true,
        load: () => import('./ui/numberBaseConverter'),
    },

    // Batch 2 Tools
    backslashEscape: {
        id: 'backslashEscape',
        title: 'Backslash Escape/Unescape',
        description: 'Escape and unescape special characters',
        category: 'Encoders',
        icon: 'code',
        useCustomUI: true,
        load: () => import('./ui/backslashEscape'),
    },

    randomStringGenerator: {
        id: 'randomStringGenerator',
        title: 'Random String Generator',
        description: 'Generate random strings and passwords',
        category: 'Generators',
        icon: 'shuffle',
        useCustomUI: true,
        load: () => import('./ui/randomStringGenerator'),
    },

    imageToBase64: {
        id: 'imageToBase64',
        title: 'Image to Base64',
        description: 'Convert images to Base64 data URLs',
        category: 'Converters',
        icon: 'image',
        useCustomUI: true,
        load: () => import('./ui/imageToBase64'),
    },

    // Batch 3 - Final Tools
    svgOptimizer: {
        id: 'svgOptimizer',
        title: 'SVG Optimizer',
        description: 'Minify and optimize SVG code',
        category: 'Formatters',
        icon: 'polyline',
        useCustomUI: true,
        load: () => import('./ui/svgOptimizer'),
    },

    barcodeGenerator: {
        id: 'barcodeGenerator',
        title: 'Barcode Generator',
        description: 'Generate barcodes in various formats',
        category: 'Generators',
        icon: 'qr_code',
        useCustomUI: true,
        load: () => import('./ui/barcodeGenerator'),
    }
};

window.tools = tools;

export default tools;
