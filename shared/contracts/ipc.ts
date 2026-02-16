export const IPC_CHANNELS = {
  LAUNCHER_GET_PROMPTS: 'launcher:get-prompts',
  LAUNCHER_UPDATE_SETTINGS: 'launcher:update-settings',
  LAUNCHER_GET_BOUNDS: 'launcher:get-bounds',
  LAUNCHER_SET_POSITION: 'launcher:set-position',
  LAUNCHER_SET_SIZE: 'launcher:set-size',
  LAUNCHER_EXECUTE: 'launcher:execute',
  LAUNCHER_CLOSE: 'launcher:close',
  LAUNCHER_TOGGLE: 'launcher:toggle',
  UTOOLS_SYNC_NATIVE_THEME: 'utools:sync-native-theme',
  UTOOLS_CREATE_BROWSER_WINDOW: 'utools:create-browser-window',
  UTOOLS_WINDOW_QUERY: 'utools:window-query',
  UTOOLS_WINDOW_ACTION: 'utools:window-action',
  UTOOLS_SEND_TO_PARENT: 'utools:send-to-parent',
  DEEPSEEK_ENSURE_PROXY: 'deepseek:ensure-proxy',
  DEEPSEEK_LOGIN: 'deepseek:login',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface LauncherExecuteAction {
  code: string;
  type?: string;
  payload?: unknown;
  from?: string;
}

export interface WindowEventPayload {
  senderId: number;
  event: string;
}
