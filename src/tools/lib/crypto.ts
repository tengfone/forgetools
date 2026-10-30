// Crypto-flavoured tools. All local: WebCrypto (renderer and Node 20+) plus hash-wasm.
import {
  createHMAC,
  createMD5,
  createSHA1,
  createSHA256,
  createSHA384,
  createSHA512,
  createSHA3,
  bcrypt,
  bcryptVerify,
  argon2id,
  argon2Verify,
} from 'hash-wasm';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  derToPem,
  fromUtf8,
  hexToBytes,
  pemToDer,
  toUtf8,
  tryUtf8,
} from './bytes';
import { intBytes, intHex, oidName, parseDer, readName, readOid, readSan, type Asn1 } from './asn1';

// ── HMAC ───────────────────────────────────────────────────────────────────

export type HmacAlgo = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'sha3-256';
const HASHERS = {
  md5: () => createMD5(),
  sha1: () => createSHA1(),
  sha256: () => createSHA256(),
  sha384: () => createSHA384(),
  sha512: () => createSHA512(),
  'sha3-256': () => createSHA3(256),
};

export function decodeKey(key: string, enc: 'utf8' | 'hex' | 'base64'): Uint8Array {
  if (enc === 'hex') return hexToBytes(key);
  if (enc === 'base64') return base64ToBytes(key);
  return toUtf8(key);
}

export async function hmac(message: string, key: Uint8Array, algo: HmacAlgo): Promise<Uint8Array> {
  const h = await createHMAC(HASHERS[algo](), key);
  h.init();
  h.update(toUtf8(message));
  return h.digest('binary');
}

export async function hmacAll(
  message: string,
  key: Uint8Array,
  algo: HmacAlgo,
): Promise<{ hex: string; base64: string; base64url: string }> {
  const d = await hmac(message, key, algo);
  return { hex: bytesToHex(d), base64: bytesToBase64(d), base64url: bytesToBase64Url(d) };
}

/** Compare an expected signature (hex, Base64 or Base64URL; optional "sha256=" / "v1=" prefix). */
export async function hmacVerify(
  message: string,
  key: Uint8Array,
  algo: HmacAlgo,
  signature: string,
): Promise<boolean> {
  const sig = signature.trim().replace(/^(sha\d+|v\d+)=/i, '');
  const d = await hmac(message, key, algo);
  return (
    bytesToHex(d) === sig.toLowerCase() || bytesToBase64(d) === sig || bytesToBase64Url(d) === sig.replace(/=+$/, '')
  );
}

// ── JWT signing ────────────────────────────────────────────────────────────

export type JwtAlg =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'ES256'
  | 'ES384'
  | 'EdDSA'
  | 'none';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const b64urlJson = (o: unknown): string => bytesToBase64Url(toUtf8(JSON.stringify(o)));

function pkcs8From(pem: string): Uint8Array {
  const { label, der } = pemToDer(pem);
  if (label === 'PRIVATE KEY') return der;
  if (label === 'RSA PRIVATE KEY') return wrapPkcs1(der);
  throw new Error(`Unsupported key "${label}". Use a PKCS#8 "PRIVATE KEY" (or "RSA PRIVATE KEY") PEM.`);
}

/** Wrap a PKCS#1 RSAPrivateKey into PKCS#8. */
function wrapPkcs1(der: Uint8Array): Uint8Array {
  const algId = hexToBytes('300d06092a864886f70d0101010500');
  const octet = tlv(0x04, der);
  return tlv(0x30, concat(hexToBytes('020100'), algId, octet));
}

export function tlv(tag: number, content: Uint8Array): Uint8Array {
  const n = content.length;
  const len =
    n < 0x80
      ? [n]
      : n < 0x100
        ? [0x81, n]
        : n < 0x10000
          ? [0x82, n >> 8, n & 0xff]
          : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff];
  return concat(Uint8Array.from([tag, ...len]), content);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const SIGN_PARAMS: Record<
  Exclude<JwtAlg, 'none' | `HS${string}`>,
  { imp: RsaHashedImportParams | EcKeyImportParams | Algorithm; sign: AlgorithmIdentifier | RsaPssParams | EcdsaParams }
> = {
  RS256: { imp: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, sign: { name: 'RSASSA-PKCS1-v1_5' } },
  RS384: { imp: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, sign: { name: 'RSASSA-PKCS1-v1_5' } },
  RS512: { imp: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, sign: { name: 'RSASSA-PKCS1-v1_5' } },
  PS256: { imp: { name: 'RSA-PSS', hash: 'SHA-256' }, sign: { name: 'RSA-PSS', saltLength: 32 } },
  ES256: { imp: { name: 'ECDSA', namedCurve: 'P-256' }, sign: { name: 'ECDSA', hash: 'SHA-256' } },
  ES384: { imp: { name: 'ECDSA', namedCurve: 'P-384' }, sign: { name: 'ECDSA', hash: 'SHA-384' } },
  EdDSA: { imp: { name: 'Ed25519' }, sign: { name: 'Ed25519' } },
};

export async function signJwt(
  header: Record<string, unknown>,
  payload: unknown,
  alg: JwtAlg,
  secret: string,
  secretEnc: 'utf8' | 'base64' = 'utf8',
): Promise<string> {
  const h = { ...header, alg };
  if (!('typ' in h)) (h as Record<string, unknown>).typ = 'JWT';
  const signingInput = `${b64urlJson(h)}.${b64urlJson(payload)}`;
  if (alg === 'none') return signingInput + '.';
  if (alg.startsWith('HS')) {
    if (!secret) throw new Error('Enter a secret to sign HS* tokens');
    const algo = ({ HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' } as const)[alg as 'HS256'];
    const sig = await hmac(signingInput, decodeKey(secret, secretEnc), algo);
    return `${signingInput}.${bytesToBase64Url(sig)}`;
  }
  const p = SIGN_PARAMS[alg as keyof typeof SIGN_PARAMS];
  if (!secret.includes('-----BEGIN')) throw new Error(`${alg} needs a PEM private key`);
  let key: CryptoKey;
  try {
    key = await subtle().importKey('pkcs8', pkcs8From(secret) as BufferSource, p.imp, false, ['sign']);
  } catch (e) {
    throw new Error(
      `Could not import the private key for ${alg}: ${(e as Error).message || 'key type does not match the algorithm'}`,
    );
  }
  const sig = new Uint8Array(await subtle().sign(p.sign, key, toUtf8(signingInput)));
  return `${signingInput}.${bytesToBase64Url(sig)}`;
}

export async function verifyJwt(
  token: string,
  secretOrPem: string,
  secretEnc: 'utf8' | 'base64' = 'utf8',
): Promise<boolean> {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('A JWT has three dot-separated parts');
  const header = JSON.parse(fromUtf8(base64ToBytes(parts[0]!))) as { alg: JwtAlg };
  const input = toUtf8(`${parts[0]}.${parts[1]}`);
  const sig = base64ToBytes(parts[2]!);
  if (header.alg.startsWith('HS')) {
    const algo = ({ HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' } as const)[header.alg as 'HS256'];
    return (
      bytesToHex(await hmac(`${parts[0]}.${parts[1]}`, decodeKey(secretOrPem, secretEnc), algo)) === bytesToHex(sig)
    );
  }
  const p = SIGN_PARAMS[header.alg as keyof typeof SIGN_PARAMS];
  if (!p) throw new Error(`Unsupported alg ${header.alg}`);
  const { der } = pemToDer(secretOrPem, 'PUBLIC KEY');
  const key = await subtle().importKey('spki', der as BufferSource, p.imp, false, ['verify']);
  return subtle().verify(p.sign, key, sig, input);
}

// ── Key pairs ──────────────────────────────────────────────────────────────

export type KeyType = 'rsa-2048' | 'rsa-3072' | 'rsa-4096' | 'ec-p256' | 'ec-p384' | 'ed25519';

export interface KeyPairOut {
  privatePem: string;
  publicPem: string;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  ssh?: string;
}

const sshString = (b: Uint8Array): Uint8Array => {
  const l = b.length;
  return concat(Uint8Array.from([l >>> 24, (l >> 16) & 255, (l >> 8) & 255, l & 255]), b);
};
const sshMpint = (b: Uint8Array): Uint8Array => sshString(b[0]! & 0x80 ? concat(Uint8Array.of(0), b) : b);

export async function generateKeyPair(type: KeyType, comment = 'forgetools'): Promise<KeyPairOut> {
  let alg: RsaHashedKeyGenParams | EcKeyGenParams | Algorithm;
  if (type.startsWith('rsa'))
    alg = {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: +type.split('-')[1]!,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    };
  else if (type === 'ed25519') alg = { name: 'Ed25519' };
  else alg = { name: 'ECDSA', namedCurve: type === 'ec-p256' ? 'P-256' : 'P-384' };
  const kp = (await subtle().generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', kp.privateKey));
  const spki = new Uint8Array(await subtle().exportKey('spki', kp.publicKey));
  const publicJwk = await subtle().exportKey('jwk', kp.publicKey);
  const privateJwk = await subtle().exportKey('jwk', kp.privateKey);
  let ssh: string | undefined;
  if (type === 'ed25519') {
    const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
    ssh = `ssh-ed25519 ${bytesToBase64(concat(sshString(toUtf8('ssh-ed25519')), sshString(raw)))} ${comment}`;
  } else if (type.startsWith('rsa')) {
    const e = base64ToBytes(publicJwk.e!),
      n = base64ToBytes(publicJwk.n!);
    ssh = `ssh-rsa ${bytesToBase64(concat(sshString(toUtf8('ssh-rsa')), sshMpint(e), sshMpint(n)))} ${comment}`;
  } else {
    const curve = type === 'ec-p256' ? 'nistp256' : 'nistp384';
    const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
    ssh = `ecdsa-sha2-${curve} ${bytesToBase64(concat(sshString(toUtf8(`ecdsa-sha2-${curve}`)), sshString(toUtf8(curve)), sshString(raw)))} ${comment}`;
  }
  return {
    privatePem: derToPem(pkcs8, 'PRIVATE KEY'),
    publicPem: derToPem(spki, 'PUBLIC KEY'),
    publicJwk,
    privateJwk,
    ssh,
  };
}

// ── PEM <-> JWK ────────────────────────────────────────────────────────────

const CURVE_BY_OID: Record<string, { crv: string; size: number }> = {
  '1.2.840.10045.3.1.7': { crv: 'P-256', size: 32 },
  '1.3.132.0.34': { crv: 'P-384', size: 48 },
  '1.3.132.0.35': { crv: 'P-521', size: 66 },
};
const b64u = bytesToBase64Url;
const pad = (b: Uint8Array, n: number): Uint8Array => (b.length >= n ? b : concat(new Uint8Array(n - b.length), b));

/** Parse SubjectPublicKeyInfo DER into a JWK (no WebCrypto needed, so any curve/size works). */
export function spkiToJwk(der: Uint8Array): JsonWebKey {
  const spki = parseDer(der);
  const [algId, bitStr] = spki.children ?? [];
  if (!algId?.children || !bitStr) throw new Error('Not a SubjectPublicKeyInfo structure');
  const oid = readOid(algId.children[0]!.content);
  const key = bitStr.content.subarray(1);
  if (oid === '1.2.840.113549.1.1.1') {
    const rsa = parseDer(key);
    const [n, e] = rsa.children!;
    return { kty: 'RSA', n: b64u(intBytes(n!)), e: b64u(intBytes(e!)) };
  }
  if (oid === '1.2.840.10045.2.1') {
    const c = CURVE_BY_OID[readOid(algId.children[1]!.content)];
    if (!c) throw new Error('Unsupported EC curve');
    if (key[0] !== 4) throw new Error('Compressed EC points are not supported');
    return { kty: 'EC', crv: c.crv, x: b64u(key.subarray(1, 1 + c.size)), y: b64u(key.subarray(1 + c.size)) };
  }
  if (oid === '1.3.101.112') return { kty: 'OKP', crv: 'Ed25519', x: b64u(key) };
  if (oid === '1.3.101.110') return { kty: 'OKP', crv: 'X25519', x: b64u(key) };
  throw new Error(`Unsupported key algorithm ${oidName(oid)}`);
}

export function pkcs8ToJwk(der: Uint8Array): JsonWebKey {
  const p8 = parseDer(der);
  const [, algId, octet] = p8.children ?? [];
  if (!algId?.children || !octet) throw new Error('Not a PKCS#8 PrivateKeyInfo structure');
  const oid = readOid(algId.children[0]!.content);
  if (oid === '1.2.840.113549.1.1.1') {
    const k = parseDer(octet.content).children!;
    const [n, e, d, p, q, dp, dq, qi] = k.slice(1).map((x) => b64u(intBytes(x)));
    return { kty: 'RSA', n, e, d, p, q, dp, dq, qi };
  }
  if (oid === '1.2.840.10045.2.1') {
    const c = CURVE_BY_OID[readOid(algId.children[1]!.content)];
    if (!c) throw new Error('Unsupported EC curve');
    const ec = parseDer(octet.content).children!;
    const d = pad(ec[1]!.content, c.size);
    const pubTag = ec.find((x) => x.cls === 2 && x.num === 1);
    const jwk: JsonWebKey = { kty: 'EC', crv: c.crv, d: b64u(d) };
    if (pubTag) {
      const pt = pubTag.children![0]!.content.subarray(1);
      jwk.x = b64u(pt.subarray(1, 1 + c.size));
      jwk.y = b64u(pt.subarray(1 + c.size));
    }
    return jwk;
  }
  if (oid === '1.3.101.112') return { kty: 'OKP', crv: 'Ed25519', d: b64u(parseDer(octet.content).content) };
  throw new Error(`Unsupported key algorithm ${oidName(oid)}`);
}

export function pemToJwk(pem: string): JsonWebKey {
  const { label, der } = pemToDer(pem);
  if (label === 'PUBLIC KEY') return spkiToJwk(der);
  if (label === 'PRIVATE KEY') return pkcs8ToJwk(der);
  if (label === 'RSA PRIVATE KEY') return pkcs8ToJwk(wrapPkcs1(der));
  if (label === 'CERTIFICATE') {
    const tbs = parseDer(der).children![0]!;
    const fields = tbs.children!;
    const off = fields[0]!.cls === 2 ? 1 : 0;
    return spkiToJwk(fields[off + 5]!.bytes);
  }
  throw new Error(`Unsupported PEM type "${label}"`);
}

/** JWK -> PEM via WebCrypto import/export. */
export async function jwkToPem(jwk: JsonWebKey): Promise<string> {
  const isPrivate = 'd' in jwk;
  let alg: RsaHashedImportParams | EcKeyImportParams | Algorithm;
  if (jwk.kty === 'RSA') alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  else if (jwk.kty === 'EC') alg = { name: 'ECDSA', namedCurve: jwk.crv! };
  else if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') alg = { name: 'Ed25519' };
  else throw new Error(`Unsupported JWK kty/crv: ${jwk.kty}/${jwk.crv ?? ''}`);
  const clean: JsonWebKey = { ...jwk };
  delete clean.alg;
  delete clean.use;
  delete clean.key_ops;
  delete (clean as Record<string, unknown>).kid;
  const key = await subtle().importKey('jwk', clean, alg, true, isPrivate ? ['sign'] : ['verify']);
  const der = new Uint8Array(await subtle().exportKey(isPrivate ? 'pkcs8' : 'spki', key));
  return derToPem(der, isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY');
}

// ── CSR ────────────────────────────────────────────────────────────────────

export interface CsrInfo {
  subject: string;
  keyAlgorithm: string;
  keySize?: number;
  curve?: string;
  signatureAlgorithm: string;
  san: string[];
  publicKeyJwk: JsonWebKey;
}

export function decodeCsr(pem: string): CsrInfo {
  const { der } = pemToDer(pem.replace(/NEW CERTIFICATE REQUEST/g, 'CERTIFICATE REQUEST'), 'CERTIFICATE REQUEST');
  const csr = parseDer(der);
  const [info, sigAlg] = csr.children ?? [];
  if (!info?.children || !sigAlg?.children) throw new Error('Not a PKCS#10 certification request');
  const [, subject, spki, attrs] = info.children;
  const algIdKids = spki!.children![0]!.children!;
  const keyAlgorithm = oidName(readOid(algIdKids[0]!.content));
  const jwk = spkiToJwk(spki!.bytes);
  const san: string[] = [];
  for (const attr of attrs?.children ?? []) {
    if (readOid(attr.children![0]!.content) !== '1.2.840.113549.1.9.14') continue;
    for (const ext of attr.children![1]!.children![0]!.children ?? []) {
      if (readOid(ext.children![0]!.content) === '2.5.29.17')
        san.push(...readSan(ext.children![ext.children!.length - 1]!.content));
    }
  }
  return {
    subject: readName(subject!),
    keyAlgorithm,
    keySize: jwk.kty === 'RSA' ? base64ToBytes(jwk.n!).length * 8 : undefined,
    curve: jwk.crv,
    signatureAlgorithm: oidName(readOid(sigAlg.children[0]!.content)),
    san,
    publicKeyJwk: jwk,
  };
}

// ── Password strength ──────────────────────────────────────────────────────

const COMMON = new Set(
  (
    'password 123456 12345678 qwerty abc123 111111 123123 letmein welcome monkey dragon iloveyou admin ' +
    'login princess football baseball master sunshine shadow trustno1 passw0rd starwars 1234567890 hello freedom whatever ' +
    'qazwsx zaq12wsx password1 superman batman 000000 654321 michael charlie'
  ).split(' '),
);

export interface Strength {
  entropy: number;
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  crackTime: string;
  warnings: string[];
}

export function humanDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec > 1e18) return 'centuries+';
  const units: Array<[number, string]> = [
    [31557600 * 100, 'centuries'],
    [31557600, 'years'],
    [2629800, 'months'],
    [86400, 'days'],
    [3600, 'hours'],
    [60, 'minutes'],
    [1, 'seconds'],
  ];
  for (const [s, n] of units) if (sec >= s) return `${Math.round(sec / s).toLocaleString('en-US')} ${n}`;
  return 'instant';
}

export function passwordStrength(pw: string, guessesPerSecond = 1e10): Strength {
  const warnings: string[] = [];
  if (!pw) return { entropy: 0, score: 0, label: 'Empty', crackTime: 'instant', warnings };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  if (/[^\p{ASCII}]/u.test(pw)) pool += 100;
  let entropy = [...pw].length * Math.log2(pool || 1);
  const lower = pw.toLowerCase();
  const leet = lower
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't');
  if (COMMON.has(lower) || COMMON.has(leet) || COMMON.has(leet.replace(/\d+$/, ''))) {
    warnings.push('This is a very common password');
    entropy = Math.min(entropy, 10);
  }
  if (/(.)\1{2,}/.test(pw)) {
    warnings.push('Avoid repeated characters (aaa, 111)');
    entropy *= 0.8;
  }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|wert|asdf|sdfg|zxcv)/i.test(pw)) {
    warnings.push('Avoid sequences like 1234, abcd or qwerty');
    entropy *= 0.8;
  }
  if (/^(19|20)\d{2}$/.test(pw.slice(-4))) warnings.push('Years at the end are easy to guess');
  if (pw.length < 8) warnings.push('Use at least 12 characters');
  else if (pw.length < 12) warnings.push('Longer is stronger: aim for 12+ characters');
  if (pool <= 26 && pw.length < 16) warnings.push('Mix in upper case, digits or symbols, or use a longer passphrase');
  const score = entropy < 28 ? 0 : entropy < 36 ? 1 : entropy < 60 ? 2 : entropy < 80 ? 3 : 4;
  const seconds = Math.pow(2, entropy) / 2 / guessesPerSecond;
  return {
    entropy: Math.round(entropy * 10) / 10,
    score,
    label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]!,
    crackTime: humanDuration(seconds),
    warnings,
  };
}

// ── bcrypt / argon2 ────────────────────────────────────────────────────────

const randomSalt = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export async function bcryptHash(password: string, cost: number): Promise<string> {
  if (cost < 4 || cost > 15) throw new Error('bcrypt cost must be between 4 and 15');
  if (toUtf8(password).length > 72) throw new Error('bcrypt only uses the first 72 bytes of a password');
  return bcrypt({ password, salt: randomSalt(16), costFactor: cost, outputType: 'encoded' });
}

export async function bcryptCheck(password: string, hash: string): Promise<boolean> {
  if (!/^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash.trim()))
    throw new Error('Not a bcrypt hash ($2a$/$2b$/$2y$...)');
  return bcryptVerify({ password, hash: hash.trim().replace(/^\$2[xy]\$/, '$2b$') });
}

export async function argon2Hash(
  password: string,
  opts: { memoryKiB: number; iterations: number; parallelism: number },
): Promise<string> {
  return argon2id({
    password,
    salt: randomSalt(16),
    iterations: opts.iterations,
    parallelism: opts.parallelism,
    memorySize: opts.memoryKiB,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function argon2Check(password: string, hash: string): Promise<boolean> {
  if (!hash.trim().startsWith('$argon2')) throw new Error('Not an Argon2 hash ($argon2id$...)');
  return argon2Verify({ password, hash: hash.trim() });
}

// ── Inflate / SAML ─────────────────────────────────────────────────────────

export type Compression = 'gzip' | 'deflate' | 'deflate-raw';

export async function decompress(bytes: Uint8Array, format: Compression): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  try {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error(`Data is not valid ${format}`);
  }
}

export async function compress(bytes: Uint8Array, format: Compression): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Detect gzip (1f 8b), zlib (78 xx) or fall back to raw deflate. */
export function sniffCompression(b: Uint8Array): Compression {
  if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
  if (b[0] === 0x78 && ((b[0] << 8) | b[1]!) % 31 === 0) return 'deflate';
  return 'deflate-raw';
}

export async function autoDecompress(b: Uint8Array): Promise<{ format: Compression; data: Uint8Array }> {
  const first = sniffCompression(b);
  const order: Compression[] = [
    first,
    ...(['gzip', 'deflate', 'deflate-raw'] as Compression[]).filter((f) => f !== first),
  ];
  for (const f of order) {
    try {
      return { format: f, data: await decompress(b, f) };
    } catch {
      /* try next */
    }
  }
  throw new Error('Data is not gzip, zlib or raw deflate');
}

export function prettyXml(xml: string, indent = '  '): string {
  const tokens = xml
    .replace(/>\s+</g, '><')
    .trim()
    .split(/(<[^>]+>)/)
    .filter((t) => t.length);
  let depth = 0;
  const lines: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^<\//.test(t)) {
      depth = Math.max(0, depth - 1);
      lines.push(indent.repeat(depth) + t);
    } else if (/^<[^!?][^>]*[^/]>$|^<[a-zA-Z]>$/.test(t)) {
      const text = tokens[i + 1],
        close = tokens[i + 2];
      if (text && !text.startsWith('<') && close && /^<\//.test(close)) {
        lines.push(indent.repeat(depth) + t + text.trim() + close);
        i += 2;
      } else {
        lines.push(indent.repeat(depth) + t);
        depth++;
      }
    } else lines.push(indent.repeat(depth) + t.trim());
  }
  return lines.join('\n');
}

/** Decode SAMLRequest / SAMLResponse: URL-decode, Base64, then inflate if needed (HTTP-Redirect binding). */
export async function decodeSaml(input: string): Promise<{ xml: string; binding: 'POST' | 'Redirect' }> {
  let s = input.trim();
  const m = /[?&]SAML(?:Request|Response)=([^&\s]+)/.exec(s);
  if (m) s = m[1]!;
  if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s);
  const bytes = base64ToBytes(s);
  const asText = tryUtf8(bytes);
  if (asText && /^\s*</.test(asText)) return { xml: prettyXml(asText), binding: 'POST' };
  const inflated = await decompress(bytes, 'deflate-raw').catch(() => {
    throw new Error('Decoded data is neither XML nor raw-deflated XML');
  });
  return { xml: prettyXml(fromUtf8(inflated)), binding: 'Redirect' };
}

export { intHex, readName, parseDer, type Asn1 };
