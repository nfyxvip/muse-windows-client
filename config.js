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

const MODIFIERS = new Set([
  'Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl',
  'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta',
]);
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Enter', 'Return', 'Escape', 'Esc', 'Backspace',
  'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'Up', 'Down', 'Left', 'Right', 'Plus', 'Minus',
]);

/**
 * Validate an Electron accelerator string: at least one modifier plus
 * one key. Anything invalid falls back to the default, so a bad value
 * in the config file can never break shortcut registration.
 */
function isValidAccelerator(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('+').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (MODIFIERS.has(key)) return false;
  return NAMED_KEYS.has(key) || /^[A-Za-z0-9]$/.test(key) || /^F([1-9]|1\d|2[0-4])$/.test(key);
}

function sanitizeBounds(raw, minWidth, minHeight) {
  if (!raw || typeof raw !== 'object') return null;
  const width = Number(raw.width);
  const height = Number(raw.height);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < minWidth || height < minHeight) return null;
  return {
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
    width: Math.round(width),
    height: Math.round(height),
  };
}

const DEFAULTS = Object.freeze({
  // Launch at Windows login. Default off.
  autoStart: false,
  // 'minimize-to-tray' | 'quit'
  closeBehaviour: 'minimize-to-tray',
  // Global shortcut (show/hide main window) enabled?
  shortcutEnabled: true,
  // Accelerator for show/hide main window. Customisable in Settings.
  toggleShortcut: 'CommandOrControl+Alt+M',
  // Quick chat mini window enabled? Default on.
  quickChatEnabled: true,
  // Accelerator that toggles the Quick chat window.
  quickChatShortcut: 'CommandOrControl+Alt+Q',
  // Last Quick chat window bounds { x, y, width, height } or null.
  quickChatBounds: null,
  // Floating button (small always-on-top window). Default off.
  floatingButtonEnabled: false,
  // Last floating button position { x, y } or null.
  floatingButtonBounds: null,
  // Master switch for notifications (web notifications + app toasts).
  notificationsEnabled: true,
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
  if (isValidAccelerator(raw.toggleShortcut)) out.toggleShortcut = raw.toggleShortcut;
  if (typeof raw.quickChatEnabled === 'boolean') out.quickChatEnabled = raw.quickChatEnabled;
  if (isValidAccelerator(raw.quickChatShortcut)) out.quickChatShortcut = raw.quickChatShortcut;
  const qcb = sanitizeBounds(raw.quickChatBounds, 360, 480);
  if (qcb) out.quickChatBounds = qcb;
  if (typeof raw.floatingButtonEnabled === 'boolean') out.floatingButtonEnabled = raw.floatingButtonEnabled;
  if (raw.floatingButtonBounds && typeof raw.floatingButtonBounds === 'object') {
    const fx = Number(raw.floatingButtonBounds.x);
    const fy = Number(raw.floatingButtonBounds.y);
    if (Number.isFinite(fx) && Number.isFinite(fy)) {
      out.floatingButtonBounds = { x: Math.round(fx), y: Math.round(fy) };
    }
  }
  if (typeof raw.notificationsEnabled === 'boolean') out.notificationsEnabled = raw.notificationsEnabled;
  if (typeof raw.zoomFactor === 'number' && Number.isFinite(raw.zoomFactor)) {
    out.zoomFactor = Math.min(2.0, Math.max(0.5, raw.zoomFactor));
  }
  if (typeof raw.checkUpdatesOnStartup === 'boolean') {
    out.checkUpdatesOnStartup = raw.checkUpdatesOnStartup;
  }
  const wb = sanitizeBounds(raw.windowBounds, 600, 400);
  if (wb) out.windowBounds = wb;
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
