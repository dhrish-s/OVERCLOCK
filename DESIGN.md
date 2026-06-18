# Overclock - architecture

## Philosophy

Three things constrained every decision here: it has to run 100% offline on one Windows laptop, the data has to survive crashes and bad days without corruption, and a closed window shouldn't mean reminders stop firing. Everything else - the visual design, the reward system, the streak math - is in service of those three.

## Process architecture

Electron's two-process model is used exactly as intended, not fought against:

- **Main process** (`main.js`) owns the filesystem, the window, the system tray, and the reminder clock. It is the only code in the app with Node access.
- **Renderer process** (`src/index.html` + `src/js/**`) is pure DOM/JS with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. It cannot touch the filesystem, spawn processes, or reach Node APIs directly - it can only call the handful of functions `preload.js` explicitly exposes on `window.api`.
- **Preload** (`preload.js`) is the bridge: a `contextBridge.exposeInMainWorld('api', {...})` call listing every function the renderer is allowed to invoke, each one a thin wrapper around a specific, named IPC channel. There is no generic "run this" channel - every capability is its own narrow function.

The reminder clock lives in the main process specifically so it keeps running while the window is hidden in the tray; if it lived in the renderer, hiding the window would risk suspending its timers.

### IPC surface (the entire renderer-reachable API)

| Renderer call | Channel | What it does |
|---|---|---|
| `loadData()` | `data:load` | Reads and returns the JSON data file (or `null` on first run). |
| `saveData(data)` | `data:save` | Atomically writes the data file, rotates a backup, and re-syncs the reminder clock + login-item setting from the new settings. |
| `exportFile(name, content)` | `dialog:exportFile` | Native save dialog, then writes the given string to the chosen path. |
| `importFile()` | `dialog:importFile` | Native open dialog, reads and JSON-parses the chosen file. |
| `openExternal(url)` | `shell:openExternal` | Opens a URL in the system browser - only if it starts with `https://`. |
| `minimizeWindow / maximizeWindow / closeWindow` | `window:*` | Custom-titlebar window controls (the window has no native frame). `close` hides rather than quits. |
| `onReminder(cb)` | `reminder:fire` (main → renderer) | Subscribes to water/walk reminder events for the in-app toast. |
| `getLaunchOnStartup()` / `setLaunchOnStartup(bool)` | `app:get/setLaunchOnStartup` | Reads/writes the Windows "launch at login" registration via `app.setLoginItemSettings`. Reads the live OS state rather than trusting the JSON file, in case the user toggled it from Windows Settings directly. |
| `getVersion()` | `app:getVersion` | Returns `app.getVersion()` for the About panel. |
| `showDataFolder()` | `shell:showDataFolder` | Reveals the data file in Explorer. Takes no arguments from the renderer - the path is server-side, so there's no injection surface. |

## Security model

- **CSP** (in `index.html`): `script-src 'self'` with no `unsafe-inline` exception - verified safe because the entire renderer codebase uses `addEventListener` exclusively; there are no inline `onclick=`-style attributes anywhere to break. `connect-src 'none'` because the renderer never makes a network call of any kind; all data access is through `window.api`. `style-src` allows `'unsafe-inline'` because views set a lot of per-element inline styles (progress percentages, category accent colors) rather than generating a CSS rule per data point.
- **Navigation lockdown**: `setWindowOpenHandler` denies all `window.open()` calls, and `will-navigate` is blocked to anything that isn't a `file://` URL pointing at the app's own `index.html`.
- **Single-instance lock**: a second launch focuses the existing window instead of racing on the data file.
- **Atomic, backed-up writes**: every save writes to a `.tmp` file and renames it over the real one (atomic on the same volume), and rotates the previous version into a `backups/` folder (last 6 kept) before doing so.
- **No network, ever**: no telemetry, no analytics, no auto-updater, no fetch/XHR/WebSocket anywhere in the renderer.
- **Login-item registration is packaged-build-only**: `syncLoginItemSetting()` in `main.js` no-ops (and just logs) when `app.isPackaged` is false, so running the app from source (`npm start`) never registers the raw Electron binary as a Windows startup item.

## Design system

Aesthetic: "engineering console / terminal telemetry" - a dark void background, an amber phosphor accent rather than the generic cyan-neon look, hairline borders with glow instead of drop shadows, and monospace type reserved for anything that's fundamentally a readout (timers, counters, dates).

```
--void: #0B0E13            --phosphor: #FFB454        --violet: #8B7CF6
--panel: #141925            --phosphor-dim: #8A6A37     --diff-green: #4ADE80
--panel-raised: #1B2230      (+ -glow variants at        --diff-red: #F2555A
--panel-hover: #202838        ~30% alpha for each)
--border / --border-soft

--font-mono: Cascadia Code, JetBrains Mono, Consolas
--font-sans: Segoe UI Variable, Segoe UI, system-ui

--r-card: 7px   --r-chip: 4px   --r-pill: 999px
--titlebar-h: 38px   --rail-w: 76px
```

Layout is a single CSS grid (`#app-shell`): a fixed-height titlebar row, then a row split into a 76px icon rail and the scrollable view area. Every view is a self-contained module that renders into that view area.

## Data model

One JSON object, persisted as a whole on every change (debounced 350ms in the renderer, written atomically in the main process):

```
{
  version: 1,
  profile: { displayName, level, xp, coins, stars, streakShields, createdAt },
  categories: [
    { id, name, icon, color, goalType: 'count'|'minutes', goalValue, countLabel,
      timerMode: 'stopwatch'|'countdown'|'pomodoro', timerWorkSec, timerBreakSec,
      coinMin, coinMax, order, archived }
  ],
  days: {
    'YYYY-MM-DD': { categoryProgress: { [categoryId]: {...} }, perfectDay, coinsEarned, starsEarned }
  },
  streaks: { overall: {current, longest, lastDate}, [categoryId]: {...} },
  rewards: { small: [...], big: [...], usedSmallIds, usedBigIds, history: [...] },
  worklog: [ { id, date, categoryId, note, createdAt } ],
  settings: { waterReminderMinutes, walkReminderMinutes, remindersEnabled,
              soundEnabled, launchOnStartup }
}
```

`migrate()` in `state.js` is the seam for every future schema change - it backfills any field an older backup might be missing rather than letting it silently corrupt on import or upgrade.

### Reward draw logic

Each pool (small/coins, big/stars) tracks which reward IDs have already been claimed since the last "reset." Claiming draws only from rewards the user can currently afford and hasn't claimed in the current cycle; once every affordable reward has been claimed once, the cycle resets for that pool. This is what produces the "feels random but never repeats annoyingly, and never dangles something I can't afford" feel.

## File map

```
main.js                    Main process: window, tray, IPC, reminder clock, data file I/O
preload.js                  contextBridge surface exposed to the renderer as window.api
src/index.html               SPA shell + CSP
src/js/app.js                 Router: builds the shell chrome, mounts/cleans up views
src/js/state.js               Data model, defaults, migration, the Store class
src/js/logic.js               Pure functions: streaks, leveling, scoring, formatting (unit-tested)
src/js/icons.js               Inline SVG icon set (no icon font/image dependency)
src/js/dom.js                 Small DOM helpers (escapeHtml, greeting, etc.)
src/js/timer.js               The focus-session modal: stopwatch/countdown/pomodoro + logging
src/js/confetti.js            Celebration bursts (perfect day, level-up)
src/js/notifications.js       In-app toast stack + bridge from main-process reminder events
src/js/views/dashboard.js     "Today" - category cards, pulse-trace strip, daily summary
src/js/views/calendar.js      Streak heatmap + per-day drill-in
src/js/views/rewards.js       Reward pool balances + claim flow
src/js/views/worklog.js       Searchable log of every logged session/note
src/js/views/stats.js         Aggregate charts/trends
src/js/views/settings.js      Category/reward CRUD, reminders, startup toggle, data import/export/reset
test/logic.test.mjs          42 unit tests covering logic.js
build/icon.png, icon.ico     App icon (original geometric mark, generated for this project)
```

## Known limitations / ideas for later

- The reward "claim" flow currently has no undo - a misclick spends real coins. A confirmation step would be a small, safe addition.
- Stats trends are computed at render time from `days`, which is fine at this scale but would want pre-aggregation if the data file grows into years of history.
- There's no per-category "pause" separate from full archive - archiving hides a category from active grids but its historical data and streak stay intact, which covers most of the same need.
