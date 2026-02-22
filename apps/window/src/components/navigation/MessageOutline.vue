<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { extractMarkdownHeadings, type HeadingItem } from '../../utils/markdown/headingIds';
import {
  buildViewportMetrics,
  pickActiveHeading,
  resolveOutlinePosition,
  type HeadingIntersectionState,
  type OutlinePosition,
  type ViewportMetrics,
} from '../../utils/messageOutlineViewport';

type MessageStyle = 'horizontal' | 'vertical' | 'fold' | 'grid' | '';
const INPUT_RESIZE_CLASS = 'chat-input-resizing';
const INPUT_RESIZE_END_EVENT = 'chat-input-resize-end';
const STICKY_EDGE_PADDING_PX = 12;
const HEADING_OBSERVER_ROOT_MARGIN = '-10% 0px -80% 0px';
const HEADING_OBSERVER_THRESHOLD = 0;
const ACTIVE_STATE_HYSTERESIS_PX = 6;

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
const activeHeadingId = ref<string | null>(null);
const outlineBodyStyle = computed(() => ({
  top: stickyTopPx.value === null ? '50%' : `${stickyTopPx.value}px`,
}));

let scrollHost: HTMLElement | null = null;
let scrollTarget: EventTarget | null = null;
let frameId = 0;
let headingObserver: IntersectionObserver | null = null;
let observerSetupTicket = 0;
let pendingLayoutSync: 'state' | 'full' = 'full';
const headingStates = new Map<string, Omit<HeadingIntersectionState, 'id'>>();
const headingSignature = computed(() => headings.value.map((heading) => heading.id).join('|'));

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

const resolveScrollHost = () =>
  (containerRef.value?.closest('.chat-main') as HTMLElement | null) || null;

const getViewportMetrics = (): ViewportMetrics => {
  const host = scrollHost || resolveScrollHost();
  if (host) {
    scrollHost = host;
    const rect = host.getBoundingClientRect();
    return buildViewportMetrics(rect.top, rect.bottom);
  }
  return buildViewportMetrics(0, window.innerHeight);
};

const syncStickyTop = () => {
  const viewport = getViewportMetrics();
  const minTop = STICKY_EDGE_PADDING_PX;
  const maxTop = Math.max(minTop, viewport.height - STICKY_EDGE_PADDING_PX);
  const relativeTop = viewport.centerY - viewport.top;
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
  const viewport = getViewportMetrics();
  if (outlinePosition.value === 'active') {
    if (rect.bottom <= viewport.centerY - ACTIVE_STATE_HYSTERESIS_PX) {
      outlinePosition.value = 'before';
      return;
    }
    if (rect.top >= viewport.centerY + ACTIVE_STATE_HYSTERESIS_PX) {
      outlinePosition.value = 'after';
      return;
    }
    outlinePosition.value = 'active';
    return;
  }

  outlinePosition.value = resolveOutlinePosition(rect, viewport);
};

const scheduleLayoutSync = (mode: 'state' | 'full') => {
  if (mode === 'full') {
    pendingLayoutSync = 'full';
  } else if (pendingLayoutSync !== 'full') {
    pendingLayoutSync = 'state';
  }

  if (frameId) return;
  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    if (isInputResizing()) return;
    if (pendingLayoutSync === 'full') {
      syncStickyTop();
    }
    computeActiveState();
    pendingLayoutSync = 'state';
  });
};

const handleScroll = () => {
  if (isInputResizing()) return;
  scheduleLayoutSync('state');
};

const handleViewportResize = () => {
  if (isInputResizing()) return;
  scheduleLayoutSync('full');
};

const handleInputResizeEnd = () => {
  scheduleLayoutSync('full');
};

const clearHeadingObserver = () => {
  observerSetupTicket += 1;
  if (headingObserver) {
    headingObserver.disconnect();
    headingObserver = null;
  }
  headingStates.clear();
};

const recomputeActiveHeading = () => {
  const fallbackId =
    activeHeadingId.value && headings.value.some((heading) => heading.id === activeHeadingId.value)
      ? activeHeadingId.value
      : null;

  const candidates: HeadingIntersectionState[] = headings.value.map((heading, index) => {
    const state = headingStates.get(heading.id);
    return {
      id: heading.id,
      isIntersecting: Boolean(state?.isIntersecting),
      top: state?.top ?? Number.POSITIVE_INFINITY,
      order: state?.order ?? index,
    };
  });

  activeHeadingId.value = pickActiveHeading(candidates, fallbackId);
};

const setupHeadingObserver = async () => {
  const ticket = observerSetupTicket + 1;
  clearHeadingObserver();
  observerSetupTicket = ticket;
  activeHeadingId.value = null;
  if (!shouldShow.value) return;

  await nextTick();
  if (ticket !== observerSetupTicket) return;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  if (ticket !== observerSetupTicket) return;

  const observerRoot = scrollHost || resolveScrollHost();
  if (observerRoot) {
    scrollHost = observerRoot;
  }

  const messageElement = document.getElementById(`message-${String(props.messageId)}`);
  if (!messageElement) return;

  const observedElements: HTMLElement[] = [];
  headings.value.forEach((heading, index) => {
    const element = messageElement.querySelector<HTMLElement>(`#${escapeSelector(heading.id)}`);
    if (!element) return;
    headingStates.set(heading.id, {
      isIntersecting: false,
      top: Number.POSITIVE_INFINITY,
      order: index,
    });
    observedElements.push(element);
  });

  if (observedElements.length === 0) return;

  headingObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement | null)?.id;
        if (!id) return;

        const previous = headingStates.get(id);
        if (!previous) return;

        headingStates.set(id, {
          isIntersecting: entry.isIntersecting,
          top: entry.boundingClientRect.top,
          order: previous.order,
        });
      });

      recomputeActiveHeading();
    },
    {
      root: observerRoot,
      rootMargin: HEADING_OBSERVER_ROOT_MARGIN,
      threshold: HEADING_OBSERVER_THRESHOLD,
    },
  );

  observedElements.forEach((element) => {
    headingObserver?.observe(element);
  });
};

const bindViewportListeners = () => {
  scrollHost = resolveScrollHost();
  scrollTarget = scrollHost || window;
  scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleViewportResize, { passive: true });
  window.addEventListener(INPUT_RESIZE_END_EVENT, handleInputResizeEnd);
};

const unbindViewportListeners = () => {
  if (scrollTarget) {
    scrollTarget.removeEventListener('scroll', handleScroll);
  }
  scrollTarget = null;
  scrollHost = null;
  window.removeEventListener('resize', handleViewportResize);
  window.removeEventListener(INPUT_RESIZE_END_EVENT, handleInputResizeEnd);
};

const scrollToHeading = (id: string) => {
  const messageElement = document.getElementById(`message-${String(props.messageId)}`);
  if (!messageElement) return;

  const target = messageElement.querySelector<HTMLElement>(`#${escapeSelector(id)}`);
  if (!target) return;

  activeHeadingId.value = id;

  const useNearest = props.messageStyle === 'horizontal' || props.messageStyle === 'grid';
  if (useNearest) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
    return;
  }

  const host = scrollHost || resolveScrollHost();
  if (!host) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
    return;
  }

  const hostRect = host.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = Math.max(0, host.scrollTop + (targetRect.top - hostRect.top));
  host.scrollTo({
    top: nextTop,
    behavior: 'smooth',
  });
};

onMounted(async () => {
  await nextTick();
  bindViewportListeners();
  scheduleLayoutSync('full');
  void setupHeadingObserver();
});

onBeforeUnmount(() => {
  if (frameId) {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  }
  clearHeadingObserver();
  unbindViewportListeners();
});

watch(
  () => [props.enabled, props.messageStyle, props.markdown, headingSignature.value],
  async () => {
    await nextTick();
    scheduleLayoutSync('full');
    void setupHeadingObserver();
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
        :class="{ 'is-active': activeHeadingId === heading.id }"
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
  left: calc(-1 * var(--message-outline-left-offset, 38px));
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

.message-outline-item.is-active .message-outline-dot {
  background: var(--el-color-primary);
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

.message-outline-item.is-active .message-outline-text {
  color: var(--el-color-primary);
}
</style>
