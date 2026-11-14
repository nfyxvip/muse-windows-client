/**
 * runner-preload.js — preload for the local task runner window.
 *
 * Exposes task-package parsing, folder picking, running, aborting
 * and report handling through contextBridge. No Node.js APIs are
 * exposed to the page. All validation, whitelisting and execution
 * happen in the main process; the page only displays.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museRunner', {
  getState: () => ipcRenderer.invoke('runner:get-state'),
  pickFolder: () => ipcRenderer.invoke('runner:pick-folder'),
  parse: (text) => ipcRenderer.invoke('runner:parse', text),
  check: (pkg, cwd) => ipcRenderer.invoke('runner:check', pkg, cwd),
  run: (pkg, cwd) => ipcRenderer.invoke('runner:run', pkg, cwd),
  abort: () => ipcRenderer.invoke('runner:abort'),
  copyReport: (report) => ipcRenderer.invoke('runner:copy-report', report),
  saveReport: (report, cwd, title) => ipcRenderer.invoke('runner:save-report', report, cwd, title),
  onProgress: (cb) => ipcRenderer.on('runner:progress', (event, info) => cb(info)),
  onFinished: (cb) => ipcRenderer.on('runner:finished', (event, info) => cb(info)),
  openSettings: () => ipcRenderer.send('runner:open-settings'),
  close: () => ipcRenderer.send('runner:close'),
  getSchedules: () => ipcRenderer.invoke('runner:schedule-list'),
  addSchedule: (input) => ipcRenderer.invoke('runner:schedule-add', input),
  setScheduleEnabled: (id, enabled) => ipcRenderer.invoke('runner:schedule-set-enabled', id, enabled),
  deleteSchedule: (id) => ipcRenderer.invoke('runner:schedule-delete', id),
  runScheduleNow: (id) => ipcRenderer.invoke('runner:schedule-run-now', id),
  onScheduleLog: (cb) => ipcRenderer.on('runner:schedule-log', (event, entry) => cb(entry)),
});
