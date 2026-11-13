/**
 * Muse Windows Client — a simple unofficial wrapper (v0.6.0).
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
const FLOATING_SIZE = 64;

let mainWindow = null;
let settingsWindow = null;
let quickChatWindow = null;
let dictationWindow = null;
let captureWindow = null;
let cameraWindow = null;
let regionWindow = null;
let lastFullCapture = null; // { image: nativeImage, rect: {x,y,width,height} in image pixels }
let floatingWindow = null;
let tray = null;
let isQuitting = false;
// 'ok' | 'failed' | 'disabled' — one per global shortcut.
let toggleShortcutStatus = 'disabled';
let quickChatShortcutStatus = 'disabled';
let dictationShortcutStatus = 'disabled';
let screenshotShortcutStatus = 'disabled';
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

function isMuseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'muse.ai' || u.hostname === 'www.muse.ai');
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isMuseUrl(url)) return { action: 'allow' };
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
    if (!isMuseUrl(url)) {
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
    if (isMuseUrl(url)) return { action: 'allow' };
    openExternal(url);
    return { action: 'deny' };
  });
  quickChatWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
      handleUnhandledDrop(url);
      return;
    }
    if (!isMuseUrl(url)) {
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

async function startRegionCapture() {
  if (!config.get('screenshotEnabled')) {
    permissionOffNotice('screenshot', '截屏');
    return;
  }
  if (!(await confirmPermissionOnce('screenshot'))) return;
  createRegionWindow();
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
    if (registerOneShortcut(accelerator, openCaptureWindow)) {
      screenshotShortcutStatus = 'ok';
    } else {
      screenshotShortcutStatus = 'failed';
      reportShortcutFailure('截屏', accelerator);
    }
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
        { label: `截屏 (${describeShortcut(config.get('screenshotShortcut'))})`, click: () => openCaptureWindow() },
        { label: '拍照', click: () => openCameraWindow() },
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
    { label: '截屏', click: () => openCaptureWindow() },
    { label: '拍照', click: () => openCameraWindow() },
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
  shortcutStatus: { toggle: toggleShortcutStatus, quickChat: quickChatShortcutStatus, dictation: dictationShortcutStatus, screenshot: screenshotShortcutStatus },
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
    Object.prototype.hasOwnProperty.call(p, 'screenshotShortcut')
  ) {
    registerShortcuts();
  }
  if (Object.prototype.hasOwnProperty.call(p, 'floatingButtonEnabled')) applyFloatingButton();
  if (Object.prototype.hasOwnProperty.call(p, 'zoomFactor')) applyZoom();
  buildTrayMenu();
  buildMenu();
  return {
    ...next,
    shortcutStatus: { toggle: toggleShortcutStatus, quickChat: quickChatShortcutStatus, dictation: dictationShortcutStatus, screenshot: screenshotShortcutStatus },
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
  await startRegionCapture();
  return true;
});
ipcMain.on('region-selected', async (event, rect) => {
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
  try {
    const shot = await captureRegion(rect);
    if (shot && captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.webContents.send('region-shot', shot);
      captureWindow.focus();
    } else if (!shot) {
      notify('截屏', '区域截取失败，请重试。');
    }
  } catch (err) {
    console.warn('Could not capture region:', err.message);
  }
});
ipcMain.on('region-cancel', () => {
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close();
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
  recropCapture,
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
