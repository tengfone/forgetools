// Update check: the app's ONLY network request. It is opt-in: a manual "Check for updates"
// button, plus an automatic daily check that is off by default. It asks GitHub for the
// latest *published* release (drafts/pre-releases excluded) and compares versions.
// No in-place install: the renderer links the user to the release page.
import { app, net } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS, type UpdateCheckResult, type UpdatePrefs } from '../types/ipc';
import { handle } from './ipcGuard';
import { isNewer, parseVersion } from './version';

declare const __APP_VERSION__: string;

const LATEST_URL = 'https://api.github.com/repos/tengfone/forgetools/releases/latest';
const RELEASE_PREFIX = 'https://github.com/tengfone/forgetools/releases/';
const DAY_MS = 24 * 60 * 60 * 1000;
const isE2E = !!process.env.FORGE_E2E;

interface Stored { autoCheck: boolean; lastCheck: number; latest: string | null; latestUrl: string | null }
const DEFAULTS: Stored = { autoCheck: false, lastCheck: 0, latest: null, latestUrl: null };
let prefs: Stored = { ...DEFAULTS };

const prefsFile = (): string => path.join(app.getPath('userData'), 'updates.json');

function load(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as Partial<Stored>;
    prefs = {
      autoCheck: raw.autoCheck === true,
      lastCheck: typeof raw.lastCheck === 'number' && Number.isFinite(raw.lastCheck) ? raw.lastCheck : 0,
      latest: typeof raw.latest === 'string' ? raw.latest : null,
      latestUrl: typeof raw.latestUrl === 'string' && raw.latestUrl.startsWith(RELEASE_PREFIX) ? raw.latestUrl : null,
    };
  } catch {
    prefs = { ...DEFAULTS };
  }
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2));
  } catch {
    // Non-fatal
  }
}

const current = (): string => __APP_VERSION__;

function result(checkedAt: number): UpdateCheckResult {
  const latest = prefs.latest;
  return {
    current: current(),
    latest,
    available: !!latest && isNewer(latest, current()),
    checkedAt,
  };
}

async function fetchLatest(): Promise<UpdateCheckResult> {
  const res = await net.fetch(LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ForgeTools/${current()}` },
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
  prefs = { ...prefs, lastCheck: Date.now(), latest: tag.replace(/^v/, ''), latestUrl: url };
  save();
  return result(prefs.lastCheck);
}

let inflight: Promise<UpdateCheckResult> | null = null;
const check = (): Promise<UpdateCheckResult> => (inflight ??= fetchLatest().finally(() => { inflight = null; }));

/** The release page to open: the cached latest release, else /releases/latest. Always a github.com URL. */
export const releaseUrl = (): string => prefs.latestUrl ?? `${RELEASE_PREFIX}latest`;

export function initUpdates(): void {
  load();
  handle(IPC_CHANNELS.UPDATES.GET_PREFS, (): UpdatePrefs => ({ autoCheck: prefs.autoCheck }));
  handle(IPC_CHANNELS.UPDATES.SET_PREFS, (_e, patch: unknown): UpdatePrefs => {
    const p = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {};
    if (typeof p.autoCheck === 'boolean') { prefs = { ...prefs, autoCheck: p.autoCheck }; save(); }
    return { autoCheck: prefs.autoCheck };
  });
  // Manual check: always hits the network and reports errors.
  handle(IPC_CHANNELS.UPDATES.CHECK, () => check());
  // Startup check from the renderer: no network unless opted in, and at most once a day.
  // Otherwise returns the cached result (or null), so a found update is still flagged.
  handle(IPC_CHANNELS.UPDATES.AUTO, async (): Promise<UpdateCheckResult | null> => {
    if (!prefs.autoCheck || isE2E) return prefs.latest ? result(prefs.lastCheck) : null;
    if (Date.now() - prefs.lastCheck < DAY_MS) return prefs.latest ? result(prefs.lastCheck) : null;
    try { return await check(); } catch {
      // Silent when automatic; still count the attempt so a failing check isn't retried every launch.
      prefs = { ...prefs, lastCheck: Date.now() }; save();
      return null;
    }
  });
}
