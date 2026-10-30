// Update check: the app's ONLY network request. It is opt-in: a manual "Check for updates"
// button, plus an automatic daily check that is off by default. It asks GitHub for the
// latest *published* release (drafts/pre-releases excluded) and compares versions.
// No in-place install: the user is linked to the release page.
import { isNewer, parseVersion } from './version';
import { RELEASE_PREFIX } from './links';

export interface UpdatePrefs {
  autoCheck: boolean;
}
export interface UpdateCheckResult {
  current: string;
  /** Latest published version without the "v" (null when never checked). */
  latest: string | null;
  available: boolean;
  checkedAt: number;
}

declare const __APP_VERSION__: string;
const LATEST_URL = 'https://api.github.com/repos/tengfone/forgetools/releases/latest';
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = 'forge-updates';

interface Stored {
  autoCheck: boolean;
  lastCheck: number;
  latest: string | null;
  latestUrl: string | null;
}
const DEFAULTS: Stored = { autoCheck: false, lastCheck: 0, latest: null, latestUrl: null };

export interface UpdateEnv {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  fetch: typeof fetch;
  now: () => number;
  current: () => string;
  /** E2E runs never touch the network automatically. */
  isE2E: () => boolean;
}

/** Process-wide options; set once at bootstrap (app.ts) before any update check runs. */
const options = { isE2E: false };
export function configureUpdates(o: Partial<typeof options>): void {
  Object.assign(options, o);
}

const defaultEnv = (): UpdateEnv => ({
  storage: localStorage,
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
  current: () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'),
  isE2E: () => options.isE2E,
});

export interface Updates {
  /** Manual check: always asks GitHub, rejects on failure. */
  check(): Promise<UpdateCheckResult>;
  getPrefs(): UpdatePrefs;
  setPrefs(patch: Partial<UpdatePrefs>): UpdatePrefs;
  /** Startup check: only hits the network when opted in and >24h since the last check. */
  auto(): Promise<UpdateCheckResult | null>;
  /** The release page to open: the cached latest release, else /releases/latest. */
  releaseUrl(): string;
}

export function createUpdates(env: UpdateEnv = defaultEnv()): Updates {
  const load = (): Stored => {
    try {
      const raw = JSON.parse(env.storage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
      if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
      return {
        autoCheck: raw.autoCheck === true,
        lastCheck: typeof raw.lastCheck === 'number' && Number.isFinite(raw.lastCheck) ? raw.lastCheck : 0,
        latest: typeof raw.latest === 'string' ? raw.latest : null,
        latestUrl: typeof raw.latestUrl === 'string' && raw.latestUrl.startsWith(RELEASE_PREFIX) ? raw.latestUrl : null,
      };
    } catch {
      return { ...DEFAULTS };
    }
  };
  let prefs = load();
  const save = (): void => {
    try {
      env.storage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* non-fatal */
    }
  };

  const result = (checkedAt: number): UpdateCheckResult => ({
    current: env.current(),
    latest: prefs.latest,
    available: !!prefs.latest && isNewer(prefs.latest, env.current()),
    checkedAt,
  });

  async function fetchLatest(): Promise<UpdateCheckResult> {
    const res = await env.fetch(LATEST_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000), // never leave the button stuck on "Checking…"
    });
    if (res.status === 404) throw new Error('No published release found');
    if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached, try again later');
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const tag = typeof body.tag_name === 'string' ? body.tag_name : '';
    if (!parseVersion(tag)) throw new Error('Unexpected response from GitHub');
    const url = typeof body.html_url === 'string' && body.html_url.startsWith(RELEASE_PREFIX) ? body.html_url : null;
    prefs = { ...prefs, lastCheck: env.now(), latest: tag.replace(/^v/, ''), latestUrl: url };
    save();
    return result(prefs.lastCheck);
  }

  let inflight: Promise<UpdateCheckResult> | null = null;
  /** Manual check: always asks GitHub, rejects on failure. */
  const check = (): Promise<UpdateCheckResult> =>
    (inflight ??= fetchLatest().finally(() => {
      inflight = null;
    }));

  return {
    check,
    getPrefs: (): UpdatePrefs => ({ autoCheck: prefs.autoCheck }),
    setPrefs: (patch: Partial<UpdatePrefs>): UpdatePrefs => {
      if (typeof patch?.autoCheck === 'boolean') {
        prefs = { ...prefs, autoCheck: patch.autoCheck };
        save();
      }
      return { autoCheck: prefs.autoCheck };
    },
    /** Startup check: only hits the network when opted in and >24h since the last check. */
    async auto(): Promise<UpdateCheckResult | null> {
      if (!prefs.autoCheck || env.isE2E()) return prefs.latest ? result(prefs.lastCheck) : null;
      if (env.now() - prefs.lastCheck < DAY_MS) return prefs.latest ? result(prefs.lastCheck) : null;
      try {
        return await check();
      } catch {
        // Silent when automatic; still count the attempt so a failing check isn't retried every launch.
        prefs = { ...prefs, lastCheck: env.now() };
        save();
        return null;
      }
    },
    /** The release page to open: the cached latest release, else /releases/latest. */
    releaseUrl: (): string => prefs.latestUrl ?? `${RELEASE_PREFIX}latest`,
  };
}

let instance: Updates | null = null;
export const updates = (): Updates => (instance ??= createUpdates());
export const releaseUrl = (): string => updates().releaseUrl();
