const { clipboard, ipcRenderer } = require('electron');

function readClipboardImageDataUrl() {
  const image = clipboard.readImage();
  if (!image || image.isEmpty()) return '';
  return image.toDataURL();
}

window.launcherApi = {
  platform: process.platform,
  getPrompts: () => ipcRenderer.invoke('launcher:get-prompts'),
  getWindowBounds: () => ipcRenderer.invoke('launcher:get-bounds'),
  setWindowPosition: ({ x, y }) => ipcRenderer.send('launcher:set-position', { x, y }),
  execute: (action) => ipcRenderer.send('launcher:execute', action),
  close: () => ipcRenderer.send('launcher:close'),
  toggle: () => ipcRenderer.send('launcher:toggle'),
  readClipboardImage: () => readClipboardImageDataUrl(),
  onRefresh: (callback) => {
    ipcRenderer.on('launcher:refresh', () => {
      if (typeof callback === 'function') callback();
    });
  },
  onFocusInput: (callback) => {
    ipcRenderer.on('launcher:focus-input', () => {
      if (typeof callback === 'function') callback();
    });
  },
};
