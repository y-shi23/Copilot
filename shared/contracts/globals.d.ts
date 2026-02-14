import type { LauncherApi, MainWindowApi, WindowPreloadBridge } from './bridge';

declare global {
  interface Window {
    api: MainWindowApi;
    preload?: WindowPreloadBridge;
    launcherApi?: LauncherApi;
    utools?: Record<string, any>;
    clipboardData?: DataTransfer;
  }

  // runtime global from preload scripts
  var utools: Record<string, any>;
}

export {};
