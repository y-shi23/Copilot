const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Notification, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const managedWindows = new Map();
let mainWindow = null;
let launcherWindow = null;
let launcherHotkey = null;
let isQuitting = false;

const DEFAULT_LAUNCHER_SETTINGS = {
  launcherEnabled: true,
  launcherHotkey: 'CommandOrControl+Shift+Space',
};

const SUPPORTED_PROMPT_TYPES = new Set(['general', 'over', 'img', 'files']);

function resolveAppFile(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

function normalizeWebPreferences(webPreferences = {}, baseDir) {
  const normalized = { ...webPreferences };

  if (normalized.preload) {
    normalized.preload = path.isAbsolute(normalized.preload)
      ? normalized.preload
      : path.resolve(baseDir, normalized.preload);
  }

  normalized.contextIsolation = false;
  normalized.sandbox = false;
  normalized.nodeIntegration = false;

  return normalized;
}

function toLoadUrl(entryPath, baseDir) {
  const raw = String(entryPath || '');

  if (/^https?:\/\//i.test(raw) || /^file:\/\//i.test(raw)) {
    return raw;
  }

  const [filePart, queryPart] = raw.split('?');
  const absolutePath = path.isAbsolute(filePart) ? filePart : path.resolve(baseDir, filePart);
  const fileUrl = pathToFileURL(absolutePath);
  if (queryPart) fileUrl.search = queryPart;
  return fileUrl.toString();
}

function normalizePromptType(rawType) {
  const value = String(rawType || 'general').toLowerCase();
  if (value === 'text') return 'over';
  if (value === 'image') return 'img';
  if (value === 'file') return 'files';
  return SUPPORTED_PROMPT_TYPES.has(value) ? value : 'general';
}

function getShimDataRoot() {
  return path.join(app.getPath('userData'), 'utools-shim');
}

function getShimDocumentsPath() {
  return path.join(getShimDataRoot(), 'documents.json');
}

function readShimDocuments() {
  const docsPath = getShimDocumentsPath();
  if (!fs.existsSync(docsPath)) return {};

  try {
    const raw = fs.readFileSync(docsPath, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[Launcher] Failed to read shim documents:', error);
    return {};
  }
}

function readStoredLauncherSettings() {
  const docs = readShimDocuments();
  const sharedConfig = docs?.config?.data?.config || {};

  const launcherEnabled = sharedConfig.launcherEnabled === undefined
    ? DEFAULT_LAUNCHER_SETTINGS.launcherEnabled
    : !!sharedConfig.launcherEnabled;

  const launcherHotkeyValue = typeof sharedConfig.launcherHotkey === 'string'
    ? sharedConfig.launcherHotkey.trim()
    : '';

  const normalizedHotkey = launcherHotkeyValue || DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
  return { launcherEnabled, launcherHotkey: normalizedHotkey };
}

function readStoredPrompts() {
  const docs = readShimDocuments();
  const promptsData = docs?.prompts?.data;
  if (!promptsData || typeof promptsData !== 'object') return [];

  return Object.entries(promptsData)
    .filter(([code, prompt]) => code && prompt && typeof prompt === 'object' && prompt.enable !== false)
    .map(([code, prompt]) => ({
      code,
      prompt: typeof prompt.prompt === 'string' ? prompt.prompt : '',
      type: normalizePromptType(prompt.type),
      showMode: typeof prompt.showMode === 'string' ? prompt.showMode : 'window',
      matchRegex: typeof prompt.matchRegex === 'string' ? prompt.matchRegex : '',
      icon: typeof prompt.icon === 'string' ? prompt.icon : '',
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function normalizeLauncherHotkey(rawHotkey) {
  if (typeof rawHotkey !== 'string') return DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
  const trimmed = rawHotkey.trim();
  return trimmed || DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
}

function registerManagedWindow(win) {
  managedWindows.set(win.id, win);
  win.on('closed', () => {
    managedWindows.delete(win.id);
  });
}

function getLauncherBounds() {
  const width = 760;
  const height = 420;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const padding = 12;

  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const preferredY = Math.round(workArea.y + Math.max(44, workArea.height * 0.12));
  const maxY = workArea.y + workArea.height - height - padding;
  const y = Math.max(workArea.y + padding, Math.min(preferredY, maxY));

  return { x, y, width, height };
}

function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow;

  const launcherPreload = resolveAppFile('electron', 'launcher_preload.js');
  const launcherHtml = resolveAppFile('electron', 'launcher.html');

  launcherWindow = new BrowserWindow({
    width: 760,
    height: 420,
    show: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f1218',
    webPreferences: {
      preload: launcherPreload,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  launcherWindow.on('blur', () => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.hide();
    }
  });

  launcherWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    launcherWindow.hide();
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });

  launcherWindow.loadURL(pathToFileURL(launcherHtml).toString());
  return launcherWindow;
}

function hideLauncherWindow() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  launcherWindow.hide();
}

function showLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const launcher = createLauncherWindow();
  const bounds = getLauncherBounds();
  launcher.setBounds(bounds, false);
  launcher.show();
  launcher.focus();

  if (launcher.webContents.isLoading()) {
    launcher.webContents.once('did-finish-load', () => {
      if (!launcher.isDestroyed()) {
        launcher.webContents.send('launcher:refresh');
        launcher.webContents.send('launcher:focus-input');
      }
    });
    return;
  }

  launcher.webContents.send('launcher:refresh');
  launcher.webContents.send('launcher:focus-input');
}

function toggleLauncherWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (launcherWindow && !launcherWindow.isDestroyed() && launcherWindow.isVisible()) {
    hideLauncherWindow();
    return;
  }

  showLauncherWindow();
}

function registerLauncherHotkey(rawSettings = {}) {
  const launcherEnabled = rawSettings.launcherEnabled === undefined
    ? DEFAULT_LAUNCHER_SETTINGS.launcherEnabled
    : !!rawSettings.launcherEnabled;
  const normalizedHotkey = normalizeLauncherHotkey(rawSettings.launcherHotkey);
  const previousHotkey = launcherHotkey;

  if (!launcherEnabled) {
    if (previousHotkey && globalShortcut.isRegistered(previousHotkey)) {
      globalShortcut.unregister(previousHotkey);
    }
    launcherHotkey = null;
    hideLauncherWindow();
    return { ok: true, launcherEnabled, launcherHotkey: normalizedHotkey, activeHotkey: null };
  }

  if (
    previousHotkey &&
    previousHotkey === normalizedHotkey &&
    globalShortcut.isRegistered(previousHotkey)
  ) {
    return {
      ok: true,
      launcherEnabled,
      launcherHotkey: normalizedHotkey,
      activeHotkey: previousHotkey,
    };
  }

  if (previousHotkey && globalShortcut.isRegistered(previousHotkey)) {
    globalShortcut.unregister(previousHotkey);
  }

  let registered = false;
  let registerError = '';
  try {
    registered = globalShortcut.register(normalizedHotkey, () => {
      toggleLauncherWindow();
    });
  } catch (error) {
    registerError = String(error?.message || error);
  }

  if (registered) {
    launcherHotkey = normalizedHotkey;
    return {
      ok: true,
      launcherEnabled,
      launcherHotkey: normalizedHotkey,
      activeHotkey: normalizedHotkey,
    };
  }

  launcherHotkey = null;

  if (previousHotkey && previousHotkey !== normalizedHotkey) {
    try {
      const restored = globalShortcut.register(previousHotkey, () => {
        toggleLauncherWindow();
      });
      if (restored) {
        launcherHotkey = previousHotkey;
      }
    } catch (_error) {
      // ignore restore errors
    }
  }

  const fallbackMsg = registerError || `Unable to register global shortcut "${normalizedHotkey}".`;
  const recoveryMsg = launcherHotkey
    ? ` Keeping previous shortcut "${launcherHotkey}".`
    : '';

  return {
    ok: false,
    launcherEnabled,
    launcherHotkey: normalizedHotkey,
    activeHotkey: launcherHotkey,
    error: `${fallbackMsg}${recoveryMsg}`,
  };
}

function createMainWindow() {
  const preloadPath = resolveAppFile('v2.0.0', 'preload.js');
  const mainIndex = resolveAppFile('v2.0.0', 'main', 'index.html');

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#f7f7f5',
    autoHideMenuBar: true,
    title: 'Anywhere',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.destroy();
      launcherWindow = null;
    }
    mainWindow = null;
  });

  mainWindow.loadURL(pathToFileURL(mainIndex).toString());
}

function ensureBuildArtifacts() {
  const requiredPaths = [
    resolveAppFile('v2.0.0', 'main', 'index.html'),
    resolveAppFile('v2.0.0', 'preload.js'),
    resolveAppFile('v2.0.0', 'window_preload.js'),
    resolveAppFile('v2.0.0', 'fast_window_preload.js'),
  ];

  const missing = requiredPaths.filter((file) => !fs.existsSync(file));
  if (missing.length === 0) return;

  const message = [
    'Desktop resources are missing.',
    'Run `pnpm build` at project root before launching Electron.',
    '',
    ...missing.map((item) => `- ${item}`),
  ].join('\n');

  dialog.showErrorBox('Anywhere Build Missing', message);
  app.quit();
}

ipcMain.on('utools:get-user-data-path', (event) => {
  event.returnValue = path.join(app.getPath('userData'), 'utools-shim');
});

ipcMain.on('utools:is-dev', (event) => {
  event.returnValue = !app.isPackaged;
});

ipcMain.on('utools:get-primary-display', (event) => {
  event.returnValue = screen.getPrimaryDisplay();
});

ipcMain.on('utools:get-display-nearest-point', (event, point) => {
  const fallback = screen.getPrimaryDisplay();
  try {
    event.returnValue = screen.getDisplayNearestPoint(point || { x: 0, y: 0 });
  } catch (_error) {
    event.returnValue = fallback;
  }
});

ipcMain.on('utools:get-cursor-screen-point', (event) => {
  event.returnValue = screen.getCursorScreenPoint();
});

ipcMain.on('utools:create-browser-window', (event, payload = {}) => {
  const entryPath = payload.entryPath || '';
  const rawOptions = payload.options || {};
  const baseDir = payload.baseDir && path.isAbsolute(payload.baseDir)
    ? payload.baseDir
    : resolveAppFile('v2.0.0');

  const normalizedOptions = {
    ...rawOptions,
    webPreferences: normalizeWebPreferences(rawOptions.webPreferences || {}, baseDir),
  };

  const win = new BrowserWindow(normalizedOptions);
  registerManagedWindow(win);

  const readyChannel = `utools:window-ready:${win.id}`;
  win.webContents.once('did-finish-load', () => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(readyChannel);
    }
  });

  const url = toLoadUrl(entryPath, baseDir);
  win.loadURL(url);

  event.returnValue = win.id;
});

ipcMain.on('utools:window-query', (event, payload = {}) => {
  const id = Number(payload.id);
  const query = payload.query;
  const win = managedWindows.get(id);

  if (!win || win.isDestroyed()) {
    event.returnValue = query === 'isDestroyed';
    return;
  }

  switch (query) {
    case 'isDestroyed':
      event.returnValue = win.isDestroyed();
      break;
    case 'isAlwaysOnTop':
      event.returnValue = win.isAlwaysOnTop();
      break;
    case 'isMaximized':
      event.returnValue = win.isMaximized();
      break;
    default:
      event.returnValue = null;
      break;
  }
});

ipcMain.on('utools:window-action', (_event, payload = {}) => {
  const id = Number(payload.id);
  const action = payload.action;
  const arg = payload.arg;
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;

  switch (action) {
    case 'show':
      win.show();
      break;
    case 'hide':
      win.hide();
      break;
    case 'close':
      win.close();
      break;
    case 'minimize':
      win.minimize();
      break;
    case 'maximize':
      if (!win.isMaximized()) win.maximize();
      break;
    case 'unmaximize':
      if (win.isMaximized()) win.unmaximize();
      break;
    case 'setAlwaysOnTop':
      win.setAlwaysOnTop(!!arg);
      break;
    default:
      break;
  }
});

ipcMain.on('utools:window-webcontents-send', (_event, payload = {}) => {
  const id = Number(payload.id);
  const channel = payload.channel;
  const data = payload.data;
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, data);
});

ipcMain.on('utools:window-open-devtools', (_event, payload = {}) => {
  const id = Number(payload.id);
  const options = payload.options || { mode: 'detach' };
  const win = managedWindows.get(id);
  if (!win || win.isDestroyed()) return;
  win.webContents.openDevTools(options);
});

ipcMain.on('utools:show-save-dialog', (event, options = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
  event.returnValue = dialog.showSaveDialogSync(owner, options);
});

ipcMain.on('utools:show-open-dialog', (event, options = {}) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
  event.returnValue = dialog.showOpenDialogSync(owner, options);
});

ipcMain.on('utools:show-notification', (_event, payload = {}) => {
  const title = payload.title || 'Anywhere';
  const body = payload.body || '';
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.on('utools:main-window-action', (_event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const action = payload.action;

  if (action === 'hide') {
    mainWindow.hide();
  } else if (action === 'show') {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('utools:send-to-parent', (event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender.id === mainWindow.webContents.id) return;
  const channel = payload.channel;
  const data = payload.payload;
  mainWindow.webContents.send(channel, data);
});

ipcMain.handle('launcher:get-prompts', () => {
  return readStoredPrompts();
});

ipcMain.handle('launcher:update-settings', (_event, payload = {}) => {
  return registerLauncherHotkey(payload);
});

ipcMain.on('launcher:close', () => {
  hideLauncherWindow();
});

ipcMain.on('launcher:toggle', () => {
  toggleLauncherWindow();
});

ipcMain.handle('launcher:get-bounds', () => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return null;
  return launcherWindow.getBounds();
});

ipcMain.on('launcher:set-position', (_event, payload = {}) => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const bounds = launcherWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x, y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const maxX = workArea.x + workArea.width - bounds.width;
  const maxY = workArea.y + workArea.height - bounds.height;
  const clampedX = Math.max(workArea.x, Math.min(Math.round(x), maxX));
  const clampedY = Math.max(workArea.y, Math.min(Math.round(y), maxY));

  launcherWindow.setPosition(clampedX, clampedY, false);
});

ipcMain.on('launcher:execute', (_event, action = {}) => {
  hideLauncherWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const code = typeof action.code === 'string' ? action.code.trim() : '';
  if (!code) return;

  const type = typeof action.type === 'string' ? action.type : 'over';
  const payload = action.payload;

  mainWindow.webContents.send('launcher:execute-action', {
    code,
    type,
    payload,
    from: 'launcher',
  });
});

app.whenReady().then(() => {
  ensureBuildArtifacts();
  createMainWindow();

  const launcherResult = registerLauncherHotkey(readStoredLauncherSettings());
  if (!launcherResult.ok) {
    console.warn('[Launcher] Shortcut registration failed:', launcherResult.error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
