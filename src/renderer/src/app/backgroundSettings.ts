// Settings > Background: keep-in-background, open-at-login and the global show/hide shortcut recorder.
import '../../../types/electronAPI';

/** KeyboardEvent -> Electron accelerator ("Ctrl+Alt+Space"). Null while only modifiers are held. */
export function toAccelerator(e: KeyboardEvent): string | null {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(k)) return null;
  const isMac = !!window.platform?.isMac;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push(isMac ? 'Control' : 'Ctrl');
  if (e.metaKey) mods.push(isMac ? 'Command' : 'Super');
  if (e.altKey) mods.push(isMac ? 'Option' : 'Alt');
  if (e.shiftKey) mods.push('Shift');
  let key: string | null = null;
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
  else {
    const map: Record<string, string> = {
      Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
      Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    };
    key = map[code] ?? null;
  }
  if (!key) return null;
  // A global shortcut needs a modifier (function keys excepted) or it would swallow normal typing
  if (!mods.length && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}

/** Pretty label for an accelerator: mac glyphs, otherwise as-is. */
export function accelLabel(a: string): string {
  if (!window.platform?.isMac) return a.replace(/\+/g, ' + ');
  return a.replace(/Command\+?/g, '\u2318').replace(/Control\+?/g, '\u2303').replace(/Option\+?|Alt\+?/g, '\u2325').replace(/Shift\+?/g, '\u21e7');
}

export function setupBackgroundSettings(): void {
  const api = window.electronAPI?.background;
  const group = document.getElementById('settingsBackground');
  if (!api || !group) { group?.setAttribute('hidden', ''); return; }
  const bg = document.getElementById('setting-background') as HTMLInputElement | null;
  const login = document.getElementById('setting-login') as HTMLInputElement | null;
  const rec = document.getElementById('shortcutRec') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('shortcutClear') as HTMLButtonElement | null;
  const chips = document.getElementById('shortcutChips');
  const msg = document.getElementById('shortcutMsg');
  if (!bg || !login || !rec || !clearBtn || !chips || !msg) return;
  const HINT = 'Shows or hides ForgeTools from any app.';
  let current: string | null = null;
  let recording = false;

  const paint = (): void => {
    rec.classList.toggle('is-recording', recording);
    rec.setAttribute('aria-pressed', String(recording));
    rec.textContent = recording ? 'Press a key combination\u2026' : current ? accelLabel(current) : 'Not set';
    rec.classList.toggle('is-empty', !current && !recording);
    clearBtn.disabled = !current;
  };
  const say = (text: string, error = false): void => {
    msg.textContent = text;
    msg.classList.toggle('is-error', error);
  };
  const apply = async (accel: string | null): Promise<void> => {
    const r = await api.setGlobalShortcut(accel);
    current = r.accelerator;
    if (r.ok) say(accel ? `${accelLabel(accel)} now shows or hides ForgeTools.` : HINT);
    else say(r.error ?? 'Shortcut is in use by another app', true);
    paint();
  };

  const isMac = !!window.platform?.isMac;
  const suggestions = isMac ? ['Option+Space', 'Control+Shift+Option+F'] : ['Ctrl+Alt+Space', 'Ctrl+Shift+Alt+F'];
  suggestions.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-chip shortcut-chip';
    b.dataset.accel = s;
    b.textContent = accelLabel(s);
    b.onclick = () => { recording = false; void apply(s); };
    chips.appendChild(b);
  });

  rec.addEventListener('click', () => { recording = !recording; if (recording) say('Press the combination, or Esc to cancel.'); else say(HINT); paint(); });
  rec.addEventListener('blur', () => { if (recording) { recording = false; say(HINT); paint(); } });
  rec.addEventListener('keydown', e => {
    if (!recording) return;
    if (e.key === 'Tab') { recording = false; paint(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) { recording = false; say(HINT); paint(); return; }
    const accel = toAccelerator(e);
    if (!accel) { if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) say('Add Ctrl, Alt or Shift to the key.', true); return; }
    recording = false;
    void apply(accel);
  });
  clearBtn.addEventListener('click', () => { recording = false; void apply(null); });

  bg.addEventListener('change', () => { void api.setBackgroundSettings({ keepInBackground: bg.checked }); });
  login.addEventListener('change', () => { void api.setBackgroundSettings({ openAtLogin: login.checked }); });

  void api.getBackgroundSettings().then(s => {
    bg.checked = s.keepInBackground;
    login.checked = s.openAtLogin;
    current = s.globalShortcut;
    paint();
  });
  paint();
}
