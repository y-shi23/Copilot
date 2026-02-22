// @ts-nocheck

const LOCAL_ICON_PRIORITY = [
  'openai',
  'claude',
  'gemini',
  'deepseek',
  'moonshot',
  'qwen',
  'zhipu',
  'doubao',
  'stepfun',
  'minimax',
  'xiaomimimo',
];

const LOCAL_ICON_MATCH_RULES = {
  openai: {
    strongPatterns: [
      /^gpt/i,
      /^o[1-9]/i,
      /codex/i,
      /chatgpt/i,
      /text-embedding/i,
      /whisper/i,
      /dall-e/i,
      /openai\//i,
    ],
    weakKeywords: [
      'gpt',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'codex',
      'chatgpt',
      'text-embedding',
      'whisper',
      'dall-e',
      'openai/',
    ],
    metadataProviderAliases: ['openai', 'azure'],
    providerHintKeywords: ['openai', 'chatgpt', 'azure openai'],
  },
  claude: {
    strongPatterns: [/^claude/i, /anthropic\//i],
    weakKeywords: ['claude', 'anthropic/'],
    metadataProviderAliases: ['anthropic'],
    providerHintKeywords: ['anthropic', 'claude'],
  },
  gemini: {
    strongPatterns: [/^gemini/i, /google\//i],
    weakKeywords: ['gemini', 'google/'],
    metadataProviderAliases: ['google'],
    providerHintKeywords: ['google', 'gemini'],
  },
  deepseek: {
    strongPatterns: [/^deepseek/i, /deepseek\//i],
    weakKeywords: ['deepseek'],
    metadataProviderAliases: ['deepseek'],
    providerHintKeywords: ['deepseek'],
  },
  moonshot: {
    strongPatterns: [/^kimi/i, /kimi\//i, /moonshot\//i],
    weakKeywords: ['kimi', 'moonshot'],
    metadataProviderAliases: ['moonshot'],
    providerHintKeywords: ['moonshot', 'kimi', 'kimi.ai'],
  },
  qwen: {
    strongPatterns: [/^qwen/i, /qwen\//i, /tongyi/i, /alibaba\//i],
    weakKeywords: ['qwen', 'tongyi', 'alibaba/'],
    metadataProviderAliases: ['alibaba', 'alibaba-cn', 'qwen'],
    providerHintKeywords: ['qwen', 'tongyi', 'alibaba', 'dashscope', 'aliyun'],
  },
  zhipu: {
    strongPatterns: [/^glm/i, /zhipu/i, /z-ai\//i, /zai\//i],
    weakKeywords: ['glm', 'zhipu', 'z-ai/', 'zai/'],
    metadataProviderAliases: ['zai', 'z-ai', 'zhipu'],
    providerHintKeywords: ['zhipu', 'z.ai', 'z-ai', 'glm'],
  },
  doubao: {
    strongPatterns: [/^doubao/i, /doubao-/i, /volcengine\/doubao/i],
    weakKeywords: ['doubao', 'volcengine/doubao'],
    metadataProviderAliases: ['doubao', 'volcengine'],
    providerHintKeywords: ['doubao', 'volcengine', 'ark.cn-beijing', 'bytedance'],
  },
  stepfun: {
    strongPatterns: [/^step-/i, /stepfun\//i],
    weakKeywords: ['step-', 'stepfun/'],
    metadataProviderAliases: ['stepfun'],
    providerHintKeywords: ['stepfun', 'step-'],
  },
  minimax: {
    strongPatterns: [/^minimax/i, /abab/i],
    weakKeywords: ['minimax', 'abab'],
    metadataProviderAliases: ['minimax'],
    providerHintKeywords: ['minimax', 'abab'],
  },
  xiaomimimo: {
    strongPatterns: [/^mimo/i, /xiaomi\/mimo/i, /xiaomi\//i],
    weakKeywords: ['mimo', 'xiaomi/mimo', 'xiaomi/'],
    metadataProviderAliases: ['xiaomi'],
    providerHintKeywords: ['xiaomi', 'mimo'],
  },
};

const localSvgModules = import.meta.glob('@/assets/model-svgs/*.svg', {
  eager: true,
  import: 'default',
});

function normalizeLocalSvgKey(filePath) {
  const fileName =
    String(filePath || '')
      .split('/')
      .pop() || '';
  return fileName
    .toLowerCase()
    .replace(/\.svg$/i, '')
    .replace(/-color$/i, '');
}

const localSvgMap = Object.entries(localSvgModules).reduce((acc, [filePath, moduleValue]) => {
  const iconKey = normalizeLocalSvgKey(filePath);
  if (iconKey) {
    acc[iconKey] = moduleValue;
  }
  return acc;
}, {});

const DEFAULT_LOCAL_ICON_KEY = localSvgMap.openai
  ? 'openai'
  : LOCAL_ICON_PRIORITY.find((key) => !!localSvgMap[key]) || Object.keys(localSvgMap)[0] || '';

export const FALLBACK_MODEL_LOGO_URL = DEFAULT_LOCAL_ICON_KEY
  ? localSvgMap[DEFAULT_LOCAL_ICON_KEY]
  : '';

function normalizeModelId(modelId) {
  return String(modelId || '')
    .trim()
    .toLowerCase();
}

function getProviderHintText(providerName, providerUrl) {
  const providerNameText = String(providerName || '').toLowerCase();
  const providerUrlText = String(providerUrl || '').toLowerCase();
  let providerHost = '';

  try {
    providerHost = new URL(providerUrl || '').hostname.toLowerCase();
  } catch (_error) {
    providerHost = '';
  }

  return `${providerNameText} ${providerUrlText} ${providerHost}`.trim();
}

function isStrongIconMatch(rule, normalizedModelId) {
  if (!rule?.strongPatterns) return false;
  return rule.strongPatterns.some((pattern) => pattern.test(normalizedModelId));
}

function isWeakIconMatch(rule, normalizedModelId) {
  if (!rule?.weakKeywords) return false;
  return rule.weakKeywords.some((keyword) => normalizedModelId.includes(keyword));
}

function isMetadataProviderIconMatch(rule, metadataProviderId) {
  if (!rule?.metadataProviderAliases || !metadataProviderId) return false;
  return rule.metadataProviderAliases.some(
    (alias) => metadataProviderId === alias || metadataProviderId.includes(alias),
  );
}

function isProviderHintIconMatch(rule, providerHintText) {
  if (!rule?.providerHintKeywords || !providerHintText) return false;
  return rule.providerHintKeywords.some((keyword) => providerHintText.includes(keyword));
}

function getLocalIconScore(iconKey, normalizedModelId, providerHintText, metadataProviderId) {
  const rule = LOCAL_ICON_MATCH_RULES[iconKey];
  if (!rule) return 0;

  let score = 0;
  if (isStrongIconMatch(rule, normalizedModelId)) {
    score += 120;
  } else if (isWeakIconMatch(rule, normalizedModelId)) {
    score += 60;
  }
  if (isMetadataProviderIconMatch(rule, metadataProviderId)) {
    score += 45;
  }
  if (isProviderHintIconMatch(rule, providerHintText)) {
    score += 25;
  }

  return score;
}

function resolveLocalIconKey(modelId, providerName, providerUrl, metadataProviderId) {
  const normalizedModelId = normalizeModelId(modelId);
  const providerHintText = getProviderHintText(providerName, providerUrl);
  const normalizedProviderId = normalizeModelId(metadataProviderId);

  const ranked = LOCAL_ICON_PRIORITY.filter((iconKey) => !!localSvgMap[iconKey])
    .map((iconKey) => ({
      iconKey,
      score: getLocalIconScore(iconKey, normalizedModelId, providerHintText, normalizedProviderId),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return LOCAL_ICON_PRIORITY.indexOf(a.iconKey) - LOCAL_ICON_PRIORITY.indexOf(b.iconKey);
    });

  const best = ranked[0];
  if (best && best.score >= 25) {
    return best.iconKey;
  }

  return DEFAULT_LOCAL_ICON_KEY || 'openai';
}

export function resolveModelLogoUrl(modelId, options = {}) {
  const iconKey = resolveLocalIconKey(
    modelId,
    options.providerName,
    options.providerUrl,
    options.metadataProviderId,
  );
  return localSvgMap[iconKey] || FALLBACK_MODEL_LOGO_URL;
}

export function handleModelLogoError(event) {
  const img = event?.target;
  if (!img || !FALLBACK_MODEL_LOGO_URL) return;
  if (img.dataset.logoFallbackApplied === '1') return;
  img.dataset.logoFallbackApplied = '1';
  img.src = FALLBACK_MODEL_LOGO_URL;
}
