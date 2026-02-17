export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export interface PromptConfig {
  type?: string;
  prompt?: string;
  model?: string;
  showMode?: string;
  enable?: boolean;
  icon?: string;
  stream?: boolean;
  temperature?: number;
  isTemperature?: boolean;
  ifTextNecessary?: boolean;
  voice?: string | null;
  reasoning_effort?: string;
  defaultMcpServers?: string[];
  defaultSkills?: string[];
  [key: string]: any;
}

export interface ProviderConfig {
  name?: string;
  url?: string;
  api_key?: string | string[];
  modelList?: string[];
  enable?: boolean;
  channel?: string;
  [key: string]: any;
}

export interface AppConfig {
  providers: Record<string, ProviderConfig>;
  providerOrder: string[];
  prompts: Record<string, PromptConfig>;
  mcpServers?: Record<string, JsonValue>;
  quickModel?: string;
  skillPath?: string;
  language?: string;
  isDarkMode?: boolean;
  zoom?: number;
  launcherEnabled?: boolean;
  launcherHotkey?: string;
  [key: string]: any;
}

export interface ConfigPayload {
  config: AppConfig;
}
