<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  pickActiveHeading,
  type HeadingIntersectionState,
} from '../../utils/messageOutlineViewport';

type MessageStyle = 'horizontal' | 'vertical' | 'fold' | 'grid' | '';

interface Props {
  enabled?: boolean;
  messageStyle?: MessageStyle;
}

interface OutlineHeading {
  id: string;
  level: number;
  text: string;
}

const HEADING_SELECTOR = 'h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]';
const HEADING_OBSERVER_ROOT_MARGIN = '-10% 0px -80% 0px';
const HEADING_OBSERVER_THRESHOLD = 0;

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
  messageStyle: '',
});

const containerRef = ref<HTMLElement | null>(null);
const headings = ref<OutlineHeading[]>([]);
const activeHeadingId = ref<string | null>(null);

const shouldRender = computed(() => props.enabled && props.messageStyle !== 'grid');
const shouldShowBody = computed(() => shouldRender.value && headings.value.length > 0);

const minHeadingLevel = computed(() => {
  if (headings.value.length === 0) return 1;
  return headings.value.reduce((minLevel, item) => Math.min(minLevel, item.level), 6);
});

let headingObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let refreshFrame = 0;
const headingStates = new Map<string, Omit<HeadingIntersectionState, 'id'>>();

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

const resolveMessageElement = () =>
  (containerRef.value?.closest('.chat-message') as HTMLElement | null) || null;

const resolveContentElement = () =>
  (resolveMessageElement()?.querySelector('.message-content-container') as HTMLElement | null) ||
  null;

const resolveScrollHost = () =>
  (containerRef.value?.closest('.chat-main') as HTMLElement | null) || null;

const clearHeadingObserver = () => {
  if (headingObserver) {
    headingObserver.disconnect();
    headingObserver = null;
  }
  headingStates.clear();
};

const clearMutationObserver = () => {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
};

const clearScheduledRefresh = () => {
  if (refreshFrame) {
    window.cancelAnimationFrame(refreshFrame);
    refreshFrame = 0;
  }
};

const cleanupOutlineTracking = () => {
  clearScheduledRefresh();
  clearHeadingObserver();
  clearMutationObserver();
};

const recomputeActiveHeading = () => {
  const defaultId = headings.value[0]?.id ?? null;
  const fallbackId =
    activeHeadingId.value && headings.value.some((heading) => heading.id === activeHeadingId.value)
      ? activeHeadingId.value
      : defaultId;

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

const collectHeadingElements = (): HTMLElement[] => {
  const content = resolveContentElement();
  if (!content) {
    headings.value = [];
    activeHeadingId.value = null;
    return [];
  }

  const headingElements = Array.from(content.querySelectorAll<HTMLElement>(HEADING_SELECTOR));
  const nextHeadings: OutlineHeading[] = [];
  const validElements: HTMLElement[] = [];

  headingElements.forEach((element) => {
    const id = String(element.id || '').trim();
    if (!id) return;

    const levelToken = element.tagName.replace(/^H/i, '');
    const levelValue = Number.parseInt(levelToken, 10);
    const level = Number.isFinite(levelValue) ? Math.min(6, Math.max(1, levelValue)) : 6;
    const text =
      String(element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim() || id;

    nextHeadings.push({ id, level, text });
    validElements.push(element);
  });

  headings.value = nextHeadings;
  if (!nextHeadings.some((heading) => heading.id === activeHeadingId.value)) {
    activeHeadingId.value = null;
  }

  return validElements;
};

const bindHeadingObserver = (elements: HTMLElement[]) => {
  clearHeadingObserver();

  if (!shouldRender.value || elements.length === 0) return;

  const root = resolveScrollHost();
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
      root,
      rootMargin: HEADING_OBSERVER_ROOT_MARGIN,
      threshold: HEADING_OBSERVER_THRESHOLD,
    },
  );

  elements.forEach((element, index) => {
    const id = String(element.id || '').trim();
    if (!id) return;

    headingStates.set(id, {
      isIntersecting: false,
      top: Number.POSITIVE_INFINITY,
      order: index,
    });
    headingObserver?.observe(element);
  });

  recomputeActiveHeading();
};

const refreshOutlineFromDom = () => {
  if (!shouldRender.value) {
    headings.value = [];
    activeHeadingId.value = null;
    clearHeadingObserver();
    return;
  }

  const headingElements = collectHeadingElements();
  bindHeadingObserver(headingElements);
};

const scheduleOutlineRefresh = () => {
  if (refreshFrame) return;

  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = 0;
    refreshOutlineFromDom();
  });
};

const bindMutationObserver = () => {
  clearMutationObserver();
  if (!shouldRender.value) return;

  const content = resolveContentElement();
  if (!content) return;

  mutationObserver = new MutationObserver(() => {
    scheduleOutlineRefresh();
  });

  mutationObserver.observe(content, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['id'],
  });
};

const scrollToHeading = (id: string) => {
  const content = resolveContentElement();
  if (!content) return;

  const target = content.querySelector<HTMLElement>(`#${escapeSelector(id)}`);
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

  const host = resolveScrollHost();
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
  scheduleOutlineRefresh();
  bindMutationObserver();
});

onBeforeUnmount(() => {
  cleanupOutlineTracking();
});

watch(
  () => [props.enabled, props.messageStyle],
  async () => {
    await nextTick();
    scheduleOutlineRefresh();
    bindMutationObserver();
  },
);
</script>

<template>
  <div v-if="shouldRender" ref="containerRef" class="message-outline-container">
    <div v-if="shouldShowBody" class="message-outline-body">
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
  pointer-events: auto;
  overflow: hidden;
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

@media (max-width: 900px) {
  .message-outline-container {
    left: -28px;
  }
}
</style>
