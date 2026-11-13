/**
 * dictation-preload.js — preload for the dictation window only.
 *
 * Exposes settings access plus clipboard copy through contextBridge.
 * No Node.js APIs are exposed to the page. No audio is ever stored.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museDictation', {
  get: () => ipcRenderer.invoke('settings-get'),
  set: (partial) => ipcRenderer.invoke('settings-set', partial),
  copyText: (text) => ipcRenderer.invoke('dictation-copy', text),
  copiedToast: () => ipcRenderer.invoke('dictation-copied-toast'),
  close: () => ipcRenderer.send('dictation-close'),
});
