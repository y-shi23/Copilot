<script setup lang="ts">
// -nocheck
import {
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
  computed,
  defineAsyncComponent,
} from 'vue';
import { ElContainer, ElMain } from 'element-plus';

import TitleBar from './components/TitleBar.vue';
import ChatHeader from './components/ChatHeader.vue';
const ChatMessage = defineAsyncComponent(() => import('./components/ChatMessage.vue'));
import MessageAnchorLine from './components/navigation/MessageAnchorLine.vue';
import ChatInput from './components/ChatInput.vue';
import ImageViewerOverlay from './components/ImageViewerOverlay.vue';
import McpDialog from './components/McpDialog.vue';
import ModelSelectionDialog from './components/ModelSelectionDialog.vue';
import SkillDialog from './components/SkillDialog.vue';
import SystemPromptDialog from './components/SystemPromptDialog.vue';

import TextSearchUI from './utils/TextSearchUI';
import { createDismissibleMessage } from './utils/dismissibleMessage';
import { getMessagePreviewText } from './utils/messagePreview';
import { getDisplayTypeName } from './utils/mcpType';
import { buildMessageSignature } from './utils/sessionSignature';
import { useAskAi } from './composables/useAskAi';
import { useAutoSave } from './composables/useAutoSave';
import { useChatMessageActions } from './composables/useChatMessageActions';
import { useChatViewport } from './composables/useChatViewport';
import { useConversationMessageStore } from './composables/useConversationMessageStore';
import { useConversationPersistenceCoordinator } from './composables/useConversationPersistenceCoordinator';
import { useFileHandlers } from './composables/useFileHandlers';
import { useMcpSkillManager } from './composables/useMcpSkillManager';
import { usePromptModelSettings } from './composables/usePromptModelSettings';
import { useSessionPersistence } from './composables/useSessionPersistence';
import { useWindowInteractionHandlers } from './composables/useWindowInteractionHandlers';
import { useWindowInitialization } from './composables/useWindowInitialization';

const showDismissibleMessage = createDismissibleMessage();

const handleMinimize = () => window.api.windowControl('minimize-window');
const handleMaximize = () => window.api.windowControl('maximize-window');
const handleCloseWindow = () => closePage();

const chatInputRef = ref(null);
const lastSelectionStart = ref(null);
const lastSelectionEnd = ref(null);
const chatContainerRef = ref(null);

const isSessionDirty = ref(false);
const hasSessionInitialized = ref(false);

let textSearchInstance = null;

const urlParams = new URLSearchParams(window.location.search);
const isDarkInit = urlParams.get('dark') === '1';
if (isDarkInit) {
  document.documentElement.classList.add('dark');
}

const defaultConfig = window.api.defaultConfig;
const UserAvart = ref('user.png');
const AIAvart = ref('ai.svg');
const favicon = ref('favicon.png');
const CODE = ref('');

const isInit = ref(false);
const isFilePickerOpen = ref(false); // 标记文件选择器是否打开
const basic_msg = ref({ os: 'macos', code: 'AI', type: 'over', payload: '请简洁地介绍一下你自己' });
const initialConfigData = JSON.parse(JSON.stringify(defaultConfig.config));
if (isDarkInit) {
  initialConfigData.isDarkMode = true;
}
const currentConfig = ref(initialConfigData);
const autoCloseOnBlur = ref(false);
const modelList = ref([]);
const modelMap = ref({});
const model = ref('');
const isAlwaysOnTop = ref(true);
const platformName = String(
  navigator.userAgentData?.platform || navigator.platform || '',
).toLowerCase();
const currentOS = ref(
  platformName.includes('mac') ? 'macos' : platformName.includes('win') ? 'win' : 'linux',
);
const isNativeMacVibrancy = computed(() => currentOS.value === 'macos');

const applyWindowVibrancyBodyClass = () => {
  const enableNativeVibrancy = isNativeMacVibrancy.value;
  document.documentElement.classList.toggle('mac-native-vibrancy', enableNativeVibrancy);
  document.body?.classList.toggle('mac-native-vibrancy', enableNativeVibrancy);
};

watch(
  isNativeMacVibrancy,
  () => {
    applyWindowVibrancyBodyClass();
  },
  { immediate: true },
);

const currentProviderID = ref(defaultConfig.config.providerOrder[0]);
const base_url = ref('');
const api_key = ref('');
const history = ref([]);
const chat_show = ref([]);
const loading = ref(false);
const prompt = ref('');
const signalController = ref(null);
const fileList = ref([]);
const zoomLevel = ref(1);
const collapsedMessages = ref(new Set());
const defaultConversationName = ref('');
const currentConversationId = ref('');
const selectedVoice = ref(null);
const tempReasoningEffort = ref('default');
const messageIdCounter = ref(0);
const messageStore = useConversationMessageStore({
  historyRef: history,
  chatShowRef: chat_show,
  messageIdCounter,
});
const sourcePromptConfig = ref(null);
const cachedBackgroundBlobUrl = ref('');

const windowBackgroundImage = computed(() => {
  if (cachedBackgroundBlobUrl.value) {
    return cachedBackgroundBlobUrl.value;
  }
  if (!CODE.value || !currentConfig.value?.prompts) return '';
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundImage || '';
});

const windowBackgroundOpacity = computed(() => {
  if (!CODE.value || !currentConfig.value?.prompts) return 0.5;
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundOpacity ?? 0.5;
});

const windowBackgroundBlur = computed(() => {
  if (!CODE.value || !currentConfig.value?.prompts) return 0;
  const promptConfig = currentConfig.value.prompts[CODE.value];
  return promptConfig?.backgroundBlur ?? 0;
});

const loadBackground = async (newUrl) => {
  if (!newUrl) {
    if (cachedBackgroundBlobUrl.value) {
      if (cachedBackgroundBlobUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBackgroundBlobUrl.value);
      }
      cachedBackgroundBlobUrl.value = '';
    }
    return;
  }
  if (newUrl.startsWith('data:') || newUrl.startsWith('file:')) return;

  try {
    const buffer = await window.api.getCachedBackgroundImage(newUrl);
    if (buffer) {
      const blob = new Blob([buffer]);
      const newBlobUrl = URL.createObjectURL(blob);
      if (cachedBackgroundBlobUrl.value && cachedBackgroundBlobUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBackgroundBlobUrl.value);
      }
      cachedBackgroundBlobUrl.value = newBlobUrl;
    } else {
      console.log(`[Background] Cache miss, downloading in background: ${newUrl}`);
      window.api.cacheBackgroundImage(newUrl);
    }
  } catch (e) {
    console.error('Failed to load cached background:', e);
  }
};

watch(
  () => {
    if (!CODE.value || !currentConfig.value?.prompts) return null;
    return currentConfig.value.prompts[CODE.value]?.backgroundImage;
  },
  async (newUrl) => {
    await loadBackground(newUrl);
  },
  { immediate: false },
);

const inputLayout = computed(() => currentConfig.value.inputLayout || 'horizontal');
const currentSystemPrompt = ref('');

const changeModel_page = ref(false);
const systemPromptDialogVisible = ref(false);
const systemPromptContent = ref('');
const imageViewerVisible = ref(false);
const imageViewerSrcList = ref([]);
const imageViewerInitialIndex = ref(0);

const {
  isAtBottom,
  showScrollToBottomButton,
  focusedMessageIndex,
  activeOutlineMessageId,
  isSticky,
  messageRefs,
  setMessageRef,
  getMessageComponentById,
  focusedMessageId,
  scrollToBottom,
  forceScrollToBottom,
  handleScroll,
  scheduleCodeBlockEnhancement,
  handleMarkdownImageClick,
  handleWheel,
  attachChatDomObserver,
  detachChatDomObserver,
  navMessages,
  scrollToMessageById,
} = useChatViewport({
  chatShow: chat_show,
  chatContainerRef,
  showDismissibleMessage,
  zoomLevel,
  currentConfig,
  imageViewerVisible,
  imageViewerSrcList,
  imageViewerInitialIndex,
});

const toolCallControllers = ref(new Map());
const isAutoApproveTools = ref(true);
const pendingToolApprovals = ref(new Map());

const handleToolApproval = (toolCallId, isApproved) => {
  const resolver = pendingToolApprovals.value.get(toolCallId);
  if (resolver) {
    resolver(isApproved);
    pendingToolApprovals.value.delete(toolCallId);
  }
};
const handleToggleAutoApprove = (val) => {
  isAutoApproveTools.value = val;

  if (val) {
    pendingToolApprovals.value.forEach((resolve) => {
      resolve(true);
    });
    pendingToolApprovals.value.clear();

    chat_show.value.forEach((msg) => {
      if (msg.tool_calls) {
        msg.tool_calls.forEach((tc) => {
          if (tc.approvalStatus === 'waiting') {
            tc.approvalStatus = 'approved';
          }
        });
      }
    });
  }
};
const {
  isMcpDialogVisible,
  sessionMcpServerIds,
  openaiFormattedTools,
  mcpSearchQuery,
  isMcpLoading,
  mcpFilter,
  mcpToolCache,
  expandedMcpServers,
  tempSessionMcpServerIds,
  toggleMcpServerExpansion,
  handleMcpToolStatusChange,
  getToolCounts,
  isMcpActive,
  mcpConnectionCount,
  availableMcpServers,
  filteredMcpServers,
  isSkillDialogVisible,
  sessionSkillIds,
  tempSessionSkillIds,
  allSkillsList,
  skillSearchQuery,
  skillFilter,
  filteredSkillsList,
  selectAllSkills,
  clearSkills,
  toggleSkillDialog,
  fetchSkillsList,
  handleQuickSkillToggle,
  handleSkillForkToggle,
  toggleSkillSelection,
  handleSkillSelectionConfirm,
  applyMcpTools,
  clearMcpTools,
  selectAllMcpServers,
  toggleMcpDialog,
  toggleMcpPersistence,
  toggleMcpServerSelection,
  handleQuickMcpToggle,
} = useMcpSkillManager({
  currentConfig,
  showDismissibleMessage,
  getDisplayTypeName,
});

const { persistConversation, syncConversationMeta, markSnapshotPersisted } =
  useConversationPersistenceCoordinator({
    refs: {
      CODE,
      defaultConversationName,
      currentConversationId,
      isSessionDirty,
    },
    getSessionDataAsObject: () => ({
      anywhere_history: true,
      conversationId: currentConversationId.value || '',
      conversationName: defaultConversationName.value || '',
      CODE: CODE.value,
      basic_msg: basic_msg.value,
      isInit: isInit.value,
      autoCloseOnBlur: autoCloseOnBlur.value,
      model: model.value,
      currentPromptConfig: currentConfig.value.prompts[CODE.value] || {},
      history: messageStore.sessionSnapshot.value?.history || [],
      chat_show: messageStore.sessionSnapshot.value?.chat_show || [],
      selectedVoice: selectedVoice.value,
      activeMcpServerIds: sessionMcpServerIds.value || [],
      activeSkillIds: sessionSkillIds.value || [],
      isAutoApproveTools: isAutoApproveTools.value,
    }),
  });

const isCollapsed = (index) => collapsedMessages.value.has(index);
const resolveVisibleIndexById = (messageId) =>
  chat_show.value.findIndex((msg) => String(msg?.id) === String(messageId));

const handleSaveWindowSize = () => saveWindowSize();
const handleTogglePin = () => {
  autoCloseOnBlur.value = !autoCloseOnBlur.value;
  if (autoCloseOnBlur.value) window.addEventListener('blur', closePage);
  else window.removeEventListener('blur', closePage);
};
const handleToggleAlwaysOnTop = () => {
  window.api.toggleAlwaysOnTop();
};
const handleSaveSession = () => handleSaveAction();
const handleDeleteMessage = (messageId) => deleteMessage(messageId);
const handleCopyText = (content, messageId) => copyText(content, messageId);
const handleReAsk = (messageId) => reaskAI(messageId);
const handleToggleCollapse = async (messageId, event) => {
  const index = resolveVisibleIndexById(messageId);
  if (index === -1) return;
  const chatContainer = chatContainerRef.value?.$el;
  const buttonElement = event.currentTarget;
  const messageElement = buttonElement.closest('.chat-message');
  if (!chatContainer || !buttonElement || !messageElement) return;
  const originalScrollTop = chatContainer.scrollTop;
  const isExpanding = isCollapsed(index);
  if (isExpanding) {
    const originalElementTop = messageElement.offsetTop;
    const originalVisualPosition = originalElementTop - originalScrollTop;
    collapsedMessages.value.delete(index);
    await nextTick();
    const newElementTop = messageElement.offsetTop;
    chatContainer.style.scrollBehavior = 'auto';
    chatContainer.scrollTop = newElementTop - originalVisualPosition;
    chatContainer.style.scrollBehavior = 'smooth';
  } else {
    const originalButtonTop = buttonElement.getBoundingClientRect().top;
    collapsedMessages.value.add(index);
    await nextTick();
    const newButtonTop = buttonElement.getBoundingClientRect().top;
    chatContainer.style.scrollBehavior = 'auto';
    chatContainer.scrollTop = originalScrollTop + (newButtonTop - originalButtonTop);
    chatContainer.style.scrollBehavior = 'smooth';
  }
};
const onAvatarClick = async (role, event) => {
  const chatContainer = chatContainerRef.value?.$el;
  const messageElement = event.currentTarget.closest('.chat-message');
  if (!chatContainer || !messageElement) return;
  const originalScrollTop = chatContainer.scrollTop;
  const originalElementTop = messageElement.offsetTop;
  const originalVisualPosition = originalElementTop - originalScrollTop;
  const roleMessageIndices = chat_show.value
    .map((msg, index) => (msg.role === role ? index : -1))
    .filter((index) => index !== -1);
  if (roleMessageIndices.length === 0) return;
  const anyExpanded = roleMessageIndices.some((index) => !collapsedMessages.value.has(index));
  if (anyExpanded) roleMessageIndices.forEach((index) => collapsedMessages.value.add(index));
  else roleMessageIndices.forEach((index) => collapsedMessages.value.delete(index));
  await nextTick();
  const newElementTop = messageElement.offsetTop;
  chatContainer.style.scrollBehavior = 'auto';
  chatContainer.scrollTop = newElementTop - originalVisualPosition;
  chatContainer.style.scrollBehavior = 'smooth';
};

const handleSubmit = () => askAI(false);
const handleCancel = () => cancelAskAI();
const handleClearHistory = () => clearHistory();
const handleRemoveFile = (index) => fileList.value.splice(index, 1);
const handleUpload = async ({ fileList: newFiles }) => {
  for (const file of newFiles) await file2fileList(file, fileList.value.length + 1);
  chatInputRef.value?.focus({ cursor: 'end' });
};
const handleOpenMcpDialog = () => toggleMcpDialog();

const handleSendAudio = async (audioFile) => {
  fileList.value = [];
  await file2fileList(audioFile, 0);
  await askAI(false);
};

const closePage = async () => {
  // 1. 如果是为了打开文件选择器而失去焦点，拦截关闭
  if (isFilePickerOpen.value) return;

  if (hasSessionInitialized.value) {
    try {
      await flushAutoSave(true);
    } catch (e) {
      console.error('关闭时自动保存失败:', e);
    }
  }

  // 3. 关闭窗口
  // window.close();
  window.api.windowControl('close-window');
};

const handlePickFileStart = () => {
  isFilePickerOpen.value = true;
};

const lastMessageSignature = computed(() => {
  const lastMessage = chat_show.value[chat_show.value.length - 1];
  return buildMessageSignature(lastMessage);
});

watch(zoomLevel, (newZoom) => {
  if (window.api && typeof window.api.setZoomFactor === 'function')
    window.api.setZoomFactor(newZoom);
});
watch(
  () => chat_show.value.length,
  () => {
    if (!hasSessionInitialized.value) return;
    markSessionDirty();
    scheduleCodeBlockEnhancement();
  },
  { flush: 'post' },
);
watch(
  lastMessageSignature,
  () => {
    if (!hasSessionInitialized.value) return;
    markSessionDirty();
    scheduleCodeBlockEnhancement();
  },
  { flush: 'post' },
);
watch(
  () => currentConfig.value?.isDarkMode,
  (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    if (textSearchInstance) {
      textSearchInstance.setTheme(isDark ? 'dark' : 'light');
    }
  },
  { immediate: true },
);

onMounted(async () => {
  if (isInit.value) return;
  isInit.value = true;

  if (window.api && window.api.onAlwaysOnTopChanged) {
    window.api.onAlwaysOnTopChanged((newState) => {
      isAlwaysOnTop.value = newState;
    });
  }

  textSearchInstance = new TextSearchUI({
    scope: '.chat-main',
    theme: currentConfig.value?.isDarkMode ? 'dark' : 'light',
  });

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);
  attachChatDomObserver();

  if (window.preload && typeof window.preload.receiveMsg === 'function') {
    window.preload.receiveMsg(async (data) => {
      await initializeWindow(data);
    });
  } else {
    const data = {
      os: 'win',
      code: 'Moss',
      config: await window.api.getConfig().config,
    };
    await initializeWindow(data);
  }
  startAutoSaveFallback();
  window.addEventListener('error', handleGlobalImageError, true);
  window.addEventListener('keydown', handleGlobalKeyDown);

  if (window.api && window.api.onConfigUpdated) {
    window.api.onConfigUpdated((newConfig) => {
      if (newConfig) {
        currentConfig.value = newConfig;
        if (newConfig.zoom !== undefined) {
          zoomLevel.value = newConfig.zoom;
        }
      }
    });
  }
});

onBeforeUnmount(async () => {
  stopAutoSave();
  detachChatDomObserver();

  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('blur', handleWindowBlur);
  if (textSearchInstance) textSearchInstance.destroy();
  if (!autoCloseOnBlur.value) window.removeEventListener('blur', closePage);
  await window.api.closeMcpClient();
  window.removeEventListener('error', handleGlobalImageError, true);
  window.removeEventListener('keydown', handleGlobalKeyDown);

  document.documentElement.classList.remove('mac-native-vibrancy');
  document.body?.classList.remove('mac-native-vibrancy');
});

const {
  saveWindowSize,
  getSessionDataAsObject,
  handleSaveAction,
  loadSession,
  checkAndLoadSessionFromFile,
} = useSessionPersistence({
  refs: {
    CODE,
    basic_msg,
    isInit,
    autoCloseOnBlur,
    model,
    currentConfig,
    selectedVoice,
    sessionMcpServerIds,
    sessionSkillIds,
    isAutoApproveTools,
    defaultConversationName,
    currentConversationId,
    zoomLevel,
    modelMap,
    currentSystemPrompt,
    UserAvart,
    AIAvart,
    currentOS,
    loading,
    hasSessionInitialized,
    isSessionDirty,
    collapsedMessages,
    focusedMessageIndex,
    tempReasoningEffort,
    tempSessionSkillIds,
    favicon,
    modelList,
    currentProviderID,
    base_url,
    api_key,
    tempSessionMcpServerIds,
  },
  messageStore,
  messageRefs,
  showDismissibleMessage,
  handleTogglePin,
  applyMcpTools: (...args) => applyMcpTools(...args),
  scrollToBottom: (...args) => scrollToBottom(...args),
  persistConversation,
  syncConversationMeta,
  markSnapshotPersisted,
});

const { scheduleAutoSave, markSessionDirty, flushAutoSave, startAutoSaveFallback, stopAutoSave } =
  useAutoSave({
    refs: {
      loading,
      currentConfig,
      CODE,
      defaultConversationName,
      currentConversationId,
      isSessionDirty,
      hasSessionInitialized,
    },
    messageStore,
    getSessionDataAsObject: (...args) => getSessionDataAsObject(...args),
    persistConversation,
  });

const { file2fileList, processFilePath, sendFile } = useFileHandlers({
  refs: {
    fileList,
    chatInputRef,
  },
  showDismissibleMessage,
  checkAndLoadSessionFromFile,
});

const { askAI } = useAskAi({
  refs: {
    loading,
    isMcpLoading,
    prompt,
    isSticky,
    currentConfig,
    CODE,
    selectedVoice,
    openaiFormattedTools,
    sessionSkillIds,
    currentOS,
    model,
    tempReasoningEffort,
    modelMap,
    isAtBottom,
    isAutoApproveTools,
    pendingToolApprovals,
    toolCallControllers,
    api_key,
    base_url,
    signalController,
    chatInputRef,
  },
  messageStore,
  showDismissibleMessage,
  sendFile,
  scrollToBottom,
  markSessionDirty,
  scheduleAutoSave,
});

const cancelAskAI = () => {
  if (loading.value && signalController.value) {
    signalController.value.abort();
    chatInputRef.value?.focus();
  }
};

const {
  copyText,
  handleEditMessage,
  handleEditStart,
  handleEditEnd,
  reaskAI,
  deleteMessage,
  clearHistory,
} = useChatMessageActions({
  refs: {
    loading,
    collapsedMessages,
    messageRefs,
    focusedMessageIndex,
    currentConfig,
    CODE,
    isSessionDirty,
    defaultConversationName,
    currentConversationId,
    chatInputRef,
    chatContainerRef,
  },
  messageStore,
  showDismissibleMessage,
  scheduleCodeBlockEnhancement,
  markSessionDirty,
  scheduleAutoSave,
  askAI: (...args) => askAI(...args),
  getMessageComponentById,
});

const {
  handleWindowBlur,
  handleWindowFocus,
  handleCopyImageFromViewer,
  handleDownloadImageFromViewer,
  handleGlobalImageError,
  handleGlobalKeyDown,
  focusOnInput,
} = useWindowInteractionHandlers({
  refs: {
    chatInputRef,
    lastSelectionStart,
    lastSelectionEnd,
    isFilePickerOpen,
    systemPromptDialogVisible,
    zoomLevel,
    loading,
  },
  showDismissibleMessage,
  handleSaveAction: (...args) => handleSaveAction(...args),
});

const { initializeWindow } = useWindowInitialization({
  refs: {
    hasSessionInitialized,
    isSessionDirty,
    currentConfig,
    UserAvart,
    currentOS,
    modelList,
    modelMap,
    CODE,
    sourcePromptConfig,
    AIAvart,
    favicon,
    autoCloseOnBlur,
    tempReasoningEffort,
    model,
    selectedVoice,
    currentProviderID,
    base_url,
    api_key,
    currentSystemPrompt,
    sessionSkillIds,
    tempSessionSkillIds,
    basic_msg,
    defaultConversationName,
    currentConversationId,
    fileList,
    sessionMcpServerIds,
    tempSessionMcpServerIds,
    isAlwaysOnTop,
    zoomLevel,
    prompt,
    chatInputRef,
  },
  messageStore,
  defaultConfig,
  showDismissibleMessage,
  loadBackground,
  loadSession,
  checkAndLoadSessionFromFile,
  processFilePath,
  closePage,
  applyMcpTools: (...args) => applyMcpTools(...args),
  fetchSkillsList: (...args) => fetchSkillsList(...args),
  scrollToBottom: (...args) => scrollToBottom(...args),
  askAI: (...args) => askAI(...args),
  scheduleCodeBlockEnhancement: (...args) => scheduleCodeBlockEnhancement(...args),
});

const { openModelDialog, changeModel, showSystemPromptDialog, saveSystemPrompt, saveModel } =
  usePromptModelSettings({
    refs: {
      currentConfig,
      modelList,
      modelMap,
      currentProviderID,
      base_url,
      api_key,
      model,
      chatInputRef,
      currentSystemPrompt,
      systemPromptContent,
      systemPromptDialogVisible,
      CODE,
      sourcePromptConfig,
      AIAvart,
      changeModel_page,
    },
    messageStore,
    defaultConfig,
    showDismissibleMessage,
  });

const handleOpenModelDialog = () => openModelDialog();
const handleChangeModel = (chosenModel) => changeModel(chosenModel);
const handleShowSystemPrompt = () => showSystemPromptDialog();
const handleSaveModel = (modelToSave) => saveModel(modelToSave);

const handleCancelToolCall = (toolCallId) => {
  const controller = toolCallControllers.value.get(toolCallId);
  if (controller) {
    controller.abort();
    showDismissibleMessage.info('正在取消工具调用...');
  }
};

const handleOpenSearch = () => {
  if (textSearchInstance) {
    textSearchInstance.show();
  }
};
</script>

<template>
  <main
    :class="{ 'native-vibrancy': isNativeMacVibrancy, 'fallback-vibrancy': !isNativeMacVibrancy }"
  >
    <div v-if="windowBackgroundImage" class="window-bg-base"></div>
    <div
      class="window-bg-layer"
      :class="{ 'is-visible': !!windowBackgroundImage }"
      :style="{
        backgroundImage: windowBackgroundImage ? `url('${windowBackgroundImage}')` : 'none',
        opacity: windowBackgroundImage ? windowBackgroundOpacity : 0,
        filter: `blur(${windowBackgroundBlur}px)`,
      }"
    ></div>
    <el-container
      class="app-container"
      :class="{
        'has-bg': !!windowBackgroundImage,
        'native-vibrancy': isNativeMacVibrancy,
        'fallback-vibrancy': !isNativeMacVibrancy,
      }"
    >
      <TitleBar
        :favicon="favicon"
        :promptName="CODE"
        :conversationName="defaultConversationName"
        :isAlwaysOnTop="isAlwaysOnTop"
        :autoCloseOnBlur="autoCloseOnBlur"
        :isDarkMode="currentConfig.isDarkMode"
        :os="currentOS"
        @save-window-size="handleSaveWindowSize"
        @save-session="handleSaveSession"
        @toggle-pin="handleTogglePin"
        @toggle-always-on-top="handleToggleAlwaysOnTop"
        @minimize="handleMinimize"
        @maximize="handleMaximize"
        @close="handleCloseWindow"
      />
      <ChatHeader
        :modelMap="modelMap"
        :model="model"
        :is-mcp-loading="isMcpLoading"
        :systemPrompt="currentSystemPrompt"
        @open-model-dialog="handleOpenModelDialog"
        @show-system-prompt="handleShowSystemPrompt"
        @open-search="handleOpenSearch"
      />

      <div class="main-area-wrapper">
        <el-main
          ref="chatContainerRef"
          class="chat-main custom-scrollbar"
          @click="handleMarkdownImageClick"
          @scroll="handleScroll"
        >
          <ChatMessage
            v-for="(message, index) in chat_show"
            :key="message.id"
            :is-auto-approve="isAutoApproveTools"
            @update-auto-approve="handleToggleAutoApprove"
            @confirm-tool="handleToolApproval"
            @reject-tool="handleToolApproval"
            :ref="(el) => setMessageRef(el, message.id)"
            :message="message"
            :index="index"
            :is-last-message="index === chat_show.length - 1"
            :is-loading="loading"
            :user-avatar="UserAvart"
            :ai-avatar="AIAvart"
            :is-collapsed="isCollapsed(index)"
            :is-dark-mode="currentConfig.isDarkMode"
            :show-message-outline="currentConfig.showMessageOutline !== false"
            :is-outline-active="String(activeOutlineMessageId ?? '') === String(message.id)"
            @delete-message="handleDeleteMessage"
            @copy-text="handleCopyText"
            @re-ask="handleReAsk"
            @toggle-collapse="handleToggleCollapse"
            @show-system-prompt="handleShowSystemPrompt"
            @avatar-click="onAvatarClick"
            @edit-message-requested="handleEditStart"
            @edit-finished="handleEditEnd"
            @edit-message="handleEditMessage"
            @cancel-tool-call="handleCancelToolCall"
          />
        </el-main>

        <MessageAnchorLine
          v-if="currentConfig.messageNavigation === 'anchor' && navMessages.length > 0"
          :messages="navMessages"
          :focused-message-id="focusedMessageId"
          :show-scroll-to-bottom-button="showScrollToBottomButton"
          :get-message-preview-text="getMessagePreviewText"
          :user-avatar="UserAvart"
          :ai-avatar="AIAvart"
          @jump="scrollToMessageById"
          @bottom="forceScrollToBottom"
        />

        <ChatInput
          ref="chatInputRef"
          v-model:prompt="prompt"
          v-model:fileList="fileList"
          v-model:selectedVoice="selectedVoice"
          v-model:tempReasoningEffort="tempReasoningEffort"
          :loading="loading"
          :ctrlEnterToSend="currentConfig.CtrlEnterToSend"
          :layout="inputLayout"
          :voiceList="currentConfig.voiceList"
          :is-mcp-active="isMcpActive"
          :all-mcp-servers="availableMcpServers"
          :active-mcp-ids="sessionMcpServerIds"
          :active-skill-ids="sessionSkillIds"
          :all-skills="allSkillsList"
          @submit="handleSubmit"
          @cancel="handleCancel"
          @clear-history="handleClearHistory"
          @remove-file="handleRemoveFile"
          @upload="handleUpload"
          @send-audio="handleSendAudio"
          @open-mcp-dialog="handleOpenMcpDialog"
          @pick-file-start="handlePickFileStart"
          @toggle-mcp="handleQuickMcpToggle"
          @toggle-skill="handleQuickSkillToggle"
          @open-skill-dialog="toggleSkillDialog"
        />
      </div>
    </el-container>
  </main>

  <ModelSelectionDialog
    v-model="changeModel_page"
    :modelList="modelList"
    :currentModel="model"
    @select="handleChangeModel"
    @save-model="handleSaveModel"
  />

  <SystemPromptDialog
    v-model="systemPromptDialogVisible"
    v-model:content="systemPromptContent"
    @save="saveSystemPrompt"
  />

  <ImageViewerOverlay
    v-model="imageViewerVisible"
    :url-list="imageViewerSrcList"
    :initial-index="imageViewerInitialIndex"
    @copy="handleCopyImageFromViewer"
    @download="handleDownloadImageFromViewer"
  />

  <McpDialog
    v-model="isMcpDialogVisible"
    v-model:mcpFilter="mcpFilter"
    v-model:mcpSearchQuery="mcpSearchQuery"
    :is-auto-approve-tools="isAutoApproveTools"
    :filtered-mcp-servers="filteredMcpServers"
    :temp-session-mcp-server-ids="tempSessionMcpServerIds"
    :expanded-mcp-servers="expandedMcpServers"
    :mcp-tool-cache="mcpToolCache"
    :mcp-connection-count="mcpConnectionCount"
    :get-tool-counts="getToolCounts"
    :get-display-type-name="getDisplayTypeName"
    @update:is-auto-approve-tools="handleToggleAutoApprove"
    @dialog-close="focusOnInput"
    @select-all="selectAllMcpServers"
    @clear="clearMcpTools"
    @toggle-selection="toggleMcpServerSelection"
    @toggle-expansion="toggleMcpServerExpansion"
    @toggle-persistence="({ id, value }) => toggleMcpPersistence(id, value)"
    @toggle-tool-status="
      ({ serverId, toolName, value }) => handleMcpToolStatusChange(serverId, toolName, value)
    "
    @apply="
      sessionMcpServerIds = [...tempSessionMcpServerIds];
      applyMcpTools();
    "
  />

  <SkillDialog
    v-model="isSkillDialogVisible"
    v-model:skillFilter="skillFilter"
    v-model:skillSearchQuery="skillSearchQuery"
    :filtered-skills-list="filteredSkillsList"
    :temp-session-skill-ids="tempSessionSkillIds"
    @select-all="selectAllSkills"
    @clear="clearSkills"
    @toggle-selection="toggleSkillSelection"
    @toggle-fork="handleSkillForkToggle"
    @confirm="handleSkillSelectionConfirm"
  />
</template>

<style src="./assets/app-global.css"></style>

<style scoped lang="less" src="./assets/app-scoped.less"></style>
