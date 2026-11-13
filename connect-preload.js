/**
 * connect-preload.js — preload for the cloud-services window.
 *
 * Exposes only the fixed service list and an allow-listed open through
 * contextBridge. No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museConnect', {
  list: () => ipcRenderer.invoke('connect-list'),
  open: (url) => ipcRenderer.invoke('connect-open', url),
  close: () => ipcRenderer.send('connect-close'),
});
