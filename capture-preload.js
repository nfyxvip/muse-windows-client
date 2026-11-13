/**
 * capture-preload.js — preload for the screenshot picker/preview window.
 *
 * Exposes source listing, capture, clipboard copy and save through
 * contextBridge. No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museCapture', {
  listSources: () => ipcRenderer.invoke('capture-list-sources'),
  take: (sourceId) => ipcRenderer.invoke('capture-take', sourceId),
  copyImage: (dataUrl) => ipcRenderer.invoke('image-copy', dataUrl),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('image-save', dataUrl, defaultName),
  close: () => ipcRenderer.send('capture-close'),
});
