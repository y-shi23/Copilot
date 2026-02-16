// @ts-nocheck
const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  screen,
  nativeTheme,
} = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

const managedWindows = new Map();
let mainWindow = null;
let launcherWindow = null;
let launcherHotkey = null;
let isQuitting = false;
const DEV_MAIN_URL = String(process.env.ANYWHERE_DEV_MAIN_URL || '').trim();
const DEV_PRELOAD_PATH = String(process.env.ANYWHERE_DEV_PRELOAD_PATH || '').trim();
const IS_RUNTIME_DEV_SERVER = DEV_MAIN_URL.length > 0;

const DEFAULT_LAUNCHER_SETTINGS = {
  launcherEnabled: true,
  launcherHotkey: 'CommandOrControl+Shift+Space',
};

const SUPPORTED_PROMPT_TYPES = new Set(['general', 'over', 'img', 'files']);
const LAUNCHER_WIDTH = 640;
const LAUNCHER_HEIGHT = 56;
const LAUNCHER_MAX_HEIGHT = 440;
const DEEPSEEK_PROXY_HOST = '127.0.0.1';
const DEEPSEEK_PROXY_PREFERRED_PORT = 5001;
const DEEPSEEK_PROXY_READY_TIMEOUT_MS = 12000;
const DEEPSEEK_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

const deepSeekProxyState = {
  started: false,
  baseUrl: '',
  port: 0,
  startPromise: null,
  lastError: '',
  moduleEntryPath: '',
};

let deepSeekLoginPromise = null;

function resolveAppFile(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

function resolveMainPreloadPath() {
  if (!DEV_PRELOAD_PATH) return resolveAppFile('runtime', 'preload.js');
  return path.isAbsolute(DEV_PRELOAD_PATH)
    ? DEV_PRELOAD_PATH
    : path.resolve(app.getAppPath(), DEV_PRELOAD_PATH);
}

function resolveMainEntryUrl() {
  if (IS_RUNTIME_DEV_SERVER) return DEV_MAIN_URL;
  return pathToFileURL(resolveAppFile('runtime', 'main', 'index.html')).toString();
}

function resolveLauncherEntryUrl() {
  if (IS_RUNTIME_DEV_SERVER) {
    try {
      return new URL('launcher.html', DEV_MAIN_URL).toString();
    } catch (_error) {
      const base = DEV_MAIN_URL.endsWith('/') ? DEV_MAIN_URL : `${DEV_MAIN_URL}/`;
      return `${base}launcher.html`;
    }
  }
  return pathToFileURL(resolveAppFile('runtime', 'main', 'launcher.html')).toString();
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

  const launcherEnabled =
    sharedConfig.launcherEnabled === undefined
      ? DEFAULT_LAUNCHER_SETTINGS.launcherEnabled
      : !!sharedConfig.launcherEnabled;

  const launcherHotkeyValue =
    typeof sharedConfig.launcherHotkey === 'string' ? sharedConfig.launcherHotkey.trim() : '';

  const normalizedHotkey = launcherHotkeyValue || DEFAULT_LAUNCHER_SETTINGS.launcherHotkey;
  return { launcherEnabled, launcherHotkey: normalizedHotkey };
}

function readStoredThemeSettings() {
  const docs = readShimDocuments();
  return docs?.config?.data?.config || {};
}

function resolveThemeSource(settings = {}) {
  const mode =
    typeof settings.themeMode === 'string' ? settings.themeMode.trim().toLowerCase() : '';

  if (mode === 'dark' || mode === 'light' || mode === 'system') {
    return mode;
  }

  if (typeof settings.isDarkMode === 'boolean') {
    return settings.isDarkMode ? 'dark' : 'light';
  }

  return 'system';
}

function applyNativeThemeSource(settings = {}) {
  if (process.platform !== 'darwin') return 'system';

  const source = resolveThemeSource(settings);
  if (nativeTheme.themeSource !== source) {
    nativeTheme.themeSource = source;
  }
  return source;
}

function readStoredPrompts() {
  const docs = readShimDocuments();
  const promptsData = docs?.prompts?.data;
  if (!promptsData || typeof promptsData !== 'object') return [];

  return Object.entries(promptsData)
    .filter(
      ([code, prompt]) => code && prompt && typeof prompt === 'object' && prompt.enable !== false,
    )
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

function applyMacVibrancy(win, options = {}) {
  if (process.platform !== 'darwin') return;
  if (!win || win.isDestroyed()) return;

  const material = typeof options.vibrancy === 'string' ? options.vibrancy.trim() : '';
  if (!material) return;

  try {
    if (typeof win.setVisualEffectState === 'function') {
      const visualEffectState =
        typeof options.visualEffectState === 'string' ? options.visualEffectState : 'active';
      win.setVisualEffectState(visualEffectState);
    }

    const duration = Number(options.animationDuration);
    if (Number.isFinite(duration) && duration >= 0) {
      win.setVibrancy(material, { animationDuration: Math.round(duration) });
      return;
    }
    win.setVibrancy(material);
  } catch (error) {
    console.warn(`[Vibrancy] Failed to apply vibrancy "${material}":`, error);
  }
}

function getLauncherBounds() {
  const width = LAUNCHER_WIDTH;
  const height = LAUNCHER_HEIGHT;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const padding = 12;

  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const preferredY = Math.round(workArea.y + Math.max(96, workArea.height * 0.28));
  const maxY = workArea.y + workArea.height - height - padding;
  const y = Math.max(workArea.y + padding, Math.min(preferredY, maxY));

  return { x, y, width, height };
}

function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow;

  const launcherPreload = resolveAppFile('electron', 'launcher_preload.js');

  launcherWindow = new BrowserWindow({
    width: LAUNCHER_WIDTH,
    height: LAUNCHER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
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

  launcherWindow.loadURL(resolveLauncherEntryUrl());
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
  const launcherEnabled =
    rawSettings.launcherEnabled === undefined
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
  const recoveryMsg = launcherHotkey ? ` Keeping previous shortcut "${launcherHotkey}".` : '';

  return {
    ok: false,
    launcherEnabled,
    launcherHotkey: normalizedHotkey,
    activeHotkey: launcherHotkey,
    error: `${fallbackMsg}${recoveryMsg}`,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDeepSeekProxyDataDir() {
  const dir = path.join(app.getPath('userData'), 'deepseek-api');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isPortAvailable(port, host = DEEPSEEK_PROXY_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    try {
      server.listen(port, host);
    } catch (_error) {
      resolve(false);
    }
  });
}

function getFreePort(host = DEEPSEEK_PROXY_HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.once('error', (error) => {
      reject(error);
    });

    server.once('listening', () => {
      const addressInfo = server.address();
      const port = addressInfo && typeof addressInfo === 'object' ? addressInfo.port : 0;
      server.close(() => {
        if (port > 0) {
          resolve(port);
        } else {
          reject(new Error('Failed to allocate free port.'));
        }
      });
    });

    server.listen(0, host);
  });
}

function resolveDeepSeekModuleEntryPath() {
  if (deepSeekProxyState.moduleEntryPath) {
    return deepSeekProxyState.moduleEntryPath;
  }

  const packageJsonPath = require.resolve('@ziuchen/deepseek-api/package.json');
  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const mainEntry =
    typeof packageJson.main === 'string' && packageJson.main.trim() ? packageJson.main.trim() : '';

  const candidates = [
    path.join(packageDir, 'dist', 'index.mjs'),
    mainEntry ? path.join(packageDir, mainEntry) : '',
    path.join(packageDir, 'dist', 'index.js'),
  ].filter(Boolean);

  const entryPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entryPath) {
    throw new Error('Unable to resolve @ziuchen/deepseek-api entry file.');
  }
  deepSeekProxyState.moduleEntryPath = entryPath;
  return entryPath;
}

async function isDeepSeekProxyReady(baseOrigin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseOrigin}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForDeepSeekProxyReady(baseOrigin, timeoutMs = DEEPSEEK_PROXY_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isDeepSeekProxyReady(baseOrigin)) {
      return true;
    }
    await delay(250);
  }
  return false;
}

async function startDeepSeekProxy() {
  const preferredAvailable = await isPortAvailable(DEEPSEEK_PROXY_PREFERRED_PORT);
  const selectedPort = preferredAvailable
    ? DEEPSEEK_PROXY_PREFERRED_PORT
    : await getFreePort(DEEPSEEK_PROXY_HOST);
  const baseOrigin = `http://${DEEPSEEK_PROXY_HOST}:${selectedPort}`;

  process.env.LISTEN_HOST = DEEPSEEK_PROXY_HOST;
  process.env.LISTEN_PORT = String(selectedPort);
  process.env.DATA_DIR = getDeepSeekProxyDataDir();

  const entryPath = resolveDeepSeekModuleEntryPath();
  await import(pathToFileURL(entryPath).toString());

  const isReady = await waitForDeepSeekProxyReady(baseOrigin);
  if (!isReady) {
    throw new Error('DeepSeek proxy did not become ready in time.');
  }

  deepSeekProxyState.started = true;
  deepSeekProxyState.baseUrl = `${baseOrigin}/v1`;
  deepSeekProxyState.port = selectedPort;
  deepSeekProxyState.lastError = '';

  return {
    ok: true,
    baseUrl: deepSeekProxyState.baseUrl,
    port: deepSeekProxyState.port,
  };
}

async function ensureDeepSeekProxy() {
  if (deepSeekProxyState.started && deepSeekProxyState.baseUrl) {
    return {
      ok: true,
      baseUrl: deepSeekProxyState.baseUrl,
      port: deepSeekProxyState.port,
    };
  }

  if (deepSeekProxyState.startPromise) {
    return deepSeekProxyState.startPromise;
  }

  deepSeekProxyState.startPromise = (async () => {
    try {
      return await startDeepSeekProxy();
    } catch (error) {
      const errorText = String(error?.message || error);
      deepSeekProxyState.started = false;
      deepSeekProxyState.baseUrl = '';
      deepSeekProxyState.port = 0;
      deepSeekProxyState.lastError = errorText;
      return {
        ok: false,
        error: errorText,
      };
    } finally {
      deepSeekProxyState.startPromise = null;
    }
  })();

  return deepSeekProxyState.startPromise;
}

function createDeepSeekLoginWindow(owner) {
  const loginWindow = new BrowserWindow({
    width: 440,
    height: 760,
    minWidth: 400,
    minHeight: 640,
    show: true,
    autoHideMenuBar: true,
    parent: owner,
    modal: false,
    title: 'DeepSeek Login',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  loginWindow.loadURL('https://chat.deepseek.com');
  return loginWindow;
}

function loginDeepSeek(owner) {
  if (deepSeekLoginPromise) {
    return deepSeekLoginPromise;
  }

  deepSeekLoginPromise = new Promise((resolve) => {
    const loginWindow = createDeepSeekLoginWindow(owner);
    let settled = false;
    let pollTimer = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(payload);
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    };

    const tryReadUserToken = async () => {
      if (settled || loginWindow.isDestroyed()) return;
      try {
        const token = await loginWindow.webContents.executeJavaScript(
          `(() => {
            try {
              const raw = localStorage.getItem('userToken');
              return typeof raw === 'string' ? raw.trim() : '';
            } catch (_error) {
              return '';
            }
          })()`,
          true,
        );
        if (token) {
          settle({ ok: true, userToken: String(token) });
        }
      } catch (_error) {
        // ignore and keep polling
      }
    };

    timeoutTimer = setTimeout(() => {
      settle({ ok: false, error: 'Timed out waiting for DeepSeek login.' });
    }, DEEPSEEK_LOGIN_TIMEOUT_MS);

    pollTimer = setInterval(() => {
      tryReadUserToken().catch(() => {});
    }, 1200);

    loginWindow.webContents.on('did-finish-load', () => {
      tryReadUserToken().catch(() => {});
    });

    loginWindow.on('closed', () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ ok: false, cancelled: true });
      }
    });
  }).finally(() => {
    deepSeekLoginPromise = null;
  });

  return deepSeekLoginPromise;
}

function createMainWindow() {
  const preloadPath = resolveMainPreloadPath();
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: isMac ? '#00000000' : '#f7f7f5',
    autoHideMenuBar: true,
    title: isMac ? '' : 'Sanft',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          transparent: true,
        }
      : {}),
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

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  mainWindow.loadURL(resolveMainEntryUrl());
  applyMacVibrancy(mainWindow, {
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    animationDuration: 120,
  });
}

function ensureBuildArtifacts() {
  if (IS_RUNTIME_DEV_SERVER) {
    const preloadPath = resolveMainPreloadPath();
    const preloadDir = path.dirname(preloadPath);
    const requiredPaths = [
      preloadPath,
      path.join(preloadDir, 'window_preload.js'),
      path.join(preloadDir, 'fast_window_preload.js'),
      path.join(preloadDir, 'runtime', 'file_runtime.js'),
      path.join(preloadDir, 'runtime', 'mcp_runtime.js'),
      path.join(preloadDir, 'runtime', 'skill_runtime.js'),
    ];
    const missing = requiredPaths.filter((file) => !fs.existsSync(file));
    if (missing.length === 0) return;

    const message = [
      'Development preload resources are missing.',
      'Run `./dev.sh` so backend watch can generate preload files.',
      '',
      ...missing.map((item) => `- ${item}`),
    ].join('\n');
    dialog.showErrorBox('Sanft Dev Resources Missing', message);
    app.quit();
    return;
  }

  const requiredPaths = [
    resolveAppFile('runtime', 'main', 'index.html'),
    resolveAppFile('runtime', 'main', 'launcher.html'),
    resolveAppFile('runtime', 'preload.js'),
    resolveAppFile('runtime', 'window_preload.js'),
    resolveAppFile('runtime', 'fast_window_preload.js'),
    resolveAppFile('runtime', 'runtime', 'file_runtime.js'),
    resolveAppFile('runtime', 'runtime', 'mcp_runtime.js'),
    resolveAppFile('runtime', 'runtime', 'skill_runtime.js'),
  ];

  const missing = requiredPaths.filter((file) => !fs.existsSync(file));
  if (missing.length === 0) return;

  const message = [
    'Desktop resources are missing.',
    'Run `pnpm build` at project root before launching Electron.',
    '',
    ...missing.map((item) => `- ${item}`),
  ].join('\n');

  dialog.showErrorBox('Sanft Build Missing', message);
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

ipcMain.on('utools:sync-native-theme', (_event, payload = {}) => {
  if (process.platform !== 'darwin') return;

  applyNativeThemeSource(payload);
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyMacVibrancy(mainWindow, {
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      animationDuration: 0,
    });
  }
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    applyMacVibrancy(launcherWindow, {
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      animationDuration: 0,
    });
  }
});

ipcMain.on('utools:create-browser-window', (event, payload = {}) => {
  const entryPath = payload.entryPath || '';
  const rawOptions = payload.options || {};
  const baseDir =
    payload.baseDir && path.isAbsolute(payload.baseDir)
      ? payload.baseDir
      : resolveAppFile('runtime');

  const normalizedOptions = {
    ...rawOptions,
    webPreferences: normalizeWebPreferences(rawOptions.webPreferences || {}, baseDir),
  };

  const windowVibrancy =
    typeof normalizedOptions.macOSVibrancy === 'string'
      ? normalizedOptions.macOSVibrancy
      : typeof normalizedOptions.vibrancy === 'string'
        ? normalizedOptions.vibrancy
        : '';
  const windowVisualEffectState =
    typeof normalizedOptions.macOSVisualEffectState === 'string'
      ? normalizedOptions.macOSVisualEffectState
      : 'active';
  const windowVibrancyAnimationDuration = normalizedOptions.macOSVibrancyAnimationDuration;

  delete normalizedOptions.macOSVibrancy;
  delete normalizedOptions.macOSVisualEffectState;
  delete normalizedOptions.macOSVibrancyAnimationDuration;
  delete normalizedOptions.vibrancy;

  const win = new BrowserWindow(normalizedOptions);
  applyMacVibrancy(win, {
    vibrancy: windowVibrancy,
    visualEffectState: windowVisualEffectState,
    animationDuration: windowVibrancyAnimationDuration,
  });
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
  const title = payload.title || 'Sanft';
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
  } else if (action === 'close') {
    mainWindow.close();
  } else if (action === 'minimize') {
    mainWindow.minimize();
  } else if (action === 'maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('utools:send-to-parent', (event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender.id === mainWindow.webContents.id) return;
  const channel = payload.channel;
  const data = payload.payload;
  mainWindow.webContents.send(channel, data);
});

ipcMain.handle('deepseek:ensure-proxy', async () => {
  return ensureDeepSeekProxy();
});

ipcMain.handle('deepseek:login', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || undefined;
  return loginDeepSeek(owner);
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

ipcMain.on('launcher:set-size', (_event, payload = {}) => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  const rawHeight = Number(payload.height);
  if (!Number.isFinite(rawHeight)) return;

  const bounds = launcherWindow.getBounds();
  const display =
    screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) || screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const maxAllowedHeight = Math.max(
    LAUNCHER_HEIGHT,
    Math.min(LAUNCHER_MAX_HEIGHT, workArea.height - 12),
  );
  const nextHeight = Math.max(LAUNCHER_HEIGHT, Math.min(Math.round(rawHeight), maxAllowedHeight));
  const maxY = workArea.y + workArea.height - nextHeight;
  const nextY = Math.max(workArea.y, Math.min(bounds.y, maxY));

  launcherWindow.setBounds(
    {
      x: bounds.x,
      y: nextY,
      width: bounds.width,
      height: nextHeight,
    },
    false,
  );
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
  applyNativeThemeSource(readStoredThemeSettings());
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
