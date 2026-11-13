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
  startRegion: () => ipcRenderer.invoke('region-start'),
  recrop: (rect) => ipcRenderer.invoke('capture-recrop', rect),
  onRegionShot: (cb) => ipcRenderer.on('region-shot', (event, shot) => cb(shot)),
  copyImage: (dataUrl) => ipcRenderer.invoke('image-copy', dataUrl),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('image-save', dataUrl, defaultName),
  close: () => ipcRenderer.send('capture-close'),
});
