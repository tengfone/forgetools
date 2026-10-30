import './fonts.css';
import { getPlatform, isMac } from './native';
import { revealWindow, setupWindowControls, setupGoHome } from './app/windowShell';
import {
  wireClipboardActions,
  openModal,
  closeModal,
  getIndentChoice,
  setIndentChoice,
  removeAfterTransition,
  type IndentChoice,
} from './ui';
import { getTheme, setTheme, syncThemeButton } from './app/theme';
import { setupBackgroundSettings } from './app/backgroundSettings';
import { setupAbout } from './app/about';
import { setupSettingsTabs, type SettingsSection } from './app/settingsDialog';
import { configureUpdates } from './updates';
import { resultCache } from './app/cache';
import { state, nav } from './app/state';
import {
  setupEditorActions,
  setupEditorSettings,
  setEditorEditListener,
  applyIndentToModels,
  processInput,
  disposeEditors,
} from './app/editors';
import { setPinsListener } from './app/pins';
import { renderSidebar, renderQuickGroups, setupDrawer } from './app/sidebar';
import { renderWelcome, setupHomeSearch, focusHomeSearch, syncHomePins } from './app/home';
import { setupHistory, setupHistorySetting, recordHistorySoon } from './app/history';
import { clearToolSession, setupRememberSetting } from './app/session';
import { setupHelp } from './app/help';
import { setupCommandPalette } from './app/palette';
import { switchTool, goHome, copyCurrentOutput } from './app/toolView';

/** Matches the loading screen's `duration-150` fade in index.html. */
const LOADING_FADE_MS = 150;

// E2E builds only (`npm run build:wdio`): WebdriverIO's execute/mock bridge, and no update
// checks. Dead-code-eliminated from normal builds because the flag is a compile-time constant.
if (import.meta.env.VITE_WDIO === '1') {
  configureUpdates({ isE2E: true });
  void import('@wdio/tauri-plugin');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') setTheme('system');
});

window.addEventListener('beforeunload', () => {
  resultCache.clear();
  disposeEditors();
});

document.addEventListener('DOMContentLoaded', () => {
  setTheme(getTheme());
  initApp();
  revealWindow();
});

function setupTitlebar(): void {
  const mac = isMac();
  const titlebar = document.querySelector<HTMLElement>('.titlebar');
  if (!titlebar) return;
  document.querySelectorAll('.mod-key').forEach((el) => {
    el.textContent = mac ? '\u2318' : 'Ctrl';
  });
  document.getElementById('railSearch')?.setAttribute('title', `Search (${mac ? '\u2318' : 'Ctrl '}K)`);
  // Platform class drives titlebar insets: traffic lights (mac, left) or our caption buttons (win/linux, right)
  document.documentElement.classList.add(`platform-${getPlatform()}`);
  setupWindowControls(mac);
  document.getElementById('homeLogo')?.addEventListener('click', () => goHome());

  const controls = document.getElementById('titlebarControls') ?? titlebar;
  // Theme: one icon button cycling System -> Light -> Dark (label states the current mode)
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.id = 'themeToggle';
  themeBtn.className = 'tb-btn';
  themeBtn.innerHTML = '<i class="material-icons" aria-hidden="true"></i>';
  themeBtn.onclick = () => {
    const order = ['system', 'light', 'dark'] as const;
    setTheme(order[(order.indexOf(getTheme()) + 1) % order.length] ?? 'system');
  };
  controls.append(themeBtn);
  syncThemeButton();
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.id = 'titlebarSettings';
  settings.className = 'tb-btn';
  settings.title = 'Settings';
  settings.setAttribute('aria-label', 'Settings');
  settings.setAttribute('aria-haspopup', 'dialog');
  settings.innerHTML = '<i class="material-icons" aria-hidden="true">tune</i>';
  settings.onclick = () => nav.openSettings(settings);
  controls.append(settings);
}

/** Status-bar indent select. */
function setupIndent(): void {
  const sel = document.getElementById('indentSelect');
  if (!(sel instanceof HTMLSelectElement)) return;
  sel.value = String(getIndentChoice());
  sel.addEventListener('change', () => {
    const choice: IndentChoice = sel.value === 'tab' ? 'tab' : sel.value === '4' ? 4 : 2;
    setIndentChoice(choice);
    applyIndentToModels();
    resultCache.clear();
    void processInput();
  });
}

/** Settings dialog (titlebar button -> last-used section; palette "About ForgeTools" -> About). */
function setupSettings(): void {
  const selectSection = setupSettingsTabs();
  const overlay = document.getElementById('settingsOverlay');
  if (overlay) {
    const panel = overlay.querySelector<HTMLElement>('[role="dialog"]') ?? overlay;
    const close = (): void => {
      if (!overlay.classList.contains('visible')) return;
      overlay.classList.remove('visible');
      overlay.classList.add('hidden');
      closeModal(panel);
    };
    const open = (section?: SettingsSection, opener?: HTMLElement | null): void => {
      const s = selectSection(section);
      overlay.classList.remove('hidden');
      overlay.classList.add('visible');
      const active = document.activeElement;
      openModal(panel, {
        opener: opener ?? (active instanceof HTMLElement ? active : null),
        initialFocus: document.getElementById(`stab-${s}`),
        onEscape: close,
      });
    };
    const closeBtn = document.getElementById('settingsClose');
    if (closeBtn) closeBtn.onclick = close;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    nav.openSettings = (opener) => open(undefined, opener);
    nav.openAbout = (opener) => open('about', opener);
  }
  setupEditorSettings();
  setupRememberSetting();
  setupHistorySetting();
}

function setupGlobalKeys(): void {
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
    if (e.key.toLowerCase() === 'c') {
      // Let native copy work when the user has a text selection in a field/editor
      const sel = window.getSelection()?.toString();
      if (sel && !document.activeElement?.closest('.monaco-editor')) return;
      e.preventDefault();
      copyCurrentOutput();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      clearToolSession();
    }
  });
}

function initApp(): void {
  nav.openTool = switchTool;
  nav.goHome = goHome;
  setPinsListener(() => {
    renderQuickGroups();
    syncHomePins();
  });
  setEditorEditListener(recordHistorySoon);

  renderSidebar();
  renderWelcome();
  setupHomeSearch();
  setupBackgroundSettings();
  setupAbout();
  setupGoHome(() => {
    if (state.currentTool) goHome();
    focusHomeSearch();
  });
  wireClipboardActions();
  setupHistory();
  setupHelp();
  setupEditorActions(recordHistorySoon);
  setupSettings();
  setupCommandPalette();
  setupTitlebar();
  setupDrawer();
  setupIndent();
  setupGlobalKeys();

  // Hide the loading screen as soon as the shell is ready
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    removeAfterTransition(loadingScreen, LOADING_FADE_MS);
  }
}
