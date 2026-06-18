# Overclock

Overclock is a small Windows desktop app I made for fun, mostly to push myself to stay consistent.

It started as a simple tracker. Then it became actually useful: a local focus console for LeetCode, GitHub work, job applications, system design, networking, notes, streaks, coins, and daily momentum.

No accounts. No cloud. No telemetry. Just your laptop, your goals, and a tiny bit of pressure.

## What It Does

- Tracks daily work across customizable categories
- Lets each day have a different mode, like LeetCode Heavy, GitHub Heavy, Job Hunt Heavy, or Balanced
- Keeps minimum baselines so you do not completely avoid important areas
- Runs focus sessions with intent notes and completion checks
- Shows streaks, coins, stars, stats, calendar progress, and weekly review
- Stores everything locally on your Windows machine
- Can run in the system tray with reminders

## Run Locally

You need Node.js installed first.

Then clone the project and run:

```powershell
npm install
npm start
```

That opens the app in development mode.

To run the tests:

```powershell
npm test
```

## Build The Windows App

To create the Windows installer:

```powershell
npm install
npm run dist
```

The installer will be created inside:

```powershell
dist\
```

Look for a file like:

```powershell
Overclock Setup 1.0.0.exe
```

Run that installer to install Overclock on your laptop.

## Quick App Test Without Installing

If you just want to build and open the app folder directly:

```powershell
npm run dist:dir
```

Then open:

```powershell
dist\win-unpacked\Overclock.exe
```

This is useful when you want to test the packaged app without running the installer.

## Important Note

`npm run dist` builds the installer. It does not install the app automatically.

After the command finishes, you still need to open the generated `.exe` from the `dist` folder.

## Where Your Data Lives

Your data is stored locally here:

```powershell
%APPDATA%\overclock-tracker\overclock-data.json
```

Backups are kept here:

```powershell
%APPDATA%\overclock-tracker\backups\
```

So updating or rebuilding the app should not erase your progress.

## Windows Warning

The app is not code-signed, so Windows may show an "Unknown Publisher" warning.

For a personal/local build, that is expected. Click **More info** and then **Run anyway** if you trust the build.

## Why I Made It

I wanted something simple that could push me without becoming another complicated productivity system.

Some days should be LeetCode-heavy. Some days should be GitHub-heavy. Some days are job-search days. But every day should still keep the basics alive.

That is the idea behind Overclock: flexible days, minimum baselines, visible progress, and enough game-like pressure to make consistency feel a little more fun.
