'use strict';

/**
 * Overclock - main process.
 *
 * Responsibilities (and nothing else - keep the privileged process small):
 *   1. Create the app window with a locked-down webPreferences config.
 *   2. Own the on-disk data file. The renderer never touches the filesystem
 *      directly; it asks the main process via a small, explicit IPC surface.
 *   3. Run the water/walk reminder clock so reminders keep firing even if
 *      the window is hidden in the tray.
 *
 * Security notes:
 *   - contextIsolation + sandbox + nodeIntegration:false means the renderer
 *     has zero direct access to Node or Electron internals. It only gets
 *     the handful of functions explicitly exposed in preload.js.
 *   - No remote content is ever loaded. loadFile() points at a local file,
 *     navigation away from it is blocked, and window.open() is denied.
 *   - The data file lives under Electron's userData directory (the normal
 *     per-user, per-app folder on Windows - not anywhere shared/world
 *     writable), writes are atomic (write tmp -> rename), and the previous
 *     version is rotated into a small backups/ folder before every save.
 */

const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { loadDataWithRecovery } = require('./storage');

const IS_WINDOWS = process.platform === 'win32';
if (IS_WINDOWS) {
  // Gives Windows toast notifications a stable identity instead of
  // falling back to a generic Electron icon/name.
  app.setAppUserModelId('com.overclock.tracker');
}

// Prevent two copies from running at once and racing on the same data file.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let focusDeadlineTimer = null;

const userDataDir = app.getPath('userData');
const dataFilePath = path.join(userDataDir, 'overclock-data.json');
const backupsDir = path.join(userDataDir, 'backups');
const MAX_BACKUPS = 6;

function ensureDirs() {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

function safeReadData() {
  return loadDataWithRecovery(dataFilePath, backupsDir, (err) => {
    console.error('[overclock] failed to read a data snapshot:', err);
  });
}

function rotateBackups() {
  ensureDirs();
  try {
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .sort();
    while (files.length >= MAX_BACKUPS) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(backupsDir, oldest));
    }
  } catch (err) {
    console.error('[overclock] backup rotation failed:', err);
  }
}

function safeWriteData(data) {
  ensureDirs();
  const json = JSON.stringify(data, null, 2);
  const tmpPath = `${dataFilePath}.tmp`;

  // Snapshot the previous file before we touch anything, so a crash mid
  // write can never destroy both the live file and the last good copy.
  if (fs.existsSync(dataFilePath)) {
    rotateBackups();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      fs.copyFileSync(dataFilePath, path.join(backupsDir, `backup-${stamp}.json`));
    } catch (err) {
      console.error('[overclock] backup copy failed:', err);
    }
  }

  fs.writeFileSync(tmpPath, json, 'utf-8');
  fs.renameSync(tmpPath, dataFilePath); // atomic on the same volume
}

// Windows "launch at login" registration. Guarded to packaged builds only -
// in dev (`npm start`, running the raw Electron binary) registering would
// point the registry Run key at electron.exe itself, not Overclock, so we
// skip it there and just log what would have happened.
function syncLoginItemSetting(enabled) {
  if (!app.isPackaged) {
    console.log(`[overclock] (dev) skipping login-item registration, would set: ${!!enabled}`);
    return;
  }
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
  } catch (err) {
    console.error('[overclock] failed to set login item:', err);
  }
}

function createWindow(startHidden) {
  const appIndexPath = path.join(__dirname, 'src', 'index.html');
  const appIndexUrl = pathToFileURL(appIndexPath).href;

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0b0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(appIndexPath);

  // When Windows launched us automatically at login, stay tucked in the
  // tray instead of popping a window in front of whatever the user just
  // sat down to do. A manual launch (Start menu / desktop shortcut) still
  // shows immediately, same as any other app.
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  // Closing the window hides it (reminders + streak keep running in the
  // tray); only the tray's "Quit" item actually exits the process.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Lock the renderer to this app's own bundled entry point only.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appIndexUrl) {
      event.preventDefault();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    console.error('[overclock] tray icon failed to load:', err);
    return;
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Open Overclock', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip('Overclock - daily execution console');
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow && mainWindow.show());
}

// ---------------------------------------------------------------------
// Reminder engine - lives in the main process so it keeps ticking even
// while the window is hidden in the tray.
// ---------------------------------------------------------------------
let reminderSettings = { waterMinutes: 60, walkMinutes: 90, enabled: true, sound: true };
let lastWaterAt = Date.now();
let lastWalkAt = Date.now();

function fireReminder(kind, title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: !reminderSettings.sound }).show();
    }
  } catch (err) {
    console.error('[overclock] notification failed:', err);
  }
  if (mainWindow) {
    mainWindow.webContents.send('reminder:fire', { kind, title, body, at: Date.now() });
  }
}

function tickReminders() {
  if (!reminderSettings.enabled) return;
  const now = Date.now();
  if (now - lastWaterAt >= reminderSettings.waterMinutes * 60000) {
    lastWaterAt = now;
    fireReminder('water', 'Hydration check', 'Drink some water and reset your focus for a minute.');
  }
  if (now - lastWalkAt >= reminderSettings.walkMinutes * 60000) {
    lastWalkAt = now;
    fireReminder('walk', 'Movement break', 'Stand up, stretch, and take a short walk before the next block.');
  }
}

app.whenReady().then(() => {
  ensureDirs();
  const existing = safeReadData();
  if (existing && existing.settings) {
    reminderSettings = {
      waterMinutes: Number(existing.settings.waterReminderMinutes) || 60,
      walkMinutes: Number(existing.settings.walkReminderMinutes) || 90,
      enabled: existing.settings.remindersEnabled !== false,
      sound: existing.settings.soundEnabled !== false,
    };
    syncLoginItemSetting(existing.settings.launchOnStartup !== false);
  } else {
    // Fresh install with no data file yet - default is "on", matching
    // createDefaultData() in state.js.
    syncLoginItemSetting(true);
  }
  const startHidden = app.isPackaged && !!app.getLoginItemSettings().wasOpenedAtLogin;
  createWindow(startHidden);
  createTray();
  setInterval(tickReminders, 30000);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ---------------------------------------------------------------------
// IPC - the entire privileged surface the renderer can reach.
// ---------------------------------------------------------------------
ipcMain.handle('data:load', () => safeReadData());

ipcMain.handle('data:save', (_event, data) => {
  try {
    if (data && data.settings) {
      reminderSettings = {
        waterMinutes: Number(data.settings.waterReminderMinutes) || 60,
        walkMinutes: Number(data.settings.walkReminderMinutes) || 90,
        enabled: data.settings.remindersEnabled !== false,
        sound: data.settings.soundEnabled !== false,
      };
      syncLoginItemSetting(data.settings.launchOnStartup !== false);
    }
    safeWriteData(data);
    return { ok: true };
  } catch (err) {
    console.error('[overclock] save failed:', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('timer:scheduleDeadline', (_event, payload) => {
  if (focusDeadlineTimer) clearTimeout(focusDeadlineTimer);
  const delayMs = Math.max(0, Math.min(Number(payload?.delayMs) || 0, 7 * 86400000));
  const sessionId = String(payload?.sessionId || '');
  const title = String(payload?.title || 'Focus timer').slice(0, 120);
  const body = String(payload?.body || '').slice(0, 300);
  if (!sessionId || delayMs <= 0) return { ok: false };
  focusDeadlineTimer = setTimeout(() => {
    focusDeadlineTimer = null;
    try {
      if ((!mainWindow || !mainWindow.isVisible() || !mainWindow.isFocused()) && Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch (err) {
      console.error('[overclock] timer notification failed:', err);
    }
    if (mainWindow) mainWindow.webContents.send('timer:deadline', { sessionId });
  }, delayMs);
  return { ok: true };
});

ipcMain.on('timer:cancelDeadline', () => {
  if (focusDeadlineTimer) clearTimeout(focusDeadlineTimer);
  focusDeadlineTimer = null;
});

ipcMain.handle('shell:showDataFolder', () => {
  try {
    shell.showItemInFolder(dataFilePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('app:getLaunchOnStartup', () => {
  // Ask Windows directly rather than trusting our own JSON file, in case
  // the user flipped it off from Windows Settings > Apps > Startup.
  if (!app.isPackaged) return { enabled: true, devMode: true };
  const settings = app.getLoginItemSettings();
  return { enabled: !!settings.openAtLogin };
});

ipcMain.handle('app:setLaunchOnStartup', (_event, enabled) => {
  syncLoginItemSetting(enabled);
  return { ok: true, enabled: !!enabled };
});

ipcMain.handle('shell:openExternal', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//i.test(url)) {
    shell.openExternal(url);
    return { ok: true };
  }
  return { ok: false, error: 'Blocked: only https:// links may be opened.' };
});

ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.hide());

ipcMain.handle('dialog:exportFile', async (_event, { defaultName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'CSV', extensions: ['csv'] },
    ],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('dialog:importFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});
