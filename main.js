/**
 * Muse Windows Client — a simple unofficial wrapper (v0.7.3).
 *
 * This app only opens the Muse web app (https://muse.ai) in a desktop
 * window. It is NOT an official Muse client, and it does not add any
 * Muse account, login, or native Mac-only features. You log in with
 * your own Muse account inside the window, exactly as on the web.
 *
 * Phase 1 (v0.2.0):
 * - Settings are persisted in %APPDATA%\Muse Windows Client\config.json
 *   (window size/position, zoom, close behaviour, shortcut on/off,
 *   auto-start, update check on startup) and restored on launch.
 * - Auto-start is no longer reset on every launch.
 * - A minimal Settings window (tray menu / File menu > Settings).
 * - Update checking via electron-updater + GitHub Releases: check +
 *   prompt + manual download only, never silent auto-install.
 *
 * Phase 2 (v0.3.0):
 * - Quick chat: a small window (same login session as the main window)
 *   toggled by a global shortcut (default Ctrl+Alt+Q). Esc hides it.
 * - Floating button: a small draggable always-on-top button (off by
 *   default); click it to show/hide the main window.
 * - Customisable shortcuts: both global shortcuts can be changed in
 *   Settings; a shortcut that fails to register reports the conflict
 *   instead of silently doing nothing.
 * - Notifications: a master switch in Settings. Web notifications from
 *   muse.ai are allowed/denied through it, and the app's own toasts
 *   honour it too.
 *
 * Phase 3 (v0.4.0):
 * - File drag & drop: dropping a file on the main window / Quick chat
 *   is first offered to the web page (muse.ai decides whether it
 *   accepts the drop). If the page does not handle it, the shell
 *   steps in: it checks the authorised-folders list and copies the
 *   file's content (text, up to 512 KB) or its path (binary / large)
 *   to the clipboard, so the user can paste it into the chat.
 * - File picker: File menu / tray "发送文件到聊天…" opens the system
 *   file picker and does the same check-and-copy.
 * - Authorised folders: Settings holds an explicit allow list (added
 *   one by one) and a block list (always wins). The shell never reads
 *   outside the allow list. Recent files (paths only, max 10) can be
 *   re-copied from Settings.
 *
 * Phase 4 (v0.5.0):
 * - Dictation: a small window using the Web Speech API (online) to
 *   recognise speech in Chinese or English. Recognised text is copied
 *   to the clipboard (automatically, or with a button) for pasting
 *   into the chat. No audio is stored, and nothing is typed into
 *   other apps automatically — clipboard only, by design.
 * - Microphone permission is gated by a setting, for both the web
 *   page and the dictation window.
 *
 * Phase 5 (v0.6.0):
 * - Screenshot: pick a screen or a window, preview it, then copy it
 *   to the clipboard (paste into the chat) or save it as a PNG.
 * - Camera: a small window with a live preview; take a photo, then
 *   copy it to the clipboard or save it.
 * - Local automation, strictly bounded: only four whitelisted
 *   actions (Notepad, Calculator, File Explorer, default browser),
 *   each toggled in Settings and confirmed on every single use.
 *   No remote triggering, no background control, no key/mouse
 *   recording. All three permissions default OFF and ask for
 *   confirmation on first use.
 *
 * v0.6.1 adds region screenshot to Phase 5: drag a rectangle on the
 * screen to capture just that region (DPI-aware cropping), plus
 * exact X / Y / width / height inputs in the preview to re-crop
 * the last capture to a precise size.
 *
 * v0.7.1 changes the region flow from user feedback: the screenshot
 * shortcut now goes straight into region selection (crosshair
 * cursor, no picker in between). After dragging, a small
 * Copy / Save toolbar appears at the bottom-right of the selected
 * region; double-clicking inside the region (or pressing Enter)
 * copies it straight to the clipboard.
 *
 * v0.7.2 fixes the connector sign-in flow: popups and navigations
 * to agent.meta.ai and the providers' login pages (Google,
 * Microsoft, Apple) now open in-app, so the connect page gets a
 * real popup window and the OAuth flow can finish and report back.
 * Before this, those popups were denied and sent to the external
 * browser, so window.open returned null and the web app reported
 * "无法打开连接页面".
 *
 * v0.7.3 fixes region screenshot double-click: clicking inside an
 * existing selection no longer restarts the selection (which used
 * to clear it before the double-click could fire), the Copy/Save
 * toolbar now appears immediately on mouse-up instead of waiting
 * for the capture, and a copy/save requested before the capture
 * finishes is queued and runs as soon as it lands. The overlay
 * also gets a ✕ button and slightly lighter dimming.
 *
 * v0.8.0 adds local models (Phase 7): connect to your own model
 * server (llama.cpp, Ollama, LM Studio) through an OpenAI-compatible
 * API. Settings holds several provider profiles, CC Switch style
 * (preset, protocol, host, port, optional key, model; one active
 * at a time), and a chat window talks to the active one with
 * streaming replies. The Muse web app itself still talks to
 * Meta's cloud; the local model is a separate entry in this
 * client. API keys, if the user types one, are stored only in the
 * local config file and only ever sent to the configured endpoint.
 *
 * v0.9.0 adds the local task runner (Phase 8, P1 from the Claude
 * Desktop comparison): Edison gives a "task package" in chat — a
 * JSON list of commands — the user pastes it into the runner
 * window, picks an authorized folder, confirms, and the client
 * runs the steps one by one (spawn, no shell) and builds a
 * Markdown report to copy back into the chat. Only whitelisted
 * commands can run (default: php, composer, git, npm, node, npx),
 * only inside authorized folders, only after a per-run
 * confirmation. There is no direct channel between Edison and the
 * client: the user is the only bridge, and the only approver.
 *
 * Phase 6 (v0.7.0):
 * - Cloud service entries: a "Connect" window that jumps to the
 *   services' web apps (Muse, Gmail, Outlook, Google Calendar,
 *   Microsoft To Do, Google Drive, OneDrive). Authorization happens
 *   in the Muse web app through its official connectors; this
 *   client never asks for or stores any service password.
 * - Filename-only search in authorized folders: no content is read,
 *   no whole-disk index is built. Results can be copied (paste the
 *   path into the chat) or opened in their folder. The search window
 *   also shows starred files and recent files when the query is empty.
 * - NOT built, on purpose: reading local private databases
 *   (WhatsApp / WeChat local stores, Outlook PST, Apple app data).
 *   That is a red line; cloud accounts go through official
 *   connectors instead.
 *
 * Safety notes:
 * - The web page runs sandboxed, with Node integration off and
 *   context isolation on. The preload script exposes nothing except
 *   a tiny read-only version bridge.
 * - Links that would open a new window are opened in the user's
 *   default browser instead, so you never get stuck inside the app.
 * - Closing the window minimises to the tray (unless the user chose
 *   "quit" in Settings); Quit from the tray really exits the app.
 * - No passwords, tokens, or login data are stored by this app.
 *   No remote computer control and no local app data access.
 */
'use strict';

const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, dialog, screen, ipcMain, Notification, session, clipboard, desktopCapturer } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const config = require('./config');

const MUSE_URL = 'https://muse.ai';
// Pretend to be desktop Chrome: some sites serve a broken page (or
// refuse to boot) when they see Electron's default user agent, which
// contains the word "Electron". A plain Chrome UA avoids that.
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;
const QUICK_CHAT_WIDTH = 480;
const QUICK_CHAT_HEIGHT = 640;
const DICTATION_WIDTH = 440;
const DICTATION_HEIGHT = 560;
const LOCAL_MODEL_WIDTH = 560;
const LOCAL_MODEL_HEIGHT = 680;
const RUNNER_WIDTH = 640;
const RUNNER_HEIGHT = 720;
const FLOATING_SIZE = 64;

let mainWindow = null;
let settingsWindow = null;
let quickChatWindow = null;
let dictationWindow = null;
let captureWindow = null;
let cameraWindow = null;
let regionWindow = null;
let regionOrigin = 'shortcut'; // 'shortcut' (toolbar flow) | 'picker' (preview flow)
let lastRegionShot = null; // { image: nativeImage, width, height, rect } — cropped region
let searchWindow = null;
let connectWindow = null;
let localModelWindow = null;
let localModelStreamAbort = null;
let runnerWindow = null;
let runnerCurrentChild = null;
let runnerAbortRequested = false;
let lastFullCapture = null; // { image: nativeImage, rect: {x,y,width,height} in image pixels }
let floatingWindow = null;
let tray = null;
let isQuitting = false;
// 'ok' | 'failed' | 'disabled' — one per global shortcut.
let toggleShortcutStatus = 'disabled';
let quickChatShortcutStatus = 'disabled';
let dictationShortcutStatus = 'disabled';
let screenshotShortcutStatus = 'disabled';
let searchShortcutStatus = 'disabled';
let localModelShortcutStatus = 'disabled';
let runnerShortcutStatus = 'disabled';
let updateCheckInFlight = false;

// electron-updater is optional at runtime: if it cannot be loaded,
// update checking is disabled gracefully instead of crashing.
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
} catch (err) {
  console.warn('electron-updater is unavailable, update checking is disabled:', err.message);
}

function iconCandidates() {
  const ico = path.join(__dirname, 'build', 'icon.ico');
  const png = path.join(__dirname, 'build', 'icon.png');
  // Windows prefers .ico; other platforms decode .png more reliably.
  return process.platform === 'win32' ? [ico, png] : [png, ico];
}

function iconPath() {
  for (const p of iconCandidates()) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      // Try the next candidate.
    }
  }
  return undefined;
}

/** Load the tray icon, trying each bundled icon until one decodes. */
function loadTrayImage() {
  for (const p of iconCandidates()) {
    try {
      if (!fs.existsSync(p)) continue;
      const img = nativeImage.createFromPath(p);
      if (img.isEmpty()) continue;
      return img.getSize().width > 16 ? img.resize({ width: 16, height: 16 }) : img;
    } catch (err) {
      console.warn('Tray icon candidate failed:', p, err.message);
    }
  }
  console.warn('No tray icon file could be loaded, using an empty tray image.');
  return nativeImage.createEmpty();
}

// Hosts allowed to open as in-app popups / navigations. The connector
// and sign-in flows need a real popup window: the connect page lives
// on agent.meta.ai and OAuth goes through the provider's login page.
// Denying those makes window.open return null, and the web app
// reports "无法打开连接页面" even though the browser tab did open.
// Everything else still opens in the default browser.
const POPUP_HOSTS = new Set([
  'muse.ai',
  'www.muse.ai',
  'agent.meta.ai',
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
]);

function isPopupAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && POPUP_HOSTS.has(u.hostname);
  } catch (_) {
    return false;
  }
}

function openExternal(url) {
  // Only http(s) links leave the app; anything else is dropped.
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url).catch((err) => console.warn('Could not open external link:', err.message));
  }
}

/** Clamp saved window bounds to a display that actually exists now. */
function initialBounds() {
  const saved = config.get('windowBounds');
  const fallback = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  if (!saved) return fallback;
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - 100 && saved.x < a.x + a.width &&
      saved.y >= a.y - 100 && saved.y < a.y + a.height;
  });
  if (!onScreen) return fallback;
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.max(primary.x, Math.min(saved.x, primary.x + primary.width - 200)),
    y: Math.max(primary.y, Math.min(saved.y, primary.y + primary.height - 200)),
    width: Math.min(Math.max(saved.width, 900), primary.width),
    height: Math.min(Math.max(saved.height, 600), primary.height),
  };
}

let saveBoundsTimer = null;
function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  try {
    // Do not persist a maximised/fullscreen size as the normal size.
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
    config.update({ windowBounds: mainWindow.getBounds() });
  } catch (err) {
    console.warn('Could not save window bounds:', err.message);
  }
}
function scheduleSaveBounds() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveWindowBounds, 500);
}

function applyZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.setZoomFactor(config.get('zoomFactor') || 1.0);
  } catch (err) {
    console.warn('Could not apply zoom:', err.message);
  }
}

function setZoom(delta) {
  if (!mainWindow) return;
  const next = Math.min(2.0, Math.max(0.5, (config.get('zoomFactor') || 1.0) + delta));
  config.update({ zoomFactor: next });
  applyZoom();
}

function createWindow() {
  const bounds = initialBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      partition: 'persist:muse',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      userAgent: CHROME_USER_AGENT,
    },
  });

  applyZoom();
  mainWindow.loadURL(MUSE_URL);

  // If the page itself fails to load (network down, muse.ai blocked,
  // certificate problem), Electron's blank error page tells the user
  // nothing. Show the real error code instead, with actions.
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.warn('Page failed to load:', errorCode, errorDescription, validatedURL);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: '无法打开 Muse',
      message: 'Muse 页面加载失败',
      detail:
        `地址：${validatedURL}\n错误：${errorDescription}（代码 ${errorCode}）\n\n` +
        '可能的原因：\n' +
        '• 网络无法访问 muse.ai（在中国大陆通常需要 VPN/代理才能打开 Meta 的服务）\n' +
        '• 代理或防火墙拦截了连接\n' +
        '• 证书问题\n\n' +
        '可以先在 Edge/Chrome 里打开 https://muse.ai 试试：如果浏览器里也打不开，就是网络问题，与客户端无关；如果浏览器能打开，请把上面的错误信息发给我。',
      buttons: ['重试', '在浏览器中打开', '关闭'],
      defaultId: 0,
      cancelId: 2,
    }).then(({ response }) => {
      if (response === 0 && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(MUSE_URL);
      else if (response === 1) openExternal(MUSE_URL);
    }).catch(() => {});
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    applyZoom();
  });
  mainWindow.webContents.on('did-finish-load', applyZoom);

  // Open external links in the default browser, not inside the app.
  // Connector / sign-in popups (agent.meta.ai, provider login pages)
  // open in-app so the flow can finish and report back.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isPopupAllowedUrl(url)) return { action: 'allow' };
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      // A file dropped on the page that the page did not handle.
      event.preventDefault();
      handleUnhandledDrop(url);
      return;
    }
    if (!isPopupAllowedUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);

  // Close behaviour comes from Settings: minimise to tray (default)
  // or really quit.
  mainWindow.on('close', (event) => {
    saveWindowBounds();
    if (!isQuitting && config.get('closeBehaviour') !== 'quit') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// --- Quick chat -------------------------------------------------------
// A small window on the same login partition as the main window, so
// the user is already logged in. There is no slim muse.ai entry
// point, so it loads the full web app in a compact window.

let saveQuickChatBoundsTimer = null;
function saveQuickChatBounds() {
  if (!quickChatWindow || quickChatWindow.isDestroyed() || quickChatWindow.isMinimized()) return;
  try {
    if (quickChatWindow.isMaximized() || quickChatWindow.isFullScreen()) return;
    config.update({ quickChatBounds: quickChatWindow.getBounds() });
  } catch (err) {
    console.warn('Could not save Quick chat bounds:', err.message);
  }
}
function scheduleSaveQuickChatBounds() {
  if (saveQuickChatBoundsTimer) clearTimeout(saveQuickChatBoundsTimer);
  saveQuickChatBoundsTimer = setTimeout(saveQuickChatBounds, 500);
}

function initialQuickChatBounds() {
  const saved = config.get('quickChatBounds');
  const fallback = { width: QUICK_CHAT_WIDTH, height: QUICK_CHAT_HEIGHT };
  if (!saved) return fallback;
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - 100 && saved.x < a.x + a.width &&
      saved.y >= a.y - 100 && saved.y < a.y + a.height;
  });
  if (!onScreen) return fallback;
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.max(primary.x, Math.min(saved.x, primary.x + primary.width - 200)),
    y: Math.max(primary.y, Math.min(saved.y, primary.y + primary.height - 200)),
    width: Math.min(Math.max(saved.width, 360), primary.width),
    height: Math.min(Math.max(saved.height, 480), primary.height),
  };
}

function createQuickChatWindow() {
  if (quickChatWindow && !quickChatWindow.isDestroyed()) return quickChatWindow;
  const bounds = initialQuickChatBounds();
  quickChatWindow = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 480,
    title: 'Quick chat — Muse',
    icon: iconPath(),
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      partition: 'persist:muse',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      userAgent: CHROME_USER_AGENT,
    },
  });
  quickChatWindow.loadURL(MUSE_URL);
  quickChatWindow.once('ready-to-show', () => {
    quickChatWindow.show();
    quickChatWindow.focus();
  });
  console.log('Quick chat window created.');
  // Esc hides Quick chat instead of closing it.
  quickChatWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      quickChatWindow.hide();
    }
  });
  quickChatWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isPopupAllowedUrl(url)) return { action: 'allow' };
    openExternal(url);
    return { action: 'deny' };
  });
  quickChatWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
      handleUnhandledDrop(url);
      return;
    }
    if (!isPopupAllowedUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  quickChatWindow.on('resize', scheduleSaveQuickChatBounds);
  quickChatWindow.on('move', scheduleSaveQuickChatBounds);
  // Closing Quick chat (X button) only hides it; the shortcut or the
  // menu brings it back. Really destroy it only when quitting.
  quickChatWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      saveQuickChatBounds();
      quickChatWindow.hide();
    }
  });
  quickChatWindow.on('closed', () => {
    quickChatWindow = null;
  });
  return quickChatWindow;
}

function toggleQuickChat() {
  if (!config.get('quickChatEnabled')) return;
  if (!quickChatWindow || quickChatWindow.isDestroyed()) {
    createQuickChatWindow();
    return;
  }
  if (quickChatWindow.isVisible()) {
    quickChatWindow.hide();
  } else {
    quickChatWindow.show();
    quickChatWindow.focus();
  }
}

// --- Dictation --------------------------------------------------------
// A small local window using the Web Speech API (online) to recognise
// speech. No audio is stored. Recognised text goes to the clipboard
// (automatically, or with a button) for pasting into the chat —
// nothing is typed into other apps automatically, by design.

let saveDictationBoundsTimer = null;
function saveDictationBounds() {
  if (!dictationWindow || dictationWindow.isDestroyed() || dictationWindow.isMinimized()) return;
  try {
    if (dictationWindow.isMaximized() || dictationWindow.isFullScreen()) return;
    config.update({ dictationBounds: dictationWindow.getBounds() });
  } catch (err) {
    console.warn('Could not save dictation bounds:', err.message);
  }
}
function scheduleSaveDictationBounds() {
  if (saveDictationBoundsTimer) clearTimeout(saveDictationBoundsTimer);
  saveDictationBoundsTimer = setTimeout(saveDictationBounds, 500);
}

function initialDictationBounds() {
  const saved = config.get('dictationBounds');
  const fallback = { width: DICTATION_WIDTH, height: DICTATION_HEIGHT };
  if (!saved) return fallback;
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - 100 && saved.x < a.x + a.width &&
      saved.y >= a.y - 100 && saved.y < a.y + a.height;
  });
  if (!onScreen) return fallback;
  const primary = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.max(primary.x, Math.min(saved.x, primary.x + primary.width - 200)),
    y: Math.max(primary.y, Math.min(saved.y, primary.y + primary.height - 200)),
    width: Math.min(Math.max(saved.width, 360), primary.width),
    height: Math.min(Math.max(saved.height, 480), primary.height),
  };
}

function createDictationWindow() {
  if (dictationWindow && !dictationWindow.isDestroyed()) return dictationWindow;
  const bounds = initialDictationBounds();
  dictationWindow = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 480,
    title: '听写 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'dictation-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  dictationWindow.setMenu(null);
  dictationWindow.loadFile(path.join(__dirname, 'dictation.html'));
  dictationWindow.once('ready-to-show', () => {
    dictationWindow.show();
    dictationWindow.focus();
  });
  // Esc hides the dictation window instead of closing it.
  dictationWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      dictationWindow.hide();
    }
  });
  dictationWindow.on('resize', scheduleSaveDictationBounds);
  dictationWindow.on('move', scheduleSaveDictationBounds);
  dictationWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      saveDictationBounds();
      dictationWindow.hide();
    }
  });
  dictationWindow.on('closed', () => {
    dictationWindow = null;
  });
  return dictationWindow;
}

function toggleDictation() {
  if (!config.get('dictationEnabled')) return;
  if (!dictationWindow || dictationWindow.isDestroyed()) {
    createDictationWindow();
    return;
  }
  if (dictationWindow.isVisible()) {
    dictationWindow.hide();
  } else {
    dictationWindow.show();
    dictationWindow.focus();
  }
}

// --- Phase 5 permissions: first-use confirmation ----------------------
// Screenshot, camera and automation each default OFF and ask once,
// the first time they are used, what they do and what they never do.

const PERMISSION_INFO = {
  screenshot: {
    title: '使用截屏？',
    detail:
      '截屏会读取你选中的屏幕或窗口画面，显示在预览窗口里。\n\n' +
      '会做的：把截图复制到剪贴板（你粘贴进聊天），或按你的选择保存为 PNG 文件。\n' +
      '不会做的：不会自动上传、不会后台偷偷截屏、不会读取其他窗口。',
  },
  camera: {
    title: '使用相机？',
    detail:
      '相机会打开摄像头实时预览，点“拍照”才拍一张。\n\n' +
      '会做的：把照片复制到剪贴板（你粘贴进聊天），或按你的选择保存为 PNG 文件。\n' +
      '不会做的：不会录像、不会在后台打开摄像头、不会自动上传。',
  },
  automation: {
    title: '使用本地操作？',
    detail:
      '本地操作只能打开白名单里的几个程序（记事本、计算器、文件资源管理器、默认浏览器），每次执行前都会再问你一次。\n\n' +
      '会做的：只在你点了“执行”后，打开你选的那一个程序。\n' +
      '不会做的：不会远程触发、不会后台静默控制、不会记录键盘鼠标。',
  },
  runner: {
    title: '使用任务执行器？',
    detail:
      '任务执行器按你粘贴的“任务包”（一份命令清单）跑命令，例如 php、composer、git。每次执行前都会把全部步骤和文件夹列出来问你一次。\n\n' +
      '会做的：只在授权文件夹里、只跑白名单里的命令，把每一步的输出写进一份报告，报告由你自己复制回聊天。\n' +
      '不会做的：不会自动执行、不跑白名单外的命令、不离开授权文件夹、不绕过你把结果发给任何人。',
  },
};

/** Returns true when the user confirmed (or had confirmed before). */
async function confirmPermissionOnce(kind) {
  const confirmed = config.get('confirmedPermissions') || [];
  if (confirmed.includes(kind)) return true;
  const info = PERMISSION_INFO[kind];
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: info.title,
    message: info.title,
    detail: info.detail,
    buttons: ['我知道了，继续', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return false;
  config.update({ confirmedPermissions: [...confirmed, kind] });
  return true;
}

function permissionOffNotice(kind, settingName) {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '功能未开启',
    message: '这个功能还没有开启',
    detail: `请先在设置 → 权限里打开“${settingName}”。`,
  }).catch(() => {});
}

// --- Screenshot -------------------------------------------------------
// Pick a screen or a window, preview it, then copy to the clipboard
// (paste into the chat) or save it as a PNG file.

function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.focus();
    return captureWindow;
  }
  captureWindow = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 560,
    minHeight: 420,
    title: '截屏 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'capture-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  captureWindow.setMenu(null);
  captureWindow.loadFile(path.join(__dirname, 'capture.html'));
  captureWindow.once('ready-to-show', () => {
    captureWindow.show();
    captureWindow.focus();
  });
  captureWindow.on('closed', () => {
    captureWindow = null;
  });
  return captureWindow;
}

async function openCaptureWindow() {
  if (!config.get('screenshotEnabled')) {
    permissionOffNotice('screenshot', '截屏');
    return;
  }
  if (!(await confirmPermissionOnce('screenshot'))) return;
  createCaptureWindow();
}

async function listCaptureSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: false,
  });
  return sources
    .filter((s) => s.name && s.name !== 'Muse' && !s.name.startsWith('截屏'))
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumb: s.thumbnail.toDataURL(),
    }));
}

async function captureSource(sourceId) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1920, height: 1080 },
    fetchWindowIcons: false,
  });
  const source = sources.find((s) => s.id === sourceId);
  if (!source) return null;
  const thumb = source.thumbnail;
  const size = thumb.getSize();
  lastFullCapture = { image: thumb, rect: { x: 0, y: 0, width: size.width, height: size.height } };
  return {
    id: source.id,
    name: source.name,
    dataUrl: thumb.toDataURL(),
    width: size.width,
    height: size.height,
    rect: { x: 0, y: 0, width: size.width, height: size.height },
    fullWidth: size.width,
    fullHeight: size.height,
  };
}

/** Clamp a crop rect to an image; returns null when nothing is left. */
function clampRectToImage(rect, size) {
  if (!rect || !size) return null;
  const x = Math.max(0, Math.min(Math.round(rect.x || 0), size.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y || 0), size.height - 1));
  const width = Math.max(0, Math.min(Math.round(rect.width || 0), size.width - x));
  const height = Math.max(0, Math.min(Math.round(rect.height || 0), size.height - y));
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

/** Re-crop the last full capture to an exact rect (image pixels). */
function recropCapture(rect) {
  if (!lastFullCapture) return null;
  const fullSize = lastFullCapture.image.getSize();
  const clamped = clampRectToImage(rect, fullSize);
  if (!clamped) return null;
  lastFullCapture.rect = clamped;
  const cropped = lastFullCapture.image.crop(clamped);
  return {
    dataUrl: cropped.toDataURL(),
    width: clamped.width,
    height: clamped.height,
    rect: clamped,
    fullWidth: fullSize.width,
    fullHeight: fullSize.height,
  };
}

// --- Region screenshot ------------------------------------------------
// Drag a rectangle on the screen; the overlay reports DIP coordinates
// and the crop is converted to physical pixels with the display's
// scale factor, so the result is exact on HiDPI screens too.

function createRegionWindow() {
  if (regionWindow && !regionWindow.isDestroyed()) {
    regionWindow.focus();
    return regionWindow;
  }
  const display = screen.getPrimaryDisplay();
  regionWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: '框选区域 — Muse',
    webPreferences: {
      preload: path.join(__dirname, 'region-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  regionWindow.setMenu(null);
  regionWindow.loadFile(path.join(__dirname, 'region.html'));
  regionWindow.once('ready-to-show', () => {
    regionWindow.show();
    regionWindow.focus();
  });
  regionWindow.on('closed', () => {
    regionWindow = null;
  });
  return regionWindow;
}

async function startRegionCapture(origin = 'shortcut') {
  if (!config.get('screenshotEnabled')) {
    permissionOffNotice('screenshot', '截屏');
    return;
  }
  if (!(await confirmPermissionOnce('screenshot'))) return;
  regionOrigin = origin;
  createRegionWindow();
}

function defaultScreenshotName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'screenshot-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
}

/**
 * Shared by both region flows. Captures the region, then either
 * shows the Copy/Save toolbar in the overlay (shortcut flow) or
 * hands the shot to the capture window's preview (picker flow).
 */
async function onRegionSelected(rect) {
  const shot = await captureRegion(rect);
  if (!shot) {
    notify('截屏', '区域截取失败，请重试。');
    return null;
  }
  lastRegionShot = {
    image: lastFullCapture.image.crop(lastFullCapture.rect),
    width: shot.width,
    height: shot.height,
    rect: shot.rect,
  };
  if (regionOrigin === 'picker') {
    if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.webContents.send('region-shot', shot);
      captureWindow.focus();
    }
  } else if (regionWindow && !regionWindow.isDestroyed()) {
    regionWindow.webContents.send('region-captured', { width: shot.width, height: shot.height });
  }
  return shot;
}

/** Copy the last captured region straight to the clipboard. */
function copyRegionShot() {
  if (!lastRegionShot) return false;
  clipboard.writeImage(lastRegionShot.image);
  lastRegionShot = null;
  notify('截图已准备好', '已复制到剪贴板，粘贴进聊天即可发给 Edison。');
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
  return true;
}

/** Save the last captured region as a PNG file. */
async function saveRegionShot() {
  if (!lastRegionShot) return { ok: false };
  const parent = regionWindow && !regionWindow.isDestroyed() ? regionWindow : undefined;
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: '保存截图',
    defaultPath: defaultScreenshotName(),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
  fs.writeFileSync(filePath, lastRegionShot.image.toPNG());
  lastRegionShot = null;
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
  notify('截图已保存', filePath);
  return { ok: true, filePath };
}

/** Capture a region given in DIP coordinates on the primary display. */
async function captureRegion(rectDip) {
  if (!rectDip || (rectDip.width || 0) < 1 || (rectDip.height || 0) < 1) return null;
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.min(Math.round(display.size.width * scale), 3840),
      height: Math.min(Math.round(display.size.height * scale), 2160),
    },
    fetchWindowIcons: false,
  });
  let source = sources.find((s) => String(s.display_id) === String(display.id));
  if (!source) source = sources[0];
  if (!source) return null;
  const full = source.thumbnail;
  const fullSize = full.getSize();
  const rectPx = clampRectToImage({
    x: Math.round(rectDip.x * scale),
    y: Math.round(rectDip.y * scale),
    width: Math.round(rectDip.width * scale),
    height: Math.round(rectDip.height * scale),
  }, fullSize);
  if (!rectPx) return null;
  lastFullCapture = { image: full, rect: rectPx };
  const cropped = full.crop(rectPx);
  return {
    dataUrl: cropped.toDataURL(),
    name: `区域 ${rectPx.width}×${rectPx.height}`,
    width: rectPx.width,
    height: rectPx.height,
    rect: rectPx,
    fullWidth: fullSize.width,
    fullHeight: fullSize.height,
  };
}

// --- Camera -----------------------------------------------------------

function createCameraWindow() {
  if (cameraWindow && !cameraWindow.isDestroyed()) {
    cameraWindow.focus();
    return cameraWindow;
  }
  cameraWindow = new BrowserWindow({
    width: 560,
    height: 620,
    minWidth: 420,
    minHeight: 480,
    title: '拍照 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'camera-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  cameraWindow.setMenu(null);
  cameraWindow.loadFile(path.join(__dirname, 'camera.html'));
  cameraWindow.once('ready-to-show', () => {
    cameraWindow.show();
    cameraWindow.focus();
  });
  cameraWindow.on('closed', () => {
    cameraWindow = null;
  });
  return cameraWindow;
}

async function openCameraWindow() {
  if (!config.get('cameraEnabled')) {
    permissionOffNotice('camera', '相机');
    return;
  }
  if (!(await confirmPermissionOnce('camera'))) return;
  createCameraWindow();
}

// --- Local automation (strictly bounded) ------------------------------
// Only four whitelisted actions. Each one needs its own switch in
// Settings AND a confirmation dialog on every single use. Nothing
// else can run, and nothing runs in the background.

const AUTOMATION_ACTIONS = {
  notepad: { label: '记事本', setting: 'automationAllowNotepad', target: 'C:\\Windows\\System32\\notepad.exe' },
  calculator: { label: '计算器', setting: 'automationAllowCalculator', target: 'C:\\Windows\\System32\\calc.exe' },
  browser: { label: '默认浏览器（打开 muse.ai）', setting: 'automationAllowBrowser', target: null },
};

/** Pure gate check, used by the menu, the tray and the smoke tests. */
function canAutomate(action) {
  if (action !== 'explorer' && !AUTOMATION_ACTIONS[action]) {
    return { ok: false, reason: 'unknown-action' };
  }
  if (process.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
  if (!config.get('automationEnabled')) return { ok: false, reason: 'disabled' };
  if (action === 'explorer') {
    if (!config.get('automationAllowExplorer')) return { ok: false, reason: 'not-whitelisted' };
    return { ok: true };
  }
  const def = AUTOMATION_ACTIONS[action];
  if (!config.get(def.setting)) return { ok: false, reason: 'not-whitelisted' };
  return { ok: true };
}

async function runAutomation(action) {
  const gate = canAutomate(action);
  if (!gate.ok) {
    const detail = gate.reason === 'unsupported-platform'
      ? '本地操作目前只支持 Windows。'
      : gate.reason === 'disabled'
        ? '请先在设置 → 权限里打开“本地操作”。'
        : '这个操作不在白名单里。请先在设置 → 权限 → 本地操作白名单里勾选它。';
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '无法执行本地操作',
      message: '这个本地操作现在不能执行',
      detail,
    }).catch(() => {});
    return { ok: false, reason: gate.reason };
  }
  if (!(await confirmPermissionOnce('automation'))) return { ok: false, reason: 'cancelled' };
  const label = action === 'explorer' ? '文件资源管理器' : AUTOMATION_ACTIONS[action].label;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '执行本地操作？',
    message: `将要打开${label}`,
    detail: '这是本地操作，只会在你点了“执行”后打开这一个程序，不会做别的事。',
    buttons: ['执行', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return { ok: false, reason: 'cancelled' };
  try {
    if (action === 'explorer') {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '选择要在文件资源管理器中打开的文件夹',
        properties: ['openDirectory'],
      });
      if (canceled || !filePaths || filePaths.length === 0) return { ok: false, reason: 'cancelled' };
      await shell.openPath(filePaths[0]);
    } else if (action === 'browser') {
      await shell.openExternal(MUSE_URL);
    } else {
      const err = await shell.openPath(AUTOMATION_ACTIONS[action].target);
      if (err) throw new Error(err);
    }
    return { ok: true };
  } catch (err) {
    dialog.showErrorBox('打开失败', `打开${label}失败：${err && err.message ? err.message : String(err)}`);
    return { ok: false, reason: 'failed' };
  }
}

// --- Phase 6: cloud service entries -----------------------------------
// Entry jumps only. Authorization happens in the Muse web app through
// its official connectors; this client never asks for or stores any
// service password. Local private databases are never read.

const CLOUD_SERVICES = [
  { id: 'muse', name: 'Muse', desc: '在 muse.ai 网页版里连接 Gmail、Outlook、Google 日历等，连接成功后在 Windows 客户端里就能直接用。', url: MUSE_URL },
  { id: 'gmail', name: 'Gmail', desc: 'Google 邮箱网页版', url: 'https://mail.google.com/' },
  { id: 'outlook', name: 'Outlook', desc: '微软邮箱网页版', url: 'https://outlook.live.com/' },
  { id: 'gcal', name: 'Google 日历', desc: 'Google 日历网页版', url: 'https://calendar.google.com/' },
  { id: 'todo', name: 'Microsoft To Do', desc: '微软待办事项网页版', url: 'https://to-do.live.com/' },
  { id: 'gdrive', name: 'Google Drive', desc: 'Google 云端硬盘网页版', url: 'https://drive.google.com/' },
  { id: 'onedrive', name: 'OneDrive', desc: '微软 OneDrive 网页版', url: 'https://onedrive.live.com/' },
];

function createConnectWindow() {
  if (connectWindow && !connectWindow.isDestroyed()) {
    connectWindow.focus();
    return connectWindow;
  }
  connectWindow = new BrowserWindow({
    width: 560,
    height: 560,
    minWidth: 480,
    minHeight: 420,
    title: '连接云端服务 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'connect-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  connectWindow.setMenu(null);
  connectWindow.loadFile(path.join(__dirname, 'connect.html'));
  connectWindow.once('ready-to-show', () => {
    connectWindow.show();
    connectWindow.focus();
  });
  connectWindow.on('closed', () => {
    connectWindow = null;
  });
  return connectWindow;
}

// --- Phase 6: filename-only search ------------------------------------
// Only file NAMES are matched. File contents are never opened or read,
// and no whole-disk index is built. Search stays inside the folders
// the user authorized in Settings; blocked folders always win.

const SEARCH_MAX_SCANNED = 20000;
const SEARCH_MAX_RESULTS = 200;
const SEARCH_MAX_DEPTH = 8;

function searchFileNames(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { results: [], scanned: 0, folders: 0 };
  const folders = config.get('authorizedFolders') || [];
  const blocked = config.get('blockedFolders') || [];
  const results = [];
  let scanned = 0;
  const isBlocked = (dir) => blocked.some((b) => dir === b || dir.startsWith(b + path.sep));
  function walk(dir, depth) {
    if (results.length >= SEARCH_MAX_RESULTS || scanned >= SEARCH_MAX_SCANNED || depth > SEARCH_MAX_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return; // unreadable folder: skip it quietly.
    }
    for (const e of entries) {
      if (results.length >= SEARCH_MAX_RESULTS || scanned >= SEARCH_MAX_SCANNED) return;
      if (e.name.startsWith('.')) continue; // hidden files and folders.
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || isBlocked(full)) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        scanned++;
        if (e.name.toLowerCase().includes(q)) {
          results.push({ name: e.name, path: full, folder: dir });
        }
      }
    }
  }
  let usableFolders = 0;
  for (const f of folders) {
    if (!f || isBlocked(f)) continue;
    usableFolders++;
    walk(f, 0);
  }
  return { results, scanned, folders: usableFolders };
}

function toggleFavoriteFile(filePath) {
  const favs = config.get('favoriteFiles') || [];
  const idx = favs.indexOf(filePath);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.unshift(filePath);
  }
  config.update({ favoriteFiles: favs.slice(0, 20) });
  return config.get('favoriteFiles') || [];
}

function createSearchWindow() {
  if (searchWindow && !searchWindow.isDestroyed()) {
    searchWindow.show();
    searchWindow.focus();
    return searchWindow;
  }
  searchWindow = new BrowserWindow({
    width: 600,
    height: 520,
    minWidth: 480,
    minHeight: 360,
    title: '文件名搜索 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'search-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  searchWindow.setMenu(null);
  searchWindow.loadFile(path.join(__dirname, 'search.html'));
  searchWindow.once('ready-to-show', () => {
    searchWindow.show();
    searchWindow.focus();
  });
  searchWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      searchWindow.hide();
      event.preventDefault();
    }
  });
  searchWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      searchWindow.hide();
    }
  });
  searchWindow.on('closed', () => {
    searchWindow = null;
  });
  return searchWindow;
}

function toggleSearch() {
  if (!searchWindow || searchWindow.isDestroyed()) {
    createSearchWindow();
    return;
  }
  if (searchWindow.isVisible()) {
    searchWindow.hide();
  } else {
    searchWindow.show();
    searchWindow.focus();
  }
}

// --- Local model chat (Phase 7, v0.8.0) -------------------------------
// A separate chat window that talks to the user's own model server
// (llama.cpp, Ollama, LM Studio) through its OpenAI-compatible API.
// The Muse web app keeps talking to Meta's cloud; this window is
// the local model's own entry. The endpoint always comes from the
// stored config (resolved in the main process), never from the
// renderer, and the API key is only ever sent to that endpoint.

function getActiveLocalModel() {
  const providers = config.get('localModels') || [];
  const id = config.get('activeLocalModelId');
  if (!id) return null;
  return providers.find((p) => p.id === id) || null;
}

/** The provider as the renderer may see it: no API key. */
function publicLocalModel(provider) {
  if (!provider) return null;
  return {
    id: provider.id,
    name: provider.name,
    preset: provider.preset,
    protocol: provider.protocol,
    host: provider.host,
    port: provider.port,
    model: provider.model,
    baseUrl: config.localModelBaseUrl(provider),
  };
}

function friendlyFetchError(err) {
  const code = (err && err.code) || '';
  const message = (err && err.message) || '';
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(message)) return '连不上：服务没开，或地址端口不对。';
  if (code === 'ENOTFOUND' || /ENOTFOUND/.test(message)) return '找不到这台电脑：地址不对。';
  if (code === 'ETIMEDOUT' || /timed out|timeout/i.test(message)) return '连接超时：那台电脑可能没开机，或网络不通。';
  if (err && err.name === 'AbortError') return '连接被取消。';
  return message ? message.slice(0, 200) : '未知错误。';
}

/** Probe GET {base}/v1/models. Returns { ok, models } or { ok:false, error }. */
async function testLocalModelConnection(provider) {
  const clean = config.sanitizeLocalModel(provider);
  if (!clean) return { ok: false, error: '模型配置无效，请检查地址和端口。' };
  const headers = {};
  if (clean.apiKey) headers.Authorization = 'Bearer ' + clean.apiKey;
  let res;
  try {
    res = await fetch(config.localModelBaseUrl(clean) + '/v1/models', {
      headers,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: '连接失败：' + friendlyFetchError(err) };
  }
  if (!res.ok) {
    return { ok: false, error: `服务返回了 ${res.status}，请检查地址和端口。` };
  }
  try {
    const json = await res.json();
    const models = Array.isArray(json.data)
      ? json.data.map((m) => m && m.id).filter((id) => typeof id === 'string' && id)
      : [];
    return { ok: true, models };
  } catch (_) {
    return { ok: false, error: '服务返回的内容不是预期的模型列表。' };
  }
}

/**
 * Stream a chat completion from the local model.
 * callbacks: { onChunk(text), onDone(info), onError(message) }.
 * Returns { abort() } or null when it never started.
 */
async function streamLocalModelChat(provider, messages, callbacks) {
  const clean = config.sanitizeLocalModel(provider);
  if (!clean) {
    callbacks.onError('模型配置无效，请先在设置里检查地址和端口。');
    return null;
  }
  if (localModelStreamAbort) {
    try { localModelStreamAbort.abort(); } catch (_) { /* already gone */ }
  }
  // Resolve the model name: the configured one, or the first one the
  // server reports when the field was left empty.
  let model = clean.model;
  if (!model) {
    const listed = await testLocalModelConnection(clean);
    if (listed.ok && listed.models.length) {
      model = listed.models[0];
    } else {
      callbacks.onError('没有填模型名，也没能从服务上拉到模型列表：' + (listed.error || '连接失败'));
      return null;
    }
  }
  const controller = new AbortController();
  localModelStreamAbort = controller;
  const headers = { 'Content-Type': 'application/json' };
  if (clean.apiKey) headers.Authorization = 'Bearer ' + clean.apiKey;
  let res;
  try {
    res = await fetch(config.localModelBaseUrl(clean) + '/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      callbacks.onDone({ aborted: true, model });
      return null;
    }
    callbacks.onError('连接本地模型失败：' + friendlyFetchError(err));
    return null;
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
    callbacks.onError(`本地模型返回了 ${res.status}：${detail || res.statusText || '请检查服务状态。'}`);
    return null;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          callbacks.onDone({ model });
          return { abort: () => controller.abort() };
        }
        try {
          const json = JSON.parse(data);
          const piece = json && json.choices && json.choices[0] && json.choices[0].delta
            && json.choices[0].delta.content;
          if (piece) callbacks.onChunk(piece);
        } catch (_) {
          // Ignore malformed SSE lines; the stream continues.
        }
      }
    }
    callbacks.onDone({ model });
  } catch (err) {
    if (err.name === 'AbortError') callbacks.onDone({ aborted: true, model });
    else callbacks.onError('读取回复时断开了：' + friendlyFetchError(err));
  }
  return { abort: () => controller.abort() };
}

function createLocalModelWindow() {
  if (localModelWindow && !localModelWindow.isDestroyed()) {
    localModelWindow.show();
    localModelWindow.focus();
    return localModelWindow;
  }
  const saved = config.get('localModelBounds');
  const opts = {
    width: saved ? saved.width : LOCAL_MODEL_WIDTH,
    height: saved ? saved.height : LOCAL_MODEL_HEIGHT,
    minWidth: 420,
    minHeight: 480,
    title: '本地模型 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'local-model-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  };
  if (saved) {
    opts.x = saved.x;
    opts.y = saved.y;
  }
  localModelWindow = new BrowserWindow(opts);
  localModelWindow.setMenu(null);
  localModelWindow.loadFile(path.join(__dirname, 'local-model.html'));
  localModelWindow.once('ready-to-show', () => {
    localModelWindow.show();
    localModelWindow.focus();
  });
  localModelWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      localModelWindow.hide();
      event.preventDefault();
    }
  });
  localModelWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      try {
        config.update({ localModelBounds: localModelWindow.getBounds() });
      } catch (_) { /* bounds are best-effort */ }
      localModelWindow.hide();
    }
  });
  localModelWindow.on('closed', () => {
    localModelWindow = null;
  });
  return localModelWindow;
}

function toggleLocalModel() {
  if (!localModelWindow || localModelWindow.isDestroyed()) {
    createLocalModelWindow();
    return;
  }
  if (localModelWindow.isVisible()) {
    localModelWindow.hide();
  } else {
    localModelWindow.show();
    localModelWindow.focus();
  }
}

// --- Phase 8 (v0.9.0): local task runner --------------------------------
// Task-package round-trip (Claude Desktop comparison §3, mode 1):
// Edison writes the code in the cloud and gives a "task package" in
// chat — a JSON list of commands. The user pastes it here, picks an
// authorized folder, confirms, and the client runs the steps one by
// one and builds a Markdown report to copy back into the chat.
// There is NO direct channel between Edison and this client: the
// user is the only bridge, and the only approver.
//
// Safety, all enforced in the main process (the page cannot bypass
// any of it):
// - Default OFF (runnerEnabled); first use asks once (PERMISSION_INFO).
// - Only whitelisted executables (runnerAllowedCommands, bare names
//   only) — anything else refuses the whole package.
// - Only inside an authorized folder (and never a blocked one).
// - spawn() with shell: false — no shell, no pipes, no redirection,
//   no command chaining. Arguments are passed as an array.
// - Every run needs a confirmation dialog listing all steps + folder.
// - Per-step timeout (120 s) and output cap (64 KB).

const RUNNER_MAX_STEPS = 20;
const RUNNER_STEP_TIMEOUT_MS = 120000;
const RUNNER_OUTPUT_CAP = 65536;

/** Parse and validate pasted task-package JSON. Pure function. */
function parseTaskPackage(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '任务包是空的：把 Edison 在聊天里给你的 JSON 任务包粘贴进来。' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: '不是有效的 JSON：' + (err && err.message ? err.message : String(err)) };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '任务包应该是一个 JSON 对象，形如 {"title": "…", "steps": [{"cmd": "php", "args": ["-v"]}]}。' };
  }
  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim().slice(0, 120)
    : '未命名任务';
  const steps = data.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, error: '任务包里没有步骤：steps 应该是一个非空数组。' };
  }
  if (steps.length > RUNNER_MAX_STEPS) {
    return { ok: false, error: `步骤太多了（最多 ${RUNNER_MAX_STEPS} 步），请拆成几个任务包。` };
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return { ok: false, error: `第 ${i + 1} 步不是一个对象，应该是 {"cmd": "php", "args": ["-v"]} 这样的形式。` };
    }
    if (typeof s.cmd !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s.cmd)) {
      return { ok: false, error: `第 ${i + 1} 步的命令名不对：命令只能是单个程序名（如 php、git），不能带路径、空格或符号。` };
    }
    if (s.args !== undefined && (!Array.isArray(s.args) || s.args.some((a) => typeof a !== 'string'))) {
      return { ok: false, error: `第 ${i + 1} 步的参数不对：args 应该是一个字符串数组。` };
    }
  }
  return { ok: true, title, steps: steps.map((s) => ({ cmd: s.cmd, args: s.args || [] })) };
}

function runnerAllowedCommands() {
  return (config.get('runnerAllowedCommands') || []).map((c) => String(c).toLowerCase());
}

/** Returns { ok: true } or { ok: false, blocked: [names] }. */
function checkRunnerSteps(steps) {
  const allowed = new Set(runnerAllowedCommands());
  const blocked = [...new Set(steps.filter((s) => !allowed.has(s.cmd.toLowerCase())).map((s) => s.cmd))];
  return blocked.length ? { ok: false, blocked } : { ok: true };
}

/** Gate for running anything: feature on + folder authorized + exists. */
function checkRunnerRun(pkg, cwd) {
  if (!config.get('runnerEnabled')) return { ok: false, reason: 'disabled' };
  if (typeof cwd !== 'string' || !cwd) return { ok: false, reason: 'no-folder' };
  const gate = config.authorizeFile(cwd, config.get('authorizedFolders'), config.get('blockedFolders'));
  if (!gate.ok) return { ok: false, reason: gate.reason };
  try {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return { ok: false, reason: 'missing-folder' };
    }
  } catch (_) {
    return { ok: false, reason: 'missing-folder' };
  }
  const wl = checkRunnerSteps(pkg.steps);
  if (!wl.ok) return { ok: false, reason: 'not-whitelisted', blocked: wl.blocked };
  return { ok: true };
}

function runnerGateMessage(gate) {
  if (gate.reason === 'disabled') return '任务执行器还没有开启：请先在设置 → 任务执行器里打开它。';
  if (gate.reason === 'no-folders') return '还没有授权文件夹：请先在设置 → 文件与授权文件夹里添加一个文件夹（例如你的 CI4 项目文件夹）。';
  if (gate.reason === 'not-authorized') return '这个文件夹不在授权列表里：请先在设置 → 文件与授权文件夹里授权它。';
  if (gate.reason === 'blocked') return '这个文件夹在黑名单里，拒绝执行。';
  if (gate.reason === 'missing-folder') return '这个文件夹不存在了，请重新选一个。';
  if (gate.reason === 'not-whitelisted') {
    return '任务包里有白名单外的命令：' + (gate.blocked || []).join('、') +
      '。请先在设置 → 任务执行器 → 白名单里加上它，或让 Edison 换一条白名单里的命令。';
  }
  return '现在不能执行这个任务。';
}

/**
 * Run the steps one by one. onEvent receives { type: 'step-start' |
 * 'step-done', index, ... }. Resolves { results, aborted }. Each
 * result: { cmd, args, index, status: 'ok'|'failed'|'timeout',
 * exitCode, durationMs, output, truncated, error }.
 */
function runTaskSteps(pkg, cwd, onEvent) {
  return new Promise((resolve) => {
    const results = [];
    let index = 0;
    const emit = onEvent || (() => {});
    const next = () => {
      if (runnerAbortRequested) {
        resolve({ results, aborted: true });
        return;
      }
      if (index >= pkg.steps.length) {
        resolve({ results, aborted: false });
        return;
      }
      const step = pkg.steps[index];
      const startedAt = Date.now();
      emit({ type: 'step-start', index, cmd: step.cmd, args: step.args });
      let child;
      try {
        child = spawn(step.cmd, step.args, { cwd, shell: false, windowsHide: true });
      } catch (err) {
        results.push({ cmd: step.cmd, args: step.args, index, status: 'failed', exitCode: null, durationMs: Date.now() - startedAt, output: '', truncated: false, error: '启动失败：' + (err && err.message ? err.message : String(err)) });
        emit({ type: 'step-done', index, result: results[results.length - 1] });
        index++;
        next();
        return;
      }
      runnerCurrentChild = child;
      let output = '';
      let truncated = false;
      let timedOut = false;
      let settled = false;
      const push = (chunk) => {
        if (truncated) return;
        output += chunk;
        if (output.length > RUNNER_OUTPUT_CAP) {
          output = output.slice(0, RUNNER_OUTPUT_CAP);
          truncated = true;
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill(); } catch (_) { /* already gone */ }
      }, RUNNER_STEP_TIMEOUT_MS);
      child.stdout.on('data', (d) => push(d.toString('utf8')));
      child.stderr.on('data', (d) => push(d.toString('utf8')));
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        runnerCurrentChild = null;
        results.push({ cmd: step.cmd, args: step.args, index, status: 'failed', exitCode: null, durationMs: Date.now() - startedAt, output, truncated, error: '启动失败：' + (err && err.message ? err.message : String(err)) });
        emit({ type: 'step-done', index, result: results[results.length - 1] });
        index++;
        next();
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        runnerCurrentChild = null;
        const status = timedOut ? 'timeout' : (code === 0 ? 'ok' : 'failed');
        results.push({
          cmd: step.cmd, args: step.args, index, status,
          exitCode: code, durationMs: Date.now() - startedAt, output, truncated,
          error: timedOut ? `超时（超过 ${RUNNER_STEP_TIMEOUT_MS / 1000} 秒，已终止）` : '',
        });
        emit({ type: 'step-done', index, result: results[results.length - 1] });
        index++;
        next();
      });
    };
    next();
  });
}

/** Build the Markdown report the user copies back into the chat. */
function buildRunnerReport(pkg, cwd, outcome) {
  const lines = [];
  lines.push(`# 任务报告：${pkg.title}`);
  lines.push('');
  lines.push(`- 时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- 文件夹：${cwd}`);
  const okCount = outcome.results.filter((r) => r.status === 'ok').length;
  lines.push(`- 结果：${okCount}/${outcome.results.length} 步成功${outcome.aborted ? '（中途中止）' : ''}`);
  lines.push('');
  outcome.results.forEach((r, i) => {
    lines.push(`## 步骤 ${i + 1}：${r.cmd}${r.args.length ? ' ' + r.args.join(' ') : ''}`);
    const state = r.status === 'ok' ? '成功' : r.status === 'timeout' ? '超时' : '失败';
    lines.push(`- 状态：${state}，退出码：${r.exitCode === null ? '（未启动）' : r.exitCode}，用时：${(r.durationMs / 1000).toFixed(1)} 秒`);
    if (r.error) lines.push(`- 错误：${r.error}`);
    lines.push('```');
    lines.push(r.output ? r.output.replace(/\s+$/, '') : '（无输出）');
    if (r.truncated) lines.push(`…（输出太长，只保留前 ${Math.round(RUNNER_OUTPUT_CAP / 1024)} KB）`);
    lines.push('```');
    lines.push('');
  });
  return lines.join('\n');
}

function createRunnerWindow() {
  if (runnerWindow && !runnerWindow.isDestroyed()) {
    runnerWindow.show();
    runnerWindow.focus();
    return runnerWindow;
  }
  const saved = config.get('runnerBounds');
  const opts = {
    width: saved ? saved.width : RUNNER_WIDTH,
    height: saved ? saved.height : RUNNER_HEIGHT,
    minWidth: 480,
    minHeight: 520,
    title: '任务执行器 — Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'runner-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  };
  if (saved) {
    opts.x = saved.x;
    opts.y = saved.y;
  }
  runnerWindow = new BrowserWindow(opts);
  runnerWindow.setMenu(null);
  runnerWindow.loadFile(path.join(__dirname, 'runner.html'));
  runnerWindow.once('ready-to-show', () => {
    runnerWindow.show();
    runnerWindow.focus();
  });
  runnerWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      runnerWindow.hide();
      event.preventDefault();
    }
  });
  runnerWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      try {
        config.update({ runnerBounds: runnerWindow.getBounds() });
      } catch (_) { /* bounds are best-effort */ }
      runnerWindow.hide();
    }
  });
  runnerWindow.on('closed', () => {
    runnerWindow = null;
  });
  return runnerWindow;
}

function toggleRunner() {
  if (!runnerWindow || runnerWindow.isDestroyed()) {
    createRunnerWindow();
    return;
  }
  if (runnerWindow.isVisible()) {
    runnerWindow.hide();
  } else {
    runnerWindow.show();
    runnerWindow.focus();
  }
}

/** Ask the currently running step (if any) to stop. Used by the IPC handler and the smoke tests. */
function abortRunnerRun() {
  runnerAbortRequested = true;
  if (runnerCurrentChild) {
    try { runnerCurrentChild.kill(); } catch (_) { /* already gone */ }
  }
}

async function runTaskPackageWithConfirm(pkg, cwd) {
  const gate = checkRunnerRun(pkg, cwd);
  if (!gate.ok) {
    dialog.showMessageBox(runnerWindow || mainWindow, {
      type: 'info',
      title: '无法执行任务',
      message: '这个任务现在不能执行',
      detail: runnerGateMessage(gate),
    }).catch(() => {});
    return { ok: false, reason: gate.reason };
  }
  if (!(await confirmPermissionOnce('runner'))) return { ok: false, reason: 'cancelled' };
  const stepLines = pkg.steps.map((s, i) => `  ${i + 1}. ${s.cmd}${s.args.length ? ' ' + s.args.join(' ') : ''}`).join('\n');
  const { response } = await dialog.showMessageBox(runnerWindow || mainWindow, {
    type: 'question',
    title: '执行任务？',
    message: `将要执行“${pkg.title}”（${pkg.steps.length} 步）`,
    detail: `文件夹：${cwd}\n\n${stepLines}\n\n只跑上面列出的命令，不会做别的事。`,
    buttons: ['执行', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return { ok: false, reason: 'cancelled' };
  runnerAbortRequested = false;
  const outcome = await runTaskSteps(pkg, cwd, (event) => {
    if (runnerWindow && !runnerWindow.isDestroyed()) {
      runnerWindow.webContents.send('runner:progress', event);
    }
  });
  const report = buildRunnerReport(pkg, cwd, outcome);
  if (runnerWindow && !runnerWindow.isDestroyed()) {
    runnerWindow.webContents.send('runner:finished', { report, okCount: outcome.results.filter((r) => r.status === 'ok').length, total: outcome.results.length, aborted: outcome.aborted });
  }
  return { ok: true, report, outcome };
}

// --- Floating button --------------------------------------------------
// A small draggable always-on-top circle. Click toggles the main
// window; right-click opens a small menu (open main window / hide the
// button). Off by default; position is remembered.

let saveFloatingBoundsTimer = null;
function saveFloatingBounds() {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  try {
    const b = floatingWindow.getBounds();
    config.update({ floatingButtonBounds: { x: b.x, y: b.y } });
  } catch (err) {
    console.warn('Could not save floating button position:', err.message);
  }
}
function scheduleSaveFloatingBounds() {
  if (saveFloatingBoundsTimer) clearTimeout(saveFloatingBoundsTimer);
  saveFloatingBoundsTimer = setTimeout(saveFloatingBounds, 500);
}

function initialFloatingPosition() {
  const saved = config.get('floatingButtonBounds');
  const primary = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: primary.x + primary.width - FLOATING_SIZE - 24,
    y: primary.y + Math.round(primary.height / 2),
  };
  if (!saved) return fallback;
  const displays = screen.getAllDisplays();
  const onScreen = displays.some((d) => {
    const a = d.workArea;
    return saved.x >= a.x - FLOATING_SIZE && saved.x < a.x + a.width &&
      saved.y >= a.y - FLOATING_SIZE && saved.y < a.y + a.height;
  });
  if (!onScreen) return fallback;
  return {
    x: Math.max(primary.x, Math.min(saved.x, primary.x + primary.width - FLOATING_SIZE)),
    y: Math.max(primary.y, Math.min(saved.y, primary.y + primary.height - FLOATING_SIZE)),
  };
}

function createFloatingWindow() {
  if (floatingWindow && !floatingWindow.isDestroyed()) return floatingWindow;
  const pos = initialFloatingPosition();
  floatingWindow = new BrowserWindow({
    ...pos,
    width: FLOATING_SIZE,
    height: FLOATING_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Muse',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'floating-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted page; no remote content.
    },
  });
  floatingWindow.setMenu(null);
  floatingWindow.loadFile(path.join(__dirname, 'floating.html'));
  floatingWindow.once('ready-to-show', () => floatingWindow.show());
  console.log('Floating button window created.');
  floatingWindow.on('move', scheduleSaveFloatingBounds);
  floatingWindow.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => toggleWindow() },
      { label: '打开 Quick chat', click: () => toggleQuickChat() },
      { type: 'separator' },
      {
        label: '隐藏悬浮按钮',
        click: () => {
          config.update({ floatingButtonEnabled: false });
          destroyFloatingWindow();
          buildTrayMenu();
          buildMenu();
        },
      },
    ]);
    menu.popup({ window: floatingWindow });
  });
  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });
  return floatingWindow;
}

function destroyFloatingWindow() {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    saveFloatingBounds();
    floatingWindow.destroy();
  }
  floatingWindow = null;
}

function applyFloatingButton() {
  if (config.get('floatingButtonEnabled')) {
    createFloatingWindow();
  } else {
    destroyFloatingWindow();
  }
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '设置 — Muse Windows Client',
    parent: mainWindow || undefined,
    modal: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // local trusted settings page; no remote content.
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  return settingsWindow;
}

// --- Files: drag & drop, picker, clipboard hand-off (Phase 3) ---------
// The shell can never inject a file into the web page's upload —
// whether a drop is accepted is decided by muse.ai itself. What the
// shell CAN guarantee: if the page does not handle a drop, the shell
// checks the authorised-folders list and copies the file's content
// (text files) or its path (binary / large files) to the clipboard,
// so the user pastes it into the chat. Nothing is ever read outside
// the authorised folders, and a blocked folder always wins.

const MAX_TEXT_BYTES = 512 * 1024;
const MAX_READ_BYTES = 5 * 1024 * 1024;

// Paths from the most recent drop, recorded by preload.js. Only used
// when the page did not handle the drop (see handleUnhandledDrop).
let lastDrop = { paths: [], at: 0 };

function recordRecentFile(filePath) {
  const recent = config.get('recentFiles') || [];
  const next = [filePath, ...recent.filter((p) => p !== filePath)].slice(0, 10);
  config.update({ recentFiles: next });
}

/**
 * Authorise one file and copy it to the clipboard for pasting into
 * the chat. Returns { ok, mode: 'content'|'path', reason, name }.
 */
function sendFileToChat(filePath) {
  const name = path.basename(String(filePath || ''));
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return { ok: false, reason: 'missing', name };
  }
  if (!stat.isFile()) return { ok: false, reason: 'not-a-file', name };
  const check = config.authorizeFile(
    filePath,
    config.get('authorizedFolders'),
    config.get('blockedFolders')
  );
  if (!check.ok) return { ok: false, reason: check.reason, name };
  if (stat.size > MAX_READ_BYTES) {
    clipboard.writeText(filePath);
    recordRecentFile(filePath);
    return { ok: true, mode: 'path', name };
  }
  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch (_) {
    return { ok: false, reason: 'unreadable', name };
  }
  // Binary detection: a NUL byte in the first 8 KB, or too big for text.
  const head = content.subarray(0, 8192);
  if (head.includes(0) || stat.size > MAX_TEXT_BYTES) {
    clipboard.writeText(filePath);
    recordRecentFile(filePath);
    return { ok: true, mode: 'path', name };
  }
  clipboard.writeText(content.toString('utf8'));
  recordRecentFile(filePath);
  return { ok: true, mode: 'content', name };
}

function handleFilesForChat(paths, source) {
  const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && p);
  if (list.length === 0) return;
  const results = list.map((p) => sendFileToChat(p));
  const sent = results.filter((r) => r.ok);
  const denied = results.filter((r) => !r.ok);
  const contentCount = sent.filter((r) => r.mode === 'content').length;
  const pathCount = sent.filter((r) => r.mode === 'path').length;
  if (sent.length > 0) {
    const parts = [];
    if (contentCount > 0) parts.push(`${contentCount} 个文件的内容已复制到剪贴板，粘贴进聊天即可发给 Edison`);
    if (pathCount > 0) parts.push(`${pathCount} 个文件的路径已复制到剪贴板（文件是二进制或太大，只复制路径）`);
    notify('文件已准备好', parts.join('；') + '。');
  }
  const authDenied = denied.filter((r) =>
    r.reason === 'not-authorized' || r.reason === 'no-folders' || r.reason === 'blocked');
  if (authDenied.length > 0) {
    const first = authDenied[0];
    const reasonText = first.reason === 'no-folders'
      ? '还没有设置任何授权文件夹，壳子不会读取任何文件。'
      : first.reason === 'blocked'
        ? `“${first.name}”在黑名单文件夹里，壳子拒绝读取。`
        : `“${first.name}”不在已授权文件夹里，壳子拒绝读取。`;
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '文件未发送',
      message: `${authDenied.length} 个文件没有发送`,
      detail: reasonText + '\n\n请在设置 → 文件与授权文件夹里添加包含这个文件的文件夹。',
      buttons: ['打开设置', '知道了'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) createSettingsWindow();
    }).catch(() => {});
  } else if (denied.length > 0) {
    notify('部分文件未发送', denied.map((r) => r.name).join('、') + ' 无法读取。');
  }
}

/** A drop the web page did not handle arrives here as file:// navigation. */
function handleUnhandledDrop(fileUrl) {
  let paths = [];
  if (Date.now() - lastDrop.at < 2000 && lastDrop.paths.length > 0) {
    paths = lastDrop.paths;
  }
  if (paths.length === 0) {
    try {
      paths = [fileURLToPath(fileUrl)];
    } catch (_) {
      paths = [];
    }
  }
  if (paths.length > 0) handleFilesForChat(paths, 'drop');
}

async function pickAndSendFiles() {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: '选择要发给 Edison 的文件',
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return;
  handleFilesForChat(filePaths, 'picker');
}

// --- Auto-start -------------------------------------------------------

function applyAutoStart() {
  const enabled = !!config.get('autoStart');
  // setLoginSettings only exists on Windows and macOS. This is a
  // Windows client, so on Linux dev machines it is simply skipped.
  if (process.platform !== 'win32' && process.platform !== 'darwin') return enabled;
  try {
    app.setLoginSettings({ openAtLogin: enabled });
  } catch (err) {
    console.warn('Could not apply auto-start setting:', err.message);
  }
  return enabled;
}

// --- Notifications --------------------------------------------------

/** Show a Windows toast, honouring the master switch in Settings. */
function notify(title, body) {
  if (!config.get('notificationsEnabled')) return;
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    n.show();
  } catch (err) {
    console.warn('Could not show notification:', err.message);
  }
}

/**
 * Permission gates. Web notifications (the Notification API used by
 * muse.ai) go through the session permission handler, so the master
 * switch in Settings really turns them off instead of only hiding
 * the app's own toasts. Microphone access ('media') is gated the
 * same way for both the web page and the dictation window.
 */
function wirePermissionHandlers() {
  const handler = (webContents, permission, callback, details) => {
    if (permission === 'notifications') {
      callback(!!config.get('notificationsEnabled'));
    } else if (permission === 'media') {
      // Electron reports which media kinds were requested, when it can.
      const types = (details && details.mediaTypes) || [];
      if (types.length > 0) {
        const audioOk = !types.includes('audio') || !!config.get('microphoneEnabled');
        const videoOk = !types.includes('video') || !!config.get('cameraEnabled');
        callback(audioOk && videoOk);
      } else {
        callback(!!config.get('microphoneEnabled') || !!config.get('cameraEnabled'));
      }
    } else {
      callback(true);
    }
  };
  try {
    session.fromPartition('persist:muse').setPermissionRequestHandler(handler);
  } catch (err) {
    console.warn('Could not wire permission handler for muse session:', err.message);
  }
  try {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (permission === 'media') {
        const types = (details && details.mediaTypes) || [];
        if (types.length > 0) {
          const audioOk = !types.includes('audio') || !!config.get('microphoneEnabled');
          const videoOk = !types.includes('video') || !!config.get('cameraEnabled');
          callback(audioOk && videoOk);
        } else {
          callback(!!config.get('microphoneEnabled') || !!config.get('cameraEnabled'));
        }
      } else {
        callback(true);
      }
    });
  } catch (err) {
    console.warn('Could not wire permission handler for default session:', err.message);
  }
}

// --- Global shortcuts -------------------------------------------------

function describeShortcut(accelerator) {
  return String(accelerator || '')
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/CmdOrCtrl/g, 'Ctrl');
}

function registerOneShortcut(accelerator, handler) {
  try {
    return globalShortcut.register(accelerator, handler);
  } catch (err) {
    console.warn('Global shortcut registration threw:', accelerator, err.message);
    return false;
  }
}

function reportShortcutFailure(label, accelerator) {
  console.warn(
    `Global shortcut ${label} (${accelerator}) could not be registered (it may be in use by another app). ` +
    'The app keeps working without it; use the tray icon or the menu instead.'
  );
  try {
    if (tray) {
      tray.displayBalloon({
        title: 'Muse',
        content: `全局快捷键 ${label}（${describeShortcut(accelerator)}）注册失败，可能被其他软件占用。请在设置里换一个快捷键。`,
      });
    }
  } catch (_) {
    // Balloon notifications are best-effort only.
  }
  buildTrayMenu();
  buildMenu();
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  toggleShortcutStatus = 'disabled';
  quickChatShortcutStatus = 'disabled';
  localModelShortcutStatus = 'disabled';

  if (config.get('shortcutEnabled')) {
    const accelerator = config.get('toggleShortcut') || 'CommandOrControl+Alt+M';
    if (registerOneShortcut(accelerator, toggleWindow)) {
      toggleShortcutStatus = 'ok';
    } else {
      toggleShortcutStatus = 'failed';
      reportShortcutFailure('显示 / 隐藏主窗口', accelerator);
    }
  }

  if (config.get('quickChatEnabled')) {
    const accelerator = config.get('quickChatShortcut') || 'CommandOrControl+Alt+Q';
    if (registerOneShortcut(accelerator, toggleQuickChat)) {
      quickChatShortcutStatus = 'ok';
    } else {
      quickChatShortcutStatus = 'failed';
      reportShortcutFailure('Quick chat', accelerator);
    }
  }

  if (config.get('dictationEnabled')) {
    const accelerator = config.get('dictationShortcut') || 'CommandOrControl+Alt+D';
    if (registerOneShortcut(accelerator, toggleDictation)) {
      dictationShortcutStatus = 'ok';
    } else {
      dictationShortcutStatus = 'failed';
      reportShortcutFailure('听写', accelerator);
    }
  }

  if (config.get('screenshotEnabled')) {
    const accelerator = config.get('screenshotShortcut') || 'CommandOrControl+Alt+S';
    if (registerOneShortcut(accelerator, () => startRegionCapture('shortcut'))) {
      screenshotShortcutStatus = 'ok';
    } else {
      screenshotShortcutStatus = 'failed';
      reportShortcutFailure('框选区域', accelerator);
    }
  }

  {
    const accelerator = config.get('searchShortcut') || 'CommandOrControl+Alt+F';
    if (registerOneShortcut(accelerator, toggleSearch)) {
      searchShortcutStatus = 'ok';
    } else {
      searchShortcutStatus = 'failed';
      reportShortcutFailure('文件名搜索', accelerator);
    }
  }

  {
    const accelerator = config.get('localModelShortcut') || 'CommandOrControl+Alt+L';
    if (registerOneShortcut(accelerator, toggleLocalModel)) {
      localModelShortcutStatus = 'ok';
    } else {
      localModelShortcutStatus = 'failed';
      reportShortcutFailure('本地模型', accelerator);
    }
  }

  if (config.get('runnerEnabled')) {
    const accelerator = config.get('runnerShortcut') || 'CommandOrControl+Alt+R';
    if (registerOneShortcut(accelerator, toggleRunner)) {
      runnerShortcutStatus = 'ok';
    } else {
      runnerShortcutStatus = 'failed';
      reportShortcutFailure('任务执行器', accelerator);
    }
  } else {
    runnerShortcutStatus = 'disabled';
  }

  buildTrayMenu();
  buildMenu();
}

// Backwards-compatible name used by the tray menu / settings IPC.
function registerShortcut() {
  registerShortcuts();
}

// --- Updates (check + prompt only, never silent install) --------------

function checkForUpdates(manual) {
  if (!autoUpdater) {
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '检查更新',
        message: '更新检查不可用',
        detail: 'electron-updater 未加载。请确认已安装依赖（npm install），或在 README 的“自动更新”一节查看配置。',
      });
    } else {
      console.warn('Update check skipped: electron-updater is unavailable.');
    }
    return;
  }
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  autoUpdater.checkForUpdates().catch((err) => {
    updateCheckInFlight = false;
    console.warn('Update check failed:', err && err.message ? err.message : err);
    if (manual) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '检查更新失败',
        message: '检查更新失败',
        detail:
          '原因：' + (err && err.message ? err.message : String(err)) + '\n\n' +
          '最常见的原因是还没有配置 GitHub 更新仓库。请按 README 的“自动更新”一节，先在 GitHub 上创建 nfyxvip/muse-windows-client 仓库并发布一个 Release，更新检查才能工作。',
      });
    }
  });
}

function wireAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.on('update-available', (info) => {
    updateCheckInFlight = false;
    const version = info && info.version ? info.version : '新版本';
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${version}`,
      detail: '是否现在下载？下载完成后会提示你，是否重启安装由你决定，不会自动安装。',
      buttons: ['现在下载', '稍后再说'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate().catch((err) => {
        dialog.showErrorBox('下载更新失败', err && err.message ? err.message : String(err));
      });
    }).catch(() => {});
  });
  autoUpdater.on('update-not-available', () => {
    updateCheckInFlight = false;
    // Only the manual check reports "already latest"; the silent
    // startup check stays quiet. We track this via a flag set by the
    // manual caller below (see checkForUpdatesManual).
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '检查更新',
        message: '已是最新版本',
        detail: `当前版本 ${app.getVersion()}，没有可用的更新。`,
      });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && info.version ? info.version : '新版本';
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: `新版本 ${version} 已下载完成`,
      detail: '是否现在重启应用并安装？也可以稍后手动重启安装。',
      buttons: ['现在重启安装', '稍后再说'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    }).catch(() => {});
  });
  autoUpdater.on('error', (err) => {
    // The promise returned by checkForUpdates() also rejects on the
    // same failure and shows the manual dialog there; this handler
    // only logs, so the user never gets two dialogs for one failure.
    updateCheckInFlight = false;
    manualUpdateCheck = false;
    console.warn('autoUpdater error:', err && err.message ? err.message : err);
  });
}

let manualUpdateCheck = false;
function checkForUpdatesManual() {
  manualUpdateCheck = true;
  checkForUpdates(true);
}

// --- Menus ------------------------------------------------------------

function buildMenu() {
  const toggleLabel = `显示 / 隐藏主窗口 (${describeShortcut(config.get('toggleShortcut'))})`;
  const quickChatLabel = `Quick chat (${describeShortcut(config.get('quickChatShortcut'))})`;
  const template = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: '回到首页', click: () => mainWindow && mainWindow.loadURL(MUSE_URL) },
        { label: '发送文件到聊天…', accelerator: 'CmdOrCtrl+Shift+O', click: () => pickAndSendFiles() },
        { type: 'separator' },
        { label: quickChatLabel, click: () => toggleQuickChat() },
        { label: `听写 (${describeShortcut(config.get('dictationShortcut'))})`, click: () => toggleDictation() },
        { label: `框选区域 (${describeShortcut(config.get('screenshotShortcut'))})`, click: () => startRegionCapture('shortcut') },
        { label: '截屏…', click: () => openCaptureWindow() },
        { label: '拍照', click: () => openCameraWindow() },
        { label: `文件名搜索 (${describeShortcut(config.get('searchShortcut'))})`, click: () => toggleSearch() },
        { label: `本地模型 (${describeShortcut(config.get('localModelShortcut'))})`, click: () => toggleLocalModel() },
        { label: `任务执行器 (${describeShortcut(config.get('runnerShortcut'))})`, click: () => toggleRunner() },
        { label: '连接云端服务…', click: () => createConnectWindow() },
        {
          label: '本地操作',
          submenu: [
            { label: '打开记事本', click: () => runAutomation('notepad') },
            { label: '打开计算器', click: () => runAutomation('calculator') },
            { label: '打开文件夹…', click: () => runAutomation('explorer') },
            { label: '在浏览器中打开 muse.ai', click: () => runAutomation('browser') },
          ],
        },
        {
          label: '悬浮按钮',
          type: 'checkbox',
          checked: !!config.get('floatingButtonEnabled'),
          click: (menuItem) => {
            config.update({ floatingButtonEnabled: menuItem.checked });
            applyFloatingButton();
            buildTrayMenu();
            buildMenu();
          },
        },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => createSettingsWindow() },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: '查看(&V)',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', click: () => setZoom(0.1) },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => setZoom(-0.1) },
        {
          label: '恢复默认大小',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            config.update({ zoomFactor: 1.0 });
            applyZoom();
          },
        },
        { type: 'separator' },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 Muse Windows Client',
              message: `Muse Windows Client ${app.getVersion()}`,
              detail:
                '非官方的 Muse 网页版壳子，仅在桌面窗口中打开 https://muse.ai。\n' +
                'Muse 是 Meta 的产品。请用你自己的 Muse 账号登录。',
            });
          },
        },
        { label: '检查更新', click: () => checkForUpdatesManual() },
        { label: '打开 muse.ai', click: () => openExternal(MUSE_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildTrayMenu() {
  if (!tray) return;
  const autoStart = !!config.get('autoStart');
  const shortcutEnabled = !!config.get('shortcutEnabled');
  const quickChatEnabled = !!config.get('quickChatEnabled');
  const floatingEnabled = !!config.get('floatingButtonEnabled');
  const minimizeToTray = config.get('closeBehaviour') !== 'quit';
  const toggleLabel =
    toggleShortcutStatus === 'failed'
      ? `主窗口快捷键 ${describeShortcut(config.get('toggleShortcut'))}（注册失败）`
      : `主窗口快捷键 ${describeShortcut(config.get('toggleShortcut'))}`;
  const quickChatLabel =
    quickChatShortcutStatus === 'failed'
      ? `Quick chat 快捷键 ${describeShortcut(config.get('quickChatShortcut'))}（注册失败）`
      : `Quick chat 快捷键 ${describeShortcut(config.get('quickChatShortcut'))}`;
  const dictationLabel =
    dictationShortcutStatus === 'failed'
      ? `听写快捷键 ${describeShortcut(config.get('dictationShortcut'))}（注册失败）`
      : `听写快捷键 ${describeShortcut(config.get('dictationShortcut'))}`;
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏窗口', click: toggleWindow },
    { label: 'Quick chat', click: () => toggleQuickChat() },
    { label: '听写', click: () => toggleDictation() },
    { label: '框选区域', click: () => startRegionCapture('shortcut') },
    { label: '截屏', click: () => openCaptureWindow() },
    { label: '拍照', click: () => openCameraWindow() },
    { label: '文件名搜索', click: () => toggleSearch() },
    { label: '本地模型', click: () => toggleLocalModel() },
    { label: '任务执行器', click: () => toggleRunner() },
    { label: '连接云端服务…', click: () => createConnectWindow() },
    { label: '发送文件到聊天…', click: () => pickAndSendFiles() },
    { label: '重新加载', click: () => mainWindow && mainWindow.reload() },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: autoStart,
      click: (menuItem) => {
        config.update({ autoStart: menuItem.checked });
        applyAutoStart();
        buildTrayMenu();
      },
    },
    {
      label: toggleLabel,
      type: 'checkbox',
      checked: shortcutEnabled,
      click: (menuItem) => {
        config.update({ shortcutEnabled: menuItem.checked });
        registerShortcuts();
        buildTrayMenu();
      },
    },
    {
      label: quickChatLabel,
      type: 'checkbox',
      checked: quickChatEnabled,
      click: (menuItem) => {
        config.update({ quickChatEnabled: menuItem.checked });
        registerShortcuts();
        buildTrayMenu();
      },
    },
    {
      label: dictationLabel,
      type: 'checkbox',
      checked: !!config.get('dictationEnabled'),
      click: (menuItem) => {
        config.update({ dictationEnabled: menuItem.checked });
        registerShortcuts();
        buildTrayMenu();
      },
    },
    {
      label: '悬浮按钮',
      type: 'checkbox',
      checked: floatingEnabled,
      click: (menuItem) => {
        config.update({ floatingButtonEnabled: menuItem.checked });
        applyFloatingButton();
        buildTrayMenu();
        buildMenu();
      },
    },
    {
      label: '关闭时最小化到托盘',
      type: 'checkbox',
      checked: minimizeToTray,
      click: (menuItem) => {
        config.update({ closeBehaviour: menuItem.checked ? 'minimize-to-tray' : 'quit' });
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: '设置…', click: () => createSettingsWindow() },
    { label: '检查更新', click: () => checkForUpdatesManual() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function buildTray() {
  const trayImage = loadTrayImage();
  tray = new Tray(trayImage);
  tray.setToolTip('Muse');
  buildTrayMenu();
  tray.on('click', toggleWindow);
}

// --- App lifecycle ----------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Load persisted settings first; auto-start is applied from the
    // saved value, never forced off on launch (v0.1 bug).
    config.load();
    applyAutoStart();

    wireAutoUpdater();
    wirePermissionHandlers();
    buildMenu();
    createWindow();
    buildTray();
    registerShortcuts();
    applyFloatingButton();

    // Silent update check shortly after startup (no dialog unless an
    // update is actually available). Failures are logged only.
    if (config.get('checkUpdatesOnStartup')) {
      setTimeout(() => checkForUpdates(false), 8000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  saveWindowBounds();
  saveQuickChatBounds();
  saveDictationBounds();
  saveFloatingBounds();
});

// Keep the tray alive when the window is hidden; only really quit
// when the user chose Quit (or set close behaviour to "quit").
app.on('window-all-closed', (event) => {
  if (!isQuitting) event.preventDefault();
});

// Settings window IPC (used by settings-preload.js).
ipcMain.handle('settings-get', () => ({
  ...config.load(),
  version: app.getVersion(),
  shortcutStatus: { toggle: toggleShortcutStatus, quickChat: quickChatShortcutStatus, dictation: dictationShortcutStatus, screenshot: screenshotShortcutStatus, search: searchShortcutStatus, localModel: localModelShortcutStatus, runner: runnerShortcutStatus },
}));
ipcMain.handle('settings-set', (event, partial) => {
  const next = config.update(partial || {});
  const p = partial || {};
  if (Object.prototype.hasOwnProperty.call(p, 'autoStart')) applyAutoStart();
  if (
    Object.prototype.hasOwnProperty.call(p, 'shortcutEnabled') ||
    Object.prototype.hasOwnProperty.call(p, 'toggleShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'quickChatEnabled') ||
    Object.prototype.hasOwnProperty.call(p, 'quickChatShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'dictationEnabled') ||
    Object.prototype.hasOwnProperty.call(p, 'dictationShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'screenshotEnabled') ||
    Object.prototype.hasOwnProperty.call(p, 'screenshotShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'searchShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'localModelShortcut') ||
    Object.prototype.hasOwnProperty.call(p, 'runnerEnabled') ||
    Object.prototype.hasOwnProperty.call(p, 'runnerShortcut')
  ) {
    registerShortcuts();
  }
  if (Object.prototype.hasOwnProperty.call(p, 'floatingButtonEnabled')) applyFloatingButton();
  if (Object.prototype.hasOwnProperty.call(p, 'zoomFactor')) applyZoom();
  buildTrayMenu();
  buildMenu();
  return {
    ...next,
    shortcutStatus: { toggle: toggleShortcutStatus, quickChat: quickChatShortcutStatus, dictation: dictationShortcutStatus, screenshot: screenshotShortcutStatus, search: searchShortcutStatus, localModel: localModelShortcutStatus, runner: runnerShortcutStatus },
  };
});
ipcMain.handle('check-updates', () => {
  checkForUpdatesManual();
  return true;
});
ipcMain.handle('test-notification', () => {
  notify('Muse Windows Client', '这是一条测试通知。以后 muse.ai 有消息提醒时，也会这样弹出来。');
  return config.get('notificationsEnabled');
});
ipcMain.on('settings-close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

// Floating button IPC (used by floating-preload.js).
ipcMain.handle('floating-toggle-main', () => {
  toggleWindow();
  return true;
});

// File drop IPC. preload.js reports every drop on the web page; the
// main process only acts on it when the page did not handle the drop
// (a file:// navigation follows). Drops on the floating button never
// reach the web page, so they are handled directly.
ipcMain.on('dropped-files', (event, paths) => {
  if (Array.isArray(paths)) {
    lastDrop = { paths: paths.filter((p) => typeof p === 'string' && p), at: Date.now() };
  }
});
ipcMain.on('floating-drop-files', (event, paths) => {
  handleFilesForChat(paths, 'floating');
});
ipcMain.handle('select-folder', async () => {
  const parent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: '选择文件夹',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return null;
  return filePaths[0];
});
ipcMain.handle('copy-recent-file', (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, reason: 'invalid' };
  const result = sendFileToChat(filePath);
  if (result.ok) {
    notify(
      '文件已准备好',
      result.mode === 'content'
        ? `“${result.name}”的内容已复制到剪贴板，粘贴进聊天即可。`
        : `“${result.name}”的路径已复制到剪贴板。`
    );
  }
  return result;
});
ipcMain.handle('clear-recent', () => {
  config.update({ recentFiles: [] });
  return true;
});
ipcMain.handle('send-files', async () => {
  await pickAndSendFiles();
  return true;
});

// Dictation window IPC (used by dictation-preload.js).
ipcMain.handle('dictation-copy', (event, text) => {
  if (typeof text !== 'string' || !text) return false;
  clipboard.writeText(text);
  return true;
});
ipcMain.handle('dictation-copied-toast', (event, text) => {
  notify('听写', '识别结果已复制到剪贴板，粘贴进聊天即可。');
  return true;
});
ipcMain.on('dictation-close', () => {
  if (dictationWindow && !dictationWindow.isDestroyed()) dictationWindow.hide();
});

// Screenshot / camera IPC (used by capture-preload.js / camera-preload.js).
ipcMain.handle('capture-list-sources', async () => {
  try {
    return await listCaptureSources();
  } catch (err) {
    console.warn('Could not list capture sources:', err.message);
    return [];
  }
});
ipcMain.handle('capture-take', async (event, sourceId) => {
  try {
    return await captureSource(sourceId);
  } catch (err) {
    console.warn('Could not capture source:', err.message);
    return null;
  }
});
ipcMain.handle('region-start', async () => {
  await startRegionCapture('picker');
  return true;
});
ipcMain.on('region-selected', async (event, rect) => {
  await onRegionSelected(rect);
});
ipcMain.on('region-cancel', () => {
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
});
ipcMain.handle('region-copy', async () => copyRegionShot());
ipcMain.handle('region-save', async () => {
  try {
    return await saveRegionShot();
  } catch (err) {
    console.warn('Could not save region shot:', err.message);
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('capture-recrop', async (event, rect) => {
  try {
    return recropCapture(rect);
  } catch (err) {
    console.warn('Could not recrop:', err.message);
    return null;
  }
});
ipcMain.handle('image-copy', (event, dataUrl) => {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
    notify('图片已准备好', '已复制到剪贴板，粘贴进聊天即可发给 Edison。');
    return true;
  } catch (err) {
    console.warn('Could not copy image:', err.message);
    return false;
  }
});
ipcMain.handle('image-save', async (event, dataUrl, defaultName) => {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return { ok: false };
    const parent = captureWindow && !captureWindow.isDestroyed() ? captureWindow
      : cameraWindow && !cameraWindow.isDestroyed() ? cameraWindow : undefined;
    const { canceled, filePath } = await dialog.showSaveDialog(parent, {
      title: '保存图片',
      defaultPath: defaultName || 'muse-capture.png',
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
    const base64 = dataUrl.split(',')[1] || '';
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true, filePath };
  } catch (err) {
    console.warn('Could not save image:', err.message);
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
});
ipcMain.on('capture-close', () => {
  if (captureWindow && !captureWindow.isDestroyed()) captureWindow.close();
});
ipcMain.on('camera-close', () => {
  if (cameraWindow && !cameraWindow.isDestroyed()) cameraWindow.close();
});

// Cloud service entries + filename search (used by connect/search preloads).
ipcMain.handle('connect-list', () => CLOUD_SERVICES.map((s) => ({ ...s })));
ipcMain.handle('connect-open', async (event, url) => {
  const allowed = CLOUD_SERVICES.some((s) => s.url === url);
  if (!allowed) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.warn('Could not open cloud service:', err.message);
    return false;
  }
});
ipcMain.on('connect-close', () => {
  if (connectWindow && !connectWindow.isDestroyed()) connectWindow.close();
});
ipcMain.handle('search-state', () => ({
  authorizedFolders: config.get('authorizedFolders') || [],
  recentFiles: config.get('recentFiles') || [],
  favoriteFiles: config.get('favoriteFiles') || [],
}));
ipcMain.handle('search-files', async (event, query) => {
  try {
    return searchFileNames(query);
  } catch (err) {
    console.warn('Could not search files:', err.message);
    return { results: [], scanned: 0, folders: 0 };
  }
});
ipcMain.handle('search-toggle-favorite', (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return config.get('favoriteFiles') || [];
  return toggleFavoriteFile(filePath);
});
ipcMain.handle('search-copy-path', (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return false;
  clipboard.writeText(filePath);
  notify('路径已复制', '文件路径已复制到剪贴板，粘贴进聊天即可。');
  return true;
});
ipcMain.handle('search-open-folder', async (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return false;
  try {
    shell.showItemInFolder(filePath);
    return true;
  } catch (err) {
    console.warn('Could not show item in folder:', err.message);
    return false;
  }
});
ipcMain.on('search-close', () => {
  if (searchWindow && !searchWindow.isDestroyed()) searchWindow.hide();
});

// Local model IPC (used by local-model-preload.js and settings-preload.js).
// Chat always resolves the endpoint from the stored config by id;
// only the settings test accepts a provider object, and it is
// sanitised (bare host, valid port) before any fetch happens.
ipcMain.handle('local-model:get-active', () => {
  const p = getActiveLocalModel();
  return { active: publicLocalModel(p) };
});
ipcMain.handle('local-model:test', async (event, provider) => {
  return testLocalModelConnection(provider);
});
ipcMain.handle('local-model:send', async (event, providerId, messages) => {
  const providers = config.get('localModels') || [];
  const provider = (typeof providerId === 'string' && providerId
    ? providers.find((p) => p.id === providerId)
    : null) || getActiveLocalModel();
  if (!provider) {
    return { ok: false, error: '还没有启用本地模型，请先在设置 → 本地模型里添加并启用。' };
  }
  const cleanMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-50);
  if (!cleanMessages.length) return { ok: false, error: '没有要发送的内容。' };
  const sender = event.sender;
  streamLocalModelChat(provider, cleanMessages, {
    onChunk: (text) => { try { sender.send('local-model:chunk', text); } catch (_) { /* window closed */ } },
    onDone: (info) => { try { sender.send('local-model:done', info || {}); } catch (_) { /* window closed */ } },
    onError: (msg) => { try { sender.send('local-model:error', msg); } catch (_) { /* window closed */ } },
  });
  return { ok: true };
});
ipcMain.on('local-model:abort', () => {
  if (localModelStreamAbort) {
    try { localModelStreamAbort.abort(); } catch (_) { /* already gone */ }
  }
});
ipcMain.on('local-model:open-settings', () => {
  createSettingsWindow();
});
ipcMain.on('local-model:close', () => {
  if (localModelWindow && !localModelWindow.isDestroyed()) localModelWindow.hide();
});

// Task runner IPC (used by runner-preload.js). All validation and
// execution happens in the main process; the page only displays.
ipcMain.handle('runner:get-state', () => ({
  enabled: !!config.get('runnerEnabled'),
  allowedCommands: runnerAllowedCommands(),
  authorizedFolders: config.get('authorizedFolders') || [],
  shortcut: config.get('runnerShortcut') || 'CommandOrControl+Alt+R',
}));
ipcMain.handle('runner:pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(runnerWindow || mainWindow, {
    title: '选择要执行任务的文件夹（必须已授权）',
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return { ok: false, reason: 'cancelled' };
  const folder = filePaths[0];
  const gate = config.authorizeFile(folder, config.get('authorizedFolders'), config.get('blockedFolders'));
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, folder };
  }
  return { ok: true, folder };
});
ipcMain.handle('runner:parse', (event, text) => parseTaskPackage(text));
ipcMain.handle('runner:check', (event, pkg, cwd) => checkRunnerRun(pkg, cwd));
ipcMain.handle('runner:run', async (event, pkg, cwd) => runTaskPackageWithConfirm(pkg, cwd));
ipcMain.handle('runner:abort', () => {
  abortRunnerRun();
  return true;
});
ipcMain.handle('runner:copy-report', (event, report) => {
  clipboard.writeText(report || '');
  return true;
});
ipcMain.handle('runner:save-report', async (event, report, cwd, title) => {
  const safeTitle = String(title || '任务报告').replace(/[\\/:*?"<>|]/g, '').trim() || '任务报告';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const { canceled, filePath } = await dialog.showSaveDialog(runnerWindow || mainWindow, {
    title: '保存任务报告',
    defaultPath: path.join(cwd || '', `${safeTitle}-${stamp}.md`),
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: '文本', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
  try {
    fs.writeFileSync(filePath, report || '', 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, reason: 'failed', error: err && err.message ? err.message : String(err) };
  }
});
ipcMain.on('runner:open-settings', () => {
  createSettingsWindow();
});
ipcMain.on('runner:close', () => {
  if (runnerWindow && !runnerWindow.isDestroyed()) runnerWindow.hide();
});

// Exported for smoke tests only (the app entry point ignores exports).
module.exports = {
  config,
  createQuickChatWindow,
  toggleQuickChat,
  createDictationWindow,
  toggleDictation,
  createCaptureWindow,
  createCameraWindow,
  createRegionWindow,
  captureRegion,
  onRegionSelected,
  copyRegionShot,
  saveRegionShot,
  recropCapture,
  createSearchWindow,
  createConnectWindow,
  createLocalModelWindow,
  toggleLocalModel,
  getActiveLocalModel,
  testLocalModelConnection,
  streamLocalModelChat,
  createRunnerWindow,
  toggleRunner,
  parseTaskPackage,
  checkRunnerSteps,
  checkRunnerRun,
  runTaskSteps,
  buildRunnerReport,
  abortRunnerRun,
  searchFileNames,
  toggleFavoriteFile,
  CLOUD_SERVICES,
  isPopupAllowedUrl,
  listCaptureSources,
  captureSource,
  canAutomate,
  createFloatingWindow,
  destroyFloatingWindow,
  applyFloatingButton,
  registerShortcuts,
  notify,
  sendFileToChat,
  handleFilesForChat,
};
