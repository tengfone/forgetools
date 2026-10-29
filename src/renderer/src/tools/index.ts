import type { ToolCategory, ToolsRegistry } from '../../../types/tools';

/** Sidebar category order. The registry below is declared in this same order. */
export const CATEGORY_ORDER: ToolCategory[] = ['Inspect & Decode', 'Format', 'Convert', 'Text & Utilities', 'Generate', 'Compare'];

const DEFAULT_INDENT = 2;
const clampIndent = (indent?: number): number =>
    typeof indent === 'number' && Number.isFinite(indent) && indent > 0 ? Math.min(Math.floor(indent), 8) : DEFAULT_INDENT;

// ---------------------------------------------------------------------------
// SQL formatter: tokenizer-based. Uppercases keywords, breaks major clauses,
// indents AND/OR and comma lists, tracks parenthesis depth (subqueries get
// their own indentation), and leaves strings, quoted identifiers and comments
// untouched.
// ---------------------------------------------------------------------------
const SQL_KEYWORDS = new Set((
    'select from where and or not in is null like between exists as on join inner left right full outer cross ' +
    'group by order having limit offset union all distinct insert into values update set delete create table ' +
    'alter drop index view with case when then else end asc desc returning top fetch next rows only primary key ' +
    'foreign references default constraint unique check if replace truncate except intersect over partition ' +
    'count sum avg min max coalesce cast true false'
).split(' '));

// Multi-word clauses first so they win over their single-word prefixes.
const SQL_CLAUSES = [
    'GROUP BY', 'ORDER BY', 'PARTITION BY', 'INSERT INTO', 'DELETE FROM', 'UNION ALL',
    'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
    'INNER JOIN', 'CROSS JOIN', 'JOIN', 'SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET',
    'UNION', 'EXCEPT', 'INTERSECT', 'VALUES', 'UPDATE', 'SET', 'WITH', 'RETURNING',
];

type SqlToken = { type: 'word' | 'string' | 'comment' | 'punct' | 'op'; value: string };

function tokenizeSql(input: string): SqlToken[] {
    const tokens: SqlToken[] = [];
    let i = 0;
    while (i < input.length) {
        const c = input[i]!;
        if (/\s/.test(c)) { i++; continue; }
        if (c === '-' && input[i + 1] === '-') {
            const end = input.indexOf('\n', i);
            const stop = end === -1 ? input.length : end;
            tokens.push({ type: 'comment', value: input.slice(i, stop).trimEnd() });
            i = stop;
            continue;
        }
        if (c === '/' && input[i + 1] === '*') {
            const end = input.indexOf('*/', i + 2);
            const stop = end === -1 ? input.length : end + 2;
            tokens.push({ type: 'comment', value: input.slice(i, stop) });
            i = stop;
            continue;
        }
        if (c === "'" || c === '"' || c === '`' || c === '[') {
            const close = c === '[' ? ']' : c;
            let j = i + 1;
            while (j < input.length) {
                if (input[j] === close) {
                    if (close !== ']' && input[j + 1] === close) { j += 2; continue; } // doubled quote escape
                    break;
                }
                j++;
            }
            tokens.push({ type: 'string', value: input.slice(i, j + 1) });
            i = j + 1;
            continue;
        }
        if ('(),;'.includes(c)) { tokens.push({ type: 'punct', value: c }); i++; continue; }
        const word = /^[A-Za-z_@#$][\w$#@]*(\.[\w$*]+)*|^\d+(\.\d+)?/.exec(input.slice(i));
        if (word) { tokens.push({ type: 'word', value: word[0] }); i += word[0].length; continue; }
        const op = /^(<>|<=|>=|!=|\|\||::|[=<>+\-*/%.!])/.exec(input.slice(i));
        const v = op ? op[0] : c;
        tokens.push({ type: 'op', value: v });
        i += v.length;
    }
    return tokens;
}

function formatSql(input: string, indent?: number): string {
    if (!input.trim()) return '';
    const unit = ' '.repeat(clampIndent(indent));
    const tokens = tokenizeSql(input).map((t) =>
        t.type === 'word' && SQL_KEYWORDS.has(t.value.toLowerCase()) ? { ...t, value: t.value.toUpperCase() } : t);

    const lines: string[] = [];
    let line = '';
    let base = 0; // indentation level of current clause
    // Stack of paren contexts: true = subquery (block indentation), false = inline (function call / list)
    const parens: Array<{ block: boolean; base: number }> = [];
    const pad = (lvl: number) => unit.repeat(Math.max(0, lvl));
    const newline = (lvl: number) => {
        if (line.trim()) lines.push(line.trimEnd());
        line = pad(lvl);
    };
    const append = (s: string) => {
        const last = line.slice(-1);
        if (line.trim() && last !== '(' && last !== ' ' && s !== ',' && s !== ')' && s !== ';' && s !== '.') line += ' ';
        line += s;
    };
    const inlineDepth = () => parens.filter((p) => !p.block).length;
    let clause = '';

    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k]!;
        // Match multi-word clauses
        if (t.type === 'word') {
            let matched = '';
            for (const cl of SQL_CLAUSES) {
                const parts = cl.split(' ');
                if (parts.every((p, n) => tokens[k + n]?.type === 'word' && tokens[k + n]!.value.toUpperCase() === p)) {
                    matched = cl; break;
                }
            }
            if (matched && inlineDepth() === 0) {
                newline(base);
                append(matched);
                clause = matched;
                k += matched.split(' ').length - 1;
                newline(base + 1);
                // keep short clause args (e.g. LIMIT 10) on the clause line
                if (['LIMIT', 'OFFSET'].includes(matched)) line = lines.pop()!;
                continue;
            }
            // `x BETWEEN a AND b` keeps its AND inline
            const betweenAnd = t.value === 'AND' && tokens[k - 2]?.value === 'BETWEEN';
            if ((t.value === 'AND' || t.value === 'OR') && inlineDepth() === 0 && clause !== 'SELECT' && !betweenAnd) {
                newline(base + 1);
                append(t.value);
                continue;
            }
            if (t.value === 'ON' && inlineDepth() === 0) { newline(base + 1); append('ON'); continue; }
        }
        if (t.type === 'comment') {
            append(t.value);
            if (t.value.startsWith('--')) newline(base + 1);
            continue;
        }
        if (t.type === 'punct') {
            if (t.value === '(') {
                const next = tokens[k + 1];
                const block = !!next && next.type === 'word' && /^(SELECT|WITH)$/.test(next.value);
                const prev = tokens[k - 1];
                const isCall = !!prev && prev.type === 'word' && !/^(IN|AS|EXISTS|ON|VALUES|AND|OR|NOT|INTO|FROM|JOIN|WHERE|SELECT|OVER|USING)$/.test(prev.value);
                if (isCall) line = line.trimEnd();
                else if (line.trim() && !line.endsWith(' ') && !line.endsWith('(')) line += ' ';
                line += '(';
                parens.push({ block, base });
                if (block) { base += 2; newline(base); }
                continue;
            }
            if (t.value === ')') {
                const ctx = parens.pop();
                if (ctx?.block) { base = ctx.base; newline(base + 1); }
                append(')');
                continue;
            }
            if (t.value === ',') {
                append(',');
                if (inlineDepth() === 0 && clause !== 'VALUES') newline(base + 1);
                continue;
            }
            if (t.value === ';') {
                append(';');
                lines.push(line.trimEnd());
                lines.push('');
                line = '';
                base = 0; parens.length = 0; clause = '';
                continue;
            }
        }
        append(t.value);
    }
    if (line.trim()) lines.push(line.trimEnd());
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Tool registry. Editor tools are defined inline; custom UIs are code-split
// and only fetched the first time the user opens them.
// Insertion order == sidebar order: keep it grouped per CATEGORY_ORDER.
const tools: ToolsRegistry = {
    // ── Inspect & Decode ────────────────────────────────────────────────
    jwt: {
        id: 'jwt',
        noHistory: true,
        keywords: ['token', 'bearer', 'jws', 'auth'],
        title: 'JWT Decoder',
        description: 'Decode JSON Web Tokens',
        category: 'Inspect & Decode',
        icon: 'vpn_key',
        useCustomUI: true,
        load: () => import('./ui/jwt'),
        primaryInput: 'jwt-input',
    },
    certificate: {
        id: 'certificate',
        noHistory: true,
        keywords: ['x509', 'pem', 'ssl', 'tls', 'cert'],
        title: 'Certificate Decoder',
        description: 'Decode X.509 certificates',
        category: 'Inspect & Decode',
        icon: 'verified_user',
        useCustomUI: true,
        load: () => import('./ui/certificate'),
        primaryInput: 'cert-input',
    },
    base64: {
        id: 'base64',
        noHistory: true,
        keywords: ['b64', 'atob', 'btoa', 'encode', 'decode'],
        title: 'Base64',
        description: 'Convert text to/from Base64',
        category: 'Inspect & Decode',
        icon: 'text_snippet',
        useCustomUI: true,
        load: () => import('./ui/base64'),
        primaryInput: 'b64-encoded',
    },
    url: {
        id: 'url',
        noHistory: true,
        keywords: ['percent', 'uri', 'encodeURIComponent', 'query', 'escape'],
        title: 'URL Encode/Decode',
        description: 'Encode or decode URL components',
        category: 'Inspect & Decode',
        icon: 'link',
        useCustomUI: true,
        load: () => import('./ui/url'),
        primaryInput: 'url-encoded',
    },
    backslashEscape: {
        id: 'backslashEscape',
        keywords: ['escape', 'unescape', 'string literal', 'quotes'],
        title: 'Backslash Escape',
        description: 'Escape and unescape special characters',
        category: 'Inspect & Decode',
        icon: 'format_quote',
        useCustomUI: true,
        load: () => import('./ui/backslashEscape'),
        primaryInput: 'escape-input',
    },
    hexAscii: {
        id: 'hexAscii',
        keywords: ['hex', 'ascii', 'bytes', 'hexdump'],
        title: 'HEX ↔ ASCII',
        description: 'Convert between HEX and ASCII',
        category: 'Inspect & Decode',
        icon: 'memory',
        language: 'plaintext',
        // Non-UI fallback (the custom UI is what users see): auto-detect direction.
        format: (input: string): string => {
            if (!input.trim()) return '';
            const compact = input.replace(/0x/gi, '').replace(/[\s,]/g, '');
            if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) {
                return window.electronAPI.string.toAscii(compact);
            }
            return window.electronAPI.string.toHex(input);
        },
        useCustomUI: true,
        load: () => import('./ui/hexAscii'),
        primaryInput: 'hex-output',
    },
    hmac: {
        id: 'hmac',
        noHistory: true,
        keywords: ['hmac', 'signature', 'webhook', 'sha256'],
        title: 'HMAC Generator / Verifier',
        description: 'Compute and verify HMAC signatures (webhooks)',
        category: 'Inspect & Decode',
        icon: 'verified',
        useCustomUI: true,
        primaryInput: 'hmac-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.hmacTool })),
    },
    csrDecoder: {
        id: 'csrDecoder',
        noHistory: true,
        keywords: ['csr', 'pkcs10', 'certificate request', 'openssl'],
        title: 'CSR Decoder',
        description: 'Decode a PKCS#10 certificate signing request',
        category: 'Inspect & Decode',
        icon: 'assignment',
        useCustomUI: true,
        primaryInput: 'csr-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.csrDecoder })),
    },
    samlDecoder: {
        id: 'samlDecoder',
        noHistory: true,
        keywords: ['saml', 'sso', 'idp'],
        title: 'SAML Decoder',
        description: 'Decode SAMLRequest / SAMLResponse (POST or redirect)',
        category: 'Inspect & Decode',
        icon: 'badge',
        useCustomUI: true,
        primaryInput: 'saml-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.samlDecoder })),
    },
    urlParser: {
        id: 'urlParser',
        noHistory: true,
        keywords: ['url', 'query string', 'params'],
        title: 'URL Parser',
        description: 'Break a URL into parts and query parameters',
        category: 'Inspect & Decode',
        icon: 'travel_explore',
        useCustomUI: true,
        primaryInput: 'urlp-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.urlParser })),
    },
    userAgent: {
        id: 'userAgent',
        keywords: ['user agent', 'ua', 'browser'],
        title: 'User-Agent Parser',
        description: 'Identify browser, OS and device from a User-Agent',
        category: 'Inspect & Decode',
        icon: 'devices',
        useCustomUI: true,
        primaryInput: 'ua-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.uaParser })),
    },
    cidr: {
        id: 'cidr',
        keywords: ['cidr', 'subnet', 'ip', 'netmask', 'ipv6'],
        title: 'IP / CIDR Calculator',
        description: 'Subnet ranges, masks and host counts (IPv4/IPv6)',
        category: 'Inspect & Decode',
        icon: 'lan',
        useCustomUI: true,
        primaryInput: 'cidr-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.cidrCalc })),
    },
    decompress: {
        id: 'decompress',
        noHistory: true, // gzipped payloads often carry tokens
        keywords: ['gzip', 'deflate', 'zlib', 'inflate'],
        title: 'Gzip / Deflate',
        description: 'Decompress or compress gzip, zlib and raw deflate',
        category: 'Inspect & Decode',
        icon: 'compress',
        useCustomUI: true,
        primaryInput: 'gz-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.decompressTool })),
    },
    binaryDecoder: {
        id: 'binaryDecoder',
        noHistory: true,
        keywords: ['protobuf', 'msgpack', 'messagepack', 'binary'],
        title: 'Protobuf / MessagePack',
        description: 'Decode protobuf (no schema) and MessagePack',
        category: 'Inspect & Decode',
        icon: 'memory',
        useCustomUI: true,
        primaryInput: 'bin-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.binaryDecoder })),
    },
    unicodeInspector: {
        id: 'unicodeInspector',
        keywords: ['unicode', 'zero width', 'invisible', 'code point'],
        title: 'Unicode Inspector',
        description: 'Reveal code points and invisible characters',
        category: 'Inspect & Decode',
        icon: 'font_download',
        useCustomUI: true,
        primaryInput: 'uni-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.unicodeInspector })),
    },
    dockerfileLint: {
        id: 'dockerfileLint',
        keywords: ['docker', 'dockerfile', 'lint', 'hadolint'],
        title: 'Dockerfile Linter',
        description: 'Find common Dockerfile mistakes',
        category: 'Inspect & Decode',
        icon: 'rule',
        useCustomUI: true,
        primaryInput: 'dfl-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.dockerfileLint })),
    },

    // ── Format ──────────────────────────────────────────────────────────
    json: {
        id: 'json',
        keywords: ['pretty', 'beautify', 'minify', 'lint'],
        title: 'JSON Formatter',
        description: 'Format and validate JSON data',
        category: 'Format',
        icon: 'data_object',
        language: 'json',
        modes: [{ id: 'format', label: 'Format' }, { id: 'minify', label: 'Minify' }],
        format: (input: string, indent?: number, mode?: string): string => {
            if (!input.trim()) return '';
            try {
                return JSON.stringify(JSON.parse(input), null, mode === 'minify' ? 0 : clampIndent(indent));
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
        keywords: ['pretty', 'beautify'],
        title: 'XML Formatter',
        description: 'Beautify XML strings',
        category: 'Format',
        icon: 'code',
        language: 'xml',
        format: (input: string, indent?: number) => window.electronAPI.beautify.html(input, { indent_size: clampIndent(indent) }),
        placeholder: '<root><child>value</child></root>',
        sampleData: '<?xml version="1.0" encoding="UTF-8"?>\n<note>\n  <to>Tove</to>\n  <from>Jani</from>\n  <heading>Reminder</heading>\n  <body>Don\'t forget me this weekend!</body>\n</note>'
    },
    sql: {
        id: 'sql',
        keywords: ['query', 'pretty', 'beautify'],
        title: 'SQL Formatter',
        description: 'Format SQL queries',
        category: 'Format',
        icon: 'storage',
        language: 'sql',
        format: formatSql,
        placeholder: 'SELECT * FROM users WHERE id = 1',
        sampleData: "SELECT u.id, u.name, count(o.id) AS orders FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE u.created_at > '2023-01-01' AND (u.status = 'active' OR u.vip = 1) GROUP BY u.id, u.name ORDER BY orders DESC LIMIT 10"
    },
    html: {
        id: 'html',
        keywords: ['pretty', 'beautify', 'markup'],
        title: 'HTML Formatter',
        description: 'Beautify HTML code',
        category: 'Format',
        icon: 'web',
        language: 'html',
        format: (input: string, indent?: number) => window.electronAPI.beautify.html(input, { indent_size: clampIndent(indent) }),
        placeholder: '<div><p>Hello</p></div>',
        sampleData: '<!DOCTYPE html>\n<html>\n<head>\n<title>Page Title</title>\n</head>\n<body>\n<h1>My First Heading</h1>\n<p>My first paragraph.</p>\n</body>\n</html>'
    },
    yamlFormatter: {
        id: 'yamlFormatter',
        keywords: ['yml', 'pretty'],
        title: 'YAML Formatter',
        description: 'Validate YAML and view it as formatted JSON',
        category: 'Format',
        icon: 'segment',
        useCustomUI: true,
        load: () => import('./ui/yamlFormatter'),
        primaryInput: 'yaml-input',
    },
    svgOptimizer: {
        id: 'svgOptimizer',
        keywords: ['svgo', 'minify', 'vector'],
        title: 'SVG Optimizer',
        description: 'Minify and optimize SVG code',
        category: 'Format',
        icon: 'polyline',
        useCustomUI: true,
        load: () => import('./ui/svgOptimizer'),
        primaryInput: 'svg-input',
    },
    htmlJsx: {
        id: 'htmlJsx',
        keywords: ['react', 'jsx', 'tsx'],
        title: 'HTML to JSX',
        description: 'Convert HTML to JSX',
        category: 'Format',
        icon: 'javascript',
        language: 'javascript',
        format: (input: string): string => window.electronAPI.htmlToJsx.convert(input),
        placeholder: '<div class="foo">Hello</div>',
        sampleData: '<div class="container">\n  <h1 style="color: red;">Hello World</h1>\n  <button onclick="alert(\'Click\')">Click Me</button>\n</div>'
    },
    markdownToHtml: {
        id: 'markdownToHtml',
        keywords: ['md', 'markdown'],
        title: 'Markdown to HTML',
        description: 'Convert Markdown to HTML source',
        category: 'Format',
        icon: 'article',
        language: 'html',
        format: (input: string): string => window.electronAPI.marked.parse(input),
        placeholder: '# Hello\n\n- Item 1\n- Item 2',
        sampleData: '# Welcome to Markdown\n\n## Features\n\n- **Bold text**\n- *Italic text*\n- `Code blocks`\n\n```javascript\nconst greeting = "Hello World";\n```\n\n[Link to Google](https://google.com)'
    },
    // Rendering Markdown is a presentation of the same source, so it sits next to Markdown → HTML.
    markdownPreview: {
        id: 'markdownPreview',
        keywords: ['md', 'readme', 'render'],
        title: 'Markdown Preview',
        description: 'Live preview of rendered Markdown',
        category: 'Format',
        icon: 'preview',
        useCustomUI: true,
        load: () => import('./ui/markdownPreview'),
        primaryInput: 'md-source',
    },
    cssJsFormat: {
        id: 'cssJsFormat',
        keywords: ['css', 'scss', 'javascript', 'minify', 'beautify', 'prettify'],
        title: 'CSS / JS Beautify & Minify',
        description: 'Beautify or minify CSS, SCSS and JavaScript',
        category: 'Format',
        icon: 'code',
        useCustomUI: true,
        primaryInput: 'cjs-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.cssJsFormat })),
    },
    graphqlFormat: {
        id: 'graphqlFormat',
        keywords: ['graphql', 'gql'],
        title: 'GraphQL Formatter',
        description: 'Format or minify GraphQL queries and schemas',
        category: 'Format',
        icon: 'hub',
        useCustomUI: true,
        primaryInput: 'gql-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.graphqlFormat })),
    },

    // ── Convert ─────────────────────────────────────────────────────────
    csvJson: {
        id: 'csvJson',
        keywords: ['csv', 'tsv', 'spreadsheet', 'table'],
        title: 'CSV ↔ JSON',
        description: 'Convert between CSV and JSON',
        category: 'Convert',
        icon: 'grid_on',
        useCustomUI: true,
        load: () => import('./ui/csvJson'),
        primaryInput: 'csv-input',
    },
    timestamp: {
        id: 'timestamp',
        keywords: ['epoch', 'unix', 'date', 'time', 'iso'],
        title: 'Timestamp Converter',
        description: 'Convert Unix timestamps and dates',
        category: 'Convert',
        icon: 'schedule',
        useCustomUI: true,
        load: () => import('./ui/timestamp'),
        primaryInput: 'ts-unix',
    },
    color: {
        id: 'color',
        keywords: ['colour', 'hex', 'rgb', 'hsl', 'oklch', 'picker'],
        title: 'Color Converter',
        description: 'Convert between all color formats with code presets',
        category: 'Convert',
        icon: 'palette',
        useCustomUI: true,
        load: () => import('./ui/color'),
        primaryInput: 'color-hex',
    },
    numberBaseConverter: {
        id: 'numberBaseConverter',
        keywords: ['binary', 'octal', 'hex', 'decimal', 'radix'],
        title: 'Number Base Converter',
        description: 'Convert between Binary, Octal, Decimal, Hexadecimal',
        category: 'Convert',
        icon: 'calculate',
        useCustomUI: true,
        load: () => import('./ui/numberBaseConverter'),
    },
    imageToBase64: {
        id: 'imageToBase64',
        keywords: ['data uri', 'data url', 'img', 'png'],
        title: 'Image to Base64',
        description: 'Convert images to Base64 data URLs',
        category: 'Convert',
        icon: 'image',
        useCustomUI: true,
        load: () => import('./ui/imageToBase64'),
    },
    jsonYaml: {
        id: 'jsonYaml',
        keywords: ['json', 'yaml', 'yml'],
        title: 'JSON ↔ YAML',
        description: 'Convert between JSON and YAML',
        category: 'Convert',
        icon: 'swap_horiz',
        useCustomUI: true,
        primaryInput: 'jy-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.jsonYaml })),
    },
    jsonTypes: {
        id: 'jsonTypes',
        keywords: ['typescript', 'interface', 'struct', 'quicktype', 'go', 'rust'],
        title: 'JSON → Types',
        description: 'Generate TypeScript, Go, Rust, C# or Python types',
        category: 'Convert',
        icon: 'data_object',
        useCustomUI: true,
        primaryInput: 'jt-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.jsonTypes })),
    },
    tomlJson: {
        id: 'tomlJson',
        keywords: ['toml', 'cargo', 'pyproject'],
        title: 'TOML ↔ JSON',
        description: 'Convert between TOML and JSON',
        category: 'Convert',
        icon: 'settings_suggest',
        useCustomUI: true,
        primaryInput: 'tj-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.tomlJson })),
    },
    envJson: {
        id: 'envJson',
        noHistory: true,
        keywords: ['env', 'dotenv', 'environment'],
        title: '.env ↔ JSON',
        description: 'Convert dotenv files to JSON and back',
        category: 'Convert',
        icon: 'key',
        useCustomUI: true,
        primaryInput: 'ej-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.envJson })),
    },
    pemJwk: {
        id: 'pemJwk',
        noHistory: true,
        keywords: ['pem', 'jwk', 'jwks', 'key'],
        title: 'PEM ↔ JWK',
        description: 'Convert keys between PEM and JSON Web Key',
        category: 'Convert',
        icon: 'vpn_key',
        useCustomUI: true,
        primaryInput: 'pj-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.pemJwk })),
    },
    curlConverter: {
        id: 'curlConverter',
        noHistory: true,
        keywords: ['curl', 'http', 'request', 'fetch', 'requests'],
        title: 'cURL → Code',
        description: 'Turn a cURL command into fetch, Python, Go and more',
        category: 'Convert',
        icon: 'terminal',
        useCustomUI: true,
        primaryInput: 'curl-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.curlConverter })),
    },
    dockerCompose: {
        id: 'dockerCompose',
        noHistory: true,
        keywords: ['docker', 'compose', 'docker-compose'],
        title: 'docker run ↔ compose',
        description: 'Convert docker run commands to compose and back',
        category: 'Convert',
        icon: 'directions_boat',
        useCustomUI: true,
        primaryInput: 'dc-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.dockerCompose })),
    },
    chmod: {
        id: 'chmod',
        keywords: ['chmod', 'permissions', 'unix'],
        title: 'Chmod Calculator',
        description: 'Convert octal and symbolic Unix permissions',
        category: 'Convert',
        icon: 'lock_open',
        useCustomUI: true,
        primaryInput: 'chmod-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.chmodCalc })),
    },
    dataSize: {
        id: 'dataSize',
        keywords: ['bytes', 'kb', 'mib', 'gigabyte'],
        title: 'Data Size Converter',
        description: 'Convert between bytes, KB/KiB, MB/MiB, bits…',
        category: 'Convert',
        icon: 'storage',
        useCustomUI: true,
        primaryInput: 'dsz-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.dataSize })),
    },
    timezone: {
        id: 'timezone',
        keywords: ['timezone', 'tz', 'utc', 'time zone'],
        title: 'Time Zone Converter',
        description: 'Show a moment in several time zones',
        category: 'Convert',
        icon: 'public',
        useCustomUI: true,
        primaryInput: 'tz-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.timezone })),
    },

    // ── Text & Utilities ────────────────────────────────────────────────
    stringCase: {
        id: 'stringCase',
        keywords: ['camel', 'snake', 'kebab', 'pascal', 'upper', 'lower'],
        title: 'String Case Converter',
        description: 'Convert between different string cases',
        category: 'Text & Utilities',
        icon: 'text_fields',
        useCustomUI: true,
        load: () => import('./ui/stringCase'),
        primaryInput: 'case-input',
    },
    regexTester: {
        id: 'regexTester',
        keywords: ['regex', 're', 'pattern', 'match'],
        title: 'RegExp Tester',
        description: 'Test regular expressions with live matching',
        category: 'Text & Utilities',
        icon: 'find_replace',
        useCustomUI: true,
        load: () => import('./ui/regexTester'),
    },
    stringInspector: {
        id: 'stringInspector',
        keywords: ['count', 'length', 'characters', 'words', 'unicode'],
        title: 'String Inspector',
        description: 'Analyze string properties and statistics',
        category: 'Text & Utilities',
        icon: 'manage_search',
        useCustomUI: true,
        load: () => import('./ui/stringInspector'),
        primaryInput: 'insp-input',
    },
    hash: {
        id: 'hash',
        noHistory: true,
        keywords: ['sha', 'sha256', 'md5', 'sha1', 'checksum', 'digest'],
        title: 'Hash Generator',
        description: 'Generate MD5, SHA-1, SHA-256, and SHA-512 hashes',
        category: 'Text & Utilities',
        icon: 'fingerprint',
        useCustomUI: true,
        load: () => import('./ui/hash'),
        primaryInput: 'hash-input',
    },
    cronParser: {
        id: 'cronParser',
        keywords: ['cron', 'crontab', 'schedule'],
        title: 'Cron Expression Parser',
        description: 'Parse and visualize cron expressions',
        category: 'Text & Utilities',
        icon: 'event_repeat',
        useCustomUI: true,
        load: () => import('./ui/cronParser'),
        primaryInput: 'cron-input',
    },
    jsonPath: {
        id: 'jsonPath',
        keywords: ['jsonpath', 'jq', 'query'],
        title: 'JSONPath Query',
        description: 'Query JSON with JSONPath expressions',
        category: 'Text & Utilities',
        icon: 'manage_search',
        useCustomUI: true,
        primaryInput: 'jp-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.jsonPathTool })),
    },
    passwordStrength: {
        id: 'passwordStrength',
        noHistory: true,
        keywords: ['password', 'entropy', 'zxcvbn'],
        title: 'Password Strength',
        description: 'Estimate entropy and crack time',
        category: 'Text & Utilities',
        icon: 'shield',
        useCustomUI: true,
        primaryInput: 'pws-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.passwordStrengthTool })),
    },
    passwordHash: {
        id: 'passwordHash',
        noHistory: true,
        keywords: ['bcrypt', 'argon2', 'password hash'],
        title: 'bcrypt / Argon2',
        description: 'Hash and verify passwords with bcrypt or Argon2id',
        category: 'Text & Utilities',
        icon: 'password',
        useCustomUI: true,
        primaryInput: 'pwh-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.passwordHash })),
    },
    httpStatus: {
        id: 'httpStatus',
        keywords: ['http', 'status', '404', '500'],
        title: 'HTTP Status Codes',
        description: 'Searchable HTTP status code reference',
        category: 'Text & Utilities',
        icon: 'http',
        useCustomUI: true,
        primaryInput: 'http-input',
        load: () => import('./ui/builders').then(m => ({ render: m.httpStatus })),
    },
    cheatSheets: {
        id: 'cheatSheets',
        keywords: ['cheat sheet', 'reference', 'git', 'regex'],
        title: 'Cheat Sheets',
        description: 'Regex, Git, Docker, SQL, chmod and cron quick reference',
        category: 'Text & Utilities',
        icon: 'menu_book',
        useCustomUI: true,
        primaryInput: 'cheat-input',
        load: () => import('./ui/builders').then(m => ({ render: m.cheatSheets })),
    },
    pipeline: {
        id: 'pipeline',
        noHistory: true, // recipes often run tokens through HMAC/JWT/Base64
        keywords: ['chain', 'pipeline', 'recipe', 'cyberchef'],
        title: 'Pipeline (Chain Tools)',
        description: 'Chain decode, decompress, format and hash steps into one recipe.',
        category: 'Text & Utilities',
        icon: 'account_tree',
        useCustomUI: true,
        primaryInput: 'chain-input',
        load: () => import('./ui/builders').then(m => ({ render: m.pipeline })),
    },

    // ── Generate ────────────────────────────────────────────────────────
    uuid: {
        id: 'uuid',
        keywords: ['guid', 'ulid', 'uuid4', 'id'],
        title: 'UUID/ULID Generator',
        description: 'Generate and decode UUIDs and ULIDs',
        category: 'Generate',
        icon: 'tag',
        useCustomUI: true,
        load: () => import('./ui/uuid'),
        primaryInput: 'uuid-input',
    },
    qrcode: {
        id: 'qrcode',
        keywords: ['qr'],
        title: 'QR Code Generator',
        description: 'Generate QR codes from text or URLs',
        category: 'Generate',
        icon: 'qr_code_2',
        useCustomUI: true,
        load: () => import('./ui/qrcode'),
    },
    barcodeGenerator: {
        id: 'barcodeGenerator',
        keywords: ['ean', 'upc', 'code128'],
        title: 'Barcode Generator',
        description: 'Generate barcodes in various formats',
        category: 'Generate',
        icon: 'view_week',
        useCustomUI: true,
        load: () => import('./ui/barcodeGenerator'),
    },
    loremIpsum: {
        id: 'loremIpsum',
        keywords: ['placeholder', 'dummy text', 'filler'],
        title: 'Lorem Ipsum Generator',
        description: 'Generate placeholder text',
        category: 'Generate',
        icon: 'notes',
        useCustomUI: true,
        load: () => import('./ui/loremIpsum'),
    },
    randomStringGenerator: {
        id: 'randomStringGenerator',
        keywords: ['password', 'token', 'random', 'secret'],
        title: 'Random String Generator',
        description: 'Generate random strings and passwords',
        category: 'Generate',
        icon: 'casino',
        useCustomUI: true,
        load: () => import('./ui/randomStringGenerator'),
    },
    jwtSign: {
        id: 'jwtSign',
        noHistory: true,
        keywords: ['jwt', 'sign', 'token', 'encode'],
        title: 'JWT Encoder / Signer',
        description: 'Create and sign JWTs (HS, RS, PS, ES, EdDSA)',
        category: 'Generate',
        icon: 'draw',
        useCustomUI: true,
        primaryInput: 'jws-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.jwtSign })),
    },
    keyPair: {
        id: 'keyPair',
        noHistory: true,
        keywords: ['ssh-keygen', 'rsa', 'ed25519', 'keypair', 'ecdsa'],
        title: 'Key Pair Generator',
        description: 'Generate RSA, EC and Ed25519 keys (PEM, SSH, JWK)',
        category: 'Generate',
        icon: 'vpn_lock',
        useCustomUI: true,
        primaryInput: 'kp-input',
        load: () => import('./ui/builders').then(m => ({ render: m.keyPair })),
    },
    fakeData: {
        id: 'fakeData',
        primaryInput: 'fake-fmt',
        keywords: ['faker', 'mock', 'test data', 'seed'],
        title: 'Fake Data Generator',
        description: 'Generate realistic test records as JSON, CSV or SQL',
        category: 'Generate',
        icon: 'group',
        useCustomUI: true,
        load: () => import('./ui/builders').then(m => ({ render: m.fakeData })),
    },
    cronBuilder: {
        id: 'cronBuilder',
        primaryInput: 'cronb-freq',
        keywords: ['cron', 'crontab', 'schedule'],
        title: 'Cron Builder',
        description: 'Build cron expressions from a schedule',
        category: 'Generate',
        icon: 'schedule',
        useCustomUI: true,
        load: () => import('./ui/builders').then(m => ({ render: m.cronBuilder })),
    },
    gitignore: {
        id: 'gitignore',
        primaryInput: 'gi-t-node',
        keywords: ['gitignore', 'git', 'ignore'],
        title: '.gitignore Generator',
        description: 'Combine .gitignore templates',
        category: 'Generate',
        icon: 'block',
        useCustomUI: true,
        load: () => import('./ui/builders').then(m => ({ render: m.gitignore })),
    },
    favicon: {
        id: 'favicon',
        keywords: ['favicon', 'ico', 'app icon'],
        title: 'Favicon Generator',
        description: 'Create favicon PNGs and .ico from an image or emoji',
        category: 'Generate',
        icon: 'image',
        useCustomUI: true,
        primaryInput: 'fav-input',
        load: () => import('./ui/favicon'),
    },

    // ── Compare ─────────────────────────────────────────────────────────
    textDiff: {
        id: 'textDiff',
        noHistory: true,
        keywords: ['diff', 'compare', 'changes'],
        title: 'Text Diff Checker',
        description: 'Compare two texts visually',
        category: 'Compare',
        icon: 'compare',
        useCustomUI: true,
        load: () => import('./ui/textDiff'),
    },
    jsonDiff: {
        id: 'jsonDiff',
        noHistory: true,
        keywords: ['json diff', 'compare'],
        title: 'JSON Diff',
        description: 'Structural JSON comparison (ignores key order)',
        category: 'Compare',
        icon: 'difference',
        useCustomUI: true,
        primaryInput: 'jd-input',
        load: () => import('./ui/textTools').then(m => ({ render: m.jsonDiffTool })),
    },
};

window.tools = tools;

export default tools;
