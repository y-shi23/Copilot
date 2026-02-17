<script setup lang="ts">
// @ts-nocheck
import {
  ref,
  watch,
  onMounted,
  provide,
  onBeforeUnmount,
  computed,
  defineAsyncComponent,
} from 'vue';
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import {
  Bell,
  MessageCircle as ChatDotRound,
  WandSparkles as MagicStick,
  Library as Collection,
  Cloud as Cloudy,
  Rocket,
  Settings as SettingIcon,
  FileText as Document,
  FolderMinus,
  FolderOpen,
  ArrowLeft,
  Pencil as EditIcon,
  Hammer as Wrench,
  SquarePen,
  Trash2 as DeleteIcon,
} from 'lucide-vue-next';
import { ElBadge, ElMessage, ElMessageBox } from 'element-plus';
import { useAssistantSessionIndex } from './composables/useAssistantSessionIndex';

const MainChatWorkspace = defineAsyncComponent(
  () => import('./components/chat/MainChatWorkspace.vue'),
);
const Chats = defineAsyncComponent(() => import('./components/Chats.vue'));
const Prompts = defineAsyncComponent(() => import('./components/Prompts.vue'));
const Mcp = defineAsyncComponent(() => import('./components/Mcp.vue'));
const Setting = defineAsyncComponent(() => import('./components/Setting.vue'));
const DefaultModel = defineAsyncComponent(() => import('./components/DefaultModel.vue'));
const Providers = defineAsyncComponent(() => import('./components/Providers.vue'));
const Skills = defineAsyncComponent(() => import('./components/Skills.vue'));

const { t, locale } = useI18n();
const config = ref(null);
provide('config', config);

const appMode = ref('chat'); // chat | settings
const settingsTab = ref('history'); // history | prompts | mcp | skills | providers | defaultModel | system
const selectedAssistantCode = ref('');
const expandedAssistantCode = ref('');
const sessionLoadRequest = ref(null);
const sessionRequestNonce = ref(0);
const activeSessionId = ref('');
const selectedSessionId = ref('');
const sessionContextMenuVisible = ref(false);
const sessionContextMenuPosition = ref({ x: 0, y: 0 });
const sessionContextMenuTarget = ref(null);
const localAssistantOrder = ref<any[]>([]);
const isAssistantOrderDragging = ref(false);
const chatWorkspaceRef = ref(null);

const {
  enabledAssistants,
  sessionMap,
  errorMessage: sessionIndexError,
  refreshIndex,
  loadSessionPayload,
} = useAssistantSessionIndex(config);

const settingsNavItems = computed(() => [
  { id: 'back', label: t('mainSettings.backToChat'), icon: ArrowLeft },
  { id: 'history', label: t('mainSettings.tabs.history'), icon: ChatDotRound },
  { id: 'prompts', label: t('mainSettings.tabs.prompts'), icon: MagicStick },
  { id: 'mcp', label: t('mainSettings.tabs.mcp'), icon: Wrench },
  { id: 'skills', label: t('mainSettings.tabs.skills'), icon: Collection },
  { id: 'providers', label: t('mainSettings.tabs.providers'), icon: Cloudy },
  { id: 'defaultModel', label: t('mainSettings.tabs.defaultModel'), icon: Rocket },
  { id: 'system', label: t('mainSettings.tabs.system'), icon: SettingIcon },
]);

const settingsHeaderText = computed(() => {
  const item = settingsNavItems.value.find((nav) => nav.id === settingsTab.value);
  return item?.label || t('mainSettings.tabs.history');
});

const platformName = String(
  navigator.userAgentData?.platform || navigator.platform || '',
).toLowerCase();
const isMacOS = computed(() => platformName.includes('mac'));

const SIDEBAR_WIDTH_STORAGE_KEY = 'anywhere_main_sidebar_width_v2';
const SIDEBAR_DEFAULT_WIDTH = 286;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_MOBILE_BREAKPOINT = 760;
const CHAT_MOBILE_BREAKPOINT = 700;
const SIDEBAR_KEYBOARD_STEP = 12;
const SESSION_AUTO_SYNC_INTERVAL_MS = 10000;

const viewportWidth = ref(window.innerWidth || 1200);
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH);
const isSidebarResizing = ref(false);
const isMobileSidebarOpen = ref(false);

const isSidebarResizable = computed(() => viewportWidth.value > SIDEBAR_MOBILE_BREAKPOINT);
const isCompactMobile = computed(() => viewportWidth.value <= CHAT_MOBILE_BREAKPOINT);
const shouldShowSidebarBody = computed(() => !isCompactMobile.value || isMobileSidebarOpen.value);
const sidebarMaxWidth = computed(() => {
  const byViewport = Math.floor(viewportWidth.value * 0.46);
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, byViewport));
});
const rootInlineStyles = computed(() => ({
  '--sidebar-region-width': isSidebarResizable.value ? `${sidebarWidth.value}px` : '100%',
}));

let sidebarResizeStartX = 0;
let sidebarResizeStartWidth = SIDEBAR_DEFAULT_WIDTH;
let sessionAutoSyncTimer = null;
let sessionOpenRequestToken = 0;
let suppressAssistantToggleUntil = 0;

const clampSidebarWidth = (rawWidth) => {
  const width = Number(rawWidth);
  if (!Number.isFinite(width)) return SIDEBAR_MIN_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(Math.round(width), sidebarMaxWidth.value));
};

const persistSidebarWidth = () => {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth.value));
  } catch {
    // ignore localStorage failures
  }
};

const applySidebarWidth = (nextWidth, options = {}) => {
  const persist = options.persist === true;
  const clamped = clampSidebarWidth(nextWidth);
  if (sidebarWidth.value !== clamped) {
    sidebarWidth.value = clamped;
  }
  if (persist) {
    persistSidebarWidth();
  }
};

const handleSidebarResizeMove = (event) => {
  if (!isSidebarResizing.value) return;
  const deltaX = event.clientX - sidebarResizeStartX;
  applySidebarWidth(sidebarResizeStartWidth + deltaX);
};

const stopSidebarResize = () => {
  if (!isSidebarResizing.value) return;
  isSidebarResizing.value = false;
  document.body?.classList.remove('sidebar-resizing');
  window.removeEventListener('mousemove', handleSidebarResizeMove);
  window.removeEventListener('mouseup', stopSidebarResize);
  persistSidebarWidth();
};

const startSidebarResize = (event) => {
  if (!isSidebarResizable.value) return;
  if (event.button !== 0) return;

  isSidebarResizing.value = true;
  sidebarResizeStartX = event.clientX;
  sidebarResizeStartWidth = sidebarWidth.value;
  document.body?.classList.add('sidebar-resizing');

  window.addEventListener('mousemove', handleSidebarResizeMove);
  window.addEventListener('mouseup', stopSidebarResize);
  event.preventDefault();
};

const nudgeSidebarWidth = (delta) => {
  if (!isSidebarResizable.value) return;
  applySidebarWidth(sidebarWidth.value + delta, { persist: true });
};

const handleViewportResize = () => {
  viewportWidth.value = window.innerWidth || 1200;
  if (!isCompactMobile.value && !isMobileSidebarOpen.value) {
    isMobileSidebarOpen.value = true;
  }
  if (!isSidebarResizable.value) {
    stopSidebarResize();
    return;
  }
  applySidebarWidth(sidebarWidth.value);
};

const applyMainVibrancyBodyClass = () => {
  const enableNativeVibrancy = isMacOS.value;
  document.documentElement.classList.toggle('macos-vibrancy-main', enableNativeVibrancy);
  document.body?.classList.toggle('macos-vibrancy-main', enableNativeVibrancy);
};

watch(
  () => config.value?.isDarkMode,
  (isDark) => {
    if (isDark === undefined) return;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },
  { deep: true },
);

const createSessionRequest = (payload) => {
  sessionRequestNonce.value += 1;
  sessionLoadRequest.value = {
    nonce: sessionRequestNonce.value,
    ...payload,
  };
};

const startNewSession = (assistantCode) => {
  if (!assistantCode) return;
  selectedAssistantCode.value = assistantCode;
  expandedAssistantCode.value = assistantCode;
  selectedSessionId.value = '';
  createSessionRequest({ mode: 'new', assistantCode });
  if (isCompactMobile.value) {
    isMobileSidebarOpen.value = false;
  }
};

const toggleAssistantExpand = (assistantCode) => {
  if (expandedAssistantCode.value === assistantCode) {
    expandedAssistantCode.value = '';
    return;
  }
  expandedAssistantCode.value = assistantCode;
};

const canDragAssistantsReorder = computed(
  () =>
    appMode.value === 'chat' && !expandedAssistantCode.value && enabledAssistants.value.length > 1,
);

const normalizeAssistantOrder = (rawOrder: any[] = []) => {
  const enabledCodes = enabledAssistants.value.map((assistant) => String(assistant.code));
  const enabledCodeSet = new Set(enabledCodes);
  const normalized: string[] = [];

  rawOrder.forEach((rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code || !enabledCodeSet.has(code) || normalized.includes(code)) return;
    normalized.push(code);
  });

  enabledCodes.forEach((code) => {
    if (!normalized.includes(code)) {
      normalized.push(code);
    }
  });

  return normalized;
};

const applyAssistantOrder = async (nextOrder: any[] = []) => {
  const normalizedOrder = normalizeAssistantOrder(Array.isArray(nextOrder) ? nextOrder : []);
  if (!config.value || typeof config.value !== 'object') return;

  config.value.assistantOrder = [...normalizedOrder];

  if (typeof window.api?.saveSetting !== 'function') return;
  try {
    await window.api.saveSetting('assistantOrder', [...normalizedOrder]);
  } catch (error) {
    console.error('[Main] Failed to persist assistant order:', error);
    ElMessage.warning(t('common.saveFailed'));
  }
};

const syncLocalAssistantOrder = (assistants: any[] = []) => {
  const normalizedAssistants = Array.isArray(assistants) ? assistants : [];
  const assistantByCode = new Map<string, any>();
  normalizedAssistants.forEach((assistant) => {
    const code = String(assistant?.code || '').trim();
    if (!code) return;
    assistantByCode.set(code, assistant);
  });

  const currentCodes = localAssistantOrder.value
    .map((assistant) => String(assistant?.code || '').trim())
    .filter(Boolean);
  const nextCodes = [
    ...currentCodes.filter((code) => assistantByCode.has(code)),
    ...normalizedAssistants
      .map((assistant) => String(assistant?.code || '').trim())
      .filter((code) => code && !currentCodes.includes(code)),
  ];

  localAssistantOrder.value = nextCodes.map((code) => assistantByCode.get(code)).filter(Boolean);
};

const handleAssistantRowClick = (assistantCode: string) => {
  if (Date.now() < suppressAssistantToggleUntil) return;
  toggleAssistantExpand(assistantCode);
};

const handleAssistantSortStart = () => {
  isAssistantOrderDragging.value = true;
};

const handleAssistantSortEnd = async () => {
  isAssistantOrderDragging.value = false;
  suppressAssistantToggleUntil = Date.now() + 120;
  const nextOrder = localAssistantOrder.value
    .map((assistant) => String(assistant?.code || '').trim())
    .filter(Boolean);
  const currentOrder = enabledAssistants.value
    .map((assistant) => String(assistant?.code || '').trim())
    .filter(Boolean);
  if (nextOrder.join('|') === currentOrder.join('|')) return;
  await applyAssistantOrder(nextOrder);
};

watch(
  enabledAssistants,
  (assistants) => {
    if (isAssistantOrderDragging.value) return;
    syncLocalAssistantOrder(Array.isArray(assistants) ? assistants : []);
  },
  { immediate: true },
);

const SESSION_COLLAPSE_DURATION_MS = 220;
const SESSION_COLLAPSE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const clearAssistantSessionsAnimation = (node) => {
  node.style.transition = '';
  node.style.willChange = '';
  node.style.overflow = '';
};

const onAssistantSessionsBeforeEnter = (el) => {
  const node = el;
  node.style.height = '0px';
  node.style.overflow = 'hidden';
};

const onAssistantSessionsEnter = (el, done) => {
  const node = el;
  const targetHeight = node.scrollHeight;
  if (!targetHeight) {
    node.style.height = 'auto';
    clearAssistantSessionsAnimation(node);
    done();
    return;
  }

  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    node.removeEventListener('transitionend', handleTransitionEnd);
    node.style.height = 'auto';
    clearAssistantSessionsAnimation(node);
    done();
  };

  const handleTransitionEnd = (event) => {
    if (event.target !== node || event.propertyName !== 'height') return;
    finalize();
  };

  node.style.willChange = 'height';
  node.style.transition = `height ${SESSION_COLLAPSE_DURATION_MS}ms ${SESSION_COLLAPSE_EASING}`;
  node.addEventListener('transitionend', handleTransitionEnd);
  // Force layout so the animation has a stable starting point.
  void node.offsetHeight;
  requestAnimationFrame(() => {
    node.style.height = `${targetHeight}px`;
  });
  window.setTimeout(finalize, SESSION_COLLAPSE_DURATION_MS + 60);
};

const onAssistantSessionsLeave = (el, done) => {
  const node = el;
  const startHeight = node.scrollHeight;
  if (!startHeight) {
    node.style.height = '';
    clearAssistantSessionsAnimation(node);
    done();
    return;
  }

  let finished = false;
  const finalize = () => {
    if (finished) return;
    finished = true;
    node.removeEventListener('transitionend', handleTransitionEnd);
    node.style.height = '';
    clearAssistantSessionsAnimation(node);
    done();
  };

  const handleTransitionEnd = (event) => {
    if (event.target !== node || event.propertyName !== 'height') return;
    finalize();
  };

  node.style.height = `${startHeight}px`;
  node.style.overflow = 'hidden';
  node.style.willChange = 'height';
  node.style.transition = `height ${SESSION_COLLAPSE_DURATION_MS}ms ${SESSION_COLLAPSE_EASING}`;
  node.addEventListener('transitionend', handleTransitionEnd);
  // Force layout so the height transition can run reliably.
  void node.offsetHeight;
  requestAnimationFrame(() => {
    node.style.height = '0px';
  });
  window.setTimeout(finalize, SESSION_COLLAPSE_DURATION_MS + 60);
};

const onAssistantSessionsEnterCancelled = (el) => {
  const node = el;
  node.style.height = 'auto';
  clearAssistantSessionsAnimation(node);
};

const onAssistantSessionsLeaveCancelled = (el) => {
  const node = el;
  node.style.height = '';
  clearAssistantSessionsAnimation(node);
};

const getSessionConversationId = (sessionItem) => {
  return String(sessionItem?.conversationId || sessionItem?.id || '').trim();
};

const openHistorySession = async (sessionItem) => {
  const conversationId = getSessionConversationId(sessionItem);
  if (!conversationId) return;
  if (conversationId === selectedSessionId.value && !activeSessionId.value) return;
  if (conversationId === activeSessionId.value) return;

  const previousSelectedSessionId = selectedSessionId.value;
  sessionOpenRequestToken += 1;
  const requestToken = sessionOpenRequestToken;

  activeSessionId.value = conversationId;
  selectedSessionId.value = conversationId;
  try {
    const payload = await loadSessionPayload(sessionItem);
    if (requestToken !== sessionOpenRequestToken) return;
    const assistantCode = payload.assistantCode || sessionItem.assistantCode;
    const resolvedConversationId = String(payload.conversationId || conversationId).trim();
    selectedAssistantCode.value = assistantCode;
    expandedAssistantCode.value = assistantCode;
    selectedSessionId.value = resolvedConversationId;
    createSessionRequest({
      mode: 'load',
      assistantCode,
      conversationId: resolvedConversationId,
      conversationName: payload.conversationName,
      sessionData: payload.sessionData,
    });
  } catch (error) {
    if (requestToken === sessionOpenRequestToken) {
      selectedSessionId.value = previousSelectedSessionId;
    }
    console.error('[Main] Failed to load session:', error);
    ElMessage.error(t('mainChat.errors.loadSessionFailed'));
  } finally {
    if (requestToken === sessionOpenRequestToken) {
      activeSessionId.value = '';
    }
    if (isCompactMobile.value) {
      isMobileSidebarOpen.value = false;
    }
  }
};

const hideSessionContextMenu = () => {
  sessionContextMenuVisible.value = false;
  sessionContextMenuTarget.value = null;
};

const openSessionContextMenu = (event, sessionItem) => {
  event.preventDefault();
  event.stopPropagation();
  sessionContextMenuTarget.value = sessionItem;
  sessionContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY,
  };
  sessionContextMenuVisible.value = true;
};

const syncActiveWorkspaceConversationMeta = (conversationId, conversationName = '') => {
  const resolvedConversationId = String(conversationId || '').trim();
  if (!resolvedConversationId) return;
  if (resolvedConversationId !== selectedSessionId.value) return;

  createSessionRequest({
    mode: 'meta',
    assistantCode: selectedAssistantCode.value || '',
    conversationId: resolvedConversationId,
    conversationName: String(conversationName || '').trim(),
  });
};

const renameSessionFromSidebar = async () => {
  const target = sessionContextMenuTarget.value;
  hideSessionContextMenu();

  if (!target?.conversationId) return;

  try {
    if (typeof window.api.renameConversation !== 'function') {
      throw new Error('renameConversation API is unavailable');
    }

    const { value } = await ElMessageBox.prompt(
      t('mainChat.sessionMenu.rename'),
      t('mainChat.sessionMenu.rename'),
      {
        inputValue: target.conversationName || '',
        inputValidator: (nextValue) => {
          if (!nextValue || !String(nextValue).trim()) return '名称不能为空';
          return true;
        },
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    );

    const nextName = String(value || '').trim();
    if (!nextName || nextName === target.conversationName) return;

    await window.api.renameConversation(target.conversationId, nextName);
    syncActiveWorkspaceConversationMeta(target.conversationId, nextName);
    await refreshIndex({ force: true });
    ElMessage.success(t('mainChat.sessionMenu.renameSuccess'));
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    console.error('[Main] Failed to rename session from sidebar:', error);
    ElMessage.error(String(error?.message || error));
  }
};

const regenerateSessionNameFromSidebar = async () => {
  const target = sessionContextMenuTarget.value;
  hideSessionContextMenu();

  if (!target?.conversationId) return;

  const applyFallbackTitle = async () => {
    if (typeof window.api.renameConversation !== 'function') {
      throw new Error('renameConversation API is unavailable');
    }
    await window.api.renameConversation(target.conversationId, '新对话');
    syncActiveWorkspaceConversationMeta(target.conversationId, '新对话');
    await refreshIndex({ force: true });
  };

  try {
    if (
      typeof window.api.getConversation !== 'function' ||
      typeof window.api.generateConversationTitle !== 'function' ||
      typeof window.api.renameConversation !== 'function'
    ) {
      throw new Error('Conversation title APIs are unavailable');
    }

    const conversation = await window.api.getConversation(target.conversationId);
    if (!conversation || typeof conversation !== 'object' || !conversation.sessionData) {
      throw new Error('Conversation session data is unavailable');
    }

    const result = await window.api.generateConversationTitle({
      sessionData: conversation.sessionData,
      language: locale.value,
      fallbackModelKey: String(config.value?.quickModel || ''),
    });

    const title = String(result?.title || '').trim() || '新对话';
    await window.api.renameConversation(target.conversationId, title);
    syncActiveWorkspaceConversationMeta(target.conversationId, title);
    await refreshIndex({ force: true });

    if (result?.ok) {
      ElMessage.success(t('mainChat.sessionMenu.regenerateSuccess'));
    } else {
      ElMessage.warning(t('mainChat.sessionMenu.regenerateFailed'));
    }
  } catch (error) {
    console.error('[Main] Failed to regenerate session title:', error);
    try {
      await applyFallbackTitle();
      ElMessage.warning(t('mainChat.sessionMenu.regenerateFailed'));
    } catch (renameError) {
      console.error('[Main] Failed to apply fallback session title:', renameError);
      ElMessage.error(t('mainChat.sessionMenu.regenerateFailed'));
    }
  }
};

const deleteSessionFromSidebar = async () => {
  const target = sessionContextMenuTarget.value;
  hideSessionContextMenu();

  const conversationId = getSessionConversationId(target);
  if (!conversationId) return;

  try {
    if (typeof window.api.deleteConversations !== 'function') {
      throw new Error('deleteConversations API is unavailable');
    }

    await ElMessageBox.confirm(
      t('chats.confirmDelete', {
        filename: target?.conversationName || conversationId,
      }),
      t('common.warningTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    );

    await window.api.deleteConversations([conversationId]);

    if (conversationId === selectedSessionId.value) {
      const fallbackAssistantCode = String(
        target?.assistantCode || selectedAssistantCode.value || '',
      );
      if (fallbackAssistantCode) {
        startNewSession(fallbackAssistantCode);
      } else {
        selectedSessionId.value = '';
      }
    }

    await refreshIndex({ force: true });
    ElMessage.success(t('common.deleteSuccess'));
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    console.error('[Main] Failed to delete session from sidebar:', error);
    ElMessage.error(String(error?.message || t('common.deleteFailed')));
  }
};

const formatSessionTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

const getAssistantIcon = (assistantCode) => {
  return config.value?.prompts?.[assistantCode]?.icon || '';
};

const openSettingsMode = () => {
  isMobileSidebarOpen.value = true;
  appMode.value = 'settings';
};

const backToChatMode = () => {
  if (isCompactMobile.value) {
    isMobileSidebarOpen.value = false;
  }
  appMode.value = 'chat';
};

const selectSettingsTab = (tabId) => {
  if (tabId === 'back') {
    backToChatMode();
    return;
  }
  settingsTab.value = tabId;
  if (isCompactMobile.value) {
    isMobileSidebarOpen.value = false;
  }
};

const toggleMobileSidebar = () => {
  if (!isCompactMobile.value) return;
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
};

const refreshSessionIndexForSync = (force = true) => {
  if (appMode.value !== 'chat') return;
  refreshIndex({ force }).catch((error) => {
    console.error('[Main] Failed to auto-sync session index:', error);
  });
};

const handleConversationSaved = (payload) => {
  const conversationId = String(payload?.conversationId || '').trim();
  if (
    conversationId &&
    (!selectedSessionId.value ||
      selectedSessionId.value === conversationId ||
      activeSessionId.value === conversationId)
  ) {
    selectedSessionId.value = conversationId;
  }
  refreshSessionIndexForSync(true);
};

const stopSessionAutoSync = () => {
  if (!sessionAutoSyncTimer) return;
  window.clearInterval(sessionAutoSyncTimer);
  sessionAutoSyncTimer = null;
};

const startSessionAutoSync = () => {
  if (sessionAutoSyncTimer) return;
  sessionAutoSyncTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      refreshSessionIndexForSync(true);
    }
  }, SESSION_AUTO_SYNC_INTERVAL_MS);
};

const handleVisibilitySync = () => {
  if (document.visibilityState === 'visible') {
    refreshSessionIndexForSync(true);
  }
};

const handleWindowFocusSync = () => {
  refreshSessionIndexForSync(true);
};

watch(
  enabledAssistants,
  (assistants) => {
    if (!assistants.length) {
      selectedAssistantCode.value = '';
      expandedAssistantCode.value = '';
      selectedSessionId.value = '';
      return;
    }

    const hasSelected = assistants.some((item) => item.code === selectedAssistantCode.value);
    if (!hasSelected) {
      const firstCode = assistants[0].code;
      selectedAssistantCode.value = firstCode;
      expandedAssistantCode.value = firstCode;
      selectedSessionId.value = '';
      createSessionRequest({ mode: 'new', assistantCode: firstCode });
    }
  },
  { immediate: true },
);

watch(sessionContextMenuVisible, (visible) => {
  if (visible) {
    document.addEventListener('click', hideSessionContextMenu);
  } else {
    document.removeEventListener('click', hideSessionContextMenu);
  }
});

watch(appMode, (mode) => {
  if (isCompactMobile.value) {
    isMobileSidebarOpen.value = mode === 'settings';
  } else {
    isMobileSidebarOpen.value = true;
  }

  if (mode === 'chat') {
    refreshSessionIndexForSync(true);
    startSessionAutoSync();
  } else {
    stopSessionAutoSync();
  }
});

watch(
  isCompactMobile,
  (mobile) => {
    isMobileSidebarOpen.value = mobile ? appMode.value === 'settings' : true;
  },
  { immediate: true },
);

const showDocDialog = ref(false);
const docLoading = ref(false);
const currentDocContent = ref('');
const activeDocIndex = ref('0');

const docList = ref([
  { i18nKey: 'doc.titles.chat', file: 'chat_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.ai', file: 'ai_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.mcp', file: 'mcp_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.skill', file: 'skill_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.provider', file: 'provider_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.setting', file: 'setting_doc.md', lastUpdated: null },
]);

let markedParserPromise = null;
const getMarkedParser = async () => {
  if (!markedParserPromise) {
    markedParserPromise = import('marked').then((module) => module.marked);
  }
  return markedParserPromise;
};

const fetchAllDocsMetadata = async () => {
  const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
  const dateRegex = /\*\*文档更新时间：(\d{4})年(\d{1,2})月(\d{1,2})日\*\*/;

  const promises = docList.value.map(async (doc) => {
    try {
      const response = await fetch(`${baseUrl}${doc.file}`);
      if (!response.ok) return;
      const text = await response.text();

      const match = text.match(dateRegex);
      if (match) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        doc.lastUpdated = `${year}/${month}/${day} 00:00:00`;
      }
    } catch (e) {
      console.warn(`Failed to fetch metadata for ${doc.file}`, e);
    }
  });

  await Promise.all(promises);
};

const checkDocHasUpdate = (index) => {
  const doc = docList.value[index];
  if (!doc || !doc.lastUpdated) return false;

  const readMap = config.value?.docReadStatus || {};
  const lastRead = readMap[doc.file];
  if (!lastRead) return true;

  const updateTime = new Date(doc.lastUpdated).getTime();
  const readTime = new Date(lastRead).getTime();

  return updateTime > readTime;
};

const hasAnyUpdate = computed(() => {
  return docList.value.some((_, index) => checkDocHasUpdate(index));
});

const markDocAsRead = async (filename) => {
  if (!config.value) return;
  if (!config.value.docReadStatus) {
    config.value.docReadStatus = {};
  }

  config.value.docReadStatus[filename] = new Date().toISOString();

  try {
    await window.api.saveSetting(
      'docReadStatus',
      JSON.parse(JSON.stringify(config.value.docReadStatus)),
    );
  } catch (e) {
    console.error('保存阅读状态失败:', e);
  }
};

const fetchAndParseDoc = async (filename) => {
  markDocAsRead(filename);

  docLoading.value = true;
  try {
    const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
    const response = await fetch(`${baseUrl}${filename}`);
    if (!response.ok) throw new Error('Network response was not ok');

    let text = await response.text();
    const imgBaseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/image/';

    text = text.replace(
      /!\[(.*?)\]\((\.\.[\\/])?image[\\/](.*?)\)/g,
      (_match, alt, _prefix, imgFile) => {
        return `![${alt}](${imgBaseUrl}${encodeURIComponent(imgFile)})`;
      },
    );

    const markedParser = await getMarkedParser();
    currentDocContent.value = markedParser.parse(text);
  } catch (error) {
    console.error('Failed to load doc:', error);
    currentDocContent.value = `<h3>${t('doc.loadFailed')}</h3><p>${t('doc.checkNetwork')}</p>`;
  } finally {
    docLoading.value = false;
  }
};

watch(activeDocIndex, (newIndex) => {
  const doc = docList.value[newIndex];
  if (doc) {
    fetchAndParseDoc(doc.file);
  }
});

const openHelpDialog = () => {
  showDocDialog.value = true;
  const index = parseInt(activeDocIndex.value) || 0;
  const targetDoc = docList.value[index];
  if (targetDoc) {
    fetchAndParseDoc(targetDoc.file);
  }
};

const handleDocLinks = (event) => {
  const target = event.target.closest('a');
  if (!target) return;

  event.preventDefault();
  const href = target.getAttribute('href');
  if (!href) return;

  if (href.startsWith('http://') || href.startsWith('https://')) {
    if (window.utools && window.utools.shellOpenExternal) {
      window.utools.shellOpenExternal(href);
    } else {
      window.open(href, '_blank');
    }
    return;
  }

  if (href.endsWith('.md')) {
    const filename = href.split(/[\/\\]/).pop();
    const targetIndex = docList.value.findIndex((doc) => doc.file === filename);
    if (targetIndex !== -1) {
      activeDocIndex.value = String(targetIndex);
    }
  }
};

const handleGlobalEsc = (e) => {
  if (e.key !== 'Escape') return;

  const imageViewerCloseBtn = document.querySelector('.el-image-viewer__close');
  if (imageViewerCloseBtn && window.getComputedStyle(imageViewerCloseBtn).display !== 'none') {
    e.stopPropagation();
    imageViewerCloseBtn.click();
    return;
  }

  const overlays = Array.from(document.querySelectorAll('.el-overlay')).filter((el) => {
    return el.style.display !== 'none' && !el.classList.contains('is-hidden');
  });

  if (overlays.length > 0) {
    const topOverlay = overlays.reduce((max, current) => {
      return (parseInt(window.getComputedStyle(current).zIndex) || 0) >
        (parseInt(window.getComputedStyle(max).zIndex) || 0)
        ? current
        : max;
    });

    e.stopPropagation();

    const headerBtn = topOverlay.querySelector('.el-dialog__headerbtn, .el-message-box__headerbtn');
    if (headerBtn) {
      headerBtn.click();
      return;
    }

    const footer = topOverlay.querySelector('.el-dialog__footer, .el-message-box__btns');
    if (footer) {
      const rightBtn = footer.querySelector('.footer-right .el-button');
      if (rightBtn) {
        rightBtn.click();
        return;
      }
      const buttons = footer.querySelectorAll('.el-button');
      if (buttons.length > 0) {
        buttons[0].click();
      }
    }
  }
};

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleSystemThemeChange = (e) => {
  if (config.value?.themeMode === 'system') {
    const isDark = e.matches;
    if (config.value.isDarkMode !== isDark) {
      config.value.isDarkMode = isDark;
      if (window.api && window.api.saveSetting) {
        window.api.saveSetting('isDarkMode', isDark);
      }
    }
  }
};

onMounted(async () => {
  applyMainVibrancyBodyClass();

  try {
    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(storedWidth)) {
      sidebarWidth.value = storedWidth;
    }
  } catch {
    // ignore localStorage failures
  }

  handleViewportResize();
  window.addEventListener('resize', handleViewportResize);
  window.addEventListener('keydown', handleGlobalEsc, true);
  window.addEventListener('focus', handleWindowFocusSync);
  document.addEventListener('visibilitychange', handleVisibilitySync);
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  startSessionAutoSync();

  fetchAllDocsMetadata();

  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
      config.value = Object.assign({}, baseConfig, result.config);
      if (config.value.themeMode === 'system') {
        const systemDark = mediaQuery.matches;
        if (config.value.isDarkMode !== systemDark) {
          config.value.isDarkMode = systemDark;
          window.api.saveSetting('isDarkMode', systemDark);
        }
      }
    } else {
      config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error('Error fetching config in App.vue:', error);
    config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  }

  if (config.value?.isDarkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
});

onBeforeUnmount(() => {
  stopSessionAutoSync();
  stopSidebarResize();
  window.removeEventListener('resize', handleViewportResize);
  window.removeEventListener('keydown', handleGlobalEsc, true);
  window.removeEventListener('focus', handleWindowFocusSync);
  document.removeEventListener('visibilitychange', handleVisibilitySync);
  document.removeEventListener('click', hideSessionContextMenu);
  mediaQuery.removeEventListener('change', handleSystemThemeChange);
  document.documentElement.classList.remove('macos-vibrancy-main');
  document.body?.classList.remove('macos-vibrancy-main');
  document.body?.classList.remove('sidebar-resizing');
});
</script>

<template>
  <div
    class="window-root"
    :class="{
      'native-vibrancy': isMacOS,
      'fallback-vibrancy': !isMacOS,
      'mode-chat': appMode === 'chat',
    }"
    :style="rootInlineStyles"
  >
    <el-container class="common-layout">
      <el-aside class="app-sidebar" :class="{ 'mobile-collapsed': !shouldShowSidebarBody }">
        <div class="sidebar-panel">
          <div
            v-if="appMode === 'chat'"
            class="sidebar-top-row"
            :class="{ 'window-drag-region': isMacOS }"
          >
            <div class="chat-top-actions no-drag">
              <button
                v-if="isCompactMobile"
                type="button"
                class="mobile-toggle-btn rounded-action-btn"
                @click="toggleMobileSidebar"
              >
                {{
                  shouldShowSidebarBody
                    ? t('mainChat.actions.hideSidebar')
                    : t('mainChat.actions.showSidebar')
                }}
              </button>
            </div>

            <el-tooltip :content="t('app.header.help') || '使用指南'" placement="right">
              <el-button class="help-button no-drag" text @click="openHelpDialog">
                <el-badge :is-dot="hasAnyUpdate" class="bell-badge">
                  <el-icon :size="18"><Bell /></el-icon>
                </el-badge>
              </el-button>
            </el-tooltip>
          </div>

          <template v-if="appMode === 'chat'">
            <div v-show="shouldShowSidebarBody" class="assistant-sidebar no-drag">
              <draggable
                v-model="localAssistantOrder"
                item-key="code"
                class="assistant-sidebar-draggable"
                :class="{
                  'is-sort-enabled': canDragAssistantsReorder,
                  'is-assistant-dragging': isAssistantOrderDragging,
                }"
                :animation="250"
                ghost-class="provider-drag-ghost"
                :force-fallback="true"
                fallback-class="provider-drag-fallback"
                :fallback-on-body="true"
                :disabled="!canDragAssistantsReorder"
                @start="handleAssistantSortStart"
                @end="handleAssistantSortEnd"
              >
                <template #item="{ element: assistant }">
                  <div
                    class="assistant-group"
                    :class="{ active: selectedAssistantCode === assistant.code }"
                  >
                    <div
                      class="assistant-row"
                      role="button"
                      tabindex="0"
                      @click="handleAssistantRowClick(assistant.code)"
                      @keydown.enter.prevent="toggleAssistantExpand(assistant.code)"
                      @keydown.space.prevent="toggleAssistantExpand(assistant.code)"
                    >
                      <span class="assistant-folder">
                        <FolderOpen v-if="expandedAssistantCode === assistant.code" :size="14" />
                        <FolderMinus v-else :size="14" />
                      </span>

                      <span class="assistant-name" :title="assistant.code">{{
                        assistant.code
                      }}</span>
                      <button
                        type="button"
                        class="assistant-new-session-btn"
                        :title="t('mainChat.actions.newConversation')"
                        :aria-label="t('mainChat.actions.newConversation')"
                        @click.stop="startNewSession(assistant.code)"
                        @keydown.enter.stop.prevent="startNewSession(assistant.code)"
                        @keydown.space.stop.prevent="startNewSession(assistant.code)"
                      >
                        <SquarePen :size="13" />
                      </button>
                    </div>

                    <Transition
                      name="assistant-sessions-collapse"
                      :css="false"
                      @before-enter="onAssistantSessionsBeforeEnter"
                      @enter="onAssistantSessionsEnter"
                      @leave="onAssistantSessionsLeave"
                      @enter-cancelled="onAssistantSessionsEnterCancelled"
                      @leave-cancelled="onAssistantSessionsLeaveCancelled"
                    >
                      <div
                        v-if="expandedAssistantCode === assistant.code"
                        class="assistant-sessions-collapse"
                      >
                        <div class="assistant-sessions">
                          <button
                            v-for="session in sessionMap[assistant.code] || []"
                            :key="session.id"
                            type="button"
                            class="assistant-row session-item"
                            :class="{
                              'is-loading': activeSessionId === session.id,
                              'is-selected':
                                selectedSessionId === (session.conversationId || session.id),
                            }"
                            :title="`${formatSessionTime(session.lastmod)}${
                              session.preview ? ` · ${session.preview}` : ''
                            }`"
                            @click="openHistorySession(session)"
                            @contextmenu.prevent.stop="openSessionContextMenu($event, session)"
                          >
                            <span
                              class="assistant-name session-name"
                              :title="session.conversationName"
                              >{{ session.conversationName }}</span
                            >
                          </button>

                          <div
                            v-if="(sessionMap[assistant.code] || []).length === 0"
                            class="assistant-empty-sessions"
                          >
                            {{ t('mainChat.empty.assistantSessions') }}
                          </div>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </template>
              </draggable>

              <div v-if="enabledAssistants.length === 0" class="assistant-empty-state">
                {{ t('mainChat.empty.assistants') }}
              </div>

              <div v-if="sessionIndexError" class="assistant-error">
                {{ t('mainChat.errors.indexFailed') }}: {{ sessionIndexError }}
              </div>
            </div>

            <div v-show="shouldShowSidebarBody" class="sidebar-nav-item no-drag">
              <button type="button" class="nav-item" @click="openSettingsMode">
                <el-icon class="nav-icon"><SettingIcon /></el-icon>
                <span class="nav-label">{{ t('mainSettings.entry') }}</span>
              </button>
            </div>
          </template>

          <template v-else>
            <div class="sidebar-top-row" :class="{ 'window-drag-region': isMacOS }"></div>
            <nav v-show="shouldShowSidebarBody" class="sidebar-nav no-drag">
              <button
                v-for="item in settingsNavItems"
                :key="item.id"
                type="button"
                class="nav-item"
                @click="selectSettingsTab(item.id)"
                :class="{ 'active-tab': settingsTab === item.id && item.id !== 'back' }"
              >
                <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
                <span class="nav-label">{{ item.label }}</span>
              </button>
            </nav>
          </template>
        </div>
      </el-aside>

      <div
        v-if="isSidebarResizable"
        class="sidebar-resize-handle no-drag"
        :class="{ 'is-resizing': isSidebarResizing }"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar width"
        :aria-valuemin="SIDEBAR_MIN_WIDTH"
        :aria-valuemax="sidebarMaxWidth"
        :aria-valuenow="sidebarWidth"
        tabindex="0"
        @mousedown="startSidebarResize"
        @keydown.left.prevent="nudgeSidebarWidth(-SIDEBAR_KEYBOARD_STEP)"
        @keydown.right.prevent="nudgeSidebarWidth(SIDEBAR_KEYBOARD_STEP)"
      ></div>

      <el-main class="workspace-main" v-if="config">
        <div v-show="appMode === 'chat'" class="workspace-content chat-workspace-content">
          <MainChatWorkspace
            ref="chatWorkspaceRef"
            :assistant-code="selectedAssistantCode"
            :session-load-request="sessionLoadRequest"
            @conversation-saved="handleConversationSaved"
          />
        </div>

        <template v-if="appMode !== 'chat'">
          <header class="workspace-header" :class="{ 'window-drag-region': isMacOS }">
            <el-text class="header-title-text">{{ settingsHeaderText }}</el-text>
          </header>
          <div class="workspace-content settings-workspace-content">
            <Chats v-if="settingsTab === 'history'" key="history" />
            <Prompts v-if="settingsTab === 'prompts'" key="prompts" />
            <Mcp v-if="settingsTab === 'mcp'" key="mcp" />
            <Skills v-if="settingsTab === 'skills'" key="skills" />
            <Providers v-if="settingsTab === 'providers'" key="providers" />
            <DefaultModel v-if="settingsTab === 'defaultModel'" key="defaultModel" />
            <Setting v-if="settingsTab === 'system'" key="system" />
          </div>
        </template>
      </el-main>

      <teleport to="body">
        <div
          v-if="sessionContextMenuVisible"
          class="session-context-menu"
          :style="{
            left: `${sessionContextMenuPosition.x}px`,
            top: `${sessionContextMenuPosition.y}px`,
          }"
        >
          <div class="session-context-item" @click="renameSessionFromSidebar">
            <el-icon class="session-context-icon"><EditIcon /></el-icon>
            <span>{{ t('mainChat.sessionMenu.rename') }}</span>
          </div>
          <div class="session-context-item" @click="regenerateSessionNameFromSidebar">
            <el-icon class="session-context-icon"><MagicStick /></el-icon>
            <span>{{ t('mainChat.sessionMenu.regenerate') }}</span>
          </div>
          <div class="session-context-item" @click="deleteSessionFromSidebar">
            <el-icon class="session-context-icon"><DeleteIcon /></el-icon>
            <span>{{ t('common.delete') }}</span>
          </div>
        </div>
      </teleport>

      <el-dialog
        v-model="showDocDialog"
        :title="t('doc.title')"
        width="80%"
        :lock-scroll="false"
        class="doc-dialog"
        append-to-body
      >
        <div class="doc-container">
          <div class="doc-sidebar">
            <el-menu
              :default-active="activeDocIndex"
              @select="(index) => (activeDocIndex = index)"
              class="doc-menu"
            >
              <el-menu-item v-for="(doc, index) in docList" :key="index" :index="String(index)">
                <el-icon><Document /></el-icon>
                <span class="menu-item-text">
                  {{ t(doc.i18nKey) }}
                  <span v-if="checkDocHasUpdate(index)" class="doc-update-dot"></span>
                </span>
              </el-menu-item>
            </el-menu>
          </div>
          <div class="doc-content" v-loading="docLoading" :element-loading-text="t('doc.loading')">
            <el-scrollbar height="60vh">
              <div class="markdown-body" v-html="currentDocContent" @click="handleDocLinks"></div>
            </el-scrollbar>
          </div>
        </div>
      </el-dialog>
    </el-container>
  </div>
</template>

<style scoped>
:global(html.macos-vibrancy-main),
:global(body.macos-vibrancy-main),
:global(html.macos-vibrancy-main #app) {
  background: transparent !important;
}

:global(body.sidebar-resizing),
:global(body.sidebar-resizing *) {
  user-select: none !important;
  cursor: col-resize !important;
}

.window-root {
  --layout-shell-bg: rgba(245, 244, 243, 0.9);
  --workspace-surface-bg: #ffffff;
  --workspace-edge-color: color-mix(in srgb, var(--border-primary) 55%, transparent);
  --sidebar-vibrancy-tint: rgba(255, 255, 255, 0.1);
  --sidebar-fallback-tint: rgba(247, 246, 244, 0.62);
  --sidebar-vibrancy-divider: color-mix(in srgb, var(--border-primary) 62%, transparent);
  --sidebar-region-width: 286px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--layout-shell-bg);
}

.window-root.native-vibrancy {
  --layout-shell-bg: transparent;
}

.window-root.fallback-vibrancy {
  --layout-shell-bg: #f1efec;
  --workspace-surface-bg: #fcfcfb;
  --sidebar-fallback-tint: rgba(238, 235, 231, 0.86);
}

.window-drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.common-layout,
.el-container {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  gap: 0;
  overflow: hidden;
  background-color: var(--layout-shell-bg);
  display: flex;
  flex-direction: row;
}

.window-root.native-vibrancy .common-layout::before,
.window-root.fallback-vibrancy .common-layout::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: calc(var(--sidebar-region-width) + var(--radius-xl));
  pointer-events: none;
  z-index: 0;
}

.window-root.native-vibrancy .common-layout::before {
  background-color: var(--sidebar-vibrancy-tint);
  box-shadow: none;
}

.window-root.fallback-vibrancy .common-layout::before {
  background-color: var(--sidebar-fallback-tint);
  backdrop-filter: blur(20px) saturate(125%);
  -webkit-backdrop-filter: blur(20px) saturate(125%);
  box-shadow: none;
}

.app-sidebar {
  --el-aside-width: var(--sidebar-region-width);
  width: var(--sidebar-region-width);
  min-width: var(--sidebar-region-width);
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
  margin-right: 0;
  background-color: transparent;
}

.sidebar-panel {
  height: 100%;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: transparent;
}

.sidebar-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 2px 4px 8px;
}

.chat-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mobile-toggle-btn {
  height: 30px;
  padding: 0 10px;
  border: none;
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.help-button {
  width: 32px;
  height: 32px;
  color: var(--text-secondary);
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  box-shadow: none !important;
  transition: background-color 0.18s ease;
}

.help-button:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62) !important;
}

.assistant-sidebar {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 2px 4px;
}

.assistant-sidebar-draggable {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assistant-sidebar-draggable.is-sort-enabled .assistant-row {
  cursor: move;
}

.assistant-group {
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}

.assistant-group.active {
  background-color: rgba(255, 255, 255, 0.52);
}

.assistant-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  min-height: 38px;
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  outline: none;
}

.assistant-row:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62);
}

.assistant-sidebar-draggable.is-assistant-dragging .assistant-row:hover,
.assistant-sidebar-draggable.is-assistant-dragging .assistant-row:focus-visible {
  color: var(--text-secondary);
  background-color: transparent;
}

.provider-drag-ghost {
  opacity: 0 !important;
  transition: none !important;
}

:global(.provider-drag-fallback) {
  opacity: 1 !important;
  background-color: var(--bg-accent-light) !important;
  border-radius: var(--radius-md) !important;
  box-shadow:
    0 8px 24px -4px rgba(0, 0, 0, 0.12),
    0 2px 6px -1px rgba(0, 0, 0, 0.05) !important;
  z-index: 9999 !important;
  transition: box-shadow 0.2s ease !important;
}

:global(html.dark .provider-drag-fallback) {
  background-color: var(--bg-accent-light) !important;
  box-shadow:
    0 8px 24px -4px rgba(0, 0, 0, 0.5),
    0 2px 6px -1px rgba(0, 0, 0, 0.25) !important;
}

.assistant-row:focus-visible {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62);
}

.assistant-folder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.assistant-icon {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: cover;
}

.assistant-icon-fallback {
  background: color-mix(in srgb, var(--bg-tertiary) 80%, transparent);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.assistant-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.assistant-new-session-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  color: var(--text-tertiary);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    color 0.16s ease,
    background-color 0.16s ease;
}

.assistant-row:hover .assistant-new-session-btn,
.assistant-row:focus-within .assistant-new-session-btn {
  opacity: 1;
  pointer-events: auto;
}

.assistant-new-session-btn:hover {
  color: var(--text-primary);
  background-color: color-mix(in srgb, var(--bg-tertiary) 84%, transparent);
}

.assistant-new-session-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
  color: var(--text-primary);
  background-color: color-mix(in srgb, var(--bg-tertiary) 84%, transparent);
  outline: 2px solid color-mix(in srgb, var(--text-accent) 45%, transparent);
  outline-offset: 1px;
}

.assistant-sessions {
  margin-top: 2px;
  padding: 0 4px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.assistant-sessions-collapse {
  height: auto;
  overflow: hidden;
}

.assistant-sessions-collapse > .assistant-sessions {
  min-height: 0;
}

.session-item {
  min-height: 34px;
  grid-template-columns: 1fr auto;
  padding: 7px 10px;
}

.session-item.is-loading {
  opacity: 0.65;
  pointer-events: none;
}

.session-item.is-selected {
  color: var(--text-primary);
  background-color: color-mix(in srgb, var(--bg-tertiary) 84%, transparent);
}

.session-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}

.session-context-menu {
  position: fixed;
  z-index: 9999;
  border-radius: var(--radius-lg) !important;
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent) !important;
  box-shadow:
    var(--shadow-lg),
    0 0 0 1px var(--border-primary) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden !important;
  padding: 6px !important;
  min-width: 170px;
}

.session-context-item {
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

html.dark .session-context-item:hover {
  background-color: #3d3d3d !important;
}

html:not(.dark) .session-context-item:hover {
  background-color: var(--bg-tertiary);
}

.session-context-icon {
  width: 16px;
  height: 16px;
}

.assistant-empty-sessions,
.assistant-empty-state,
.assistant-error {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 6px 10px;
}

.assistant-error {
  color: #cf5c5c;
}

.sidebar-nav-item {
  padding-top: 6px;
}

.sidebar-nav-item .nav-item {
  width: 100%;
  height: 40px;
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background-color: transparent;
  cursor: pointer;
  appearance: none;
  text-align: left;
  font: inherit;
  color: var(--text-secondary);
  transition: all 0.18s ease;
}

.sidebar-nav-item .nav-item:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.nav-item {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background-color: transparent;
  cursor: pointer;
  appearance: none;
  text-align: left;
  font: inherit;
  color: var(--text-secondary);
  transition: all 0.18s ease;
}

.nav-item:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62);
}

.nav-item.active-tab {
  color: var(--text-primary);
  border-color: transparent;
  background-color: #eae9e8;
  box-shadow: none;
}

.nav-icon {
  font-size: 16px;
  width: 18px;
  min-width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--sidebar-region-width);
  width: 12px;
  transform: translateX(-50%);
  z-index: 3;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: col-resize;
}

.sidebar-resize-handle:focus,
.sidebar-resize-handle:focus-visible {
  outline: none;
  box-shadow: none;
}

.sidebar-resize-handle::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background-color: color-mix(in srgb, var(--border-primary) 78%, transparent);
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sidebar-resize-handle:hover::before,
.sidebar-resize-handle.is-resizing::before {
  background-color: color-mix(in srgb, var(--text-accent) 74%, transparent);
  box-shadow: none;
}

.sidebar-resize-handle:focus-visible::before {
  background-color: color-mix(in srgb, var(--text-accent) 74%, transparent);
  box-shadow: none;
}

.workspace-main {
  padding: 0;
  margin: 0;
  overflow: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  border-radius: var(--radius-xl);
  border: none;
  box-shadow:
    inset 0 1px 0 var(--workspace-edge-color),
    inset -1px 0 0 var(--workspace-edge-color),
    inset 0 -1px 0 var(--workspace-edge-color);
  background-color: var(--workspace-surface-bg);
}

.workspace-header {
  padding: 20px 24px 12px;
  flex-shrink: 0;
  background-color: var(--workspace-surface-bg);
}

.header-title-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  background-color: var(--workspace-surface-bg);
}

.chat-workspace-content {
  padding: 0;
  overflow: hidden;
}

.chat-workspace-content :deep(main) {
  height: 100%;
}

.chat-workspace-content :deep(.app-container) {
  border: none;
  box-shadow: none;
  border-radius: 0;
}

.chat-workspace-content :deep(.model-header) {
  height: 54px !important;
  padding: 13px 10px 0 !important;
}

.chat-workspace-content :deep(.chat-main) {
  padding: 4px 20px 20px !important;
}

.chat-workspace-content :deep(.input-footer) {
  padding: 8px 20px 20px !important;
}

.settings-workspace-content {
  padding-top: 0;
}

.doc-container {
  display: flex;
  min-height: 60vh;
}

.doc-sidebar {
  width: 240px;
  border-right: 1px solid var(--border-primary);
  background-color: var(--bg-secondary);
}

.doc-content {
  flex: 1;
  padding: 12px 16px;
  background-color: var(--bg-primary);
}

.doc-menu {
  border-right: none;
  background-color: transparent;
}

.menu-item-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.doc-update-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--text-accent);
}

.markdown-body :deep(a) {
  color: var(--text-accent);
}

html.dark .help-button,
html.dark .nav-item,
html.dark .sidebar-nav-item .nav-item,
html.dark .mobile-toggle-btn,
html.dark .assistant-row {
  color: #bfbcb8;
}

html.dark .help-button:hover,
html.dark .nav-item:hover,
html.dark .sidebar-nav-item .nav-item:hover,
html.dark .mobile-toggle-btn:hover,
html.dark .assistant-row:hover {
  color: #efede9;
  background-color: rgba(255, 255, 255, 0.08);
}

html.dark .assistant-sidebar-draggable.is-assistant-dragging .assistant-row:hover,
html.dark .assistant-sidebar-draggable.is-assistant-dragging .assistant-row:focus-visible {
  color: #bfbcb8;
  background-color: transparent;
}

html.dark .nav-item.active-tab {
  color: #f7f4ef;
  background-color: rgba(255, 255, 255, 0.14);
}

html.dark .assistant-group.active {
  background-color: rgba(255, 255, 255, 0.08);
}

html.dark .session-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

html.dark .session-item.is-selected {
  color: #f4f1ed;
  background: rgba(255, 255, 255, 0.14);
}

html.dark .window-root {
  --layout-shell-bg: #1a1b1d;
  --workspace-surface-bg: #181818;
  --sidebar-vibrancy-divider: rgba(255, 255, 255, 0.07);
  --workspace-edge-color: rgba(6, 8, 11, 0.88);
}

html.dark .window-root.native-vibrancy {
  --layout-shell-bg: transparent;
  --sidebar-vibrancy-tint: rgba(30, 30, 32, 0.28);
}

html.dark .window-root.fallback-vibrancy {
  --layout-shell-bg: #191b1e;
  --workspace-surface-bg: #181818;
  --sidebar-fallback-tint: rgba(44, 42, 42, 0.92);
}

@media (max-width: 900px) {
  .assistant-sessions {
    padding-left: 32px;
  }
}

@media (max-width: 760px) {
  .window-root {
    --sidebar-region-width: 100%;
  }

  .common-layout,
  .el-container {
    flex-direction: column;
    padding: 0;
  }

  .window-root.native-vibrancy .common-layout::before,
  .window-root.fallback-vibrancy .common-layout::before {
    display: none;
  }

  .app-sidebar {
    --el-aside-width: 100%;
    width: 100%;
    min-width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(227, 224, 221, 0.9);
    margin-right: 0;
    margin-bottom: 0;
  }

  .sidebar-panel {
    height: auto;
    max-height: 52vh;
  }

  .workspace-main {
    border: none;
    box-shadow: none;
    border-radius: 0;
  }

  .workspace-header {
    padding: 14px 14px 12px;
  }

  .doc-container {
    flex-direction: column;
  }

  .doc-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-primary);
  }

  html.dark .app-sidebar {
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }
}

@media (max-width: 700px) {
  .app-sidebar.mobile-collapsed .sidebar-panel {
    max-height: 54px;
    overflow: hidden;
  }

  .mobile-toggle-btn {
    font-size: 11px;
    padding: 0 8px;
  }
}
</style>
