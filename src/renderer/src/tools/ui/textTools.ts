// Render functions for the text-in/text-out tools. Each export is a tool's `render`.
import { textTool } from './textTool';
import { jsonToYaml, yamlToJson, jsonToTypes, jsonPath, jsonDiff, formatJsonDiff, parseJsonLabeled, type TypeLang } from '../lib/json';
import {
    hmacAll, hmacVerify, decodeKey, signJwt, pemToJwk, jwkToPem, decodeCsr, passwordStrength,
    bcryptHash, bcryptCheck, argon2Hash, argon2Check, autoDecompress, compress, decodeSaml,
    type HmacAlgo, type JwtAlg,
} from '../lib/crypto';
import {
    tomlToJson, jsonToToml, envToJson, jsonToEnv, curlToCode, parseChmod, convertSize, parseInZone, inZones,
    DEFAULT_ZONES, decodeProtobuf, decodeMsgpack, encodeMsgpack, type CurlTarget,
} from '../lib/convert';
import { parseUrl, parseUserAgent, calcSubnet, cidrContains, inspectUnicode, stripInvisible, graphemeCount } from '../lib/inspect';
import { beautifyCss, beautifyJs, minifyCss, minifyJs, formatGraphql, minifyGraphql, lintDockerfile, dockerRunToCompose, composeToDockerRun } from '../lib/format';
import { SAMPLE_CSR_EC } from '../lib/samples';
import { bytesToBase64, bytesToHex, hexOrBase64ToBytes, toUtf8, tryUtf8 } from '../lib/bytes';

const json = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? bytesToHex(x) : x), 2);
const dir = (a: string, b: string): [string, string][] => [['a', a], ['b', b]];

export const jsonYaml = textTool({
    prefix: 'jy', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Direction', choices: dir('JSON → YAML', 'YAML → JSON') }],
    sample: { input: '{"name":"forge","tags":["dev","tools"],"server":{"port":8080,"tls":true}}' },
    run: (s, v) => (v.dir === 'a' ? jsonToYaml(s) : yamlToJson(s)),
});

export const jsonTypes = textTool({
    prefix: 'jt', inputLabel: 'JSON', outputLabel: 'Types',
    options: [{ id: 'lang', label: 'Language', choices: [['typescript', 'TypeScript'], ['go', 'Go'], ['rust', 'Rust'], ['csharp', 'C#'], ['python', 'Python']] }],
    fields: [{ id: 'root', label: 'Root type name', default: 'Root' }],
    sample: { input: '{"id":1,"name":"Ada","email":"ada@example.com","roles":["admin"],"address":{"city":"London","zip":"N1"},"orders":[{"sku":"A1","qty":2},{"sku":"B2"}]}' },
    run: (s, v) => jsonToTypes(s, v.lang as TypeLang, v.root?.trim() || 'Root'),
});

export const jsonPathTool = textTool({
    prefix: 'jp', inputLabel: 'JSON', outputLabel: 'Matches',
    fields: [{ id: 'path', label: 'JSONPath expression', default: '$..title', placeholder: '$.store.book[?(@.price < 10)].title' }],
    sample: { input: '{"store":{"book":[{"title":"Dune","price":8},{"title":"Neuromancer","price":12}],"bicycle":{"price":19}}}', fields: { path: '$.store.book[?(@.price < 10)].title' } },
    run: (s, v) => json(jsonPath(parseJsonLabeled(s, 'JSON'), v.path || '$')),
    okMessage: (o) => `${(JSON.parse(o) as unknown[]).length} match(es)`,
});

export const jsonDiffTool = textTool({
    prefix: 'jd', inputLabel: 'Original JSON', outputLabel: 'Differences',
    fields: [{ id: 'other', label: 'Changed JSON', rows: 8 }],
    sample: { input: '{"name":"forge","version":1,"tags":["a","b"]}', fields: { other: '{"version":2,"name":"forge","tags":["a","b","c"],"new":true}' } },
    run: (s, v) => formatJsonDiff(jsonDiff(parseJsonLabeled(s, 'Original'), parseJsonLabeled(v.other || 'null', 'Changed'))),
});

export const hmacTool = textTool({
    prefix: 'hmac', inputLabel: 'Message', outputLabel: 'HMAC',
    options: [
        { id: 'algo', label: 'Algorithm', choices: [['sha256', 'SHA-256'], ['sha384', 'SHA-384'], ['sha512', 'SHA-512'], ['sha1', 'SHA-1'], ['md5', 'MD5'], ['sha3-256', 'SHA3-256']] },
        { id: 'enc', label: 'Key encoding', choices: [['utf8', 'Text'], ['hex', 'Hex'], ['base64', 'Base64']] },
    ],
    fields: [{ id: 'key', label: 'Secret key', default: '' }, { id: 'verify', label: 'Signature to verify (optional)', placeholder: 'hex, base64 or sha256=…' }],
    sample: { input: 'what do ya want for nothing?', fields: { key: 'Jefe' } },
    run: async (s, v) => {
        const key = decodeKey(v.key ?? '', v.enc as 'utf8');
        const r = await hmacAll(s, key, v.algo as HmacAlgo);
        let out = `Hex:        ${r.hex}\nBase64:     ${r.base64}\nBase64url:  ${r.base64url}`;
        if (v.verify?.trim()) out += `\n\nVerify:     ${(await hmacVerify(s, key, v.algo as HmacAlgo, v.verify)) ? 'MATCH ✓' : 'MISMATCH ✗'}`;
        return out;
    },
});

export const jwtSign = textTool({
    prefix: 'jws', inputLabel: 'Payload (JSON)', outputLabel: 'Signed JWT', outputRows: 8,
    options: [{ id: 'alg', label: 'Algorithm', choices: ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'ES256', 'ES384', 'EdDSA', 'none'].map(a => [a, a] as [string, string]) }],
    fields: [{ id: 'secret', label: 'Secret (HS*) or private key PEM', rows: 4 }, { id: 'header', label: 'Extra header fields (JSON, optional)', placeholder: '{"kid":"key-1"}' }],
    sample: { input: '{"sub":"1234567890","name":"John Doe","iat":1516239022}', fields: { secret: 'your-256-bit-secret' }, options: { alg: 'HS256' } },
    run: (s, v) => signJwt({ typ: 'JWT', ...(v.header?.trim() ? parseJsonLabeled(v.header, 'Header') as object : {}) }, parseJsonLabeled(s, 'Payload'), v.alg as JwtAlg, v.secret ?? ''),
});

export const urlParser = textTool({
    prefix: 'urlp', inputLabel: 'URL', outputLabel: 'Parts', inputRows: 4,
    sample: { input: 'https://user:pass@api.example.com:8443/v1/items/42?sort=desc&tag=a&tag=b#details' },
    run: s => {
        const u = parseUrl(s);
        const rows: Array<[string, string]> = [['Protocol', u.protocol], ['Origin', u.origin], ['Username', u.username], ['Password', u.password], ['Host', u.hostname], ['Port', u.port], ['Path', u.pathname], ['Query', u.search], ['Fragment', u.hash]];
        let out = rows.filter(([, x]) => x).map(([k, x]) => `${k.padEnd(10)} ${x}`).join('\n');
        if (u.pathSegments.length) out += `\n\nPath segments:\n${u.pathSegments.map((p, i) => `  [${i}] ${p}`).join('\n')}`;
        if (u.params.length) out += `\n\nQuery parameters:\n${u.params.map(([k, x]) => `  ${k} = ${x}`).join('\n')}`;
        return out;
    },
});

export const passwordStrengthTool = textTool({
    prefix: 'pws', inputLabel: 'Password', outputLabel: 'Strength', inputType: 'password',
    sample: { input: 'Tr0ub4dor&3' },
    run: s => {
        const r = passwordStrength(s);
        return `Score:       ${r.score}/4 (${r.label})\nEntropy:     ~${Math.round(r.entropy)} bits\nCrack time:  ${r.crackTime} (offline, 10B guesses/s)${r.warnings.length ? `\n\nWarnings:\n${r.warnings.map(w => `  • ${w}`).join('\n')}` : ''}`;
    },
});

export const passwordHash = textTool({
    prefix: 'pwh', inputLabel: 'Password', outputLabel: 'Result', inputType: 'password', outputRows: 6,
    options: [
        { id: 'algo', label: 'Algorithm', choices: [['bcrypt', 'bcrypt'], ['argon2id', 'Argon2id']] },
        { id: 'cost', label: 'Cost', choices: [['low', 'Low (fast)'], ['med', 'Medium'], ['high', 'High']], default: 'med' },
    ],
    fields: [{ id: 'hash', label: 'Existing hash to verify (optional)', placeholder: '$2b$10$… or $argon2id$…' }],
    sample: { input: 'hunter2' },
    run: async (s, v) => {
        const known = v.hash?.trim();
        if (known) {
            const ok = known.startsWith('$argon2') ? await argon2Check(s, known) : await bcryptCheck(s, known);
            return ok ? 'MATCH ✓: password matches the hash' : 'MISMATCH ✗: password does not match';
        }
        const lvl = v.cost === 'low' ? 0 : v.cost === 'high' ? 2 : 1;
        return v.algo === 'bcrypt'
            ? bcryptHash(s, [8, 10, 12][lvl]!)
            : argon2Hash(s, { memoryKiB: [8192, 19456, 65536][lvl]!, iterations: [2, 2, 3][lvl]!, parallelism: 1 });
    },
});

export const csrDecoder = textTool({
    prefix: 'csr', inputLabel: 'CSR (PEM)', outputLabel: 'Decoded',
    sample: { input: SAMPLE_CSR_EC },
    run: s => {
        const c = decodeCsr(s);
        return `Subject:     ${c.subject}\nKey:         ${c.keyAlgorithm}${c.keySize ? ` ${c.keySize}-bit` : ''}${c.curve ? ` (${c.curve})` : ''}\nSignature:   ${c.signatureAlgorithm}\nSANs:        ${c.san.length ? c.san.join(', ') : '(none)'}\n\nPublic key (JWK):\n${json(c.publicKeyJwk)}`;
    },
});

export const pemJwk = textTool({
    prefix: 'pj', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Direction', choices: dir('PEM → JWK', 'JWK → PEM') }],
    sample: { input: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----', options: { dir: 'a' } },
    run: async (s, v) => (v.dir === 'a' ? json(pemToJwk(s)) : jwkToPem(parseJsonLabeled(s, 'JWK') as JsonWebKey)),
});

export const samlDecoder = textTool({
    prefix: 'saml', inputLabel: 'SAMLRequest / SAMLResponse (Base64 or redirect URL)', outputLabel: 'XML',
    sample: { input: bytesToBase64(toUtf8('<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_8e8dc5f69a98cc4c1ff3427e5ce34606fd672f91e6" Version="2.0" IssueInstant="2024-01-01T00:00:00Z" AssertionConsumerServiceURL="https://sp.example.com/acs"><saml:Issuer>https://sp.example.com</saml:Issuer></samlp:AuthnRequest>')) },
    run: async s => (await decodeSaml(s)).xml,
    okMessage: () => 'Decoded',
});

export const tomlJson = textTool({
    prefix: 'tj', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Direction', choices: dir('TOML → JSON', 'JSON → TOML') }],
    sample: { input: 'title = "ForgeTools"\n\n[server]\nhost = "localhost"\nport = 8080\n\n[[users]]\nname = "ada"\nadmin = true\n' },
    run: (s, v) => (v.dir === 'a' ? tomlToJson(s) : jsonToToml(s)),
});

export const envJson = textTool({
    prefix: 'ej', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Direction', choices: dir('.env → JSON', 'JSON → .env') }],
    sample: { input: '# database\nDB_HOST=localhost\nDB_PORT=5432\nexport API_URL="https://api.example.com"\nGREETING=\'hello world\'\n' },
    run: (s, v) => (v.dir === 'a' ? envToJson(s) : jsonToEnv(s)),
});

export const curlConverter = textTool({
    prefix: 'curl', inputLabel: 'cURL command', outputLabel: 'Code',
    options: [{ id: 'target', label: 'Target', choices: [['fetch', 'JavaScript fetch'], ['axios', 'Axios'], ['node-http', 'Node https'], ['python', 'Python requests'], ['go', 'Go net/http'], ['php', 'PHP cURL'], ['rust', 'Rust reqwest']] }],
    sample: { input: `curl -X POST 'https://api.example.com/v1/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer TOKEN' \\\n  -d '{"name":"Ada","role":"admin"}'` },
    run: (s, v) => curlToCode(s, v.target as CurlTarget),
});

export const chmodCalc = textTool({
    prefix: 'chmod', inputLabel: 'Permissions (octal or symbolic)', outputLabel: 'Result', inputRows: 2,
    sample: { input: '755' },
    run: s => { const c = parseChmod(s); return `Octal:     ${c.octal}\nSymbolic:  ${c.symbolic}\nCommand:   ${c.command}\n\n${c.description.join('\n')}`; },
});

export const dataSize = textTool({
    prefix: 'dsz', inputLabel: 'Size', outputLabel: 'Conversions', inputRows: 2, outputRows: 16,
    sample: { input: '1.5 GiB' },
    run: s => convertSize(s).map(([u, n]) => `${u.padEnd(5)} ${n}`).join('\n'),
});

export const timezone = textTool({
    prefix: 'tz', inputLabel: 'Date / time', outputLabel: 'In each zone', inputRows: 2, runOnEmpty: true,
    placeholder: 'now, 2024-06-01 09:00, ISO with offset, or Unix seconds',
    fields: [{ id: 'from', label: 'Interpret wall time in zone', default: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, { id: 'zones', label: 'Show zones (one per line)', rows: 6, default: DEFAULT_ZONES.join('\n') }],
    sample: { input: '2024-06-01 09:00', fields: { from: 'America/New_York' } },
    run: (s, v) => {
        const d = parseInZone(s, v.from?.trim() || 'UTC');
        const zones = (v.zones ?? '').split(/\r?\n/).map(z => z.trim()).filter(Boolean);
        return `ISO (UTC):  ${d.toISOString()}\nUnix:       ${Math.floor(d.getTime() / 1000)}\n\n` + inZones(d, zones).map(z => `${z.zone.padEnd(22)} ${z.time}  ${z.offset}`).join('\n');
    },
});

export const binaryDecoder = textTool({
    prefix: 'bin', inputLabel: 'Bytes (hex or Base64) or JSON', outputLabel: 'Decoded',
    options: [{ id: 'fmt', label: 'Format', choices: [['protobuf', 'Protobuf (schema-less)'], ['msgpack', 'MessagePack → JSON'], ['tomsgpack', 'JSON → MessagePack']] }],
    sample: { input: '08 96 01 12 07 74 65 73 74 69 6e 67 1a 03 08 c8 01', options: { fmt: 'protobuf' } },
    run: (s, v) => {
        if (v.fmt === 'tomsgpack') { const b = encodeMsgpack(parseJsonLabeled(s, 'JSON')); return `Hex:\n${bytesToHex(b)}\n\nBase64:\n${bytesToBase64(b)}`; }
        const b = hexOrBase64ToBytes(s);
        return json(v.fmt === 'msgpack' ? decodeMsgpack(b) : decodeProtobuf(b));
    },
});

export const uaParser = textTool({
    prefix: 'ua', inputLabel: 'User-Agent', outputLabel: 'Parsed', inputRows: 3,
    sample: { input: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    run: s => { const u = parseUserAgent(s.trim()); return `Browser:  ${u.browser} ${u.browserVersion}\nEngine:   ${u.engine}\nOS:       ${u.os} ${u.osVersion}\nDevice:   ${u.device}${u.vendor ? `\nVendor:   ${u.vendor}` : ''}${u.bot ? `\nBot:      ${u.bot}` : ''}`; },
});

export const cidrCalc = textTool({
    prefix: 'cidr', inputLabel: 'CIDR / IP + mask', outputLabel: 'Subnet', inputRows: 2,
    fields: [{ id: 'ip', label: 'Check whether an IP is inside (optional)' }],
    sample: { input: '192.168.10.77/26', fields: { ip: '192.168.10.100' } },
    run: (s, v) => {
        const n = calcSubnet(s);
        const rows: Array<[string, string | undefined]> = [['Network', n.network], ['Netmask', n.mask], ['Wildcard', n.wildcard], ['Broadcast', n.broadcast], ['First host', n.firstHost], ['Last host', n.lastHost], ['Addresses', n.totalAddresses], ['Usable hosts', n.usableHosts], ['Class', n.ipClass], ['Scope', n.scope], ['Binary mask', n.binaryMask]];
        let out = rows.filter(([, x]) => x).map(([k, x]) => `${k.padEnd(13)} ${x}`).join('\n');
        if (v.ip?.trim()) out += `\n\n${v.ip.trim()} is ${cidrContains(n.network, v.ip.trim()) ? 'INSIDE' : 'OUTSIDE'} this network`;
        return out;
    },
});

export const decompressTool = textTool({
    prefix: 'gz', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Mode', choices: [['de', 'Decompress (Base64/hex in)'], ['gzip', 'Gzip → Base64'], ['deflate', 'Zlib → Base64'], ['deflate-raw', 'Raw deflate → Base64']] }],
    sample: { input: 'H4sIAAAAAAAACvNIzcnJVyjPL8pJAQBSntaLCwAAAA==', options: { dir: 'de' } },
    run: async (s, v) => {
        if (v.dir !== 'de') return bytesToBase64(await compress(toUtf8(s), v.dir as 'gzip'));
        const r = await autoDecompress(hexOrBase64ToBytes(s));
        return tryUtf8(r.data) ?? `(binary, ${r.data.length} bytes, hex)\n${bytesToHex(r.data)}`;
    },
    okMessage: (o, _i, v) => (v.dir === 'de' ? 'Decompressed' : `${o.length} Base64 chars`),
});

export const unicodeInspector = textTool({
    prefix: 'uni', inputLabel: 'Text', outputLabel: 'Characters', outputRows: 16,
    options: [{ id: 'mode', label: 'Show', choices: [['all', 'All characters'], ['invisible', 'Invisible only'], ['strip', 'Text with invisibles removed']] }],
    sample: { input: 'Price:\u00A0100\u200B€ — café 👍🏽\uFEFF' },
    run: (s, v) => {
        if (v.mode === 'strip') return stripInvisible(s);
        const chars = inspectUnicode(s).filter(c => v.mode === 'all' || c.invisible);
        const head = `${[...s].length} code points, ${graphemeCount(s)} graphemes, ${s.length} UTF-16 units, ${toUtf8(s).length} UTF-8 bytes\n\n`;
        return head + chars.map(c => `${c.invisible ? '⚠' : ' '} ${c.codePoint.padEnd(8)} ${(c.invisible ? '·' : c.char).padEnd(3)} UTF-8 ${c.utf8.padEnd(12)} ${c.category.padEnd(4)} ${c.name}`).join('\n');
    },
    okMessage: (_o, s) => `${inspectUnicode(s).filter(c => c.invisible).length} invisible character(s)`,
});

export const cssJsFormat = textTool({
    prefix: 'cjs', inputLabel: 'Code', outputLabel: 'Result',
    options: [{ id: 'lang', label: 'Language', choices: [['css', 'CSS / SCSS'], ['js', 'JavaScript']] }, { id: 'mode', label: 'Mode', choices: [['pretty', 'Beautify'], ['min', 'Minify']] }],
    sample: { input: '.btn{color:#fff;background:#0af}\n.btn:hover{background:#08c;transform:translateY(-1px)}', options: { lang: 'css', mode: 'pretty' } },
    run: (s, v) => (v.lang === 'css' ? (v.mode === 'min' ? minifyCss(s) : beautifyCss(s)) : (v.mode === 'min' ? minifyJs(s) : beautifyJs(s))),
    okMessage: (o, i) => `${i.length} → ${o.length} chars`,
});

export const graphqlFormat = textTool({
    prefix: 'gql', inputLabel: 'GraphQL', outputLabel: 'Result',
    options: [{ id: 'mode', label: 'Mode', choices: [['pretty', 'Format'], ['min', 'Minify']] }],
    sample: { input: 'query GetUser($id: ID!){user(id:$id){id name posts(first:5){edges{node{title}}}}}' },
    run: (s, v) => (v.mode === 'min' ? minifyGraphql(s) : formatGraphql(s)),
});

export const dockerfileLint = textTool({
    prefix: 'dfl', inputLabel: 'Dockerfile', outputLabel: 'Findings',
    sample: { input: 'FROM node\nMAINTAINER dev@example.com\nRUN apt-get update\nRUN apt-get install curl\nADD . /app\nWORKDIR app\nENV API_KEY=supersecret\nRUN npm install\nCMD npm start\n' },
    run: s => {
        const issues = lintDockerfile(s);
        if (!issues.length) return 'No issues found ✓';
        const icon = { error: '✗', warning: '⚠', info: 'ℹ' } as const;
        return issues.map(i => `${icon[i.level]} line ${String(i.line).padEnd(3)} ${i.rule.padEnd(11)} ${i.message}`).join('\n');
    },
    okMessage: (o) => (o.startsWith('No issues') ? 'Clean' : `${o.split('\n').length} finding(s)`),
});

export const dockerCompose = textTool({
    prefix: 'dc', inputLabel: 'Input', outputLabel: 'Output',
    options: [{ id: 'dir', label: 'Direction', choices: dir('docker run → compose', 'compose → docker run') }],
    sample: { input: 'docker run -d --name web -p 8080:80 -e NGINX_HOST=example.com -v ./html:/usr/share/nginx/html:ro --restart unless-stopped nginx:1.27', options: { dir: 'a' } },
    run: (s, v) => (v.dir === 'a' ? dockerRunToCompose(s) : composeToDockerRun(s)),
});

