<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronsDown } from 'lucide-vue-next';
import { resolveModelLogoUrl } from '../../utils/modelLogos';

type MessageId = string | number;

interface NavigationMessage {
  id?: MessageId;
  messageId?: MessageId;
  role?: string;
  aiName?: string;
  modelLabel?: string;
  [key: string]: any;
}

interface Props {
  messages: NavigationMessage[];
  focusedMessageId: MessageId | null;
  showScrollToBottomButton: boolean;
  getMessagePreviewText: (message: NavigationMessage) => string;
  userAvatar?: string;
  aiAvatar?: string;
}

const props = withDefaults(defineProps<Props>(), {
  userAvatar: 'user.png',
  aiAvatar: 'ai.svg',
});

const emit = defineEmits<{
  (e: 'jump', messageId: MessageId): void;
  (e: 'bottom'): void;
}>();

const messagesListRef = ref<HTMLElement | null>(null);
const mouseY = ref<number | null>(null);
const listOffsetY = ref(0);
const itemRefs = ref(new Map<string, HTMLElement>());

const BOTTOM_ANCHOR_ID = '__bottom_anchor__';

const navigationMessages = computed(() =>
  props.messages.filter((message) => String(message?.role || '').toLowerCase() !== 'system'),
);

const toItemId = (message: NavigationMessage) => String(message?.messageId ?? message?.id ?? '');

const setItemRef = (id: string, el: HTMLElement | null) => {
  if (!el) {
    itemRefs.value.delete(id);
    return;
  }
  itemRefs.value.set(id, el);
};

const calculateValueByDistance = (itemId: string, maxValue: number) => {
  if (mouseY.value === null) return 0;

  const listElement = messagesListRef.value;
  const itemElement = itemRefs.value.get(itemId);
  if (!listElement || !itemElement) return 0;

  const listRect = listElement.getBoundingClientRect();
  const itemRect = itemElement.getBoundingClientRect();
  const centerY = itemRect.top + itemRect.height / 2;
  const distance = Math.abs(centerY - listRect.top - mouseY.value);
  const maxDistance = 100;
  return Math.max(0, maxValue * (1 - distance / maxDistance));
};

const getDefaultOpacity = (index: number, length: number) =>
  Math.max(0.2, 0.62 - (0.3 * Math.abs(index - length / 2)) / 5);

const getItemStyle = (itemId: string, index: number, total: number) => {
  const opacity =
    mouseY.value !== null
      ? 0.5 + calculateValueByDistance(itemId, 0.5)
      : getDefaultOpacity(index, total);
  const scale = 1 + calculateValueByDistance(itemId, 0.2);
  const size = 10 + calculateValueByDistance(itemId, 12);
  return {
    opacity,
    scale,
    size,
  };
};

const getAuthorName = (message: NavigationMessage) => {
  if (String(message?.role || '').toLowerCase() === 'assistant') {
    const modelLabel = String(message?.modelLabel || '');
    if (modelLabel.includes('|')) {
      const parts = modelLabel.split('|');
      const name = parts[parts.length - 1]?.trim();
      if (name) return name;
    }
    return String(message?.aiName || 'AI');
  }
  return 'You';
};

const getAssistantModelIdentity = (message: NavigationMessage) => {
  const modelLabel = String(message?.modelLabel || message?.aiName || '').trim();
  const modelKey = String(message?.modelKey || message?.model || '').trim();

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

  const fallbackName = String(message?.aiName || 'AI').trim() || 'AI';
  const modelName = modelNameFromKey || modelNameFromLabel || fallbackName;

  return {
    modelName,
    providerName: providerName || providerId,
    providerId,
  };
};

const getAvatarSource = (message: NavigationMessage) => {
  const isAssistant = String(message?.role || '').toLowerCase() === 'assistant';
  if (!isAssistant) {
    return props.userAvatar;
  }

  const identity = getAssistantModelIdentity(message);
  return (
    resolveModelLogoUrl(identity.modelName, {
      providerName: identity.providerName,
      metadataProviderId: identity.providerId,
    }) || props.aiAvatar
  );
};

const handleAvatarError = (event: Event, message: NavigationMessage) => {
  const img = event?.target as HTMLImageElement | null;
  if (!img || img.dataset.anchorFallbackApplied === '1') return;
  img.dataset.anchorFallbackApplied = '1';
  const isAssistant = String(message?.role || '').toLowerCase() === 'assistant';
  img.src = isAssistant ? props.aiAvatar : props.userAvatar;
};

const handleMouseMove = (event: MouseEvent) => {
  const listElement = messagesListRef.value;
  const containerElement = event.currentTarget as HTMLElement | null;
  if (!listElement || !containerElement) return;

  const containerRect = containerElement.getBoundingClientRect();
  const listRect = listElement.getBoundingClientRect();
  mouseY.value = event.clientY - listRect.top;

  if (listRect.height > containerRect.height) {
    const mousePositionRatio = (event.clientY - containerRect.top) / containerRect.height;
    const maxOffset = (containerRect.height - listRect.height) / 2 - 20;
    listOffsetY.value = -maxOffset + mousePositionRatio * (maxOffset * 2);
  } else {
    listOffsetY.value = 0;
  }
};

const handleMouseLeave = () => {
  mouseY.value = null;
  listOffsetY.value = 0;
};

const jumpToMessage = (message: NavigationMessage) => {
  const messageId = message?.messageId ?? message?.id;
  if (messageId === undefined || messageId === null) return;
  emit('jump', messageId);
};

const isActiveMessage = (message: NavigationMessage) =>
  String(props.focusedMessageId ?? '') === String(message?.messageId ?? message?.id ?? '');
</script>

<template>
  <div
    v-if="navigationMessages.length > 0"
    class="message-anchor-line"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div
      ref="messagesListRef"
      class="message-anchor-list"
      :style="{ transform: `translateY(${listOffsetY}px)` }"
    >
      <div
        v-for="(message, index) in navigationMessages"
        :key="toItemId(message)"
        :ref="(el: any) => setItemRef(toItemId(message), el)"
        class="message-anchor-item"
        :class="{ active: isActiveMessage(message) }"
        :style="{
          opacity: getItemStyle(toItemId(message), index, navigationMessages.length).opacity,
        }"
        @click="jumpToMessage(message)"
      >
        <div
          class="message-anchor-content"
          :style="{
            transform: `scale(${getItemStyle(toItemId(message), index, navigationMessages.length).scale})`,
          }"
        >
          <div class="anchor-content-title">{{ getAuthorName(message) }}</div>
          <div class="anchor-content-preview">
            {{ props.getMessagePreviewText(message) }}
          </div>
        </div>

        <img
          class="message-anchor-avatar"
          :src="getAvatarSource(message)"
          alt="message avatar"
          @error="(event) => handleAvatarError(event, message)"
          :style="{
            width: `${getItemStyle(toItemId(message), index, navigationMessages.length).size}px`,
            height: `${getItemStyle(toItemId(message), index, navigationMessages.length).size}px`,
          }"
        />
      </div>

      <div
        :ref="(el: any) => setItemRef(BOTTOM_ANCHOR_ID, el)"
        class="message-anchor-item bottom-anchor"
        :class="{ 'is-highlight': props.showScrollToBottomButton }"
        :style="{
          opacity: mouseY !== null ? 0.6 + calculateValueByDistance(BOTTOM_ANCHOR_ID, 0.4) : 0.56,
        }"
        @click="emit('bottom')"
      >
        <div class="message-anchor-content bottom-content">
          <div class="anchor-content-title">底部</div>
          <div class="anchor-content-preview">滚动到最新消息</div>
        </div>
        <div
          class="bottom-anchor-icon"
          :style="{
            width: `${10 + calculateValueByDistance(BOTTOM_ANCHOR_ID, 16)}px`,
            height: `${10 + calculateValueByDistance(BOTTOM_ANCHOR_ID, 16)}px`,
          }"
        >
          <ChevronsDown :size="12" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-anchor-line {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  max-height: min(70vh, calc(100% - 20px));
  z-index: 90;
  overflow: hidden;
  display: flex;
  justify-content: flex-end;
  user-select: none;
  transition: width 0.25s ease;
}

.message-anchor-line:hover {
  width: 460px;
  overflow: visible;
}

.message-anchor-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 4px 0;
  will-change: transform;
}

.message-anchor-item {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
  cursor: pointer;
  transform-origin: right center;
  padding: 0;
  transition:
    opacity 0.12s linear,
    filter 0.2s ease;
}

.message-anchor-item.active .message-anchor-avatar {
}

.message-anchor-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  gap: 3px;
  opacity: 0;
  max-width: 240px;
  transform-origin: right center;
  transition:
    opacity 0.2s ease,
    transform 0.18s ease;
}

.message-anchor-line:hover .message-anchor-content {
  opacity: 1;
}

.anchor-content-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.1;
}

.anchor-content-preview {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.2;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-anchor-avatar {
  border-radius: 999px;
  object-fit: cover;
  flex-shrink: 0;
  transition:
    width 0.16s ease,
    height 0.16s ease,
    box-shadow 0.16s ease;
}

.bottom-anchor {
  margin-top: 6px;
}

.bottom-anchor-icon {
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.bottom-anchor.is-highlight .bottom-anchor-icon {
  background: color-mix(in srgb, var(--el-color-primary) 24%, transparent);
}

.bottom-content .anchor-content-title {
  color: var(--el-color-primary);
}

@media (max-width: 900px) {
  .message-anchor-line {
    right: 6px;
  }
}
</style>
