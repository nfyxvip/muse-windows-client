/**
 * Preload script — intentionally minimal and safe.
 *
 * No Node.js APIs are exposed to the web page. The only bridge is a
 * small read-only object that lets the page (if it ever needs to)
 * know it is running inside this wrapper and which app version it is.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { version } = require('./package.json');

contextBridge.exposeInMainWorld('museClient', {
  appName: 'Muse Windows Client',
  appVersion: version,
  platform: process.platform,
});

// Report file drops to the main process. The page itself gets the
// drop first (muse.ai may accept it as an upload); the main process
// only acts if the page did not handle it (a file:// navigation
// follows the drop). File objects carry a .path in Electron.
window.addEventListener('drop', (event) => {
  try {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || files.length === 0) return;
    const paths = [];
    for (const f of files) {
      if (f && typeof f.path === 'string' && f.path) paths.push(f.path);
    }
    if (paths.length > 0) ipcRenderer.send('dropped-files', paths);
  } catch (_) {
    // Never let reporting a drop break the page.
  }
});
