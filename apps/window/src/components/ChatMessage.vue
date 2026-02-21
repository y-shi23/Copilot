<script setup lang="ts">
// -nocheck
import { computed, ref, nextTick, onBeforeUnmount, watch } from 'vue';
import { Bubble } from 'vue-element-plus-x';
import {
  ElTooltip,
  ElButton,
  ElInput,
  ElCollapse,
  ElCollapseItem,
  ElCheckbox,
  ElTag,
} from 'element-plus';
import {
  Copy,
  Check,
  Pencil,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Trash2,
  X,
  FileText,
  Wrench,
  Square,
  ArrowUp,
  ArrowDown,
  AlarmClockCheck,
} from 'lucide-vue-next';

import DeepThinkingCard from './reasoning/DeepThinkingCard.vue';
import MessageOutline from './navigation/MessageOutline.vue';
import MarkdownRenderer from './markdown/MarkdownRenderer.vue';
import { formatTimestamp, formatMessageText, sanitizeToolArgs } from '../utils/formatters';
import { handleModelLogoError, resolveModelLogoUrl } from '../utils/modelLogos';

const props = defineProps({
  message: Object,
  index: Number,
  isLastMessage: Boolean,
  isLoading: Boolean,
  userAvatar: String,
  aiAvatar: String,
  isCollapsed: Boolean,
  isDarkMode: Boolean,
  isAutoApprove: Boolean,
  showMessageOutline: Boolean,
});

const emit = defineEmits([
  'copy-text',
  're-ask',
  'delete-message',
  'toggle-collapse',
  'avatar-click',
  'edit-message',
  'edit-message-requested',
  'edit-finished',
  'cancel-tool-call',
  'confirm-tool',
  'reject-tool',
  'update-auto-approve',
]);
const editInputRef = ref(null);
const isEditing = ref(false);
const editedContent = ref('');
const isCopied = ref(false);
const reasoningExpandedMap = ref<Record<string, boolean>>({});

let copyFeedbackTimer = null;
const RENDER_CACHE_LIMIT = 500;
const renderedMessageCache = new Map();

const stableStringify = (value) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value || '');
  }
};

const hashContent = (value) => {
  const raw = stableStringify(value);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

const getRenderCacheKey = (message, fallbackIndex = 0) => {
  const idPart = message?.id ?? `idx-${fallbackIndex}`;
  const rolePart = message?.role || 'user';
  const contentHash = hashContent(message?.content);
  const statusPart = message?.status || '';
  return `${idPart}:${rolePart}:${statusPart}:${contentHash}`;
};

const getCachedRender = (cacheKey) => renderedMessageCache.get(cacheKey);
const setCachedRender = (cacheKey, renderedHtml) => {
  renderedMessageCache.set(cacheKey, renderedHtml);
  if (renderedMessageCache.size > RENDER_CACHE_LIMIT) {
    const oldestKey = renderedMessageCache.keys().next().value;
    if (oldestKey !== undefined) {
      renderedMessageCache.delete(oldestKey);
    }
  }
};

// 格式化工具参数为易读的 JSON 字符串
const formatToolArgs = (argsString) => {
  try {
    const sanitized = sanitizeToolArgs(argsString);
    const obj = JSON.parse(sanitized);
    // 2 表示缩进空格数
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return argsString;
  }
};

const mermaidConfig = computed(() => ({
  theme: props.isDarkMode ? 'dark' : 'neutral',
}));

const formatMessageContent = (content, role) => {
  if (!content) return '';
  if (!Array.isArray(content)) {
    if (
      String(content).toLowerCase().startsWith('file name:') &&
      String(content).toLowerCase().endsWith('file end')
    ) {
      return '';
    } else {
      return String(content);
    }
  }

  let markdownString = '';
  let i = 0;
  while (i < content.length) {
    const part = content[i];

    if (
      part.type === 'text' &&
      part.text &&
      part.text.toLowerCase().startsWith('file name:') &&
      part.text.toLowerCase().endsWith('file end')
    ) {
      i++;
      continue;
    } else if (part.type === 'image_url' && part.image_url?.url) {
      let imageGroupMarkdown = '';
      while (i < content.length && content[i].type === 'image_url' && content[i].image_url?.url) {
        imageGroupMarkdown += `![Image](${content[i].image_url.url}) `;
        i++;
      }
      markdownString += `\n\n${imageGroupMarkdown.trim()}\n\n`;
    } else if (part.type === 'input_audio' && part.input_audio?.data) {
      if (role === 'user') {
        markdownString += `\n\n<audio class="chat-audio-player" controls preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
      } else {
        markdownString += `\n\n<audio class="chat-audio-player" controls autoplay preload="none">\n<source id="${part.input_audio.format}" src="data:audio/${part.input_audio.format};base64,${part.input_audio.data}">\n</audio>\n`;
      }
      i++;
    } else if (part.type === 'text' && part.text) {
      markdownString += part.text;
      i++;
    } else {
      i++;
    }
  }

  return markdownString;
};

const formatMessageFile = (content) => {
  let files = [];
  if (!Array.isArray(content)) {
    if (
      String(content).toLowerCase().startsWith('file name:') &&
      String(content).toLowerCase().endsWith('file end')
    )
      files.push(String(content).split('\n')[0].replace('file name:', '').trim());
    else return [];
  } else {
    content.forEach((part) => {
      if (
        part.type === 'text' &&
        part.text &&
        part.text.toLowerCase().startsWith('file name:') &&
        part.text.toLowerCase().endsWith('file end')
      )
        files.push(part.text.split('\n')[0].replace('file name:', '').trim());
      else if (part.type === 'input_file' && part.filename) files.push(part.filename);
      else if (part.type === 'file' && part.file.filename) files.push(part.file.filename);
    });
  }
  return files;
};

const isEditable = computed(() => {
  if (props.message.role === 'user') return true;
  const content = props.message.content;
  if (typeof content === 'string') return true;
  if (Array.isArray(content)) {
    return content.some(
      (part) =>
        part.type === 'text' && part.text && !part.text.toLowerCase().startsWith('file name:'),
    );
  }
  return false;
});

const assistantResponseMetrics = computed(() => {
  if (props.message.role !== 'assistant') return null;
  const metrics = props.message?.metrics;
  if (!metrics || typeof metrics !== 'object') return null;

  const toCount = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : null;
  };
  const toMs = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
  };

  const completionTokens = toCount(metrics.completion_tokens);
  const promptTokens = toCount(metrics.prompt_tokens);
  const totalTokens = toCount(metrics.total_tokens);
  if (completionTokens === null && promptTokens === null && totalTokens === null) return null;

  const safePromptTokens = promptTokens ?? 0;
  const safeCompletionTokens = completionTokens ?? 0;
  const safeTotalTokens = totalTokens ?? safePromptTokens + safeCompletionTokens;
  const timeFirstTokenMs = toMs(metrics.time_first_token_millsec);
  const timeCompletionMs = toMs(metrics.time_completion_millsec);
  const directTokenSpeed = Number(metrics.token_speed);
  const fallbackTokenSpeed =
    timeCompletionMs && safeCompletionTokens >= 0
      ? safeCompletionTokens / (timeCompletionMs / 1000)
      : null;
  const tokenSpeed =
    Number.isFinite(directTokenSpeed) && directTokenSpeed >= 0
      ? directTokenSpeed
      : fallbackTokenSpeed;

  return {
    completionTokens: safeCompletionTokens,
    promptTokens: safePromptTokens,
    totalTokens: safeTotalTokens,
    timeFirstTokenMs,
    tokenSpeed,
    isEstimated: Boolean(metrics.is_estimated),
  };
});

const assistantResponseTotalTokensDisplay = computed(() => {
  const metrics = assistantResponseMetrics.value;
  if (!metrics) return '';
  return `${metrics.isEstimated ? '~' : ''}${metrics.totalTokens}Tokens`;
});

const assistantFirstTokenLatencyDisplay = computed(() => {
  const metrics = assistantResponseMetrics.value;
  if (!metrics || metrics.timeFirstTokenMs === null) return '-';
  return `${Math.round(metrics.timeFirstTokenMs)} ms`;
});

const assistantTokenSpeedDisplay = computed(() => {
  const metrics = assistantResponseMetrics.value;
  if (!metrics || !Number.isFinite(metrics.tokenSpeed) || metrics.tokenSpeed < 0) return '-';
  return `${metrics.tokenSpeed.toFixed(1)} Tokens/s`;
});

const assistantModelDisplayMeta = computed(() => {
  const fallbackName = String(props.message?.aiName || 'AI').trim() || 'AI';
  const modelKey = String(props.message?.modelKey || props.message?.model || '');
  const modelLabel = String(props.message?.modelLabel || props.message?.aiName || '');

  let providerName = '';
  let providerId = '';
  let modelNameFromLabel = '';
  let modelNameFromKey = '';

  if (modelLabel.includes('|')) {
    const [provider = '', ...modelParts] = modelLabel.split('|');
    providerName = provider.trim();
    modelNameFromLabel = modelParts.join('|').trim();
  }

  if (modelKey.includes('|')) {
    const [provider = '', ...modelParts] = modelKey.split('|');
    providerId = provider.trim();
    modelNameFromKey = modelParts.join('|').trim();
  }

  const modelName = modelNameFromKey || modelNameFromLabel || fallbackName;
  const provider = providerName || providerId;

  return {
    modelName,
    providerName: provider,
    providerId,
    providerInitial: provider ? provider.charAt(0).toUpperCase() : '',
    hasModelIdentity: Boolean((modelNameFromKey || modelNameFromLabel) && provider),
  };
});

const assistantAvatarMeta = computed(() => {
  const fallbackAvatar = props.aiAvatar || 'ai.svg';
  if (props.message?.role !== 'assistant') {
    return { src: fallbackAvatar, isModelLogo: false };
  }

  if (!assistantModelDisplayMeta.value.hasModelIdentity) {
    return { src: fallbackAvatar, isModelLogo: false };
  }

  if (!assistantModelDisplayMeta.value.modelName) {
    return { src: fallbackAvatar, isModelLogo: false };
  }

  return {
    src: resolveModelLogoUrl(assistantModelDisplayMeta.value.modelName, {
      providerName: assistantModelDisplayMeta.value.providerName,
      metadataProviderId: assistantModelDisplayMeta.value.providerId,
    }),
    isModelLogo: true,
  };
});

const onAssistantAvatarError = (event) => {
  if (assistantAvatarMeta.value.isModelLogo) {
    handleModelLogoError(event);
    return;
  }
  const img = event?.target;
  if (!img || img.dataset.avatarFallbackApplied === '1') return;
  img.dataset.avatarFallbackApplied = '1';
  img.src = 'ai.svg';
};

const switchToEditMode = () => {
  editedContent.value = formatMessageText(props.message.content);
  isEditing.value = true;
  nextTick(() => {
    editInputRef.value?.focus();
  });
};

const switchToShowMode = () => {
  isEditing.value = false;
};

defineExpose({ switchToEditMode, switchToShowMode });

const finishEdit = (action) => {
  isEditing.value = false;
  emit('edit-finished', {
    id: props.message.id,
    action: action,
    content: editedContent.value,
  });
};

const handleEditKeyDown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    finishEdit('cancel');
  } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    finishEdit('save');
  }
};

const renderedMarkdownContent = computed(() => {
  const cacheKey = getRenderCacheKey(props.message, props.index);
  const cachedContent = getCachedRender(cacheKey);
  if (cachedContent !== undefined) {
    return cachedContent;
  }

  const content = props.message.role ? props.message.content : props.message;
  const role = props.message.role ? props.message.role : 'user';
  const formattedContent = formatMessageContent(content, role);
  const rendered =
    !formattedContent && props.message.role === 'assistant' ? ' ' : formattedContent || ' ';
  setCachedRender(cacheKey, rendered);
  return rendered;
});

const normalizeReasoningText = (value: any) => String(value || '').trim();

const assistantToolCallMap = computed(() => {
  const map = new Map<string, any>();
  const list = Array.isArray(props.message?.tool_calls) ? props.message.tool_calls : [];
  list.forEach((toolCall: any) => {
    const id = String(toolCall?.id || '').trim();
    if (!id) return;
    map.set(id, toolCall);
  });
  return map;
});

const assistantTimelineSegments = computed(() => {
  if (String(props.message?.role || '') !== 'assistant') return [];

  const apiSegments = Array.isArray(props.message?.meta?.apiMessages)
    ? props.message.meta.apiMessages
    : [];
  const segments: any[] = [];

  apiSegments.forEach((apiSegment: any, index: number) => {
    const reasoningContent = normalizeReasoningText(apiSegment?.reasoning_content);
    if (reasoningContent) {
      segments.push({
        id: `reasoning-${index}`,
        type: 'reasoning',
        content: reasoningContent,
        status: 'end',
        reasoningStartedAt: null,
        reasoningFinishedAt: null,
      });
    }

    const rawToolCalls = Array.isArray(apiSegment?.tool_calls) ? apiSegment.tool_calls : [];
    if (rawToolCalls.length > 0) {
      const toolCalls = rawToolCalls
        .map((rawToolCall: any) => {
          const id = String(rawToolCall?.id || '').trim();
          if (!id) return null;

          const currentToolCall = assistantToolCallMap.value.get(id);
          if (currentToolCall) return currentToolCall;

          const args = rawToolCall?.function?.arguments ?? rawToolCall?.args ?? '{}';
          return {
            id,
            name: String(rawToolCall?.function?.name || rawToolCall?.name || 'unknown_tool'),
            args: typeof args === 'string' ? args : JSON.stringify(args),
            result: '',
            approvalStatus: 'finished',
          };
        })
        .filter(Boolean);

      if (toolCalls.length > 0) {
        segments.push({
          id: `tool-calls-${index}`,
          type: 'tool_calls',
          toolCalls,
        });
      }
    }
  });

  const liveReasoningContent = normalizeReasoningText(props.message?.reasoning_content);
  const hasApiReasoning = segments.some((segment: any) => segment.type === 'reasoning');

  if (liveReasoningContent.length > 0 && !hasApiReasoning) {
    const isThinking = props.message?.status === 'thinking';
    segments.push({
      id: 'reasoning-live',
      type: 'reasoning',
      content: liveReasoningContent,
      status: isThinking ? 'thinking' : 'end',
      reasoningStartedAt: props.message?.reasoningStartedAt ?? null,
      reasoningFinishedAt: props.message?.reasoningFinishedAt ?? null,
    });
  }

  return segments;
});

const syncToggleMap = (
  stateRef: any,
  activeIds: string[],
  getDefaultValue: (id: string) => boolean,
) => {
  const nextState: Record<string, boolean> = {};
  activeIds.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(stateRef.value, id)) {
      nextState[id] = stateRef.value[id];
      return;
    }
    nextState[id] = getDefaultValue(id);
  });
  stateRef.value = nextState;
};

watch(
  assistantTimelineSegments,
  (segments) => {
    const reasoningIds = segments
      .filter((segment: any) => segment.type === 'reasoning')
      .map((segment: any) => String(segment.id));
    syncToggleMap(reasoningExpandedMap, reasoningIds, () => false);
  },
  { immediate: true },
);

const isReasoningExpanded = (segmentId: string) => !!reasoningExpandedMap.value[String(segmentId)];
const toggleReasoningExpanded = (segmentId: string) => {
  const key = String(segmentId);
  reasoningExpandedMap.value[key] = !reasoningExpandedMap.value[key];
};
// HMR compatibility: old template chunks may still call these during hot updates.
const isToolSectionExpanded = (_segmentId: string) => true;
const toggleToolSectionExpanded = (_segmentId: string) => {};

const shouldShowCollapseButton = computed(() => {
  if (!props.isLastMessage) return true;
  if (props.isLastMessage) return !props.isLoading;
  return false;
});

const headingIdPrefix = computed(() => `heading-${String(props.message?.id ?? props.index ?? '')}`);

const assistantMessageStyle = computed(() => String(props.message?.multiModelMessageStyle || ''));

const shouldShowOutline = computed(
  () => Boolean(props.showMessageOutline) && String(props.message?.role || '') === 'assistant',
);

const onCopy = () => {
  if (props.isLoading && props.isLastMessage) return;
  emit('copy-text', formatMessageText(props.message.content), props.message.id);

  isCopied.value = true;
  if (copyFeedbackTimer !== null) {
    window.clearTimeout(copyFeedbackTimer);
  }
  copyFeedbackTimer = window.setTimeout(() => {
    isCopied.value = false;
    copyFeedbackTimer = null;
  }, 1300);
};
const onReAsk = () => emit('re-ask', props.message.id);
const onDelete = () => emit('delete-message', props.message.id);
const onToggleCollapse = (event) => emit('toggle-collapse', props.message.id, event);
const onAvatarClick = (role, event) => emit('avatar-click', role, event);
const truncateFilename = (filename, maxLength = 30) => {
  if (typeof filename !== 'string' || filename.length <= maxLength) return filename;
  const ellipsis = '...';
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex < 10)
    return filename.substring(0, maxLength - ellipsis.length) + ellipsis;
  const nameWithoutExt = filename.substring(0, lastDotIndex);
  const extension = filename.substring(lastDotIndex);
  const charsToKeep = maxLength - extension.length - ellipsis.length;
  if (charsToKeep < 1) return ellipsis + extension;
  return nameWithoutExt.substring(0, charsToKeep) + ellipsis + extension;
};

onBeforeUnmount(() => {
  if (copyFeedbackTimer !== null) {
    window.clearTimeout(copyFeedbackTimer);
  }
});
</script>

<template>
  <div :id="`message-${message.id}`" class="chat-message" v-if="message.role !== 'system'">
    <!-- 用户消息 -->
    <div v-if="message.role === 'user'" class="message-wrapper user-wrapper">
      <div class="message-meta-header user-meta-header">
        <img
          :src="userAvatar"
          alt="User Avatar"
          @click="onAvatarClick('user', $event)"
          class="chat-avatar-top user-avatar"
        />
      </div>

      <Bubble class="user-bubble" placement="end" shape="corner" maxWidth="100%">
        <template #content>
          <div v-if="!isEditing" class="markdown-wrapper" :class="{ collapsed: isCollapsed }">
            <div class="message-content-container">
              <MarkdownRenderer
                :markdown="renderedMarkdownContent"
                :is-dark="isDarkMode"
                :enable-latex="true"
                :mermaid-config="mermaidConfig"
                :allow-html="true"
                :heading-id-prefix="headingIdPrefix"
              />
            </div>
          </div>
          <div v-else class="editing-wrapper">
            <el-input
              ref="editInputRef"
              v-model="editedContent"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 15 }"
              resize="none"
              @keydown="handleEditKeyDown"
            />
            <div class="editing-actions">
              <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
              <el-button @click="finishEdit('save')" size="small" circle type="primary">
                <Check :size="14" />
              </el-button>
              <el-button @click="finishEdit('cancel')" size="small" circle>
                <X :size="14" />
              </el-button>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="message-footer">
            <div class="footer-wrapper">
              <div class="footer-actions">
                <button
                  class="footer-action-btn"
                  type="button"
                  :class="{ 'is-copied': isCopied }"
                  :title="isCopied ? '已复制' : '复制'"
                  :aria-label="isCopied ? '已复制' : '复制'"
                  :disabled="isLoading && isLastMessage"
                  @click="onCopy"
                >
                  <transition name="copy-icon-swap" mode="out-in">
                    <component
                      :is="isCopied ? Check : Copy"
                      :key="isCopied ? 'copy-ok' : 'copy'"
                      class="footer-action-icon"
                    />
                  </transition>
                </button>
                <button
                  v-if="isEditable"
                  class="footer-action-btn"
                  type="button"
                  title="编辑"
                  aria-label="编辑"
                  @click="emit('edit-message-requested', message.id)"
                >
                  <Pencil class="footer-action-icon" />
                </button>
                <button
                  v-if="shouldShowCollapseButton"
                  class="footer-action-btn"
                  type="button"
                  :title="isCollapsed ? '展开' : '折叠'"
                  :aria-label="isCollapsed ? '展开' : '折叠'"
                  @click="onToggleCollapse($event)"
                >
                  <component
                    :is="isCollapsed ? ChevronDown : ChevronUp"
                    class="footer-action-icon"
                  />
                </button>
                <button
                  v-if="isLastMessage && message.role === 'assistant'"
                  class="footer-action-btn"
                  type="button"
                  title="重新生成"
                  aria-label="重新生成"
                  @click="onReAsk"
                >
                  <RefreshCw class="footer-action-icon" />
                </button>
                <button
                  class="footer-action-btn"
                  type="button"
                  title="删除"
                  aria-label="删除"
                  @click="onDelete"
                >
                  <Trash2 class="footer-action-icon" />
                </button>
              </div>
              <div
                class="message-files-vertical-list"
                v-if="formatMessageFile(message.content).length > 0"
              >
                <el-tooltip
                  v-for="(file_name, idx) in formatMessageFile(message.content)"
                  :key="idx"
                  :content="file_name"
                  placement="top"
                  :disabled="file_name.length < 30"
                  :popper-style="{ maxWidth: '30vw', wordBreak: 'break-all' }"
                >
                  <el-button class="file-button" type="info" plain size="small">
                    <template #icon>
                      <FileText :size="14" />
                    </template>
                    {{ truncateFilename(file_name, 20) }}
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </div>
        </template>
      </Bubble>
    </div>

    <!-- AI 消息 -->
    <div v-if="message.role === 'assistant'" class="message-wrapper ai-wrapper">
      <div class="message-meta-header ai-meta-header">
        <img
          :src="assistantAvatarMeta.src"
          alt="AI Avatar"
          @click="onAvatarClick('assistant', $event)"
          @error="onAssistantAvatarError"
          class="chat-avatar-top ai-avatar"
        />
        <div class="meta-info-column">
          <div class="meta-name-row">
            <span class="ai-name">{{ assistantModelDisplayMeta.modelName }}</span>
            <span
              v-if="assistantModelDisplayMeta.providerInitial"
              class="circle-action-btn meta-provider-badge"
              :title="assistantModelDisplayMeta.providerName"
              :aria-label="`Provider: ${assistantModelDisplayMeta.providerName}`"
            >
              {{ assistantModelDisplayMeta.providerInitial }}
            </span>
            <span v-if="message.voiceName" class="voice-name">({{ message.voiceName }})</span>
          </div>
          <span class="timestamp-row" v-if="message.completedTimestamp">{{
            formatTimestamp(message.completedTimestamp)
          }}</span>
        </div>
      </div>

      <Bubble
        class="ai-bubble"
        placement="start"
        shape="corner"
        maxWidth="100%"
        :loading="
          isLastMessage &&
          isLoading &&
          renderedMarkdownContent === ' ' &&
          (!message.tool_calls || message.tool_calls.length === 0) &&
          assistantTimelineSegments.length === 0
        "
      >
        <template #content>
          <template v-for="segment in assistantTimelineSegments" :key="segment.id">
            <DeepThinkingCard
              v-if="segment.type === 'reasoning'"
              :content="segment.content"
              :loading="segment.status === 'thinking'"
              :status="segment.status"
              :expanded="isReasoningExpanded(segment.id)"
              :reasoning-started-at="segment.reasoningStartedAt"
              :reasoning-finished-at="segment.reasoningFinishedAt"
              :is-dark-mode="isDarkMode"
              @toggle="toggleReasoningExpanded(segment.id)"
            />

            <div v-else-if="segment.type === 'tool_calls'" class="tool-calls-container">
              <div
                v-for="toolCall in segment.toolCalls"
                :key="toolCall.id"
                :class="['single-tool-wrapper', { 'is-dark': isDarkMode }]"
              >
                <el-collapse
                  class="tool-collapse"
                  :model-value="
                    !isAutoApprove &&
                    (toolCall.approvalStatus === 'waiting' ||
                      toolCall.approvalStatus === 'executing')
                      ? [toolCall.id]
                      : []
                  "
                >
                  <el-collapse-item :name="toolCall.id">
                    <template #title>
                      <div class="tool-call-title">
                        <Wrench :size="15" class="tool-icon" />
                        <span class="tool-name">{{ toolCall.name }}</span>
                        <div class="tool-header-right">
                          <el-tag
                            v-if="toolCall.approvalStatus === 'waiting'"
                            type="warning"
                            size="small"
                            effect="light"
                            round
                            >等待批准</el-tag
                          >
                          <el-tag
                            v-else-if="toolCall.approvalStatus === 'executing'"
                            type="primary"
                            size="small"
                            effect="light"
                            round
                            >执行中</el-tag
                          >
                          <el-tag
                            v-else-if="toolCall.approvalStatus === 'rejected'"
                            type="danger"
                            size="small"
                            effect="plain"
                            round
                            >已拒绝</el-tag
                          >
                          <el-tag
                            v-else-if="toolCall.approvalStatus === 'finished'"
                            type="success"
                            size="small"
                            effect="plain"
                            round
                            >完成</el-tag
                          >
                          <el-tooltip
                            content="停止执行"
                            placement="top"
                            v-if="toolCall.approvalStatus === 'executing'"
                          >
                            <div
                              class="stop-btn-wrapper"
                              @click.stop="$emit('cancel-tool-call', toolCall.id)"
                            >
                              <Square :size="14" />
                            </div>
                          </el-tooltip>
                        </div>
                        <svg
                          class="tool-chevron"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </template>
                    <div class="tool-call-details">
                      <div class="tool-detail-section">
                        <strong>参数:</strong>
                        <pre><code>{{ formatToolArgs(toolCall.args) }}</code></pre>
                      </div>
                      <div
                        class="tool-detail-section"
                        v-if="
                          toolCall.result &&
                          toolCall.result !== '等待批准...' &&
                          toolCall.result !== '执行中...'
                        "
                      >
                        <strong>结果:</strong>
                        <div class="tool-result-wrapper">
                          <pre><code>{{ toolCall.result }}</code></pre>
                        </div>
                      </div>
                    </div>
                  </el-collapse-item>
                </el-collapse>
                <div v-if="toolCall.approvalStatus === 'waiting'" class="tool-approval-actions">
                  <div class="actions-left">
                    <el-button
                      type="primary"
                      size="small"
                      @click="$emit('confirm-tool', toolCall.id, true)"
                    >
                      <template #icon>
                        <Check :size="14" />
                      </template>
                      确认
                    </el-button>
                    <el-button size="small" @click="$emit('reject-tool', toolCall.id, false)">
                      <template #icon>
                        <X :size="14" />
                      </template>
                      取消
                    </el-button>
                  </div>
                  <div class="actions-right">
                    <el-checkbox
                      :model-value="isAutoApprove"
                      @change="(val) => $emit('update-auto-approve', val)"
                      label="自动批准后续调用"
                      size="small"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div
            v-if="!isEditing"
            class="markdown-wrapper"
            :class="{ collapsed: isCollapsed, 'has-message-outline': shouldShowOutline }"
          >
            <MessageOutline
              :message-id="message.id"
              :markdown="renderedMarkdownContent"
              :enabled="shouldShowOutline"
              :message-style="assistantMessageStyle"
            />
            <div class="message-content-container">
              <MarkdownRenderer
                :markdown="renderedMarkdownContent"
                :is-dark="isDarkMode"
                :enable-latex="true"
                :mermaid-config="mermaidConfig"
                :allow-html="true"
                :heading-id-prefix="headingIdPrefix"
              />
            </div>
          </div>
          <div v-else class="editing-wrapper">
            <el-input
              ref="editInputRef"
              v-model="editedContent"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 15 }"
              resize="none"
              @keydown="handleEditKeyDown"
            />
            <div class="editing-actions">
              <span class="edit-shortcut-hint">Ctrl+Enter 确认 / Esc 取消</span>
              <el-button @click="finishEdit('save')" size="small" circle type="primary">
                <Check :size="14" />
              </el-button>
              <el-button @click="finishEdit('cancel')" size="small" circle>
                <X :size="14" />
              </el-button>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="message-footer ai-footer" v-if="!(isLoading && isLastMessage)">
            <div class="footer-actions">
              <button
                class="footer-action-btn"
                type="button"
                :class="{ 'is-copied': isCopied }"
                :title="isCopied ? '已复制' : '复制'"
                :aria-label="isCopied ? '已复制' : '复制'"
                @click="onCopy"
              >
                <transition name="copy-icon-swap" mode="out-in">
                  <component
                    :is="isCopied ? Check : Copy"
                    :key="isCopied ? 'copy-ok' : 'copy'"
                    class="footer-action-icon"
                  />
                </transition>
              </button>
              <button
                v-if="isEditable"
                class="footer-action-btn"
                type="button"
                title="编辑"
                aria-label="编辑"
                @click="emit('edit-message-requested', message.id)"
              >
                <Pencil class="footer-action-icon" />
              </button>
              <button
                v-if="shouldShowCollapseButton"
                class="footer-action-btn"
                type="button"
                :title="isCollapsed ? '展开' : '折叠'"
                :aria-label="isCollapsed ? '展开' : '折叠'"
                @click="onToggleCollapse($event)"
              >
                <component :is="isCollapsed ? ChevronDown : ChevronUp" class="footer-action-icon" />
              </button>
              <button
                v-if="isLastMessage && message.role === 'assistant'"
                class="footer-action-btn"
                type="button"
                title="重新生成"
                aria-label="重新生成"
                @click="onReAsk"
              >
                <RefreshCw class="footer-action-icon" />
              </button>
              <button
                class="footer-action-btn"
                type="button"
                title="删除"
                aria-label="删除"
                @click="onDelete"
              >
                <Trash2 class="footer-action-icon" />
              </button>
            </div>
            <el-tooltip
              v-if="assistantResponseMetrics"
              placement="top-end"
              effect="light"
              popper-class="token-metrics-tooltip"
            >
              <template #content>
                <div class="token-tooltip-content">
                  <div class="token-tooltip-row">
                    <AlarmClockCheck :size="13" class="token-tooltip-icon" />
                    <span>{{ assistantFirstTokenLatencyDisplay }}</span>
                    <span class="token-tooltip-divider">·</span>
                    <span class="token-tooltip-speed">{{ assistantTokenSpeedDisplay }}</span>
                  </div>
                </div>
              </template>
              <div class="footer-token-metrics">
                <span class="token-total">{{ assistantResponseTotalTokensDisplay }}</span>
                <ArrowUp :size="12" class="token-direction-icon" />
                <span class="token-direction-value">{{
                  assistantResponseMetrics.promptTokens
                }}</span>
                <ArrowDown :size="12" class="token-direction-icon" />
                <span class="token-direction-value">{{
                  assistantResponseMetrics.completionTokens
                }}</span>
              </div>
            </el-tooltip>
          </div>
        </template>
      </Bubble>
    </div>
  </div>
</template>

<style scoped lang="less">
/* 使用与原文件相同的样式 */
.chat-message {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  padding: 0;
}

.message-wrapper {
  display: flex;
  flex-direction: column;
}

.user-wrapper {
  align-self: flex-end;
  align-items: flex-end;
  max-width: 88%;
  margin-right: 3%;
  margin-left: 6%;
}

.ai-wrapper {
  align-self: flex-start;
  align-items: flex-start;
  margin-left: 4%;
  margin-right: 8%;
  width: calc(100% - 12%);
  max-width: 100%;
}

.message-meta-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.user-meta-header {
  flex-direction: row;
  margin-bottom: 8px;
}

.ai-meta-header {
  flex-direction: row;
  align-items: flex-start;
}

.meta-info-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.3;
}

.meta-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.timestamp-row {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 1px;
}

.chat-avatar-top {
  width: 30px;
  height: 30px;
  cursor: pointer;
  object-fit: cover;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }
}

.user-avatar {
  border-radius: 50%;
}

.ai-avatar {
  border-radius: 10px;
}

.ai-name {
  font-weight: 700;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-provider-badge.circle-action-btn {
  width: 18px;
  height: 18px;
  min-width: 18px;
  padding: 0 !important;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-accent) !important;
  user-select: none;
}

.chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    border-radius: 24px;
    background-color: var(--el-bg-color-userbubble);
    border: 1px solid var(--el-border-color-lighter);
    padding-top: 10px;
    padding-bottom: 10px;
    margin-bottom: 0;
    padding-right: 14px;
    box-shadow: none;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-footer) {
    margin-top: 0;
  }
}

html.dark .chat-message .user-bubble {
  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: var(--el-bg-color-userbubble);
    border: 1px solid var(--el-border-color-lighter);
  }
}

.chat-message .ai-bubble {
  width: 100%;
  max-width: 100%;
  align-self: stretch;
  display: block;

  :deep(.el-bubble-content-wrapper) {
    background: transparent;
    box-shadow: none;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 100%;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-header) {
    width: 100%;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background-color: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
    box-shadow: none;
    width: 100%;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-arrow),
  :deep(.el-bubble-content-wrapper .el-bubble-arrow::before),
  :deep(.el-bubble-content-wrapper .el-bubble-arrow::after) {
    display: none;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-footer) {
    margin-top: 0;
    width: 100%;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content-loading .el-bubble-loading-wrap) {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    height: 16px;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content-loading .dot) {
    width: 8px;
    height: 8px;
    background-color: var(--text-accent);
    border-radius: 50%;
    animation: bubble-dot-wave 1.1s infinite ease-in-out;
    transition:
      transform 0.1s ease-out,
      opacity 0.1s ease-out;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content-loading .dot:nth-child(1)) {
    animation-delay: 0s;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content-loading .dot:nth-child(2)) {
    animation-delay: 0.24s;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content-loading .dot:nth-child(3)) {
    animation-delay: 0.48s;
  }
}

html.dark .chat-message .ai-bubble {
  :deep(.el-bubble-content-wrapper) {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  :deep(.el-bubble-content-wrapper .el-bubble-content) {
    background: transparent;
    border: none;
    box-shadow: none;
  }
}

.markdown-wrapper {
  width: 100%;
  min-width: 0;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);

  .message-content-container {
    width: 100%;
    min-width: 0;
  }

  &.has-message-outline .message-content-container {
    padding-left: 36px;
  }

  :deep(.elx-xmarkdown-container) {
    background: transparent !important;
    padding: 0;
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.65;
    tab-size: 4;
    font-family:
      ui-sans-serif,
      -apple-system,
      system-ui,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif,
      'Apple Color Emoji',
      'Segoe UI Emoji',
      'Segoe UI Symbol';
    word-break: break-word;
  }

  /* Remove the extra blank line at message top caused by default block margins. */
  :deep(.elx-xmarkdown-container > :first-child) {
    margin-top: 0 !important;
  }

  :deep(.elx-xmarkdown-container > :last-child) {
    margin-bottom: 0 !important;
  }

  :deep(.elx-xmarkdown-container p:empty) {
    display: none;
  }

  :deep(pre) {
    max-width: 100%;
    overflow-x: auto;
    white-space: pre;
    box-sizing: border-box;
    border-radius: 10px;
    background-color: color-mix(in srgb, var(--el-fill-color-light) 92%, transparent);
    border: 1px solid var(--el-border-color-lighter);
    padding: 12px;
  }

  :deep(.katex) {
    font-size: 1.2em !important;
  }

  :deep(.katex-display > .katex > .katex-html) {
    padding-bottom: 8px !important;
    scrollbar-width: thin;
    scrollbar-color: var(--el-text-color-disabled) transparent;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--el-text-color-disabled);
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: var(--el-text-color-secondary);
    }
  }

  :deep(img) {
    max-width: min(50vw, 400px);
    max-height: min(50vh, 300px);
    width: auto;
    height: auto;
    display: inline-block;
    vertical-align: middle;
    margin: 4px;
    border-radius: 8px;
    object-fit: cover;
  }

  :deep(.chat-audio-player) {
    width: 100%;
    min-width: 40vw;
    height: 48px;
    accent-color: var(--text-primary);

    &::-webkit-media-controls-enclosure {
      background: none;
      border-radius: 24px;
    }

    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #f0f0f0);
      border-radius: 24px;
      padding: 0 10px 0 10px;
      justify-content: center;
    }

    &::-webkit-media-controls-play-button {
      color: var(--text-primary);
      border-radius: 50%;

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }

    &::-webkit-media-controls-current-time-display,
    &::-webkit-media-controls-time-remaining-display {
      color: var(--text-secondary);
      font-size: 13px;
      text-shadow: none;
    }

    &::-webkit-media-controls-timeline {
      border-radius: 3px;
      height: 6px;
      margin: 0 10px;
    }

    &::-webkit-media-controls-mute-button,
    &::-webkit-media-controls-overflow-button {
      color: var(--text-secondary);
      border-radius: 50%;

      &:hover {
        background-color: rgba(0, 0, 0, 0.05);
      }
    }
  }

  :deep(.table-scroll-wrapper) {
    width: 100%;
    overflow-x: auto;
    margin-bottom: 1em;
    border-radius: 6px;

    /* 移动滚动条样式到容器上 */
    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--el-text-color-disabled);
      border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: var(--el-text-color-secondary);
    }
  }

  html.dark & :deep(.chat-audio-player) {
    accent-color: var(--text-primary);

    &::-webkit-media-controls-panel {
      background-color: var(--bg-tertiary, #2c2e33);
    }

    &::-webkit-media-controls-play-button,
    &::-webkit-media-controls-mute-button,
    &::-webkit-media-controls-overflow-button,
    &::-webkit-media-controls-current-time-display,
    &::-webkit-media-controls-time-remaining-display {
      filter: invert(1);
    }

    &::-webkit-media-controls-play-button:hover,
    &::-webkit-media-controls-mute-button:hover,
    &::-webkit-media-controls-overflow-button:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    &::-webkit-media-controls-timeline {
      background-color: transparent;
    }
  }

  :deep(p:last-of-type) {
    margin-bottom: 0;
  }

  :deep(p) {
    margin-top: 0;
    margin-bottom: 1em;
  }

  :deep(ul),
  :deep(ol) {
    margin-bottom: 1em;
  }

  :deep(strong),
  :deep(b) {
    font-weight: 600 !important;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    font-weight: 600;
    line-height: 1.25;
    margin-top: 0.5em;
    margin-bottom: 0.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  :deep(h1) {
    font-size: 1.8em;
  }

  :deep(h2) {
    font-size: 1.5em;
  }

  :deep(h3) {
    font-size: 1.3em;
  }

  :deep(h4) {
    font-size: 1.15em;
  }

  :deep(h5) {
    font-size: 1em;
  }

  :deep(h6) {
    font-size: 0.9em;
    color: var(--el-text-color-secondary);
  }

  :deep(blockquote) {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid var(--el-border-color-dark);
    background-color: rgba(0, 0, 0, 0.035) !important;
    color: var(--el-text-color-secondary);
    border-radius: 0 8px 8px 0;

    html.dark & {
      border-left-color: #656565;
      background-color: rgba(255, 255, 255, 0.05) !important;
    }
  }

  :deep(blockquote p) {
    margin-bottom: 0.5em;
  }

  :deep(blockquote p:last-child) {
    margin-bottom: 0;
  }

  :deep(pre code),
  :deep(.inline-code-tag) {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    font-size: 1em;
  }

  :deep(.inline-code-tag) {
    padding: 0.2em 0.4em;
    margin: 0;
    border-radius: 4px;
    background-color: color-mix(in srgb, var(--el-fill-color-dark) 70%, transparent);
  }

  html:not(.dark) & :deep(pre.shiki) {
    background-color: color-mix(in srgb, var(--el-fill-color-light) 94%, transparent) !important;
  }

  html.dark & {
    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5) {
      border-bottom-color: #373a40;
    }

    :deep(h6) {
      color: #8b949e;
    }

    :deep(hr) {
      background-color: #373a40 !important;
      margin-top: 8px;
      margin-bottom: 8px;
    }

    :deep(table) {
      display: table;
      width: 100%;
      max-width: 100%;
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 0;

      /* 优化表格滚动条样式 */
      &::-webkit-scrollbar {
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--el-text-color-disabled);
        border-radius: 3px;
      }

      &::-webkit-scrollbar-thumb:hover {
        background-color: var(--el-text-color-secondary);
      }
    }

    :deep(th) {
      background-color: #2c2e33;
      min-width: 60px;
    }

    :deep(tr) {
      background-color: #212327;
      border-top: 1px solid #373a40;
    }

    :deep(tr:nth-child(2n)) {
      background-color: #25272b;
    }

    :deep(td) {
      border-color: #373a40;
      min-width: 60px;
    }

    :deep(.pre-md) {
      border: 0px solid #373a40;
    }

    :deep(.inline-code-tag) {
      background-color: rgba(110, 118, 129, 0.4);
      color: #c9d1d9;
    }
  }

  :deep(.markdown-mermaid) {
    background-color: transparent;
    max-width: 100%;
    overflow-x: auto;
    padding: 5px;
    border-radius: 8px;
    box-sizing: border-box;

    .mermaid-content {
      background-color: rgba(245, 245, 245, 0.5);
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }

    html.dark & {
      color: var(--el-text-color-primary) !important;
    }

    .toolbar-container {
      border-radius: 18px;
    }

    .mermaid-toolbar {
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;

      html.dark & {
        background-color: rgba(39, 39, 39, 1);

        .el-tabs__nav {
          background-color: #2c2e33;
        }

        .el-tabs__item.is-active {
          color: #202123 !important;
        }

        .el-tabs__item:hover {
          color: #202123 !important;
        }
      }
    }

    .mermaid-source-code {
      border: hidden;
      border-top-left-radius: 0px;
      border-top-right-radius: 0px;
      background-color: rgba(248, 249, 250, 0.5);
      padding-bottom: 0px;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background-color: var(--el-border-color-darker, #4c4d4f);
        border-radius: 4px;
      }

      &::-webkit-scrollbar-thumb:hover {
        background-color: var(--el-text-color-secondary);
      }

      &::-webkit-scrollbar-corner {
        background: transparent;
      }

      html.dark & {
        background-color: rgba(23, 23, 23, 0.5);
        color: var(--el-text-color-primary);
      }
    }
  }

  &.collapsed :deep(.elx-xmarkdown-container) {
    max-height: 3.4em;
    position: relative;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  }
}

.editing-wrapper {
  width: 100%;
  min-width: 70vw;

  .el-textarea {
    margin-bottom: 8px;

    :deep(.el-textarea__inner) {
      background-color: #ececec;
      box-shadow: none !important;
      border: 1px solid var(--el-border-color-light);
      color: var(--el-text-color-primary);
    }

    :deep(.el-textarea__inner::-webkit-scrollbar) {
      width: 8px;
      height: 8px;
    }

    :deep(.el-textarea__inner::-webkit-scrollbar-track) {
      background: transparent;
      border-radius: 4px;
    }

    :deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
      background: var(--el-text-color-disabled, #c0c4cc);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }

    :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
      background: var(--el-text-color-secondary, #909399);
      background-clip: content-box;
    }

    html.dark & :deep(.el-textarea__inner::-webkit-scrollbar-thumb) {
      background: #6b6b6b;
    }

    html.dark & :deep(.el-textarea__inner::-webkit-scrollbar-thumb:hover) {
      background: #999;
    }
  }

  .editing-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .el-button--primary {
      --el-button-bg-color: var(--bg-accent);
      --el-button-border-color: var(--bg-accent);
      --el-button-text-color: var(--text-on-accent);
    }

    .el-button--primary:hover {
      --el-button-hover-bg-color: var(--bg-accent-light);
      --el-button-hover-border-color: var(--bg-accent-light);
    }
  }

  .edit-shortcut-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-right: auto;
    align-self: center;
  }
}

html.dark .editing-wrapper {
  .el-textarea :deep(.el-textarea__inner) {
    background-color: #424242;
    border-color: var(--border-primary);
    color: var(--text-primary);
  }

  .editing-actions .el-button--primary {
    --el-button-hover-bg-color: #e0e0e0;
    --el-button-hover-border-color: #e0e0e0;
  }
}

.message-files-vertical-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  padding-right: 5px;
  max-height: 150px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px !important;
    height: 8px !important;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--el-text-color-disabled, #c0c4cc);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--el-text-color-secondary, #909399);
    background-clip: content-box;
  }

  .file-button {
    width: auto;
    justify-content: flex-start;
    border: none;
    background-color: var(--el-fill-color-light);
    color: var(--el-color-info);
  }

  .file-button:hover {
    border: none;
    background-color: var(--el-fill-color-lighter);
    color: var(--el-color-info);
  }
}

html.dark .message-files-vertical-list {
  &::-webkit-scrollbar {
    width: 8px !important;
    height: 8px !important;
  }

  &::-webkit-scrollbar-thumb {
    background: #6b6b6b;
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #999;
  }

  .file-button {
    background-color: var(--el-fill-color-dark);
    color: var(--el-text-color-regular);
  }

  .file-button:hover {
    background-color: var(--el-fill-color-darker);
    color: var(--el-text-color-regular);
  }
}

.ai-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

html.dark .ai-name {
  color: var(--el-text-color-regular);
}

.voice-name {
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
  margin-right: 8px;
}

.message-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  margin-top: 6px;
  min-height: 22px;
}

.ai-footer {
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
}

.ai-bubble .ai-footer .footer-actions {
  margin-right: 0;
}

.ai-footer .footer-token-metrics {
  margin-left: auto;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    visibility 0.16s ease;
}

.message-wrapper:hover .footer-actions,
.message-wrapper:focus-within .footer-actions {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.footer-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  opacity: 0.82;
  transition:
    color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.footer-action-btn:hover {
  color: var(--el-text-color-primary);
  opacity: 1;
  background-color: var(--el-color-primary-light-9);
  box-shadow: 0 5px 10px -7px color-mix(in srgb, var(--el-color-primary) 36%, transparent);
}

.footer-action-btn:active {
  transform: translateY(1px);
}

.footer-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.footer-action-btn.is-copied {
  color: var(--el-color-success);
  opacity: 1;
}

.footer-action-icon {
  width: 15px;
  height: 15px;
}

.footer-token-metrics {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background-color: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  transition:
    color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;
}

.message-wrapper:hover .footer-token-metrics,
.message-wrapper:focus-within .footer-token-metrics {
  opacity: 0.86;
  visibility: visible;
  pointer-events: auto;
}

.token-total {
  font-weight: 600;
  color: var(--text-primary);
}

.token-direction-icon {
  color: var(--text-tertiary);
}

.token-direction-value {
  color: var(--text-secondary);
}

.footer-token-metrics:hover {
  color: var(--el-text-color-primary);
  opacity: 1;
  background-color: var(--el-color-primary-light-9);
  box-shadow: 0 5px 10px -7px color-mix(in srgb, var(--el-color-primary) 36%, transparent);
}

:deep(.token-metrics-tooltip) {
  padding: 8px 10px !important;
}

:deep(.token-metrics-tooltip .token-tooltip-content) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: auto;
}

:deep(.token-metrics-tooltip .token-tooltip-row) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-primary);
}

:deep(.token-metrics-tooltip .token-tooltip-row > span) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

:deep(.token-metrics-tooltip .token-tooltip-icon) {
  color: var(--text-secondary);
  flex-shrink: 0;
}

:deep(.token-metrics-tooltip .token-tooltip-speed) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

:deep(.token-metrics-tooltip .token-tooltip-divider) {
  color: var(--text-tertiary);
  font-weight: 400;
}

.copy-icon-swap-enter-active,
.copy-icon-swap-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.copy-icon-swap-enter-from,
.copy-icon-swap-leave-to {
  opacity: 0;
  transform: scale(0.82);
}

@media (hover: none) {
  .footer-actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .footer-token-metrics {
    opacity: 0.82;
    visibility: visible;
    pointer-events: auto;
  }
}

.footer-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.user-bubble .footer-actions {
  margin-left: auto;
}

.ai-bubble .footer-actions {
  margin-right: auto;
}

.timestamp {
  margin-top: 12px;
  font-size: 0.75rem;
  opacity: 0.8;
  white-space: nowrap;
  flex-shrink: 0;
}

.tool-calls-container {
  width: 100%;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.single-tool-wrapper {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 78%, transparent);
  background: color-mix(in srgb, var(--el-fill-color-light) 86%, transparent);
  color: var(--el-text-color-primary);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.single-tool-wrapper.is-dark {
  background: color-mix(in srgb, var(--el-fill-color-darker, #2c2e33) 84%, transparent);
  border-color: color-mix(in srgb, var(--el-border-color-dark, #373a40) 80%, transparent);
}

.tool-collapse {
  width: 100%;
  border: none;
  background: transparent;
  --el-collapse-header-height: auto;
}

.tool-collapse :deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  border-bottom: none !important;
  border-radius: 13px;
  padding: 8px 10px;
  min-height: 36px;
  font-size: 12.5px;
  line-height: 1.3;
  color: inherit;
  transition: background-color 0.2s ease;
}

.tool-collapse :deep(.el-collapse-item__header:hover) {
  background-color: color-mix(in srgb, var(--el-fill-color) 70%, transparent);
}

.single-tool-wrapper.is-dark .tool-collapse :deep(.el-collapse-item__header:hover) {
  background-color: color-mix(in srgb, var(--el-fill-color-dark, #323844) 68%, transparent);
}

.tool-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border: none;
}

.tool-collapse :deep(.el-collapse-item__content) {
  padding: 0 10px 10px;
}

.tool-collapse :deep(.el-collapse-item__arrow) {
  display: none !important;
}

.tool-call-title {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.tool-name {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--el-text-color-regular);
}

.tool-icon {
  color: var(--text-accent);
  flex-shrink: 0;
}

.tool-header-right {
  margin-left: auto;
  margin-right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-chevron {
  width: 16px;
  height: 16px;
  color: var(--el-text-color-secondary);
  stroke: currentColor;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  flex-shrink: 0;
}

.tool-collapse :deep(.el-collapse-item__header.is-active .tool-chevron) {
  transform: rotate(90deg);
}

.stop-btn-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--el-text-color-primary);
  color: var(--el-bg-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);

  &:hover {
    opacity: 0.85;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.95);
  }
}

html.dark .stop-btn-wrapper {
  background-color: #e5eaf3;
  color: #141414;

  &:hover {
    background-color: #f7f7f3;
  }
}

.tool-approval-actions {
  margin: 0 10px 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--el-fill-color) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 78%, transparent);
  border-top: 1px dashed color-mix(in srgb, var(--el-border-color-lighter) 78%, transparent);
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  animation: slide-in 0.2s ease-out;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.actions-left {
  display: flex;
  gap: 10px;
}

.actions-right {
  margin-left: auto;

  :deep(.el-checkbox__label) {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.tool-call-details {
  .tool-detail-section {
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: 0;
    }

    strong {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    pre {
      margin: 0;
      padding: 8px;
      border-radius: 6px;
      background-color: color-mix(in srgb, var(--el-fill-color) 76%, transparent);
      border: 1px solid var(--el-border-color-lighter);
      max-height: 150px;
      overflow: auto;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;

      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        color: var(--el-text-color-primary);
      }
    }
  }
}

.tool-call-details .tool-detail-section pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.tool-call-details .tool-detail-section pre::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb {
  background: var(--el-text-color-disabled, #c0c4cc);
  border-radius: 4px;
  border: 2px solid color-mix(in srgb, var(--el-fill-color) 76%, transparent);
  background-clip: content-box;
}

.tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb:hover {
  background: var(--el-text-color-secondary, #909399);
  background-clip: content-box;
}

.tool-result-wrapper {
  display: flex;
  align-items: flex-start;
}

.tool-result-wrapper pre {
  flex-grow: 1;
}

html.dark .stop-btn-wrapper:hover {
  background-color: rgba(245, 108, 108, 0.2);
  color: #f56c6c;
}

.single-tool-wrapper.is-dark .tool-approval-actions {
  background: color-mix(in srgb, var(--el-fill-color-dark, #323844) 74%, transparent);
  border-color: color-mix(in srgb, var(--el-border-color-dark, #373a40) 80%, transparent);
  border-top-color: color-mix(in srgb, var(--el-border-color-dark, #373a40) 80%, transparent);
}

.single-tool-wrapper.is-dark .tool-call-details .tool-detail-section pre {
  background-color: color-mix(in srgb, var(--el-fill-color-darker, #262a31) 84%, transparent);
  border-color: var(--el-border-color-dark, #373a40);
}

.single-tool-wrapper.is-dark .tool-call-details .tool-detail-section pre::-webkit-scrollbar-thumb {
  background: #6b6b6b;
  border-color: color-mix(in srgb, var(--el-fill-color-darker, #262a31) 84%, transparent);
}

.single-tool-wrapper.is-dark
  .tool-call-details
  .tool-detail-section
  pre::-webkit-scrollbar-thumb:hover {
  background: #999;
}

:deep(.local-file-link) {
  color: var(--el-color-primary);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 4px;
  cursor: pointer;
  word-break: break-all;
  font-weight: 500;
}

:deep(.local-file-link:hover) {
  opacity: 0.8;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  border-radius: 4px;
}

@keyframes bubble-dot-wave {
  0%,
  100% {
    transform: scale(0.82);
    opacity: 0.42;
  }
  50% {
    transform: scale(1);
    opacity: 0.9;
  }
}
</style>
