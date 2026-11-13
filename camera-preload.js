/**
 * camera-preload.js — preload for the camera window.
 *
 * Exposes clipboard copy and save through contextBridge. The camera
 * itself is accessed from the page with getUserMedia; no video is
 * ever recorded or stored by the app.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museCamera', {
  copyImage: (dataUrl) => ipcRenderer.invoke('image-copy', dataUrl),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('image-save', dataUrl, defaultName),
  close: () => ipcRenderer.send('camera-close'),
});
