import type { ConfigPayload, JsonValue } from './config';

export type AnyFn = (...args: any[]) => any;

export interface DeepSeekProxyResult {
  ok: boolean;
  baseUrl?: string;
  port?: number;
  error?: string;
}

export interface DeepSeekLoginResult {
  ok: boolean;
  userToken?: string;
  cancelled?: boolean;
  error?: string;
}

export interface MainWindowApi {
  getConfig: () => Promise<ConfigPayload> | ConfigPayload;
  updateConfig: AnyFn;
  updateConfigWithoutFeatures: AnyFn;
  saveSetting: AnyFn;
  getUser: AnyFn;
  getRandomItem: AnyFn;
  copyText: AnyFn;
  handleFilePath: AnyFn;
  sendfileDirect: AnyFn;
  saveFile: AnyFn;
  selectDirectory: AnyFn;
  listJsonFiles: AnyFn;
  readLocalFile: AnyFn;
  renameLocalFile: AnyFn;
  deleteLocalFile: AnyFn;
  writeLocalFile: AnyFn;
  setFileMtime: AnyFn;
  coderedirect: AnyFn;
  mainWindowControl: AnyFn;
  setZoomFactor: AnyFn;
  defaultConfig: ConfigPayload;
  savePromptWindowSettings: AnyFn;
  desktopCaptureSources: AnyFn;
  copyImage: AnyFn;
  getMcpToolCache: AnyFn;
  initializeMcpClient: AnyFn;
  testMcpConnection: AnyFn;
  saveMcpToolCache: AnyFn;
  testInvokeMcpTool: AnyFn;
  invokeMcpTool: AnyFn;
  closeMcpClient: AnyFn;
  isFileTypeSupported: AnyFn;
  parseFileObject: AnyFn;
  copyLocalPath: AnyFn;
  listSkills: AnyFn;
  getSkillDetails: AnyFn;
  saveSkill: AnyFn;
  deleteSkill: AnyFn;
  exportSkillToPackage: AnyFn;
  extractSkillPackage: AnyFn;
  shellShowItemInFolder: AnyFn;
  getSkillToolDefinition: AnyFn;
  resolveSkillInvocation: AnyFn;
  pathJoin: (...parts: string[]) => string;
  sethotkey?: AnyFn;
  windowControl?: AnyFn;
  toggleAlwaysOnTop?: AnyFn;
  onAlwaysOnTopChanged?: AnyFn;
  onConfigUpdated?: AnyFn;
  getCachedBackgroundImage?: AnyFn;
  cacheBackgroundImage?: AnyFn;
  toggleSkillForkMode?: AnyFn;
  shellOpenPath?: AnyFn;
  typeText?: AnyFn;
  closeWindow?: AnyFn;
  ensureDeepSeekProxy?: () => Promise<DeepSeekProxyResult>;
  loginDeepSeek?: () => Promise<DeepSeekLoginResult>;
}

export interface WindowPreloadBridge {
  receiveMsg: (callback: (data: any) => void) => void;
  onStreamUpdate?: (callback: (data: any) => void) => void;
}

export interface LauncherApi {
  platform: string;
  getPrompts: () => Promise<any[]>;
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  setWindowPosition: (payload: { x: number; y: number }) => void;
  setWindowSize: (payload: { height: number }) => void;
  execute: (action: Record<string, JsonValue | undefined>) => void;
  close: () => void;
  toggle: () => void;
  readClipboardImage: () => string;
  onRefresh: (callback: () => void) => void;
  onFocusInput: (callback: () => void) => void;
}
