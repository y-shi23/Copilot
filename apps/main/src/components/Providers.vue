<script setup>
import { ref, reactive, onMounted, computed, inject, watch } from 'vue'
import { Plus, Trash2 as Delete, Pencil as Edit, Search, ListCheck, Minus, Eye, EyeOff, Globe, Brain, Wrench, Binary, Settings } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import draggable from 'vuedraggable';

const { t } = useI18n();

const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_DEV_CACHE_KEY = 'sanft_modelsdev_cache_v1';
const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEB_KEYWORD_PATTERN = /\b(web|www|search|browse|internet|research)\b/i;
const EMBEDDING_KEYWORD_PATTERN = /\b(embed|embedding|text-embedding|bge|e5)\b/i;
const LOCAL_ICON_PRIORITY = ['openai', 'claude', 'gemini', 'deepseek', 'moonshot', 'qwen', 'zhipu', 'doubao', 'stepfun', 'minimax', 'xiaomimimo'];
const LOCAL_ICON_MATCH_RULES = {
  openai: {
    strongPatterns: [/^gpt/i, /^o[1-9]/i, /codex/i, /chatgpt/i, /text-embedding/i, /whisper/i, /dall-e/i, /openai\//i],
    weakKeywords: ['gpt', 'o1', 'o2', 'o3', 'o4', 'o5', 'codex', 'chatgpt', 'text-embedding', 'whisper', 'dall-e', 'openai/'],
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

const localSvgModules = import.meta.glob('@/assets/model-svgs/*.svg', { eager: true, import: 'default' });

function normalizeLocalSvgKey(filePath) {
  const fileName = String(filePath || '').split('/').pop() || '';
  return fileName.toLowerCase().replace(/\.svg$/i, '').replace(/-color$/i, '');
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
  : (LOCAL_ICON_PRIORITY.find((key) => !!localSvgMap[key]) || Object.keys(localSvgMap)[0] || '');
const FALLBACK_MODEL_LOGO_URL = DEFAULT_LOCAL_ICON_KEY ? localSvgMap[DEFAULT_LOCAL_ICON_KEY] : '';

const MODEL_FAMILY_PROVIDER_HINTS = [
  { providerId: 'openai', pattern: /^(gpt|o[1-9]|codex|chatgpt|text-embedding|whisper|dall-e|tts)/i },
  { providerId: 'anthropic', pattern: /^claude/i },
  { providerId: 'google', pattern: /^gemini/i },
  { providerId: 'deepseek', pattern: /^deepseek/i },
  { providerId: 'xai', pattern: /^grok/i },
  { providerId: 'moonshot', pattern: /^kimi/i },
  { providerId: 'zai', pattern: /^(glm|z-ai\/glm|zhipu)/i },
  { providerId: 'alibaba', pattern: /^(qwen|tongyi)/i },
  { providerId: 'mistral', pattern: /^(mistral|ministral|codestral|pixtral|devstral)/i },
  { providerId: 'cohere', pattern: /^(command|embed-)/i },
];

const capabilityOrder = ['vision', 'web', 'reasoning', 'tools', 'embedding'];
const capabilityIconMap = {
  vision: { icon: Eye, className: 'capability-vision', labelKey: 'providers.capabilities.vision' },
  web: { icon: Globe, className: 'capability-web', labelKey: 'providers.capabilities.web' },
  reasoning: { icon: Brain, className: 'capability-reasoning', labelKey: 'providers.capabilities.reasoning' },
  tools: { icon: Wrench, className: 'capability-tools', labelKey: 'providers.capabilities.tools' },
  embedding: { icon: Binary, className: 'capability-embedding', labelKey: 'providers.capabilities.embedding' },
};

function createEmptyCapabilities() {
  return {
    vision: false,
    web: false,
    reasoning: false,
    tools: false,
    embedding: false,
  };
}

function sanitizeCapabilities(raw) {
  return {
    vision: !!raw?.vision,
    web: !!raw?.web,
    reasoning: !!raw?.reasoning,
    tools: !!raw?.tools,
    embedding: !!raw?.embedding,
  };
}

function normalizeModelId(modelId) {
  return String(modelId || '').trim().toLowerCase();
}

const currentConfig = inject('config');
const provider_key = ref(null);
const showApiKey = ref(false);

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuProviderKey = ref(null);

const modelsMetadata = reactive({
  providers: {},
  modelIndex: {},
  providerIds: [],
  loaded: false,
  isLoading: false,
  error: null,
});

const modelCapabilityDialogVisible = ref(false);
const modelCapabilityDialogForm = reactive({
  modelId: '',
  vision: false,
  web: false,
  reasoning: false,
  tools: false,
  embedding: false,
});
const modelCapabilityDialogHasOverride = ref(false);

const modelCapabilityDialogItems = capabilityOrder.map((key) => ({
  key,
  ...capabilityIconMap[key],
}));

function isValidModelsPayload(payload) {
  return !!payload && typeof payload === 'object' && !Array.isArray(payload);
}

function readModelsMetadataCache() {
  try {
    const raw = localStorage.getItem(MODELS_DEV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cachedAt !== 'number' || !isValidModelsPayload(parsed.data)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function writeModelsMetadataCache(data) {
  try {
    localStorage.setItem(MODELS_DEV_CACHE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      data,
    }));
  } catch (_error) {
    // Ignore localStorage write errors; runtime data is still usable.
  }
}

function applyModelsMetadataData(data) {
  const providersData = isValidModelsPayload(data) ? data : {};
  const nextModelIndex = {};

  for (const [providerIdRaw, providerData] of Object.entries(providersData)) {
    if (!providerData || typeof providerData !== 'object') continue;

    const providerId = String(providerIdRaw);
    const providerIdNormalized = providerId.toLowerCase();
    const providerName = String(providerData.name || providerId);
    const models = providerData.models;
    if (!models || typeof models !== 'object') continue;

    for (const modelData of Object.values(models)) {
      if (!modelData || typeof modelData !== 'object') continue;
      const modelId = modelData.id ? String(modelData.id) : '';
      if (!modelId) continue;
      const normalizedId = normalizeModelId(modelId);
      if (!normalizedId) continue;

      if (!nextModelIndex[normalizedId]) {
        nextModelIndex[normalizedId] = [];
      }

      nextModelIndex[normalizedId].push({
        providerId,
        providerIdNormalized,
        providerName,
        modelId,
        modelData,
      });
    }
  }

  modelsMetadata.providers = providersData;
  modelsMetadata.modelIndex = nextModelIndex;
  modelsMetadata.providerIds = Object.keys(providersData).map((providerId) => String(providerId).toLowerCase());
  modelsMetadata.loaded = true;
  modelsMetadata.error = null;
}

async function loadModelsMetadata() {
  if (modelsMetadata.isLoading) return;

  const now = Date.now();
  const cached = readModelsMetadataCache();
  const hasCachedData = !!cached?.data;

  if (hasCachedData) {
    applyModelsMetadataData(cached.data);
    const cacheAge = now - cached.cachedAt;
    if (cacheAge <= MODELS_DEV_CACHE_TTL_MS) {
      return;
    }
  }

  modelsMetadata.isLoading = true;
  try {
    const response = await fetch(MODELS_DEV_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!isValidModelsPayload(payload)) {
      throw new Error('Invalid models metadata payload.');
    }
    applyModelsMetadataData(payload);
    writeModelsMetadataCache(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Failed to load models metadata:', message);
    modelsMetadata.error = message;
    if (!hasCachedData) {
      modelsMetadata.loaded = true;
      ElMessage.warning(t('providers.alerts.modelMetadataLoadFailed'));
    }
  } finally {
    modelsMetadata.isLoading = false;
  }
}

function inferProviderHints(provider, normalizedModelId = '') {
  const hints = new Set();

  if (normalizedModelId.includes('/')) {
    hints.add(normalizedModelId.split('/')[0]);
  }

  const modelIdWithoutPrefix = normalizedModelId.includes('/')
    ? normalizedModelId.split('/').slice(1).join('/')
    : normalizedModelId;
  for (const { providerId, pattern } of MODEL_FAMILY_PROVIDER_HINTS) {
    if (pattern.test(normalizedModelId) || pattern.test(modelIdWithoutPrefix)) {
      hints.add(providerId);
    }
  }

  const providerName = String(provider?.name || '').toLowerCase();
  const providerUrl = String(provider?.url || '').toLowerCase();

  const textParts = [providerName, providerUrl];
  try {
    const hostname = new URL(provider?.url || '').hostname.toLowerCase();
    if (hostname) textParts.push(hostname);
  } catch (_error) {
    // Ignore invalid URL.
  }
  const fullText = textParts.join(' ');

  const providerKeywordMap = {
    openai: ['openai', 'chatgpt'],
    anthropic: ['anthropic', 'claude'],
    google: ['google', 'gemini'],
    deepseek: ['deepseek'],
    xai: ['x.ai', 'xai', 'grok'],
    moonshot: ['moonshot', 'kimi'],
    zai: ['z.ai', 'zhipu', 'glm'],
    alibaba: ['alibaba', 'aliyun', 'dashscope', 'qwen', 'tongyi'],
    azure: ['azure'],
    ollama: ['ollama'],
    cohere: ['cohere'],
    mistral: ['mistral'],
  };

  for (const [providerId, keywords] of Object.entries(providerKeywordMap)) {
    if (keywords.some((keyword) => fullText.includes(keyword))) {
      hints.add(providerId);
    }
  }

  for (const providerId of modelsMetadata.providerIds) {
    if (providerId && fullText.includes(providerId)) {
      hints.add(providerId);
    }
  }

  return hints;
}

function getCandidateScore(candidate, hints, normalizedModelId) {
  let score = 0;
  const providerId = String(candidate?.providerIdNormalized || '');
  const candidateModelId = normalizeModelId(candidate?.modelId || candidate?.modelData?.id);

  if (hints.has(providerId)) score += 120;
  if (normalizedModelId.startsWith(`${providerId}/`)) score += 90;
  if (candidateModelId === normalizedModelId) score += 40;

  if (normalizedModelId.includes('/')) {
    const suffixId = normalizedModelId.split('/').slice(1).join('/');
    if (candidateModelId === suffixId) score += 25;
  }

  return score;
}

function pickCandidateByHints(candidates, hints, normalizedModelId) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Prefer the highest scoring candidate; if tied, keep deterministic order.
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: getCandidateScore(candidate, hints, normalizedModelId),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aProvider = String(a.candidate.providerIdNormalized || '');
      const bProvider = String(b.candidate.providerIdNormalized || '');
      if (aProvider !== bProvider) return aProvider.localeCompare(bProvider);
      return String(a.candidate.modelId || '').localeCompare(String(b.candidate.modelId || ''));
    });

  return scored[0]?.candidate || null;
}

function resolveModelMetadata(modelId, provider) {
  const normalizedId = normalizeModelId(modelId);
  if (!normalizedId) {
    return { matched: false, entry: null };
  }

  const hints = inferProviderHints(provider, normalizedId);
  const directCandidates = modelsMetadata.modelIndex[normalizedId] || [];
  const directPick = pickCandidateByHints(directCandidates, hints, normalizedId);
  if (directPick) {
    return { matched: true, entry: directPick };
  }

  if (normalizedId.includes('/')) {
    const suffixId = normalizedId.split('/').slice(1).join('/');
    const suffixCandidates = modelsMetadata.modelIndex[suffixId] || [];
    const suffixPick = pickCandidateByHints(suffixCandidates, hints, normalizedId);
    if (suffixPick) {
      return { matched: true, entry: suffixPick };
    }
  }

  return { matched: false, entry: null };
}

function getAutomaticCapabilities(entry, modelId) {
  const base = createEmptyCapabilities();
  if (!entry?.modelData) return base;

  const modelData = entry.modelData;
  const inputModalities = Array.isArray(modelData.modalities?.input)
    ? modelData.modalities.input.map((item) => String(item).toLowerCase())
    : [];

  const textForKeywordMatch = `${modelId} ${modelData.name || ''}`;

  base.vision = inputModalities.includes('image') || inputModalities.includes('video');
  base.reasoning = !!modelData.reasoning;
  base.tools = !!modelData.tool_call;
  base.web = WEB_KEYWORD_PATTERN.test(textForKeywordMatch);
  base.embedding = EMBEDDING_KEYWORD_PATTERN.test(textForKeywordMatch);

  return base;
}

function getProviderHintText(provider) {
  const providerName = String(provider?.name || '').toLowerCase();
  const providerUrl = String(provider?.url || '').toLowerCase();
  let providerHost = '';

  try {
    providerHost = new URL(provider?.url || '').hostname.toLowerCase();
  } catch (_error) {
    providerHost = '';
  }

  return `${providerName} ${providerUrl} ${providerHost}`.trim();
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
  return rule.metadataProviderAliases.some((alias) => (
    metadataProviderId === alias || metadataProviderId.includes(alias)
  ));
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

function resolveLocalIconKey(modelId, provider, metadataEntry) {
  const normalizedModelId = normalizeModelId(modelId);
  const providerHintText = getProviderHintText(provider);
  const metadataProviderId = normalizeModelId(metadataEntry?.providerId);

  const ranked = LOCAL_ICON_PRIORITY
    .filter((iconKey) => !!localSvgMap[iconKey])
    .map((iconKey) => ({
      iconKey,
      score: getLocalIconScore(iconKey, normalizedModelId, providerHintText, metadataProviderId),
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

function resolveLocalLogoUrl(modelId, provider, metadataEntry) {
  const iconKey = resolveLocalIconKey(modelId, provider, metadataEntry);
  return localSvgMap[iconKey] || FALLBACK_MODEL_LOGO_URL;
}

function getModelCapabilityOverride(provider, modelId) {
  const overrides = provider?.modelCapabilityOverrides;
  if (!overrides || typeof overrides !== 'object') return null;

  if (Object.prototype.hasOwnProperty.call(overrides, modelId)) {
    return sanitizeCapabilities(overrides[modelId]);
  }

  const normalizedModelId = normalizeModelId(modelId);
  for (const [key, value] of Object.entries(overrides)) {
    if (normalizeModelId(key) === normalizedModelId) {
      return sanitizeCapabilities(value);
    }
  }

  return null;
}

function removeModelCapabilityOverride(provider, modelId) {
  if (!provider?.modelCapabilityOverrides || typeof provider.modelCapabilityOverrides !== 'object') return;

  if (Object.prototype.hasOwnProperty.call(provider.modelCapabilityOverrides, modelId)) {
    delete provider.modelCapabilityOverrides[modelId];
  } else {
    const normalizedModelId = normalizeModelId(modelId);
    for (const key of Object.keys(provider.modelCapabilityOverrides)) {
      if (normalizeModelId(key) === normalizedModelId) {
        delete provider.modelCapabilityOverrides[key];
      }
    }
  }

  if (Object.keys(provider.modelCapabilityOverrides).length === 0) {
    delete provider.modelCapabilityOverrides;
  }
}

function getEffectiveModelCapabilities(modelId, provider) {
  const override = getModelCapabilityOverride(provider, modelId);
  const resolved = resolveModelMetadata(modelId, provider);

  let capabilities = createEmptyCapabilities();
  if (override) {
    capabilities = override;
  } else if (resolved.matched) {
    capabilities = getAutomaticCapabilities(resolved.entry, modelId);
  }

  return {
    capabilities,
    hasOverride: !!override,
    matched: resolved.matched,
    entry: resolved.entry,
  };
}

function buildModelRenderMeta(modelId, provider) {
  const effective = getEffectiveModelCapabilities(modelId, provider);
  const capabilityEntries = capabilityOrder
    .filter((capabilityKey) => effective.capabilities[capabilityKey])
    .map((capabilityKey) => ({
      key: capabilityKey,
      ...capabilityIconMap[capabilityKey],
    }));

  return {
    ...effective,
    capabilityEntries,
    logoUrl: resolveLocalLogoUrl(modelId, provider, effective.entry),
  };
}

function handleModelLogoError(event) {
  const img = event?.target;
  if (!img || !FALLBACK_MODEL_LOGO_URL) return;
  if (img.dataset.logoFallbackApplied === '1') return;
  img.dataset.logoFallbackApplied = '1';
  img.src = FALLBACK_MODEL_LOGO_URL;
}

onMounted(() => {
  if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
    provider_key.value = currentConfig.value.providerOrder[0];
  } else if (currentConfig.value.providers && Object.keys(currentConfig.value.providers).length > 0) {
    provider_key.value = Object.keys(currentConfig.value.providers)[0];
  } else {
    provider_key.value = null;
  }

  loadModelsMetadata();
});

const selectedProvider = computed(() => {
  if (provider_key.value && currentConfig.value.providers && currentConfig.value.providers[provider_key.value]) {
    return currentConfig.value.providers[provider_key.value];
  }
  return null;
});

const modelRenderMetaMap = computed(() => {
  const output = {};
  const provider = selectedProvider.value;
  if (!provider?.modelList || !Array.isArray(provider.modelList)) {
    return output;
  }

  for (const modelId of provider.modelList) {
    output[modelId] = buildModelRenderMeta(modelId, provider);
  }
  return output;
});

const localProviderOrder = ref([]);

watch(() => currentConfig.value.providerOrder, (val) => {
  localProviderOrder.value = val ? [...val] : [];
}, { immediate: true });

function saveProviderOrder() {
  atomicSave(config => {
    config.providerOrder = [...localProviderOrder.value];
  });
}

// 原子化保存函数
const atomicSave = async (updateFunction) => {
  try {
    const latestConfigData = await window.api.getConfig();
    if (!latestConfigData || !latestConfigData.config) {
      throw new Error("Failed to get latest config from DB.");
    }
    const latestConfig = latestConfigData.config;

    updateFunction(latestConfig);

    await window.api.updateConfigWithoutFeatures({ config: latestConfig });

    currentConfig.value = latestConfig;

  } catch (error) {
    console.error("Atomic save failed:", error);
    ElMessage.error(t('providers.alerts.configSaveFailed'));
  }
}

function delete_provider() {
  if (!provider_key.value) return;

  atomicSave(config => {
    const keyToDelete = provider_key.value;
    const index = config.providerOrder.indexOf(keyToDelete);

    delete config.providers[keyToDelete];
    config.providerOrder = config.providerOrder.filter(key => key !== keyToDelete);

    // 更新 provider_key 以选择一个新的服务商
    if (config.providerOrder.length > 0) {
      if (index > 0 && index <= config.providerOrder.length) {
        provider_key.value = config.providerOrder[index - 1];
      } else {
        provider_key.value = config.providerOrder[0];
      }
    } else {
      provider_key.value = null;
    }
  });
}

const addProvider_page = ref(false);
const addprovider_form = reactive({ name: "" });

function add_prvider_function() {
  const timestamp = String(Date.now());
  const newName = addprovider_form.name || `${t('providers.unnamedProvider')} ${timestamp.slice(-4)}`;

  atomicSave(config => {
    config.providers[timestamp] = {
      name: newName,
      url: "", api_key: "", modelList: [], enable: true
    };
    config.providerOrder.push(timestamp);
    provider_key.value = timestamp;
  });

  addprovider_form.name = "";
  addProvider_page.value = false;
}

const change_provider_name_page = ref(false);
const change_provider_name_form = reactive({ name: "" });

function openChangeProviderNameDialog() {
  if (selectedProvider.value) {
    change_provider_name_form.name = selectedProvider.value.name;
    change_provider_name_page.value = true;
  }
}

function change_provider_name_function() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  const newName = change_provider_name_form.name;

  atomicSave(config => {
    if (config.providers[keyToUpdate]) {
      config.providers[keyToUpdate].name = newName;
    }
  });

  change_provider_name_form.name = "";
  change_provider_name_page.value = false;
}

function delete_model(model) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      provider.modelList = provider.modelList.filter(m => m !== model);
      removeModelCapabilityOverride(provider, model);
    }
  });
}

const addModel_page = ref(false);
const addModel_form = reactive({ name: "" })

function add_model_function() {
  if (!provider_key.value || !addModel_form.name.trim()) return;
  const keyToUpdate = provider_key.value;
  const newModelName = addModel_form.name.trim();

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      provider.modelList.push(newModelName);
    }
  });

  addModel_form.name = "";
  addModel_page.value = false;
}

const getModel_page = ref(false);
const getModel_form = reactive({ modelList: [], isLoading: false, error: null });
const searchQuery = ref('');

const filteredModels = computed(() => {
  if (!searchQuery.value) {
    return getModel_form.modelList;
  }
  const lowerCaseQuery = searchQuery.value.toLowerCase();
  return getModel_form.modelList.filter(model =>
    (model.id && model.id.toLowerCase().includes(lowerCaseQuery)) ||
    (model.owned_by && model.owned_by.toLowerCase().includes(lowerCaseQuery))
  );
});


async function activate_get_model_function() {
  if (!selectedProvider.value || !selectedProvider.value.url) {
    ElMessage.warning(t('providers.alerts.providerUrlNotSet'));
    return;
  }
  getModel_page.value = true;
  getModel_form.isLoading = true;
  getModel_form.error = null;
  getModel_form.modelList = [];
  searchQuery.value = '';

  const url = selectedProvider.value.url;
  const apiKey = selectedProvider.value.api_key;
  const apiKeyToUse = window.api && typeof window.api.getRandomItem === 'function' && apiKey ? window.api.getRandomItem(apiKey) : apiKey;


  const options = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  if (apiKeyToUse) {
    options.headers['Authorization'] = `Bearer ${apiKeyToUse}`;
  }

  try {
    const response = await fetch(`${url}/models`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      const errorMessage = t('providers.alerts.fetchModelsError', { status: response.status, message: errorData.message || t('providers.alerts.fetchModelsFailedDefault') });
      throw new Error(errorMessage);
    }
    const data = await response.json();
    if (data?.data && Array.isArray(data.data)) {
      getModel_form.modelList = data.data.map(m => ({ id: m.id, owned_by: m.owned_by }));
    } else {
      getModel_form.modelList = [];
    }
  } catch (error) {
    console.error(error);
    getModel_form.error = error.message;
    ElMessage.error(error.message);
  } finally {
    getModel_form.isLoading = false;
  }
}

function get_model_function(add, modelId) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      if (add) {
        if (!provider.modelList.includes(modelId)) {
          provider.modelList.push(modelId);
        }
      } else {
        provider.modelList = provider.modelList.filter(m => m !== modelId);
        removeModelCapabilityOverride(provider, modelId);
      }
    }
  });
}

function saveModelOrder() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  // v-model已经更新了selectedProvider.modelList的顺序
  const newOrder = selectedProvider.value.modelList;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      provider.modelList = newOrder;
    }
  });
}

// 对于简单的开关和输入框，使用精确的 saveSetting
async function saveSingleProviderSetting(key, value) {
  if (!provider_key.value) return;
  const keyPath = `providers.${provider_key.value}.${key}`;
  try {
    await window.api.saveSetting(keyPath, value);
  } catch (e) {
    ElMessage.error(t('providers.alerts.saveFailed'));
  }
}

const apiKeyCount = computed(() => {
  if (!selectedProvider.value || !selectedProvider.value.api_key || !selectedProvider.value.api_key.trim()) {
    return 0;
  }
  // 同时支持中英文逗号，并过滤空字符串
  const keys = selectedProvider.value.api_key.split(/[,，]/).filter(k => k.trim() !== '');
  return keys.length;
});

function fillModelCapabilityDialogForm(capabilities) {
  const normalized = sanitizeCapabilities(capabilities);
  modelCapabilityDialogForm.vision = normalized.vision;
  modelCapabilityDialogForm.web = normalized.web;
  modelCapabilityDialogForm.reasoning = normalized.reasoning;
  modelCapabilityDialogForm.tools = normalized.tools;
  modelCapabilityDialogForm.embedding = normalized.embedding;
}

function getModelCapabilityDialogFormData() {
  return {
    vision: !!modelCapabilityDialogForm.vision,
    web: !!modelCapabilityDialogForm.web,
    reasoning: !!modelCapabilityDialogForm.reasoning,
    tools: !!modelCapabilityDialogForm.tools,
    embedding: !!modelCapabilityDialogForm.embedding,
  };
}

function openModelCapabilityDialog(modelId) {
  const provider = selectedProvider.value;
  if (!provider || !provider_key.value) return;

  const effective = getEffectiveModelCapabilities(modelId, provider);
  modelCapabilityDialogForm.modelId = modelId;
  fillModelCapabilityDialogForm(effective.capabilities);
  modelCapabilityDialogHasOverride.value = effective.hasOverride;
  modelCapabilityDialogVisible.value = true;
}

async function saveModelCapabilityOverride() {
  if (!provider_key.value || !modelCapabilityDialogForm.modelId) return;
  const keyToUpdate = provider_key.value;
  const modelId = modelCapabilityDialogForm.modelId;
  const capabilities = getModelCapabilityDialogFormData();

  await atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (!provider) return;
    if (!provider.modelCapabilityOverrides || typeof provider.modelCapabilityOverrides !== 'object') {
      provider.modelCapabilityOverrides = {};
    }
    provider.modelCapabilityOverrides[modelId] = capabilities;
  });

  modelCapabilityDialogHasOverride.value = true;
  modelCapabilityDialogVisible.value = false;
}

async function resetModelCapabilityOverride() {
  if (!provider_key.value || !modelCapabilityDialogForm.modelId) return;
  const keyToUpdate = provider_key.value;
  const modelId = modelCapabilityDialogForm.modelId;

  await atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (!provider) return;
    removeModelCapabilityOverride(provider, modelId);
  });

  const provider = selectedProvider.value;
  if (provider) {
    const refreshed = getEffectiveModelCapabilities(modelId, provider);
    fillModelCapabilityDialogForm(refreshed.capabilities);
  } else {
    fillModelCapabilityDialogForm(createEmptyCapabilities());
  }
  modelCapabilityDialogHasOverride.value = false;
}

function handleProviderContextMenu(event, key_id) {
  event.preventDefault();
  contextMenuProviderKey.value = key_id;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

function hideContextMenu() {
  contextMenuVisible.value = false;
}

function handleContextMenuRename() {
  hideContextMenu();
  provider_key.value = contextMenuProviderKey.value;
  openChangeProviderNameDialog();
}

function handleContextMenuDelete() {
  hideContextMenu();
  const keyToDelete = contextMenuProviderKey.value;
  provider_key.value = keyToDelete;
  delete_provider();
}

watch(contextMenuVisible, (val) => {
  if (val) {
    document.addEventListener('click', hideContextMenu);
  } else {
    document.removeEventListener('click', hideContextMenu);
  }
});
</script>

<template>
  <div class="providers-page-container">
    <div class="providers-content-wrapper">
      <el-container>
        <el-aside width="240px" class="providers-aside">
          <el-scrollbar class="provider-list-scrollbar">
            <draggable v-model="localProviderOrder" :item-key="(el) => el" :animation="250"
              ghost-class="provider-drag-ghost" :force-fallback="true" fallback-class="provider-drag-fallback"
              :fallback-on-body="true" @end="saveProviderOrder">
              <template #item="{ element: key_id }">
                <div class="provider-item" :class="{
                  'active': provider_key === key_id, 'disabled': currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable
                }" @click="provider_key = key_id" @contextmenu="handleProviderContextMenu($event, key_id)">
                  <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name ||
                    t('providers.unnamedProvider') }}</span>
                  <div class="provider-status-wrapper">
                    <transition name="status-flip" mode="out-in">
                      <el-tag 
                        :type="currentConfig.providers[key_id].enable ? 'primary' : 'info'"
                        size="small" 
                        effect="dark" 
                        round
                        :key="currentConfig.providers[key_id].enable ? 'on' : 'off'"
                        class="provider-status-tag">
                        {{ currentConfig.providers[key_id].enable ? t('providers.statusOn') : t('providers.statusOff') }}
                      </el-tag>
                    </transition>
                  </div>
                </div>
              </template>
            </draggable>
            <div v-if="!currentConfig.providerOrder || currentConfig.providerOrder.length === 0" class="no-providers">
              {{ t('providers.noProviders') }}
            </div>
          </el-scrollbar>
          <div class="aside-actions">
            <el-button type="primary" :icon="Plus" @click="addProvider_page = true" class="add-provider-btn">
              {{ t('providers.addProviderBtn') }}
            </el-button>
          </div>
        </el-aside>

        <el-main class="provider-main-content">
          <el-scrollbar class="provider-details-scrollbar">
            <div v-if="selectedProvider" class="provider-details">
              <div class="provider-header">
                <h2 class="provider-name">
                  {{ selectedProvider.name }}
                </h2>
                <el-switch v-model="selectedProvider.enable"
                  @change="(value) => saveSingleProviderSetting('enable', value)" size="large" />
              </div>

              <el-form label-position="left" label-width="75px" class="provider-form">
                <div class="form-item-header">
                  <div class="form-item-description">{{ t('providers.apiKeyDescription') }}</div>
                </div>
                <el-form-item>
                  <template #label>
                    <span class="label-with-badge">
                      {{ t('providers.apiKeyLabel') }}
                      <span v-if="apiKeyCount > 0" class="api-key-count-badge">{{ apiKeyCount }}</span>
                    </span>
                  </template>
                  <el-input 
                    v-model="selectedProvider.api_key" 
                    :type="showApiKey ? 'text' : 'password'"
                    :placeholder="t('providers.apiKeyPlaceholder')"
                    @change="(value) => saveSingleProviderSetting('api_key', value)">
                    <template #suffix>
                      <component 
                        :is="showApiKey ? EyeOff : Eye" 
                        :size="16" 
                        @click="showApiKey = !showApiKey"
                        style="cursor: pointer;" />
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item :label="t('providers.apiUrlLabel')">
                  <el-input v-model="selectedProvider.url" :placeholder="t('providers.apiUrlPlaceholder')"
                    @change="(value) => saveSingleProviderSetting('url', value)" />
                </el-form-item>

                <el-form-item :label="t('providers.modelsLabel')">
                  <div class="models-actions-row">
                    <el-tooltip :content="t('providers.getModelsFromApiBtn')" placement="top">
                      <el-button :icon="ListCheck" @click="activate_get_model_function" circle class="circle-action-btn" />
                    </el-tooltip>
                    <el-tooltip :content="t('providers.addManuallyBtn')" placement="top">
                      <el-button :icon="Plus" @click="addModel_page = true" circle class="circle-action-btn" />
                    </el-tooltip>
                  </div>
                </el-form-item>
                <div class="models-list-wrapper">
                  <draggable v-if="selectedProvider.modelList && selectedProvider.modelList.length > 0"
                    v-model="selectedProvider.modelList" item-key="model"
                    class="models-list-container draggable-models-list" @end="saveModelOrder"
                    ghost-class="sortable-ghost">
                    <template #item="{ element: model }">
                      <div class="model-tag">
                        <div class="model-main">
                          <img
                            class="model-logo"
                            :src="modelRenderMetaMap[model]?.logoUrl || FALLBACK_MODEL_LOGO_URL"
                            :alt="model"
                            loading="lazy"
                            @error="handleModelLogoError"
                          />
                          <span class="model-name">{{ model }}</span>
                          <div v-if="modelRenderMetaMap[model]?.capabilityEntries?.length" class="model-capabilities">
                            <el-tooltip
                              v-for="capability in modelRenderMetaMap[model].capabilityEntries"
                              :key="`${model}-${capability.key}`"
                              :content="t(capability.labelKey)"
                              placement="top"
                            >
                              <span class="model-capability-pill" :class="capability.className">
                                <component :is="capability.icon" :size="12" />
                              </span>
                            </el-tooltip>
                          </div>
                        </div>
                        <div class="model-actions">
                          <el-tooltip :content="t('providers.modelCapabilitySettingsTooltip')" placement="top">
                            <button type="button" class="circle-action-btn-sm model-settings-btn" @click.stop="openModelCapabilityDialog(model)">
                              <Settings :size="14" />
                            </button>
                          </el-tooltip>
                          <el-tooltip :content="t('providers.removeModelTooltip')" placement="top">
                            <button type="button" class="circle-action-btn-sm model-remove-btn" @click.stop="delete_model(model)">
                              <Minus :size="16" />
                            </button>
                          </el-tooltip>
                        </div>
                      </div>
                    </template>
                  </draggable>
                  <div v-else class="no-models-message">
                    {{ t('providers.noModelsAdded') }}
                  </div>
                </div>

              </el-form>
            </div>
            <el-empty v-else :description="t('providers.selectProviderOrAdd')" class="empty-state-main" />
          </el-scrollbar>
        </el-main>
      </el-container>
    </div>

    <!-- Dialogs -->
    <el-dialog v-model="addProvider_page" :title="t('providers.addProviderDialogTitle')" width="500px"
      :close-on-click-modal="false" append-to-body>
      <el-form :model="addprovider_form" @submit.prevent="add_prvider_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="addprovider_form.name" autocomplete="off"
            :placeholder="t('providers.providerNamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addProvider_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_prvider_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="change_provider_name_page" :title="t('providers.changeProviderNameDialogTitle')" width="500px"
      :close-on-click-modal="false" append-to-body>
      <el-form :model="change_provider_name_form" @submit.prevent="change_provider_name_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="change_provider_name_form.name" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="change_provider_name_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="change_provider_name_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addModel_page" :title="t('providers.addModelDialogTitle')" width="500px"
      :close-on-click-modal="false" append-to-body>
      <el-form :model="addModel_form" @submit.prevent="add_model_function" label-position="top">
        <el-form-item :label="t('providers.modelNameIdLabel')" required>
          <el-input v-model="addModel_form.name" autocomplete="off"
            :placeholder="t('providers.modelNameIdPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addModel_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_model_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="getModel_page" :title="t('providers.availableModelsDialogTitle')" width="700px" top="10vh"
      :close-on-click-modal="false" append-to-body class="available-models-dialog">
      <div class="dialog-search-bar-container">
        <el-input v-model="searchQuery" :placeholder="t('providers.searchModelsPlaceholder')" clearable
          :prefix-icon="Search" />
      </div>

      <el-alert v-if="getModel_form.error" :title="getModel_form.error" type="error" show-icon :closable="false"
        class="dialog-error-alert" />

      <el-table :data="filteredModels" v-loading="getModel_form.isLoading" style="width: 100%" max-height="50vh"
        :empty-text="searchQuery ? t('providers.noModelsMatchSearch') : t('providers.noModelsFoundError')" stripe
        border>
        <el-table-column prop="id" :label="t('providers.table.modelId')" sortable />
        <el-table-column :label="t('providers.table.action')" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              :content="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? t('providers.removeModelTooltip') : t('providers.addModelTooltip')"
              placement="top">
              <el-button
                :type="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? 'danger' : 'success'"
                :icon="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? Minus : Plus"
                circle size="small" class="circle-action-btn"
                @click="get_model_function(!(selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id)), scope.row.id)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="getModel_page = false">{{ t('common.close') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="modelCapabilityDialogVisible"
      :title="t('providers.modelCapabilityDialogTitle')"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="model-capability-dialog-model">{{ modelCapabilityDialogForm.modelId }}</div>
      <div class="model-capability-dialog-tip">{{ t('providers.modelCapabilityDialogTip') }}</div>
      <div class="model-capability-grid">
        <label v-for="item in modelCapabilityDialogItems" :key="item.key" class="model-capability-grid-item">
          <el-checkbox v-model="modelCapabilityDialogForm[item.key]" />
          <span class="model-capability-grid-icon" :class="item.className">
            <component :is="item.icon" :size="14" />
          </span>
          <span>{{ t(item.labelKey) }}</span>
        </label>
      </div>
      <template #footer>
        <el-button @click="modelCapabilityDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button @click="resetModelCapabilityOverride" :disabled="!modelCapabilityDialogHasOverride">
          {{ t('providers.modelCapabilityResetToAuto') }}
        </el-button>
        <el-button type="primary" @click="saveModelCapabilityOverride">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <teleport to="body">
      <div v-if="contextMenuVisible" class="provider-context-menu" :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }">
        <div class="context-menu-item" @click="handleContextMenuRename">
          <el-icon class="context-menu-icon"><Edit /></el-icon>
          <span>{{ t('providers.rename') }}</span>
        </div>
        <div class="context-menu-item context-menu-item-danger" @click="handleContextMenuDelete">
          <el-icon class="context-menu-icon"><Delete /></el-icon>
          <span>{{ t('providers.delete') }}</span>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.providers-page-container {
  height: 100%;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  background-color: var(--bg-primary);
  display: flex;
}

.providers-content-wrapper {
  flex-grow: 1;
  width: 100%;
  background-color: transparent;
  overflow: hidden;
  display: flex;
  padding: 0px 20px 0 20px;
  gap: 20px;
}

.providers-content-wrapper>.el-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-primary);
  overflow: hidden;
}

.providers-aside {
  background-color: transparent;
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.provider-list-scrollbar {
  flex-grow: 1;
  padding: 8px;
}

.no-providers {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  cursor: grab;
  transition: background-color 0.2s, color 0.2s;
  font-size: 14px;
  color: var(--text-primary) !important;
}

.provider-item:active {
  cursor: grabbing;
}

.provider-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  margin-right: 8px;
  font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

.provider-item:hover {
  background-color: var(--bg-tertiary);
}

.provider-item.active {
  background-color: var(--bg-accent-light);
  color: var(--text-accent);
}

.provider-item.disabled .provider-item-name {
  color: var(--text-tertiary);
}

.provider-status-wrapper {
  perspective: 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.provider-status-tag {
  min-width: 40px;
  width: 40px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 8px;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

.status-flip-enter-active {
  animation: flipIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-flip-leave-active {
  animation: flipOut 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes flipIn {
  0% {
    transform: rotateY(-90deg);
    opacity: 0;
  }
  100% {
    transform: rotateY(0deg);
    opacity: 1;
  }
}

@keyframes flipOut {
  0% {
    transform: rotateY(0deg);
    opacity: 1;
  }
  100% {
    transform: rotateY(90deg);
    opacity: 0;
  }
}

.provider-status-tag.el-tag--primary {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
  color: var(--text-on-accent);
}

.provider-status-tag.el-tag--info {
  background-color: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-secondary);
}

.aside-actions {
  padding: 12px;
  display: flex;
}

.add-provider-btn {
  width: 100%;
  height: 34px;
  min-height: 34px;
  background-color: var(--bg-accent);
  color: var(--text-on-accent);
  border: none;
  font-weight: 500;
}

.add-provider-btn:hover {
  opacity: 0.9;
  background-color: var(--bg-accent);
}

.provider-main-content {
  padding: 0;
  background-color: var(--bg-secondary);
  height: 100%;
}

.provider-details-scrollbar {
  height: 100%;
}

.provider-details-scrollbar :deep(.el-scrollbar__view) {
  height: 100%;
  display: flex;
  flex-direction: column;
}


.provider-details {
  padding: 0px 30px 0px 30px;
  flex-grow: 1;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 15px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-primary);
}

.provider-title-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.provider-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.provider-name .edit-icon {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.provider-name:hover .edit-icon {
  opacity: 1;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.provider-form {
  margin-top: 20px !important;
}

.provider-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
}

.form-item-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
  line-height: 1.4;
}

.models-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.no-models-message {
  width: 100%;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 20px 0;
  background-color: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-primary);
}

.model-tag {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  font-weight: 500;
  border-radius: 9999px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px 0 12px;
  box-sizing: border-box;
  cursor: move;
  gap: 8px;
}

.model-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.model-logo {
  width: 18px;
  height: 18px;
  min-width: 18px;
  border-radius: 50%;
  object-fit: contain;
  flex-shrink: 0;
}

.model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-capabilities {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.model-capability-pill {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
}

.model-capability-pill.capability-vision {
  color: #2563eb;
}

.model-capability-pill.capability-web {
  color: #059669;
}

.model-capability-pill.capability-reasoning {
  color: #d97706;
}

.model-capability-pill.capability-tools {
  color: #dc2626;
}

.model-capability-pill.capability-embedding {
  color: #0891b2;
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-settings-btn:hover {
  color: #2563eb;
}

.model-remove-btn:hover {
  color: var(--color-danger, #ef4444);
}

/* Provider list drag & drop */
.provider-drag-ghost {
  opacity: 0 !important;
  transition: none !important;
}

:global(.provider-drag-fallback) {
  opacity: 1 !important;
  background-color: var(--bg-accent-light) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.12),
              0 2px 6px -1px rgba(0, 0, 0, 0.05) !important;
  z-index: 9999 !important;
  transition: box-shadow 0.2s ease !important;
}

:global(html.dark .provider-drag-fallback) {
  background-color: var(--bg-accent-light) !important;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5),
              0 2px 6px -1px rgba(0, 0, 0, 0.25) !important;
}

.draggable-models-list .model-tag {
  cursor: move;
}

.draggable-models-list .sortable-ghost {
  opacity: 0.5;
  background-color: var(--bg-accent-light);
  border: 1px dashed var(--border-accent);
}

.empty-state-main {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
}

:deep(.el-switch .el-switch__core) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-switch .el-switch__action) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-table__header-wrapper th) {
  background-color: var(--bg-primary) !important;
  font-weight: 500;
  color: var(--text-secondary);
}

:deep(.el-table tr),
:deep(.el-table) {
  background-color: var(--bg-secondary);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background-color: var(--bg-primary);
}

:deep(.el-table td.el-table__cell),
:deep(.el-table th.el-table__cell.is-leaf) {
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-primary);
}

:deep(.el-table--border .el-table__cell) {
  border-right: 1px solid var(--border-primary);
}

:deep(.el-table--border::after),
:deep(.el-table--border::before) {
  background-color: var(--border-primary);
}

:deep(.el-dialog__header) {
  padding: 5px !important;
}

:deep(.el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.available-models-dialog .dialog-error-alert) {
  margin-bottom: 15px !important;
}

.dialog-search-bar-container {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bg-primary);
  padding: 0px 0px 8px 0px;
  margin: 0px 0px 10px 0px;
}

.dialog-search-bar-container :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--border-primary) inset !important;
}

.dialog-search-bar-container :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--text-accent) inset !important;
}

:deep(.el-dialog__footer) {
  padding: 5px;
}

.label-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.api-key-count-badge {
  position: absolute;
  top: -8px;
  right: -12px;
  background-color: var(--bg-accent);
  color: #000000;
  height: 16px;
  min-width: 16px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.form-item-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
  padding-left: 85px;

}

.form-item-header .form-item-description {
  margin-top: 0;
}

.provider-form {
  margin-top: 20px;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.models-actions-row {
  display: flex;
  gap: 10px;
}

.models-list-wrapper {
  margin-bottom: 18px;
}

.model-capability-dialog-model {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  word-break: break-all;
}

.model-capability-dialog-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.model-capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.model-capability-grid-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border-radius: 9999px;
  border: 1px solid var(--border-primary);
  background-color: var(--bg-primary);
  padding: 0 10px;
  color: var(--text-primary);
}

.model-capability-grid-icon {
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
}

.model-capability-grid-icon.capability-vision {
  color: #2563eb;
  border-color: color-mix(in srgb, #2563eb 35%, transparent);
  background: color-mix(in srgb, #2563eb 15%, transparent);
}

.model-capability-grid-icon.capability-web {
  color: #059669;
  border-color: color-mix(in srgb, #059669 35%, transparent);
  background: color-mix(in srgb, #059669 15%, transparent);
}

.model-capability-grid-icon.capability-reasoning {
  color: #d97706;
  border-color: color-mix(in srgb, #d97706 35%, transparent);
  background: color-mix(in srgb, #d97706 15%, transparent);
}

.model-capability-grid-icon.capability-tools {
  color: #dc2626;
  border-color: color-mix(in srgb, #dc2626 35%, transparent);
  background: color-mix(in srgb, #dc2626 15%, transparent);
}

.model-capability-grid-icon.capability-embedding {
  color: #0891b2;
  border-color: color-mix(in srgb, #0891b2 35%, transparent);
  background: color-mix(in srgb, #0891b2 15%, transparent);
}

.provider-context-menu {
  position: fixed;
  z-index: 9999;
  border-radius: var(--radius-lg) !important;
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent) !important;
  box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-primary) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden !important;
  padding: 6px !important;
  min-width: 160px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 14px;
  color: var(--text-primary);
  border-radius: var(--radius-md);
}

html.dark .context-menu-item:hover {
  background-color: #3d3d3d !important;
}

html:not(.dark) .context-menu-item:hover {
  background-color: var(--bg-tertiary);
}

.context-menu-item-danger:hover {
  color: #ef4444;
}

.context-menu-icon {
  width: 16px;
  height: 16px;
}
</style>
