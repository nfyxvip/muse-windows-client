/**
 * config.js — simple persistent settings for Muse Windows Client.
 *
 * Settings are stored as JSON in the app's userData folder
 * (e.g. %APPDATA%\Muse Windows Client\config.json on Windows).
 * No Muse passwords, tokens, or login data are ever stored here.
 * The one exception is a local-model API key, and only if the user
 * types one in for their own model server: it is stored in the same
 * local file, on their own machine, and is only ever sent to the
 * endpoint they configured. llama.cpp needs no key by default.
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

function sanitizeStringList(raw, max) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim();
    if (!value) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

// --- File access authorisation (Phase 3) ------------------------------
// The shell only reads files the user explicitly authorised. A file
// under a blocked folder is always denied, even if it is also under
// an authorised folder. Comparisons are case-insensitive on Windows.

function normalizeForCompare(p) {
  let resolved = path.resolve(String(p || ''));
  if (process.platform === 'win32') resolved = resolved.toLowerCase();
  return resolved;
}

function isUnderDir(filePath, dirPath) {
  const file = normalizeForCompare(filePath);
  const dir = normalizeForCompare(dirPath);
  return file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
}

/**
 * Check a file against the authorised/blocked folder lists.
 * Returns { ok: true } or { ok: false, reason: 'not-authorized' |
 * 'blocked' | 'no-folders' }.
 */
function authorizeFile(filePath, authorizedFolders, blockedFolders) {
  const blocked = Array.isArray(blockedFolders) ? blockedFolders : [];
  const authorized = Array.isArray(authorizedFolders) ? authorizedFolders : [];
  if (blocked.some((d) => isUnderDir(filePath, d))) {
    return { ok: false, reason: 'blocked' };
  }
  if (authorized.length === 0) {
    return { ok: false, reason: 'no-folders' };
  }
  if (authorized.some((d) => isUnderDir(filePath, d))) {
    return { ok: true };
  }
  return { ok: false, reason: 'not-authorized' };
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

// --- Local model providers (Phase 7, CC Switch style) -----------------
// A provider is one model endpoint: name, preset, protocol, host,
// port, optional API key, optional model name (empty = auto-detect
// from /v1/models). The host must be a bare hostname or IP — no
// scheme, no path, no userinfo — so a crafted value cannot turn the
// test/chat fetch into a request somewhere else.

const LOCAL_MODEL_PRESETS = ['llama.cpp', 'Ollama', 'LM Studio', '自定义'];
const LOCAL_MODEL_PRESET_PORTS = { 'llama.cpp': 8080, Ollama: 11434, 'LM Studio': 1234 };

function sanitizeLocalModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const preset = LOCAL_MODEL_PRESETS.includes(raw.preset) ? raw.preset : '自定义';
  const protocol = raw.protocol === 'https' ? 'https' : 'http';
  const host = typeof raw.host === 'string' ? raw.host.trim().replace(/\/+$/, '') : '';
  // Bare hostname / IPv4 / IPv6 literal only. Rejects schemes, paths,
  // userinfo, ports embedded in the host, and anything else.
  if (!/^(?:[A-Za-z0-9._-]+|\[[0-9A-Fa-f:]+\])$/.test(host) || host.length > 255) return null;
  let port = Number(raw.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    port = LOCAL_MODEL_PRESET_PORTS[preset] || 0;
  }
  if (!port) return null;
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim().slice(0, 64)
    : `lm-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim().slice(0, 80)
    : preset;
  return {
    id,
    name,
    preset,
    protocol,
    host,
    port: Math.round(port),
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.slice(0, 500) : '',
    model: typeof raw.model === 'string' ? raw.model.trim().slice(0, 200) : '',
  };
}

function sanitizeLocalModels(raw, max) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const p = sanitizeLocalModel(item);
    if (!p) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** Base URL for a sanitized provider, e.g. http://192.168.1.20:8080 */
function localModelBaseUrl(provider) {
  return `${provider.protocol}://${provider.host}:${provider.port}`;
}

// --- Scheduled runner tasks (Phase 8, v0.10.0) -------------------------
// Shape validation only; the task package itself is re-validated
// with parseTaskPackage in the main process before a task is saved.

function sanitizeRunnerTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : null;
  if (!id) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : '定时任务';
  const kind = raw.kind === 'weekly' ? 'weekly' : 'daily';
  const time = typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : '09:00';
  let weekday = Number(raw.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) weekday = 1;
  const cwd = typeof raw.cwd === 'string' ? raw.cwd : '';
  if (!cwd) return null;
  const pkg = raw.package;
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return null;
  const title = typeof pkg.title === 'string' && pkg.title.trim() ? pkg.title.trim().slice(0, 120) : '未命名任务';
  if (!Array.isArray(pkg.steps) || pkg.steps.length === 0 || pkg.steps.length > 20) return null;
  for (const s of pkg.steps) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    if (typeof s.cmd !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s.cmd)) return null;
    if (s.args !== undefined && (!Array.isArray(s.args) || s.args.some((a) => typeof a !== 'string'))) return null;
  }
  return {
    id,
    name,
    enabled: raw.enabled !== false,
    kind,
    time,
    weekday,
    cwd,
    package: { title, steps: pkg.steps.map((s) => ({ cmd: s.cmd, args: s.args || [] })) },
    lastRunKey: typeof raw.lastRunKey === 'string' ? raw.lastRunKey : '',
  };
}

function sanitizeRunnerTasks(raw, max) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const t = sanitizeRunnerTask(item);
    if (!t) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeScheduleLog(raw, max) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    out.push({
      taskId: typeof item.taskId === 'string' ? item.taskId : '',
      name: typeof item.name === 'string' ? item.name.slice(0, 120) : '',
      at: typeof item.at === 'string' ? item.at : '',
      ok: Number(item.ok) || 0,
      total: Number(item.total) || 0,
      aborted: !!item.aborted,
      error: typeof item.error === 'string' ? item.error.slice(0, 300) : '',
    });
    if (out.length >= max) break;
  }
  return out;
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
  // Folders the user explicitly authorised the shell to read from.
  // Empty means the shell reads nothing (it always asks first).
  authorizedFolders: [],
  // Folders that are always denied, even under an authorised folder.
  blockedFolders: [],
  // Recently sent files (paths only, never content). Max 10.
  recentFiles: [],
  // Dictation (Phase 4): online speech recognition in a small window.
  // No audio is stored; recognised text is copied to the clipboard.
  dictationEnabled: true,
  // Accelerator that toggles the dictation window.
  dictationShortcut: 'CommandOrControl+Alt+D',
  // Recognition language: 'zh-CN' | 'en-US'.
  dictationLanguage: 'zh-CN',
  // 'click' = click to start/stop, 'hold' = hold the button to talk.
  dictationMode: 'click',
  // Copy recognised text to the clipboard automatically.
  dictationAutoCopy: true,
  // Last dictation window bounds { x, y, width, height } or null.
  dictationBounds: null,
  // Allow the web page and dictation to use the microphone.
  microphoneEnabled: true,
  // Phase 5 permissions — all default OFF. Each one asks for
  // confirmation on first use.
  screenshotEnabled: false,
  cameraEnabled: false,
  automationEnabled: false,
  // Accelerator that opens the screenshot picker.
  screenshotShortcut: 'CommandOrControl+Alt+S',
  // Local automation whitelist: only these actions can run, and only
  // after a per-use confirmation. Everything else is blocked.
  automationAllowNotepad: false,
  automationAllowCalculator: false,
  automationAllowExplorer: false,
  automationAllowBrowser: false,
  // Permissions the user has already confirmed on first use
  // ('screenshot' | 'camera' | 'automation').
  confirmedPermissions: [],
  // Phase 6: filename search.
  searchShortcut: 'CommandOrControl+Alt+F',
  // Starred file paths shown in the search window (max 20).
  favoriteFiles: [],
  // Phase 7 (v0.8.0): local model providers, CC Switch style.
  // Each provider: { id, name, preset, protocol, host, port, apiKey, model }.
  // preset: 'llama.cpp' | 'Ollama' | 'LM Studio' | '自定义'.
  // Only the provider named by activeLocalModelId is enabled.
  // The Muse web app itself still talks to Meta's cloud; the local
  // model powers a separate chat window in this client.
  localModels: [],
  activeLocalModelId: null,
  // Accelerator that toggles the local model chat window.
  localModelShortcut: 'CommandOrControl+Alt+L',
  // Last local model chat window bounds { x, y, width, height } or null.
  localModelBounds: null,
  // Phase 8 (v0.9.0): local task runner. Runs a "task package" — a
  // JSON list of commands Edison gives in chat. The user pastes it
  // into the runner window, picks an authorized folder, confirms,
  // and the client runs the steps one by one (spawn, no shell),
  // capturing output into a Markdown report the user copies back
  // into the chat. Default OFF. Only commands on the whitelist can
  // run; anything else is refused with a pointer to Settings.
  runnerEnabled: false,
  // Accelerator that toggles the task runner window.
  runnerShortcut: 'CommandOrControl+Alt+R',
  // Whitelisted executable names the runner may start (bare names
  // only, no paths). Defaults cover the CI4 shop workflow.
  runnerAllowedCommands: ['php', 'composer', 'git', 'npm', 'node', 'npx'],
  // Last task runner window bounds { x, y, width, height } or null.
  runnerBounds: null,
  // Phase 8 (v0.10.0): scheduled runner tasks. Each task:
  // { id, name, enabled, kind: 'daily'|'weekly', time: 'HH:MM',
  // weekday: 0-6 (weekly only, 0 = Sunday), cwd, package: { title, steps },
  // lastRunKey: 'YYYY-MM-DD HH:MM' of the last slot that ran }.
  // A task runs automatically when the app is open and its time
  // comes; creating + enabling a task is the consent (no per-run
  // dialog — that is the point of a scheduled task). Missed slots
  // are NOT caught up when the app was closed.
  runnerScheduledTasks: [],
  // Log of scheduled runs (newest first, max 20):
  // { taskId, name, at (ISO), ok, total, aborted, error }.
  runnerScheduleLog: [],
  // Phase 8 (v0.11.0): file pack window bounds { x, y, width, height } or null.
  packBounds: null,
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
  out.authorizedFolders = sanitizeStringList(raw.authorizedFolders, 50);
  out.blockedFolders = sanitizeStringList(raw.blockedFolders, 50);
  out.recentFiles = sanitizeStringList(raw.recentFiles, 10);
  if (typeof raw.dictationEnabled === 'boolean') out.dictationEnabled = raw.dictationEnabled;
  if (isValidAccelerator(raw.dictationShortcut)) out.dictationShortcut = raw.dictationShortcut;
  if (raw.dictationLanguage === 'zh-CN' || raw.dictationLanguage === 'en-US') {
    out.dictationLanguage = raw.dictationLanguage;
  }
  if (raw.dictationMode === 'click' || raw.dictationMode === 'hold') {
    out.dictationMode = raw.dictationMode;
  }
  if (typeof raw.dictationAutoCopy === 'boolean') out.dictationAutoCopy = raw.dictationAutoCopy;
  const db = sanitizeBounds(raw.dictationBounds, 360, 480);
  if (db) out.dictationBounds = db;
  if (typeof raw.microphoneEnabled === 'boolean') out.microphoneEnabled = raw.microphoneEnabled;
  if (typeof raw.screenshotEnabled === 'boolean') out.screenshotEnabled = raw.screenshotEnabled;
  if (typeof raw.cameraEnabled === 'boolean') out.cameraEnabled = raw.cameraEnabled;
  if (typeof raw.automationEnabled === 'boolean') out.automationEnabled = raw.automationEnabled;
  if (isValidAccelerator(raw.screenshotShortcut)) out.screenshotShortcut = raw.screenshotShortcut;
  if (typeof raw.automationAllowNotepad === 'boolean') out.automationAllowNotepad = raw.automationAllowNotepad;
  if (typeof raw.automationAllowCalculator === 'boolean') out.automationAllowCalculator = raw.automationAllowCalculator;
  if (typeof raw.automationAllowExplorer === 'boolean') out.automationAllowExplorer = raw.automationAllowExplorer;
  if (typeof raw.automationAllowBrowser === 'boolean') out.automationAllowBrowser = raw.automationAllowBrowser;
  out.confirmedPermissions = sanitizeStringList(raw.confirmedPermissions, 10)
    .filter((p) => p === 'screenshot' || p === 'camera' || p === 'automation' || p === 'runner');
  if (isValidAccelerator(raw.searchShortcut)) out.searchShortcut = raw.searchShortcut;
  out.favoriteFiles = sanitizeStringList(raw.favoriteFiles, 20);
  out.localModels = sanitizeLocalModels(raw.localModels, 10);
  if (typeof raw.activeLocalModelId === 'string' && raw.activeLocalModelId &&
      out.localModels.some((p) => p.id === raw.activeLocalModelId)) {
    out.activeLocalModelId = raw.activeLocalModelId;
  } else {
    out.activeLocalModelId = null;
  }
  if (isValidAccelerator(raw.localModelShortcut)) out.localModelShortcut = raw.localModelShortcut;
  const lb = sanitizeBounds(raw.localModelBounds, 420, 480);
  if (lb) out.localModelBounds = lb;
  if (typeof raw.runnerEnabled === 'boolean') out.runnerEnabled = raw.runnerEnabled;
  if (isValidAccelerator(raw.runnerShortcut)) out.runnerShortcut = raw.runnerShortcut;
  // Runner whitelist: bare executable names only (no paths, no shell
  // characters), lowercased, max 20. Anything else is dropped.
  out.runnerAllowedCommands = sanitizeStringList(raw.runnerAllowedCommands, 20)
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => /^[a-z0-9][a-z0-9._-]*$/.test(c));
  const rb = sanitizeBounds(raw.runnerBounds, 480, 520);
  if (rb) out.runnerBounds = rb;
  out.runnerScheduledTasks = sanitizeRunnerTasks(raw.runnerScheduledTasks, 20);
  out.runnerScheduleLog = sanitizeScheduleLog(raw.runnerScheduleLog, 20);
  const pb = sanitizeBounds(raw.packBounds, 520, 520);
  if (pb) out.packBounds = pb;
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
  authorizeFile,
  isUnderDir,
  sanitizeLocalModel,
  sanitizeLocalModels,
  localModelBaseUrl,
  LOCAL_MODEL_PRESETS,
  LOCAL_MODEL_PRESET_PORTS,
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
