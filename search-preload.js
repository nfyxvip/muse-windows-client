/**
 * search-preload.js — preload for the filename search window.
 *
 * Exposes search, favorites, copy-path and show-in-folder through
 * contextBridge. No Node.js APIs are exposed to the page.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museSearch', {
  getState: () => ipcRenderer.invoke('search-state'),
  search: (query) => ipcRenderer.invoke('search-files', query),
  toggleFavorite: (filePath) => ipcRenderer.invoke('search-toggle-favorite', filePath),
  copyPath: (filePath) => ipcRenderer.invoke('search-copy-path', filePath),
  openFolder: (filePath) => ipcRenderer.invoke('search-open-folder', filePath),
  close: () => ipcRenderer.send('search-close'),
});
