# Manual release checklist

These cover native behaviour the e2e suite cannot reach. E2E runs with `FORGE_E2E=1`, which
turns off the tray, close-to-tray, the single-instance lock, login-item registration and
automatic update checks. Run this list on a **release build** (`npm run pack`, or the
installer) on each OS you ship, before tagging a release.

Prefs: `background.json` lives in the app data dir (`com.tengfone.forgetools`).

| # | Area | Steps | Expected |
|---|------|-------|----------|
| 1 | Tray icon | Launch the app. | A tray (macOS: menu bar) icon appears. Its menu has Show/Hide and Quit. Show/Hide toggles the window. Quit exits the process (check Task Manager / Activity Monitor). |
| 2 | Close to tray | Settings > Background: turn on **Keep running in background**. Close the window with the caption X (macOS: red button). | The window hides and the process keeps running. The first time, a notification says "ForgeTools is still running". The tray icon brings the window back with its state intact. |
| 3 | Close quits | Turn **Keep running in background** off, then close the window. | The process exits. |
| 4 | Global shortcut | Settings > Background: record a shortcut (for example Ctrl+Alt+Space; on macOS Option+Space). Focus another app and press it twice. | First press shows and focuses ForgeTools; the second hides it. Restart the app: the shortcut still works. **Clear** unregisters it. |
| 5 | Shortcut conflict | Record a shortcut another app already owns. | The red message "Shortcut is in use by another app" appears and the previous shortcut stays in effect. |
| 6 | Start at login | Turn on **Open at login**, then sign out and back in (or reboot). | ForgeTools starts hidden in the tray (it was launched with `--hidden`), and no window flashes. The OS lists the login item: Windows Task Manager > Startup apps, macOS Login Items, Linux `~/.config/autostart`. Turn the setting off and the login item is removed. |
| 7 | `--hidden` by hand | Run `forgetools --hidden` from a terminal. | No window appears and the tray icon does. Show/Hide opens the window. |
| 8 | Single instance | With the app running (shown or hidden in the tray), launch it again from the Start menu, Dock or terminal. | No second process starts. The existing window is shown, unminimised and focused. |
| 9 | macOS dock reopen | macOS: hide the window with close-to-tray, then click the Dock icon. | The window reappears. |
| 10 | Update check (manual) | Settings > About > **Check for updates**, online. | It shows "Up to date", or "vX.Y.Z available" plus a **View release** button that opens the GitHub release page. Offline it shows "Couldn't reach GitHub". |
| 11 | Update check (auto) | Turn on **Check for updates automatically** and restart. | At most one request to api.github.com per 24 h. A newer release puts a dot on the titlebar Settings button and the About tab. The setting is off by default. |
| 12 | Settings migration from v0.2.1 | Install v0.2.1 and set close-to-tray on, open-at-login on and a global shortcut. Install this build over it and launch. | All three settings carry over: the Background pane shows them, the shortcut works and the login item still exists. Theme and editor prefs are kept too. |
| 13 | Identifier change | After step 12, check the app data dir. | Prefs are read from the new `com.tengfone.forgetools` dir (migrated from the legacy location). Nothing is lost and no duplicate login item exists. |
