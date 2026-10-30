import { describe, it, expect } from 'vitest';
import {
  hmacAll,
  hmacVerify,
  decodeKey,
  signJwt,
  verifyJwt,
  generateKeyPair,
  pemToJwk,
  jwkToPem,
  decodeCsr,
  passwordStrength,
  bcryptHash,
  bcryptCheck,
  argon2Hash,
  argon2Check,
  compress,
  decompress,
  autoDecompress,
  decodeSaml,
} from '../../src/tools/lib/crypto';
import { base64ToBytes, bytesToBase64, fromUtf8, toUtf8 } from '../../src/tools/lib/bytes';
import { SAMPLE_CSR_EC, SAMPLE_CSR_RSA } from '../../src/tools/lib/samples';

describe('HMAC', () => {
  it('matches RFC 4231 test case 2', async () => {
    const r = await hmacAll('what do ya want for nothing?', toUtf8('Jefe'), 'sha256');
    expect(r.hex).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('known MD5/SHA-1/SHA-512 vectors', async () => {
    const k = toUtf8('key'),
      m = 'The quick brown fox jumps over the lazy dog';
    expect((await hmacAll(m, k, 'md5')).hex).toBe('80070713463e7749b90c2dc24911e275');
    expect((await hmacAll(m, k, 'sha1')).hex).toBe('de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9');
    expect((await hmacAll(m, k, 'sha512')).hex).toMatch(
      /^b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb/,
    );
  });
  it('verifies hex, prefixed and base64 signatures', async () => {
    const k = toUtf8('Jefe'),
      m = 'what do ya want for nothing?';
    const r = await hmacAll(m, k, 'sha256');
    expect(await hmacVerify(m, k, 'sha256', r.hex.toUpperCase())).toBe(true);
    expect(await hmacVerify(m, k, 'sha256', 'sha256=' + r.hex)).toBe(true);
    expect(await hmacVerify(m, k, 'sha256', r.base64)).toBe(true);
    expect(await hmacVerify(m, k, 'sha256', 'deadbeef')).toBe(false);
  });
  it('decodes keys', () => {
    expect([...decodeKey('0a0b', 'hex')]).toEqual([10, 11]);
    expect(fromUtf8(decodeKey('aGk=', 'base64'))).toBe('hi');
    expect(() => decodeKey('zz', 'hex')).toThrow();
  });
});

describe('JWT signing', () => {
  it('HS256 matches the jwt.io example', async () => {
    const t = await signJwt(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '1234567890', name: 'John Doe', iat: 1516239022 },
      'HS256',
      'your-256-bit-secret',
    );
    expect(t).toBe(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    );
    expect(await verifyJwt(t, 'your-256-bit-secret')).toBe(true);
    expect(await verifyJwt(t, 'wrong')).toBe(false);
  });
  it('none alg', async () => {
    expect(await signJwt({}, { a: 1 }, 'none', '')).toMatch(/^[\w-]+\.[\w-]+\.$/);
  });
  it.each(['RS256', 'ES256', 'EdDSA', 'PS256'] as const)('%s sign + verify with generated keys', async (alg) => {
    const type = alg === 'ES256' ? 'ec-p256' : alg === 'EdDSA' ? 'ed25519' : 'rsa-2048';
    const kp = await generateKeyPair(type);
    const t = await signJwt({}, { sub: 'x' }, alg, kp.privatePem);
    expect((JSON.parse(fromUtf8(base64ToBytes(t.split('.')[0]!))) as { alg: string }).alg).toBe(alg);
    expect(await verifyJwt(t, kp.publicPem)).toBe(true);
  });
  it('errors without a secret / with wrong key type', async () => {
    await expect(signJwt({}, {}, 'HS256', '')).rejects.toThrow(/secret/);
    await expect(signJwt({}, {}, 'RS256', 'nope')).rejects.toThrow(/PEM/);
    const ec = await generateKeyPair('ec-p256');
    await expect(signJwt({}, {}, 'RS256', ec.privatePem)).rejects.toThrow(/import/);
  });
});

describe('Key pairs and PEM <-> JWK', () => {
  it.each(['rsa-2048', 'ec-p256', 'ec-p384', 'ed25519'] as const)('%s', async (type) => {
    const kp = await generateKeyPair(type, 'me@host');
    expect(kp.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/);
    expect(kp.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(kp.ssh).toMatch(/^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(256|384)) [A-Za-z0-9+/=]+ me@host$/);
    // PEM -> JWK must match WebCrypto's own JWK export
    const pub = pemToJwk(kp.publicPem);
    for (const k of ['kty', 'crv', 'x', 'y', 'n', 'e'] as const) expect(pub[k]).toEqual(kp.publicJwk[k]);
    const priv = pemToJwk(kp.privatePem);
    expect(priv.d).toEqual(kp.privateJwk.d);
    // JWK -> PEM round-trips
    expect(await jwkToPem(kp.publicJwk)).toBe(kp.publicPem);
  });
  it('rejects unknown PEMs', () => {
    expect(() => pemToJwk('-----BEGIN FOO-----\nAAAA\n-----END FOO-----')).toThrow(/Unsupported/);
    expect(() => pemToJwk('hello')).toThrow(/PEM/);
  });
});

describe('CSR decoder', () => {
  it('decodes an EC CSR with SANs', () => {
    const c = decodeCsr(SAMPLE_CSR_EC);
    expect(c.subject).toBe('CN=forgetools.example, O=ForgeTools');
    expect(c.keyAlgorithm).toBe('ecPublicKey');
    expect(c.curve).toBe('P-256');
    expect(c.signatureAlgorithm).toBe('ecdsa-with-SHA256');
    expect(c.san).toEqual(['DNS:forgetools.example', 'DNS:www.forgetools.example', 'IP:10.0.0.1']);
  });
  it('decodes an RSA CSR', () => {
    const c = decodeCsr(SAMPLE_CSR_RSA);
    expect(c.subject).toBe('CN=rsa.example');
    expect(c.keySize).toBe(2048);
    expect(c.signatureAlgorithm).toBe('sha256WithRSAEncryption');
    expect(c.san).toEqual([]);
  });
  it('rejects non-CSR input', () => {
    expect(() => decodeCsr('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----')).toThrow(
      /CERTIFICATE REQUEST/,
    );
  });
});

describe('Password strength', () => {
  it('scores weak and strong passwords', () => {
    expect(passwordStrength('password').score).toBe(0);
    expect(passwordStrength('password').warnings.join()).toMatch(/common/);
    expect(passwordStrength('P@ssw0rd').score).toBe(0);
    expect(passwordStrength('aaaaaa').warnings.join()).toMatch(/repeated/);
    const strong = passwordStrength('correct-Horse-battery-staple-91!');
    expect(strong.score).toBe(4);
    expect(strong.crackTime).toMatch(/centuries/);
    expect(passwordStrength('').label).toBe('Empty');
  });
});

describe('bcrypt / argon2', () => {
  it('bcrypt hash + verify', async () => {
    const h = await bcryptHash('hunter2', 4);
    expect(h).toMatch(/^\$2[aby]\$04\$/);
    expect(await bcryptCheck('hunter2', h)).toBe(true);
    expect(await bcryptCheck('nope', h)).toBe(false);
    // $2y$ (PHP) prefix is accepted
    expect(await bcryptCheck('hunter2', h.replace(/^\$2[ab]\$/, '$2y$'))).toBe(true);
    await expect(bcryptCheck('x', 'not-a-hash')).rejects.toThrow(/bcrypt/);
    await expect(bcryptHash('x', 99)).rejects.toThrow(/cost/);
  });
  it('argon2id hash + verify', async () => {
    const h = await argon2Hash('hunter2', { memoryKiB: 1024, iterations: 2, parallelism: 1 });
    expect(h).toMatch(/^\$argon2id\$v=19\$m=1024,t=2,p=1\$/);
    expect(await argon2Check('hunter2', h)).toBe(true);
    expect(await argon2Check('nope', h)).toBe(false);
  });
});

describe('Compression and SAML', () => {
  it('gzip/deflate round-trip and sniffing', async () => {
    for (const f of ['gzip', 'deflate', 'deflate-raw'] as const) {
      const c = await compress(toUtf8('hello hello hello'), f);
      expect(fromUtf8(await decompress(c, f))).toBe('hello hello hello');
      const auto = await autoDecompress(c);
      expect(auto.format).toBe(f);
    }
    await expect(autoDecompress(toUtf8('plain text, not compressed'))).rejects.toThrow(/not gzip/);
  });
  it('decodes POST and Redirect bindings', async () => {
    const xml =
      '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_1"><saml:Issuer>idp</saml:Issuer></samlp:Response>';
    const post = await decodeSaml(bytesToBase64(toUtf8(xml)));
    expect(post.binding).toBe('POST');
    expect(post.xml).toContain('  <saml:Issuer>idp</saml:Issuer>');
    const deflated = bytesToBase64(await compress(toUtf8(xml), 'deflate-raw'));
    const redir = await decodeSaml(`https://idp/sso?SAMLRequest=${encodeURIComponent(deflated)}&RelayState=x`);
    expect(redir.binding).toBe('Redirect');
    expect(redir.xml).toContain('<samlp:Response');
  });
});
