/**
 * config.js — simple persistent settings for Muse Windows Client.
 *
 * Settings are stored as JSON in the app's userData folder
 * (e.g. %APPDATA%\Muse Windows Client\config.json on Windows).
 * No passwords, tokens, or login data are ever stored here.
 *
 * Defaults are applied for missing / invalid values, so a corrupt
 * or hand-edited config file can never crash the app on startup.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = Object.freeze({
  // Launch at Windows login. Default off.
  autoStart: false,
  // 'minimize-to-tray' | 'quit'
  closeBehaviour: 'minimize-to-tray',
  // Global shortcut Ctrl+Alt+M enabled?
  shortcutEnabled: true,
  // Web page zoom factor, clamped to 0.5 – 2.0.
  zoomFactor: 1.0,
  // Last main-window bounds { x, y, width, height } or null.
  windowBounds: null,
  // Check for updates (silently) shortly after startup.
  checkUpdatesOnStartup: true,
});

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

  if (typeof raw.autoStart === 'boolean') out.autoStart = raw.autoStart;
  if (raw.closeBehaviour === 'minimize-to-tray' || raw.closeBehaviour === 'quit') {
    out.closeBehaviour = raw.closeBehaviour;
  }
  if (typeof raw.shortcutEnabled === 'boolean') out.shortcutEnabled = raw.shortcutEnabled;
  if (typeof raw.zoomFactor === 'number' && Number.isFinite(raw.zoomFactor)) {
    out.zoomFactor = Math.min(2.0, Math.max(0.5, raw.zoomFactor));
  }
  if (typeof raw.checkUpdatesOnStartup === 'boolean') {
    out.checkUpdatesOnStartup = raw.checkUpdatesOnStartup;
  }
  if (raw.windowBounds && typeof raw.windowBounds === 'object') {
    const b = raw.windowBounds;
    const width = Number(b.width);
    const height = Number(b.height);
    const x = Number(b.x);
    const y = Number(b.y);
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 600 && height >= 400) {
      out.windowBounds = {
        x: Number.isFinite(x) ? Math.round(x) : 0,
        y: Number.isFinite(y) ? Math.round(y) : 0,
        width: Math.round(width),
        height: Math.round(height),
      };
    }
  }
  return out;
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    cache = sanitize(raw);
  } catch (err) {
    // Missing file on first run, or a corrupt file: start from defaults.
    if (err && err.code !== 'ENOENT') {
      console.warn('Could not read config, using defaults:', err.message);
    }
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  const data = { ...load() };
  const file = configPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write to a temp file first, then rename, so a crash mid-write
    // cannot leave a half-written config behind.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn('Could not save config:', err.message);
  }
  return data;
}

module.exports = {
  DEFAULTS,
  load,
  save,
  get(key) {
    return load()[key];
  },
  /** Merge a partial settings object, validate it, persist it, return the full settings. */
  update(partial) {
    if (!partial || typeof partial !== 'object') return load();
    cache = sanitize({ ...load(), ...partial });
    save();
    return { ...cache };
  },
};
