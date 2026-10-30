// native.ts against mocked Tauri IPC; updates.ts with a mocked fetch.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';
import {
  background,
  clipboard,
  linkUrl,
  EXTERNAL_LINKS,
  appWindow,
  CLIPBOARD_MAX,
  openLink,
} from '../../src/renderer/src/native';
import { createUpdates, type UpdateEnv } from '../../src/renderer/src/updates';

beforeAll(() => {
  // mocks need a window object with crypto (node provides globalThis.crypto)
  (globalThis as unknown as { window: unknown }).window ??= globalThis;
});
afterEach(() => clearMocks());

describe('native bridge', () => {
  it('background commands pass the right names and args', async () => {
    const calls: Array<[string, unknown]> = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'get_background_settings')
        return { keepInBackground: true, openAtLogin: false, globalShortcut: null };
      if (cmd === 'set_global_shortcut')
        return { ok: false, error: 'Shortcut is in use by another app', accelerator: null };
      return { keepInBackground: false, openAtLogin: false, globalShortcut: null };
    });
    expect((await background.get()).keepInBackground).toBe(true);
    await background.set({ keepInBackground: false });
    const r = await background.setGlobalShortcut('Ctrl+Alt+Space');
    expect(r).toEqual({ ok: false, error: 'Shortcut is in use by another app', accelerator: null });
    expect(calls).toEqual([
      ['get_background_settings', {}],
      ['set_background_settings', { patch: { keepInBackground: false } }],
      ['set_global_shortcut', { accelerator: 'Ctrl+Alt+Space' }],
    ]);
  });

  it('clipboard goes through the plugin and caps reads at 20 MiB', async () => {
    let stored = '';
    mockIPC((cmd, args) => {
      if (cmd === 'plugin:clipboard-manager|write_text') {
        stored = (args as { text: string }).text;
        return null;
      }
      if (cmd === 'plugin:clipboard-manager|read_text') return stored;
      return undefined;
    });
    await clipboard.writeText('hello');
    expect(await clipboard.readText()).toBe('hello');
    await expect(clipboard.writeText('x'.repeat(CLIPBOARD_MAX + 1))).rejects.toThrow(/too large/);
    stored = 'y'.repeat(CLIPBOARD_MAX + 10);
    expect((await clipboard.readText()).length).toBe(CLIPBOARD_MAX);
  });

  it('window controls target the current window', async () => {
    mockWindows('main');
    const cmds: string[] = [];
    mockIPC((cmd) => {
      cmds.push(cmd);
    });
    await appWindow.minimize();
    await appWindow.toggleMaximize();
    await appWindow.setTheme(null);
    expect(cmds).toEqual(['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|set_theme']);
  });

  it('external links are allowlisted', async () => {
    const latest = (): string => 'https://github.com/tengfone/forgetools/releases/tag/v9.9.9';
    expect(linkUrl('coffee', latest)).toBe(EXTERNAL_LINKS.coffee);
    expect(linkUrl('latestRelease', latest)).toBe(latest());
    expect(() => linkUrl('https://evil.example', latest)).toThrow('Unknown link');
    expect(() => linkUrl('toString', latest)).toThrow('Unknown link');
    expect(() => linkUrl('latestRelease', () => 'https://evil.example/')).toThrow('Unknown link');
    const opened: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === 'plugin:opener|open_url') opened.push((args as { url: string }).url);
    });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    await openLink('github');
    expect(opened).toEqual([EXTERNAL_LINKS.github]);
    vi.unstubAllGlobals();
  });
});

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}
const res = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });

function env(over: Partial<UpdateEnv> = {}): UpdateEnv & { fetch: ReturnType<typeof vi.fn> } {
  return {
    storage: new MemStore(),
    fetch: vi.fn(),
    now: () => 1_000_000_000,
    current: () => '0.2.1',
    isE2E: () => false,
    ...over,
  } as never;
}

describe('update check (mocked fetch)', () => {
  it('reports a newer release and remembers its page', async () => {
    const e = env();
    e.fetch.mockResolvedValue(
      res(200, { tag_name: 'v0.3.0', html_url: 'https://github.com/tengfone/forgetools/releases/tag/v0.3.0' }),
    );
    const u = createUpdates(e);
    expect(await u.check()).toEqual({ current: '0.2.1', latest: '0.3.0', available: true, checkedAt: 1_000_000_000 });
    expect(e.fetch.mock.calls[0]![0]).toBe('https://api.github.com/repos/tengfone/forgetools/releases/latest');
    expect(u.releaseUrl()).toBe('https://github.com/tengfone/forgetools/releases/tag/v0.3.0');
    // persisted
    expect(createUpdates(e).releaseUrl()).toBe('https://github.com/tengfone/forgetools/releases/tag/v0.3.0');
  });

  it('maps errors like v0.2.1', async () => {
    const cases: Array<[Response, string]> = [
      [res(404, {}), 'No published release found'],
      [res(403, {}), 'GitHub rate limit reached, try again later'],
      [res(429, {}), 'GitHub rate limit reached, try again later'],
      [res(500, {}), 'GitHub responded 500'],
      [res(200, { tag_name: 'nightly' }), 'Unexpected response from GitHub'],
    ];
    for (const [r, msg] of cases) {
      const e = env();
      e.fetch.mockResolvedValue(r);
      await expect(createUpdates(e).check()).rejects.toThrow(msg);
    }
  });

  it('ignores off-site release URLs and up-to-date versions', async () => {
    const e = env();
    e.fetch.mockResolvedValue(res(200, { tag_name: '0.2.1', html_url: 'https://evil.example/' }));
    const u = createUpdates(e);
    expect((await u.check()).available).toBe(false);
    expect(u.releaseUrl()).toBe('https://github.com/tengfone/forgetools/releases/latest');
  });

  it('auto check: off by default, opt-in once a day, never under e2e', async () => {
    let now = 10 * 86_400_000;
    const e = env({ now: () => now });
    e.fetch.mockResolvedValue(res(200, { tag_name: 'v0.2.1' }));
    const u = createUpdates(e);
    expect(u.getPrefs()).toEqual({ autoCheck: false });
    expect(await u.auto()).toBeNull();
    expect(e.fetch).not.toHaveBeenCalled();
    u.setPrefs({ autoCheck: true });
    expect((await u.auto())?.latest).toBe('0.2.1');
    now += 3_600_000;
    await u.auto();
    expect(e.fetch).toHaveBeenCalledTimes(1);
    now += 86_400_000;
    e.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await u.auto()).toBeNull(); // silent when automatic
    now += 3_600_000;
    await u.auto(); // the failed attempt still counts: no retry within a day
    expect(e.fetch).toHaveBeenCalledTimes(2);
  });

  it('auto check under e2e never fetches', async () => {
    const e = env({ isE2E: () => true });
    const u = createUpdates(e);
    u.setPrefs({ autoCheck: true });
    expect(await u.auto()).toBeNull();
    expect(e.fetch).not.toHaveBeenCalled();
  });
});
