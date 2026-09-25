# Overclock

Overclock is a fast, local-first Windows focus tracker for turning a busy day into a clear record of what actually happened.

Start a focused task, backfill work you forgot to track, inspect every hour of the day, and build momentum with streaks, coins, stars, and rewards. No account, cloud service, subscription, or telemetry required.

## Highlights

- Custom categories for LeetCode, applications, system design, open source, or anything else
- Stopwatch, countdown, and Pomodoro focus sessions
- One active timer at a time, with a live session bar in the title bar
- Automatic worklog entries when a session starts
- Manual entries for forgotten or one-off work
- Quick templates for Gym, Class, Reading, Interview prep, and Errands
- Editable and removable finished worklog entries
- A readable 24-hour timesheet with tasks shown inside hourly rows
- Idle-gap detection between tracked work blocks
- Flexible day modes with baseline and focus targets
- Calendar history, statistics, weekly review, streaks, coins, stars, and rewards
- Windows tray support, reminders, and optional launch at startup
- Local JSON storage with rotating backups

## Requirements

- Windows 10 or Windows 11, 64-bit
- [Node.js](https://nodejs.org/) with npm for development and local builds
- Git if you are cloning the repository

Using the current Node.js LTS release is recommended.

## Get The Code

Open PowerShell and run:

```powershell
git clone https://github.com/dhrish-s/Activity-Rewarder.git
cd Activity-Rewarder
npm install
```

`npm install` downloads the Electron development tools used by the project. You normally only need to run it after cloning or when dependencies change.

## Run The App

Start the normal local app:

```powershell
npm start
```

Start it with the development flag:

```powershell
npm run dev
```

Both commands open Electron directly from the source folder. They do not install Overclock into Windows.

## Run Tests

Run the logic test suite:

```powershell
npm test
```

A successful run ends with output similar to:

```text
114 passed, 0 failed
4 storage recovery checks passed
```

## Build Without Installing

Create an unpacked Windows build:

```powershell
npm run dist:dir
```

Then launch:

```text
dist\win-unpacked\Overclock.exe
```

This is the quickest way to test the real packaged application without running an installer.

## Build And Install On Windows

Create the Windows installer:

```powershell
npm run dist
```

The installer is written to the `dist` folder and will have a name similar to:

```text
Overclock Setup 1.0.0.exe
```

To install:

1. Open the `dist` folder.
2. Run `Overclock Setup 1.0.0.exe`.
3. Choose the installation folder when prompted.
4. Finish setup and launch Overclock from the desktop or Start menu shortcut.

The installer is not currently code-signed. Windows SmartScreen may show an Unknown Publisher message for a personal build. If you built the project yourself and trust it, select **More info**, then **Run anyway**.

## Command Reference

| Command | Purpose |
| --- | --- |
| `npm install` | Install project dependencies |
| `npm start` | Run Electron from source |
| `npm run dev` | Run Electron with the development flag |
| `npm test` | Run the logic tests |
| `npm run dist:dir` | Build an unpacked Windows app for quick testing |
| `npm run dist` | Build the Windows installer |

## Local Data And Backups

Overclock stores its data locally in Electron's Windows user-data directory:

```text
%APPDATA%\overclock-tracker\overclock-data.json
```

Rotating backups are stored in:

```text
%APPDATA%\overclock-tracker\backups\
```

You can also export and import a full JSON backup from **Settings > Data**. Rebuilding or reinstalling the app should not remove the user-data folder, but exporting a backup before major system changes is still a good habit.

## Everyday Workflow

1. Pick a day mode based on what matters today.
2. Start a category session and write a concrete intent.
3. Finish the session and record what you completed.
4. Add forgotten or offline work manually when needed.
5. Review the hourly Work Log to spot productive blocks and idle gaps.
6. Keep the streak alive and spend earned rewards without guilt.

Closing the main window keeps Overclock available in the Windows tray so reminders can continue. Use **Quit** from the tray menu when you want to fully stop the app.

## Troubleshooting

### `npm` is not recognized

Install Node.js, close PowerShell, open it again, and verify:

```powershell
node --version
npm --version
```

### PowerShell blocks `npm.ps1`

Use the Windows command shim:

```powershell
npm.cmd install
npm.cmd start
```

The same form works for every command, such as `npm.cmd test` or `npm.cmd run dist`.

### The build cannot download Electron

Check the internet connection, VPN, proxy, firewall, or antivirus rules, then retry the build. Electron Builder may need to download the Windows Electron runtime during packaging.

### The app appears to stay open after closing

That is expected tray behavior. Open it again from the tray icon, or choose **Quit** from the tray menu to stop it completely.

## Project Philosophy

Overclock should help you notice your day, not become another job to maintain. It stays compact, responsive, private, and useful in the background, while still making progress feel satisfying.

Build momentum. Keep the record honest. Then go claim a reward.
