# Overclock

A local, offline daily execution console for the grad-school + job-search grind: LeetCode, job applications, system design study, and open source work - each with its own timer, coin rewards, and streak tracking. Everything runs on your Windows machine only; nothing is ever sent over a network.

## Features

- Four default task categories (LeetCode, Job Applications, System Design Study, Open Source/GitHub) - fully customizable in Settings, and you can add as many of your own as you want.
- Per-category timer modes: stopwatch, countdown, or pomodoro (work/break cycles).
- Coin rewards per completed session (a randomized range you set per category), plus a bonus star when every category's daily goal is met - a "perfect day."
- Two reward pools - small (spent in coins) and big (spent in stars) - that draw without repeating until the pool is exhausted, and only offer what you can currently afford. Fully editable: add, edit, disable, or delete entries in Settings.
- A Duolingo-style calendar heatmap with both an overall streak and a separate streak per category.
- A detailed work log of every session, searchable and exportable.
- Periodic water and movement reminders as native Windows notifications, with a configurable interval - these keep firing even while the app is minimized to the tray.
- Optional launch-on-Windows-login, starting minimized in the tray rather than popping a window in your face.
- 100% local storage: a single JSON file under your Windows user profile, atomic writes, six rotating backups, and one-click manual export/import.

## Running it in development

```
npm install
npm start
```

`npm test` runs the unit test suite (42 tests covering the scoring, streak, and leveling logic in `src/js/logic.js`).

## Building the Windows installer

```
npm install
npm run dist
```

This produces an NSIS installer under `dist/`.

**Important:** this project was built inside a sandboxed environment, and that sandbox's network allowlist doesn't permit Electron to actually fetch its own binary. As of Electron 42, that download no longer happens during `npm install` - it happens the first time Electron actually runs (e.g. `npm start`, or partway through `npm run dist` when electron-builder needs the binary to package it). Either way, that first real run needs to happen on your own machine with normal internet access, not in a build sandbox.

### About the "Unknown Publisher" warning

The installer isn't code-signed (that requires a paid certificate), so Windows SmartScreen will likely flag it the first time you run it. Click "More info," then "Run anyway." That's normal for any unsigned app and doesn't indicate a problem with the build.

## Where your data lives

Everything lives in one JSON file:

```
%APPDATA%\overclock-tracker\overclock-data.json
```

The last six versions are rotated automatically into `%APPDATA%\overclock-tracker\backups\` before every save. In-app, **Settings → Data** has a "Show data file in Explorer" button that jumps straight there, plus one-click Export and Import for your own manual backups.

## Customizing

Settings has four tabs:

- **General** - display name, the launch-on-login toggle, reminder cadence and on/off, and sound on/off.
- **Categories** - add, edit, archive (reversible), or permanently delete any task category: name, icon, accent color, goal (a count or a minutes target), timer mode, and coin range.
- **Rewards** - edit the small (coin) and big (star) pools: add, edit, disable, or delete entries.
- **Data** - export or import a full backup, or reset everything (typing RESET is required before the button enables).

## Day-to-day behavior

Closing the window doesn't quit the app - it minimizes to the system tray so reminders keep running in the background. Use the tray icon's "Quit" option to actually exit. If you've turned on launch-at-login, Overclock starts automatically (tucked in the tray, no popup) every time you sign into Windows; a manual launch from the Start menu or desktop shortcut still opens the window right away as usual.

## Security notes

- `contextIsolation`, `sandbox`, and disabled `nodeIntegration` are all on - the renderer has no direct access to Node or Electron internals, only the small set of functions explicitly exposed in `preload.js`.
- A strict Content-Security-Policy blocks any remote script, style, or network connection; everything the app needs ships inside this folder.
- No network calls, telemetry, or auto-updater of any kind, ever.
- The data file lives in your normal per-user app-data folder (not anywhere shared), writes are atomic (write-then-rename), and the previous version is rotated into a backup before every save.
- `npm audit` is clean (0 vulnerabilities) as of `electron@42.4.1` / `electron-builder@26.15.4`, the versions pinned in `package.json` and locked in `package-lock.json`. The Electron API surface this app actually uses (BrowserWindow, Tray, dialog, Notification, ipcMain/contextBridge, app.setLoginItemSettings) was checked line-by-line against Electron's breaking-changes log across every major version from 31 through 42, and none of the changes in that range affect this codebase - the upgrade was safe, not just convenient. Run `npm audit` yourself after `npm install` if you want to verify this on your own machine, since new advisories can always surface later.

See `DESIGN.md` for the full architecture writeup - data model, file map, and the reasoning behind each of the choices above.
