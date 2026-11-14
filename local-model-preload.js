/**
 * local-model-preload.js — preload for the local model chat window.
 *
 * Exposes the active provider, streaming chat, and window controls
 * through contextBridge. No Node.js APIs are exposed to the page.
 * The endpoint is resolved in the main process from the stored
 * config; the page never sees the API key or the raw host/port.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museLocalModel', {
  getActive: () => ipcRenderer.invoke('local-model:get-active'),
  send: (providerId, messages) => ipcRenderer.invoke('local-model:send', providerId, messages),
  abort: () => ipcRenderer.send('local-model:abort'),
  onChunk: (cb) => ipcRenderer.on('local-model:chunk', (event, text) => cb(text)),
  onDone: (cb) => ipcRenderer.on('local-model:done', (event, info) => cb(info)),
  onError: (cb) => ipcRenderer.on('local-model:error', (event, message) => cb(message)),
  openSettings: () => ipcRenderer.send('local-model:open-settings'),
  close: () => ipcRenderer.send('local-model:close'),
});
