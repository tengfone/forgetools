// Settings > About: version, update check (manual + opt-in daily), links and runtime details.
import { clipboard, getAppInfo, openLink, type ExternalLinkId } from '../native';
import { updates, type UpdateCheckResult, type UpdatePrefs } from '../updates';
import { logger } from '../logger';
import { showToast } from '../ui';

/** Flag "update available" on the titlebar Settings button and the About tab. */
function flag(on: boolean): void {
  const btn = document.getElementById('titlebarSettings');
  btn?.classList.toggle('has-dot', on);
  if (btn) btn.title = on ? 'Settings: update available' : 'Settings';
  const dot = document.getElementById('aboutTabDot');
  if (dot) dot.hidden = !on;
}

export function setupAbout(): void {
  const group = document.getElementById('settingsAbout');
  if (!group) return;

  const version = document.getElementById('aboutVersion');
  const navVersion = document.getElementById('settingsNavVersion');
  const status = document.getElementById('aboutUpdate');
  const checkBtn = document.getElementById('aboutCheck') as HTMLButtonElement | null;
  const auto = document.getElementById('setting-autoupdate') as HTMLInputElement | null;
  const meta = document.getElementById('aboutMeta');
  let details = '';
  const openRelease = (): void => {
    void openLink('latestRelease').catch(() => showToast('Could not open link', 'error'));
  };

  void getAppInfo()
    .then((info) => {
      if (version) version.textContent = `Version ${info.version}`;
      if (navVersion) navVersion.textContent = `v${info.version}`;
      details = `ForgeTools ${info.version} · Tauri ${info.tauri} · WebView ${info.webview} · ${info.platform}-${info.arch}`;
      if (meta)
        meta.textContent = `Tauri ${info.tauri} · WebView ${info.webview.split('.')[0]} · ${info.platform}-${info.arch}`;
    })
    .catch(() => {
      if (version) version.textContent = '';
    });

  const setStatus = (kind: '' | 'ok' | 'error' | 'new', text = ''): void => {
    if (!status) return;
    status.className = `about-update${kind ? ` is-${kind}` : ''}`;
    status.textContent = text;
  };
  const show = (r: UpdateCheckResult): void => {
    flag(r.available);
    if (!r.available) {
      setStatus('ok', 'Up to date');
      if (checkBtn) {
        checkBtn.textContent = 'Check for updates';
        checkBtn.className = 'btn-icon btn-sm';
        delete checkBtn.dataset.mode;
      }
      return;
    }
    if (!status) return;
    setStatus('new');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'about-update-link';
    link.textContent = `v${r.latest} available`;
    link.title = 'Open the release page in your browser';
    link.addEventListener('click', openRelease);
    status.append(link);
    if (checkBtn) {
      checkBtn.textContent = 'View release';
      checkBtn.className = 'btn-primary btn-sm';
      checkBtn.dataset.mode = 'open';
    }
  };

  checkBtn?.addEventListener('click', () => {
    if (checkBtn.dataset.mode === 'open') {
      openRelease();
      return;
    }
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    setStatus('');
    updates()
      .check()
      .then(show)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus('error', /fetch|net::|ENOTFOUND|network|abort|timeout/i.test(msg) ? "Couldn't reach GitHub" : msg);
      })
      .finally(() => {
        checkBtn.disabled = false;
        if (checkBtn.dataset.mode !== 'open') checkBtn.textContent = 'Check for updates';
      });
  });

  if (auto) {
    auto.checked = updates().getPrefs().autoCheck;
    auto.addEventListener('change', () => {
      const want = auto.checked;
      let p: UpdatePrefs;
      try {
        p = updates().setPrefs({ autoCheck: want });
      } catch {
        auto.checked = !want;
        showToast('Could not save setting', 'error');
        return;
      }
      auto.checked = p.autoCheck;
      if (p.autoCheck)
        void updates()
          .auto()
          .then((r) => {
            if (r) show(r);
          })
          .catch((e: unknown) => logger.warn('Auto update check failed:', e));
    });
  }
  // Startup: updates.ts decides whether to touch the network (opt-in, once a day).
  void updates()
    .auto()
    .then((r) => {
      if (r?.available) show(r);
    })
    .catch((e: unknown) => logger.warn('Auto update check failed:', e));

  meta?.addEventListener('click', () => {
    if (!details) return;
    void clipboard
      .writeText(details)
      .then(() => showToast('Version details copied'))
      .catch(() => showToast('Could not copy', 'error'));
  });

  group.querySelectorAll<HTMLButtonElement>('[data-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void openLink(btn.dataset.link as ExternalLinkId).catch(() => showToast('Could not open link', 'error'));
    });
  });
}
