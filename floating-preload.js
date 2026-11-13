/**
 * floating-preload.js — preload for the floating button window only.
 *
 * Exposes one action (toggle the main window) through contextBridge.
 * No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museFloating', {
  toggleMain: () => ipcRenderer.invoke('floating-toggle-main'),
  sendFiles: (paths) => ipcRenderer.send('floating-drop-files', paths),
});
