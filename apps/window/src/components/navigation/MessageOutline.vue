<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { extractMarkdownHeadings, type HeadingItem } from '../../utils/markdown/headingIds';

type MessageStyle = 'horizontal' | 'vertical' | 'fold' | 'grid' | '';
type OutlinePosition = 'before' | 'active' | 'after';
const INPUT_RESIZE_CLASS = 'chat-input-resizing';
const INPUT_RESIZE_END_EVENT = 'chat-input-resize-end';

interface Props {
  messageId: string | number;
  markdown: string;
  enabled?: boolean;
  messageStyle?: MessageStyle;
}

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
  messageStyle: '',
});

const headingIdPrefix = computed(() => `heading-${String(props.messageId)}`);

const headings = computed<HeadingItem[]>(() => {
  if (!props.enabled) return [];
  return extractMarkdownHeadings(props.markdown || '', {
    idPrefix: headingIdPrefix.value,
  });
});

const minHeadingLevel = computed(() => {
  if (headings.value.length === 0) return 1;
  return headings.value.reduce((minLevel, item) => Math.min(minLevel, item.level), 6);
});

const shouldShow = computed(
  () => props.enabled && props.messageStyle !== 'grid' && headings.value.length > 0,
);

const containerRef = ref<HTMLElement | null>(null);
const outlinePosition = ref<OutlinePosition>('after');
const isActive = computed(() => outlinePosition.value === 'active');
const stickyTopPx = ref<number | null>(null);
const outlineBodyStyle = computed(() => ({
  top: stickyTopPx.value === null ? '50%' : `${stickyTopPx.value}px`,
}));

let scrollHost: HTMLElement | null = null;
let scrollTarget: EventTarget | null = null;
let frameId = 0;

const escapeSelector = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
};

const dotWidth = (level: number) => {
  const base = 12;
  const offset = Math.max(0, level - minHeadingLevel.value);
  return Math.max(4, base - offset * 2);
};

const textOffset = (level: number) => Math.max(0, level - minHeadingLevel.value) * 8;

const isInputResizing = () =>
  typeof document !== 'undefined' &&
  (document.documentElement?.classList.contains(INPUT_RESIZE_CLASS) ||
    document.body?.classList.contains(INPUT_RESIZE_CLASS));

const getViewportCenterY = () => {
  return window.innerHeight / 2;
};

const syncStickyTop = () => {
  const centerY = window.innerHeight / 2;
  if (!scrollHost) {
    stickyTopPx.value = Math.round(centerY);
    return;
  }

  const rect = scrollHost.getBoundingClientRect();
  const minTop = 12;
  const maxTop = Math.max(minTop, rect.height - 12);
  const relativeTop = centerY - rect.top;
  const clampedTop = Math.min(maxTop, Math.max(minTop, relativeTop));
  stickyTopPx.value = Math.round(clampedTop);
};

const computeActiveState = () => {
  if (!containerRef.value) {
    outlinePosition.value = 'active';
    return;
  }

  const messageElement = containerRef.value.closest('.chat-message') as HTMLElement | null;
  if (!messageElement) {
    outlinePosition.value = 'active';
    return;
  }

  const rect = messageElement.getBoundingClientRect();
  const centerY = getViewportCenterY();
  if (rect.bottom <= centerY) {
    outlinePosition.value = 'before';
    return;
  }
  if (rect.top >= centerY) {
    outlinePosition.value = 'after';
    return;
  }
  outlinePosition.value = 'active';
};

const scheduleLayoutSync = () => {
  if (frameId) return;
  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    if (isInputResizing()) return;
    syncStickyTop();
    computeActiveState();
  });
};

const handleViewportChange = () => {
  if (isInputResizing()) return;
  scheduleLayoutSync();
};

const handleInputResizeEnd = () => {
  scheduleLayoutSync();
};

const bindViewportListeners = () => {
  scrollHost = (containerRef.value?.closest('.chat-main') as HTMLElement | null) || null;
  scrollTarget = scrollHost || window;
  scrollTarget.addEventListener('scroll', handleViewportChange, { passive: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener(INPUT_RESIZE_END_EVENT, handleInputResizeEnd);
};

const unbindViewportListeners = () => {
  if (scrollTarget) {
    scrollTarget.removeEventListener('scroll', handleViewportChange);
  }
  scrollTarget = null;
  scrollHost = null;
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener(INPUT_RESIZE_END_EVENT, handleInputResizeEnd);
};

const scrollToHeading = (id: string) => {
  const messageElement = document.getElementById(`message-${String(props.messageId)}`);
  if (!messageElement) return;

  const target = messageElement.querySelector<HTMLElement>(`#${escapeSelector(id)}`);
  if (!target) return;

  const block: ScrollLogicalPosition =
    props.messageStyle === 'horizontal' || props.messageStyle === 'grid' ? 'nearest' : 'start';

  target.scrollIntoView({
    behavior: 'smooth',
    block,
    inline: 'nearest',
  });
};

onMounted(async () => {
  await nextTick();
  bindViewportListeners();
  scheduleLayoutSync();
});

onBeforeUnmount(() => {
  if (frameId) {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  }
  unbindViewportListeners();
});

watch(
  () => [props.enabled, props.messageStyle, props.markdown, headings.value.length],
  async () => {
    await nextTick();
    scheduleLayoutSync();
  },
);
</script>

<template>
  <div
    v-if="shouldShow"
    ref="containerRef"
    class="message-outline-container"
    :class="[`is-${outlinePosition}`, { 'is-active': isActive }]"
  >
    <div class="message-outline-body" :style="outlineBodyStyle">
      <button
        v-for="heading in headings"
        :key="heading.id"
        type="button"
        class="message-outline-item"
        :title="heading.text"
        @click="scrollToHeading(heading.id)"
      >
        <span class="message-outline-dot" :style="{ width: `${dotWidth(heading.level)}px` }"></span>
        <span
          class="message-outline-text"
          :style="{ paddingLeft: `${textOffset(heading.level)}px` }"
        >
          {{ heading.text }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-outline-container {
  position: absolute;
  left: -38px;
  top: 0;
  bottom: 0;
  width: 32px;
  pointer-events: none;
  z-index: 2;
}

.message-outline-body {
  position: sticky;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(72vh, calc(100vh - 24px));
  padding: 8px 0 8px 6px;
  border-radius: 10px;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  transition:
    transform 160ms ease,
    opacity 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    padding 0.2s ease;
}

.message-outline-container.is-active .message-outline-body {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%);
}

.message-outline-container.is-before .message-outline-body {
  transform: translateY(calc(-50% - 8px));
}

.message-outline-container.is-after .message-outline-body {
  transform: translateY(calc(-50% + 8px));
}

.message-outline-body:hover {
  padding-right: 8px;
  background: color-mix(in srgb, var(--el-bg-color-overlay) 88%, transparent);
  box-shadow: var(--el-box-shadow-lighter);
  overflow-y: auto;
}

.message-outline-item {
  appearance: none;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.message-outline-dot {
  display: inline-block;
  height: 4px;
  min-width: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-text-color-secondary) 70%, transparent);
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.message-outline-item:hover .message-outline-dot {
  background: var(--el-text-color-primary);
}

.message-outline-text {
  font-size: 12px;
  line-height: 1.2;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  max-width: 0;
  transition:
    opacity 0.2s ease,
    max-width 0.2s ease,
    color 0.2s ease,
    padding-left 0.2s ease;
}

.message-outline-body:hover .message-outline-text {
  opacity: 1;
  max-width: 260px;
}

.message-outline-item:hover .message-outline-text {
  color: var(--el-text-color-primary);
}
</style>
