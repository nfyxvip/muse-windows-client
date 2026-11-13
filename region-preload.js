/**
 * region-preload.js — preload for the region-selection overlay.
 *
 * Exposes only "rectangle selected" and "cancelled" through
 * contextBridge. No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museRegion', {
  selectRect: (rect) => ipcRenderer.send('region-selected', rect),
  cancel: () => ipcRenderer.send('region-cancel'),
});
