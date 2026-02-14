// @ts-nocheck
const { ipcRenderer, clipboard, nativeImage, shell, desktopCapturer } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function deepClone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function safeFileName(id) {
  return encodeURIComponent(String(id));
}

const dataRoot = ipcRenderer.sendSync('utools:get-user-data-path');
const docsFile = path.join(dataRoot, 'documents.json');
const attachmentsDir = path.join(dataRoot, 'attachments');
const nativeIdFile = path.join(dataRoot, 'native-id.txt');

function ensureStore() {
  if (!fs.existsSync(dataRoot)) fs.mkdirSync(dataRoot, { recursive: true });
  if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true });
  if (!fs.existsSync(docsFile)) fs.writeFileSync(docsFile, JSON.stringify({}, null, 2), 'utf8');
}

function readDocs() {
  ensureStore();
  try {
    const raw = fs.readFileSync(docsFile, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('[uTools Shim] Failed to read documents:', error);
    return {};
  }
}

function writeDocs(docs) {
  ensureStore();
  const tempFile = `${docsFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(docs, null, 2), 'utf8');
  fs.renameSync(tempFile, docsFile);
}

function nextRev(currentRev) {
  const currentNumber = currentRev ? Number(String(currentRev).split('-')[0]) : 0;
  const nextNumber = Number.isFinite(currentNumber) ? currentNumber + 1 : 1;
  return `${nextNumber}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function attachmentPath(attachmentId) {
  return path.join(attachmentsDir, safeFileName(attachmentId));
}

const db = {
  get(id) {
    const docs = readDocs();
    const doc = docs[String(id)];
    return doc ? deepClone(doc) : null;
  },

  put(doc) {
    if (!doc || !doc._id) {
      return { ok: false, error: true, name: 'bad_request', message: 'Missing _id' };
    }

    const id = String(doc._id);
    const docs = readDocs();
    const existing = docs[id];

    if (existing && doc._rev && doc._rev !== existing._rev) {
      return { ok: false, error: true, name: 'conflict', message: 'Document update conflict' };
    }

    const rev = nextRev(existing ? existing._rev : null);
    docs[id] = {
      _id: id,
      _rev: rev,
      data: deepClone(doc.data),
    };
    writeDocs(docs);
    return { ok: true, id, rev };
  },

  remove(id) {
    const key = String(id);
    const docs = readDocs();

    if (docs[key]) {
      delete docs[key];
      writeDocs(docs);
      return { ok: true, id: key };
    }

    const file = attachmentPath(key);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return { ok: true, id: key };
    }

    return { ok: false, error: true, name: 'not_found', message: `Document ${key} not found` };
  },

  promises: {
    async get(id) {
      return db.get(id);
    },
    async put(doc) {
      return db.put(doc);
    },
    async remove(id) {
      return db.remove(id);
    },
    async postAttachment(attachmentId, buffer) {
      ensureStore();
      const target = attachmentPath(attachmentId);
      const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      fs.writeFileSync(target, content);
      return { ok: true, id: String(attachmentId) };
    },
    async getAttachment(attachmentId) {
      ensureStore();
      const target = attachmentPath(attachmentId);
      if (!fs.existsSync(target)) return null;
      return fs.readFileSync(target);
    },
  },
};

const features = new Map([
  [
    'Anywhere Settings',
    {
      code: 'Anywhere Settings',
      explain: 'Settings',
      cmds: ['Anywhere Settings'],
    },
  ],
  [
    'Resume Conversation',
    {
      code: 'Resume Conversation',
      explain: 'Resume Conversation',
      cmds: ['Resume Conversation', '恢复聊天', 'Restore Chat'],
    },
  ],
]);

const pluginEnterHandlers = new Set();
const WINDOW_SHORTCUT_SUFFIX = 'anywhere助手^_^';

function resolveFeatureCode(label) {
  const commandMatchedCodes = [];

  for (const feature of features.values()) {
    const cmds = Array.isArray(feature.cmds) ? feature.cmds : [];
    let matched = false;
    for (const cmd of cmds) {
      if (typeof cmd === 'string' && cmd === label) matched = true;
      if (cmd && typeof cmd === 'object' && cmd.label === label) matched = true;
      if (matched) break;
    }

    if (matched) commandMatchedCodes.push(feature.code);
  }

  if (commandMatchedCodes.length > 0) {
    const preferred = commandMatchedCodes.find((code) =>
      String(code).endsWith(WINDOW_SHORTCUT_SUFFIX),
    );
    return preferred || commandMatchedCodes[0];
  }

  for (const feature of features.values()) {
    if (feature.code === label || feature.explain === label) return feature.code;
  }

  return label;
}

function createWindowProxy(windowId) {
  const id = Number(windowId);

  const query = (name) => ipcRenderer.sendSync('utools:window-query', { id, query: name });
  const action = (name, arg) => ipcRenderer.send('utools:window-action', { id, action: name, arg });

  return {
    id,
    show() {
      action('show');
    },
    hide() {
      action('hide');
    },
    close() {
      action('close');
    },
    minimize() {
      action('minimize');
    },
    maximize() {
      action('maximize');
    },
    unmaximize() {
      action('unmaximize');
    },
    isDestroyed() {
      return !!query('isDestroyed');
    },
    isAlwaysOnTop() {
      return !!query('isAlwaysOnTop');
    },
    setAlwaysOnTop(flag) {
      action('setAlwaysOnTop', !!flag);
    },
    isMaximized() {
      return !!query('isMaximized');
    },
    webContents: {
      send(channel, data) {
        ipcRenderer.send('utools:window-webcontents-send', { id, channel, data });
      },
      openDevTools(options) {
        ipcRenderer.send('utools:window-open-devtools', { id, options });
      },
    },
  };
}

function getNativeId() {
  ensureStore();
  if (fs.existsSync(nativeIdFile)) {
    const cached = fs.readFileSync(nativeIdFile, 'utf8').trim();
    if (cached) return cached;
  }

  const created = crypto
    .createHash('sha256')
    .update(`${os.hostname()}::${process.platform}::${crypto.randomUUID()}`)
    .digest('hex')
    .slice(0, 16);
  fs.writeFileSync(nativeIdFile, created, 'utf8');
  return created;
}

function showNotification(...args) {
  const body = args
    .filter((v) => v !== undefined && v !== null)
    .map(String)
    .join(' ');
  if (!body) return;
  ipcRenderer.send('utools:show-notification', {
    title: 'Anywhere',
    body,
  });
}

function toImage(data) {
  if (!data) return nativeImage.createEmpty();

  if (typeof data === 'string') {
    if (data.startsWith('data:')) return nativeImage.createFromDataURL(data);
    return nativeImage.createFromDataURL(`data:image/png;base64,${data}`);
  }

  if (Buffer.isBuffer(data)) return nativeImage.createFromBuffer(data);
  if (data instanceof Uint8Array) return nativeImage.createFromBuffer(Buffer.from(data));

  return nativeImage.createEmpty();
}

async function desktopCaptureSources(options = {}) {
  const result = await desktopCapturer.getSources(options);
  return result.map((source) => ({
    id: source.id,
    name: source.name,
    display_id: source.display_id,
    appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
    thumbnail:
      source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
  }));
}

async function screenCapture(callback) {
  try {
    const primaryDisplay = ipcRenderer.sendSync('utools:get-primary-display');
    const width = primaryDisplay?.size?.width || 1920;
    const height = primaryDisplay?.size?.height || 1080;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    const image = sources[0]?.thumbnail;
    if (image && !image.isEmpty()) {
      callback(image.toDataURL());
    } else {
      callback(null);
    }
  } catch (error) {
    console.error('[uTools Shim] screenCapture failed:', error);
    callback(null);
  }
}

const utools = {
  db,

  getNativeId,

  getFeatures() {
    return Array.from(features.values()).map(deepClone);
  },
  setFeature(feature) {
    if (!feature || !feature.code) return false;
    features.set(feature.code, deepClone(feature));
    return true;
  },
  removeFeature(code) {
    return features.delete(code);
  },

  getUser() {
    return {
      nickname: os.userInfo().username || 'User',
      avatar: 'user.png',
      type: 'local',
    };
  },

  getPrimaryDisplay() {
    return ipcRenderer.sendSync('utools:get-primary-display');
  },
  getDisplayNearestPoint(point) {
    return ipcRenderer.sendSync('utools:get-display-nearest-point', point);
  },
  getCursorScreenPoint() {
    return ipcRenderer.sendSync('utools:get-cursor-screen-point');
  },

  isDev() {
    return !!ipcRenderer.sendSync('utools:is-dev');
  },
  isMacOS() {
    return process.platform === 'darwin';
  },
  isWindows() {
    return process.platform === 'win32';
  },

  copyText(content) {
    clipboard.writeText(content == null ? '' : String(content));
    return true;
  },
  copyImage(imageData) {
    try {
      const image = toImage(imageData);
      if (!image.isEmpty()) clipboard.writeImage(image);
      return true;
    } catch (error) {
      console.error('[uTools Shim] copyImage failed:', error);
      return false;
    }
  },
  desktopCaptureSources,
  screenCapture,

  shellShowItemInFolder(targetPath) {
    if (!targetPath) return false;
    shell.showItemInFolder(path.resolve(targetPath));
    return true;
  },
  shellOpenPath(targetPath) {
    if (!targetPath) return false;
    shell.openPath(path.resolve(targetPath));
    return true;
  },
  shellOpenExternal(url) {
    if (!url) return false;
    shell.openExternal(url);
    return true;
  },

  showNotification,
  showSaveDialog(options = {}) {
    return ipcRenderer.sendSync('utools:show-save-dialog', options);
  },
  showOpenDialog(options = {}) {
    return ipcRenderer.sendSync('utools:show-open-dialog', options);
  },

  hideMainWindow() {
    ipcRenderer.send('utools:main-window-action', { action: 'hide' });
    return true;
  },
  showMainWindow() {
    ipcRenderer.send('utools:main-window-action', { action: 'show' });
    return true;
  },
  hideMainWindowPasteText(text) {
    this.copyText(text);
    return true;
  },
  outPlugin() {
    return true;
  },

  onPluginEnter(callback) {
    if (typeof callback === 'function') pluginEnterHandlers.add(callback);
  },
  redirect(label, payload) {
    const code = resolveFeatureCode(label);
    const action = {
      code,
      type: 'over',
      payload,
      from: 'redirect',
    };
    for (const callback of pluginEnterHandlers) {
      Promise.resolve().then(() => callback(action));
    }
    return true;
  },

  sendToParent(channel, payload) {
    ipcRenderer.send('utools:send-to-parent', { channel, payload });
    return true;
  },

  createBrowserWindow(entryPath, options = {}, onReady) {
    const windowId = ipcRenderer.sendSync('utools:create-browser-window', {
      entryPath,
      options,
      baseDir: __dirname,
    });

    if (typeof onReady === 'function') {
      ipcRenderer.once(`utools:window-ready:${windowId}`, () => onReady());
    }

    return createWindowProxy(windowId);
  },
};

module.exports = utools;
