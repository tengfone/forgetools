import { describe, it, expect } from 'vitest';
import { isNewer, parseVersion } from '../../src/main/version';

describe('update version compare', () => {
  it('parses tags with or without v and ignores suffixes', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.0-beta.1')).toEqual([0, 10, 0]);
    expect(parseVersion('nightly')).toBeNull();
  });
  it('compares numerically, not lexically', () => {
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('0.2.1', '0.2.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  });
  it('is false for equal, older or unparseable versions', () => {
    expect(isNewer('v0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
    expect(isNewer('garbage', '0.2.0')).toBe(false);
  });
});
