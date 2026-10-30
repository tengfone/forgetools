// Tauri window shell: reveal-after-first-paint, custom caption buttons and the go-home event.
import { appWindow, background, isTauri, startHidden } from '../native';
import { logger } from '../logger';
import { nextFrameOrTimeout } from '../ui';

/**
 * The window is created hidden (no white flash); reveal it once the first frame is painted.
 * Launched at login with --hidden: stay in the tray until the user opens it.
 * WebKit (macOS/Linux) does not run rAF for a hidden window, so a timer is the fallback.
 */
export function revealWindow(): void {
  if (!isTauri()) return;
  nextFrameOrTimeout(() => {
    void startHidden()
      .then(hidden => (hidden ? undefined : appWindow.show()))
      .catch((e: unknown) => logger.warn('Window reveal failed:', e));
  }, undefined, 2);
}

const windowCall = (name: string, fn: () => Promise<void>) => (): void => {
  void fn().catch((e: unknown) => logger.warn(`Window ${name} failed:`, e));
};

/** Windows/Linux: our own minimize / maximize / close buttons (macOS keeps native traffic lights). */
export function setupWindowControls(isMac: boolean): void {
  const box = document.getElementById('windowControls');
  if (!box || isMac || !isTauri()) return;
  box.hidden = false;
  document.getElementById('wcMinimize')?.addEventListener('click', windowCall('minimize', appWindow.minimize));
  document.getElementById('wcMaximize')?.addEventListener('click', windowCall('maximize', appWindow.toggleMaximize));
  document.getElementById('wcClose')?.addEventListener('click', windowCall('close', appWindow.close));
}

/** Global shortcut / tray brought the window back. */
export function setupGoHome(onGoHome: () => void): void {
  if (!isTauri()) return;
  void background.onGoHome(onGoHome).catch((e: unknown) => logger.warn('go-home listener failed:', e));
}
