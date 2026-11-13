/**
 * Muse Windows Client — a simple unofficial wrapper (v0.2.0).
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

const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, dialog, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const config = require('./config');

const MUSE_URL = 'https://muse.ai';
const SHORTCUT = 'CommandOrControl+Alt+M';
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;
// 'ok' | 'failed' | 'disabled'
let shortcutStatus = 'disabled';
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
    },
  });

  applyZoom();
  mainWindow.loadURL(MUSE_URL);
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

// --- Global shortcut --------------------------------------------------

function registerShortcut() {
  globalShortcut.unregister(SHORTCUT);
  if (!config.get('shortcutEnabled')) {
    shortcutStatus = 'disabled';
    return false;
  }
  let ok = false;
  try {
    ok = globalShortcut.register(SHORTCUT, toggleWindow);
  } catch (err) {
    console.warn('Global shortcut registration threw:', err.message);
    ok = false;
  }
  if (ok) {
    shortcutStatus = 'ok';
  } else {
    shortcutStatus = 'failed';
    console.warn(
      'Global shortcut Ctrl+Alt+M could not be registered (it may be in use by another app). ' +
      'The app keeps working without it; use the tray icon to show/hide the window.'
    );
    try {
      if (tray) {
        tray.displayBalloon({
          title: 'Muse',
          content: '全局快捷键 Ctrl+Alt+M 注册失败，可能被其他软件占用。可用托盘图标显示 / 隐藏窗口。',
        });
      }
    } catch (_) {
      // Balloon notifications are best-effort only.
    }
  }
  buildTrayMenu();
  return ok;
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
          '最常见的原因是还没有配置 GitHub 更新仓库。请按 README 的“自动更新”一节，先在 GitHub 上创建 mingzhen/muse-windows-client 仓库并发布一个 Release，更新检查才能工作。',
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
  const template = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: '回到首页', click: () => mainWindow && mainWindow.loadURL(MUSE_URL) },
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
  const minimizeToTray = config.get('closeBehaviour') !== 'quit';
  const shortcutLabel =
    shortcutStatus === 'failed'
      ? '快捷键 Ctrl+Alt+M（注册失败）'
      : '快捷键 Ctrl+Alt+M';
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏窗口', click: toggleWindow },
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
      label: shortcutLabel,
      type: 'checkbox',
      checked: shortcutEnabled,
      click: (menuItem) => {
        config.update({ shortcutEnabled: menuItem.checked });
        registerShortcut();
        buildTrayMenu();
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
    buildMenu();
    createWindow();
    buildTray();
    registerShortcut();

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
});

// Keep the tray alive when the window is hidden; only really quit
// when the user chose Quit (or set close behaviour to "quit").
app.on('window-all-closed', (event) => {
  if (!isQuitting) event.preventDefault();
});

// Settings window IPC (used by settings-preload.js).
ipcMain.handle('settings-get', () => ({ ...config.load(), version: app.getVersion() }));
ipcMain.handle('settings-set', (event, partial) => {
  const next = config.update(partial || {});
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'autoStart')) applyAutoStart();
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'shortcutEnabled')) registerShortcut();
  if (Object.prototype.hasOwnProperty.call(partial || {}, 'zoomFactor')) applyZoom();
  buildTrayMenu();
  return next;
});
ipcMain.handle('check-updates', () => {
  checkForUpdatesManual();
  return true;
});
ipcMain.on('settings-close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});
