/**
 * region-preload.js — preload for the region-selection overlay.
 *
 * Exposes "rectangle selected", "cancelled", copy and save through
 * contextBridge, plus a callback for when the capture is ready.
 * No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museRegion', {
  selectRect: (rect) => ipcRenderer.send('region-selected', rect),
  cancel: () => ipcRenderer.send('region-cancel'),
  copy: () => ipcRenderer.invoke('region-copy'),
  save: () => ipcRenderer.invoke('region-save'),
  onCaptured: (cb) => ipcRenderer.on('region-captured', (event, info) => cb(info)),
});
