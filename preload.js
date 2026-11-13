/**
 * Preload script — intentionally minimal and safe.
 *
 * No Node.js APIs are exposed to the web page. The only bridge is a
 * small read-only object that lets the page (if it ever needs to)
 * know it is running inside this wrapper and which app version it is.
 */
'use strict';

const { contextBridge } = require('electron');
const { version } = require('./package.json');

contextBridge.exposeInMainWorld('museClient', {
  appName: 'Muse Windows Client',
  appVersion: version,
  platform: process.platform,
});
