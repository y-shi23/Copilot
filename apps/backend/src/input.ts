import type {} from 'node:fs';
const { ipcRenderer } = require('electron');

const DEEPSEEK_OFFICIAL_CHANNEL = 'deepseek-official';

type RandomItemInput = string | string[];

interface PromptConfig {
  model?: string;
  prompt?: string;
  ifTextNecessary?: boolean;
  stream?: boolean;
}

interface ProviderConfig {
  url?: string;
  api_key?: string | string[];
  channel?: string;
}

interface RequestConfig {
  prompts: Record<string, PromptConfig>;
  providers: Record<string, ProviderConfig | undefined>;
  apiUrl: string;
  apiKey: string | string[];
  modelSelect: string;
}

interface ChatContentItem {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

function getRandomItem(list: RandomItemInput): string {
  let normalizedList: string[] | string = list;

  // 检查list是不是字符串
  if (typeof normalizedList === 'string') {
    // 如果字符串包含逗号
    if (normalizedList.includes(',')) {
      normalizedList = normalizedList.split(',');
      // 删除空白字符
      normalizedList = normalizedList.filter((item) => item.trim() !== '');
    } else if (normalizedList.includes('，')) {
      normalizedList = normalizedList.split('，');
      // 删除空白字符
      normalizedList = normalizedList.filter((item) => item.trim() !== '');
    } else {
      return normalizedList;
    }
  }

  if (normalizedList.length === 0) {
    return '';
  } else {
    const resault = normalizedList[Math.floor(Math.random() * normalizedList.length)];
    return resault;
  }
}

function parseDeepSeekUserTokenValue(rawValue: unknown): string {
  const source = String(rawValue || '').trim();
  if (!source) return '';

  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === 'string') {
      return parseDeepSeekUserTokenValue(parsed);
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = (parsed as { value?: unknown }).value;
      if (typeof value === 'string') {
        return value.trim();
      }
      if (value !== undefined && value !== null) {
        return String(value).trim();
      }
    }
  } catch (_error) {
    // keep raw token
  }

  return source;
}

function resolveDeepSeekToken(rawApiKey: string | string[]): string {
  if (Array.isArray(rawApiKey)) {
    const pool = [...rawApiKey];
    while (pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length);
      const candidate = pool.splice(index, 1)[0];
      const token = parseDeepSeekUserTokenValue(candidate);
      if (token) return token;
    }
    return '';
  }
  return parseDeepSeekUserTokenValue(rawApiKey);
}

// 函数：处理文本
async function requestTextOpenAI(
  code: string,
  content: string | ChatContentItem[],
  config: RequestConfig,
) {
  // 从 prompt 配置中获取模型信息
  const promptConfig = config.prompts[code] || {};
  const modelInfo = promptConfig.model;
  let apiUrl = config.apiUrl;
  let apiKey = config.apiKey;
  let model = config.modelSelect;
  let providerChannel = '';

  if (modelInfo) {
    const [providerId, modelName] = modelInfo.split('|');
    const provider = config.providers[providerId];
    if (provider) {
      apiUrl = provider.url || apiUrl;
      apiKey = provider.api_key || apiKey;
      model = modelName || model;
      providerChannel = String(provider.channel || '').toLowerCase();
    }
  }

  if (providerChannel === DEEPSEEK_OFFICIAL_CHANNEL) {
    const token = resolveDeepSeekToken(apiKey);
    if (!token) {
      throw new Error('DeepSeek userToken 未配置，请先在服务商页面登录 DeepSeek 或手动填写。');
    }
    apiKey = token;
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
      throw new Error('DeepSeek 代理不可用：IPC 环境未就绪。');
    }
    const proxyResult = await ipcRenderer.invoke('deepseek:ensure-proxy');
    if (!proxyResult?.ok || !proxyResult.baseUrl) {
      throw new Error(proxyResult?.error || 'DeepSeek 代理启动失败。');
    }
    apiUrl = proxyResult.baseUrl;
  }

  if (promptConfig.ifTextNecessary) {
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // 如果是字符串
    if (typeof content === 'string') {
      content = timestamp + '\n\n' + content;
    } else if (Array.isArray(content)) {
      let flag = false;
      for (let i = 0; i < content.length; i++) {
        // 是文本类型，且不是文本文件
        const item = content[i];
        if (
          item.type === 'content' &&
          typeof item.text === 'string' &&
          !(
            item.text.toLowerCase().startsWith('file name:') &&
            item.text.toLowerCase().endsWith('file end')
          )
        ) {
          item.text = timestamp + '\n\n' + item.text;
          flag = true;
          break;
        }
      }
      if (!flag) {
        content.push({
          type: 'text',
          text: timestamp,
        });
      }
    }
  }

  const isStream = config.prompts[code].stream ?? true;

  const response = await fetch(apiUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + getRandomItem(apiKey),
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: promptConfig.prompt,
        },
        {
          role: 'user',
          content: content,
        },
      ],
      stream: isStream,
    }),
  });
  return response;
}

module.exports = {
  requestTextOpenAI,
  getRandomItem,
};
