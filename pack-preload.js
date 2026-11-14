/**
 * pack-preload.js — preload for the file pack window.
 *
 * Exposes folder picking, scanning, packing, copying and saving
 * through contextBridge. No Node.js APIs are exposed to the page.
 * All scanning, filtering and packing happen in the main process.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('musePack', {
  getState: () => ipcRenderer.invoke('pack:get-state'),
  pickFolder: () => ipcRenderer.invoke('pack:pick-folder'),
  scan: (root) => ipcRenderer.invoke('pack:scan', root),
  build: (root, selected) => ipcRenderer.invoke('pack:build', root, selected),
  copy: (text) => ipcRenderer.invoke('pack:copy', text),
  save: (text, root) => ipcRenderer.invoke('pack:save', text, root),
  close: () => ipcRenderer.send('pack:close'),
});
