'use strict';

/**
 * Preload - runs in an isolated context with access to Node, but the
 * renderer (contextIsolation:true) cannot reach into it except through
 * what we explicitly hang on `window.api` below. Keep this list short:
 * every function added here is a function the renderer is trusted with.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  exportFile: (defaultName, content) =>
    ipcRenderer.invoke('dialog:exportFile', { defaultName, content }),
  importFile: () => ipcRenderer.invoke('dialog:importFile'),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  getLaunchOnStartup: () => ipcRenderer.invoke('app:getLaunchOnStartup'),
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke('app:setLaunchOnStartup', enabled),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  showDataFolder: () => ipcRenderer.invoke('shell:showDataFolder'),

  onReminder: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('reminder:fire', handler);
    return () => ipcRenderer.removeListener('reminder:fire', handler);
  },

  platform: process.platform,
});
