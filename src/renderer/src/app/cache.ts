// Result cache for editor tools. Inputs may contain secrets (JWTs, keys), so the cache
// never stores raw input: entries are keyed by a hash, and it is small and short-lived.

/** cyrb53: fast 53-bit non-cryptographic string hash. */
export function fastHash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Inputs larger than this are not cached (hashing + holding output costs more than it saves). */
export const MAX_CACHEABLE_INPUT = 100 * 1024;

export function resultCacheKey(tool: string, mode: string, indent: string, input: string): string {
  return `${tool}:${mode}:${indent}:${input.length}:${fastHash(input)}`;
}

// LRU cache backed by Map insertion order, with TTL expiry
export class LRUCache<K> {
  private cache = new Map<K, { value: string; timestamp: number }>();
  private cleanupThreshold: number;

  constructor(private maxSize = 100, private ttl = 5 * 60 * 1000) {
    // Cleanup when cache is 90% full to avoid frequent cleanup
    this.cleanupThreshold = Math.floor(maxSize * 0.9);
  }

  get(key: K): string | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key: K, value: string): void {
    const now = Date.now();
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: now });
    if (this.cache.size >= this.cleanupThreshold) this.sweepExpired(now);
  }

  /** Drop all expired entries. */
  sweepExpired(now = Date.now()): void {
    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.ttl) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const resultCache = new LRUCache<string>(20, 60 * 1000);
// Periodic sweep so expired outputs don't linger in memory while the app idles
setInterval(() => resultCache.sweepExpired(), 60 * 1000);

/** Typed trailing-edge debounce (no tool-epoch guard; safe for app-shell contexts). */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): (...args: A) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { timeout = undefined; fn(...args); }, wait);
  };
}
