<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { extractMarkdownHeadings, type HeadingItem } from '../../utils/markdown/headingIds';

type MessageStyle = 'horizontal' | 'vertical' | 'fold' | 'grid' | '';

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
const centerTopPx = ref(0);
const isCenterActive = ref(true);

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

const getViewportCenterY = () => {
  if (scrollHost) {
    const rect = scrollHost.getBoundingClientRect();
    return rect.top + rect.height / 2;
  }
  return window.innerHeight / 2;
};

const computeCenterTop = () => {
  if (scrollHost) {
    centerTopPx.value = Math.max(0, scrollHost.getBoundingClientRect().height / 2);
    return;
  }
  centerTopPx.value = Math.max(0, window.innerHeight / 2);
};

const computeActiveState = () => {
  if (!containerRef.value) {
    isCenterActive.value = true;
    return;
  }

  const messageElement = containerRef.value.closest('.chat-message') as HTMLElement | null;
  if (!messageElement) {
    isCenterActive.value = true;
    return;
  }

  const rect = messageElement.getBoundingClientRect();
  const centerY = getViewportCenterY();
  isCenterActive.value = rect.top <= centerY && rect.bottom >= centerY;
};

const syncLayoutState = () => {
  computeCenterTop();
  computeActiveState();
};

const scheduleLayoutSync = () => {
  if (frameId) return;
  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    syncLayoutState();
  });
};

const handleViewportChange = () => {
  scheduleLayoutSync();
};

const bindViewportListeners = () => {
  scrollHost = (containerRef.value?.closest('.chat-main') as HTMLElement | null) || null;
  scrollTarget = scrollHost || window;
  scrollTarget.addEventListener('scroll', handleViewportChange, { passive: true });
  window.addEventListener('resize', handleViewportChange, { passive: true });
};

const unbindViewportListeners = () => {
  if (scrollTarget) {
    scrollTarget.removeEventListener('scroll', handleViewportChange);
  }
  scrollTarget = null;
  scrollHost = null;
  window.removeEventListener('resize', handleViewportChange);
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
  syncLayoutState();
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
    :class="{ 'is-active': isCenterActive }"
  >
    <div class="message-outline-body" :style="{ '--outline-center-top': `${centerTopPx}px` }">
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
  left: 0;
  top: 0;
  bottom: 0;
  width: 32px;
  pointer-events: none;
  z-index: 1;
}

.message-outline-body {
  position: sticky;
  top: var(--outline-center-top, 50%);
  transform: translateY(-50%);
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(72vh, calc(100vh - 24px));
  padding: 8px 0 8px 6px;
  border-radius: 10px;
  pointer-events: auto;
  overflow: hidden;
  opacity: 0.72;
  transition:
    opacity 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    padding 0.2s ease;
}

.message-outline-container.is-active .message-outline-body {
  opacity: 1;
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
