/**
 * settings-preload.js — preload for the local Settings window only.
 *
 * Exposes a minimal, safe bridge to the main process. No Node.js
 * APIs are exposed to the page; the Settings window is local trusted
 * HTML, but it still goes through contextBridge + ipcRenderer only.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museSettings', {
  get: () => ipcRenderer.invoke('settings-get'),
  set: (partial) => ipcRenderer.invoke('settings-set', partial),
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),
  close: () => ipcRenderer.send('settings-close'),
});
