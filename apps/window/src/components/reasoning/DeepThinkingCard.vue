<template>
  <div
    class="deep-thinking-card"
    :class="{
      'is-loading': loading,
      'is-expanded': expanded,
      'is-dark': isDarkMode,
      'is-error': status === 'error',
    }"
  >
    <button
      type="button"
      class="dt-header"
      aria-label="切换思考过程展开状态"
      @click="emit('toggle')"
    >
      <span class="dt-icon-wrap" :class="{ 'is-rotating': loading }">
        <DeepThinkIcon :size="18" class="dt-icon" />
      </span>

      <span class="dt-title">
        <ShimmerEffect :enabled="loading">深度思考</ShimmerEffect>
      </span>

      <span v-if="elapsedTime" class="dt-time">
        <ShimmerEffect :enabled="loading">{{ elapsedTime }}</ShimmerEffect>
      </span>

      <span class="dt-spacer" />

      <svg class="dt-chevron" :class="{ 'is-expanded': expanded }" viewBox="0 0 24 24" fill="none">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>

    <Transition name="dt-expand" @after-enter="checkOverflow" @after-leave="checkOverflow">
      <div v-show="expanded" class="dt-body">
        <div
          ref="contentRef"
          class="dt-content custom-scrollbar"
          :class="{ 'has-fade': hasOverflow }"
          @scroll="checkOverflow"
        >
          <MarkdownRenderer
            v-if="hasReasoningContent"
            :markdown="normalizedContent"
            :is-dark="isDarkMode"
            :enable-latex="true"
            :mermaid-config="mermaidConfig"
            :allow-html="true"
          />

          <div v-else class="dt-placeholder">
            <ThreeDotLoading :dot-size="8" :dot-gap="6" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import DeepThinkIcon from './DeepThinkIcon.vue';
import ShimmerEffect from './ShimmerEffect.vue';
import ThreeDotLoading from './ThreeDotLoading.vue';
import MarkdownRenderer from '../markdown/MarkdownRenderer.vue';

interface Props {
  content: string;
  loading: boolean;
  status: 'thinking' | 'end' | 'error' | '';
  expanded: boolean;
  reasoningStartedAt?: string | null;
  reasoningFinishedAt?: string | null;
  isDarkMode: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  loading: false,
  status: '',
  expanded: false,
  reasoningStartedAt: null,
  reasoningFinishedAt: null,
  isDarkMode: false,
});

const emit = defineEmits<{
  toggle: [];
}>();

const contentRef = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);
const timerTick = ref(Date.now());
let timerId: ReturnType<typeof setInterval> | null = null;

const mermaidConfig = computed(() => ({
  theme: props.isDarkMode ? 'dark' : 'neutral',
}));

const normalizedContent = computed(() =>
  String(props.content || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\n+/, '')
    .replace(/\n+\s*$/, ''),
);

const hasReasoningContent = computed(() => normalizedContent.value.trim().length > 0);

const parseTime = (raw: string | null | undefined) => {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const elapsedTime = computed(() => {
  const startMs = parseTime(props.reasoningStartedAt);
  if (startMs === null) return '';

  const endFromProps = parseTime(props.reasoningFinishedAt);
  const endMs = props.loading ? timerTick.value : (endFromProps ?? timerTick.value);
  const elapsedMs = Math.max(0, endMs - startMs);
  return `(${(elapsedMs / 1000).toFixed(1)}s)`;
});

const stopTimer = () => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
};

const startTimer = () => {
  stopTimer();
  timerTick.value = Date.now();
  timerId = setInterval(() => {
    timerTick.value = Date.now();
  }, 100);
};

const checkOverflow = () => {
  if (!contentRef.value) {
    hasOverflow.value = false;
    return;
  }

  const el = contentRef.value;
  hasOverflow.value = el.scrollHeight > el.clientHeight + 0.5;
};

watch(
  () => [props.loading, props.reasoningStartedAt],
  ([loading, startedAt]) => {
    if (loading && startedAt) {
      startTimer();
    } else {
      stopTimer();
      timerTick.value = Date.now();
    }
  },
  { immediate: true },
);

watch(
  () => [props.expanded, normalizedContent.value, props.loading],
  async ([expanded, _content, loading]) => {
    await nextTick();

    checkOverflow();
    if (expanded && loading && contentRef.value) {
      contentRef.value.scrollTop = contentRef.value.scrollHeight;
    }
  },
  { immediate: true },
);

const handleResize = () => {
  checkOverflow();
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  stopTimer();
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.deep-thinking-card {
  width: 100%;
  margin: 0 0 8px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 78%, transparent);
  background: color-mix(in srgb, var(--el-fill-color-light) 86%, transparent);
  color: var(--el-text-color-primary);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.deep-thinking-card.is-dark {
  background: color-mix(in srgb, var(--el-fill-color-darker, #2c2e33) 84%, transparent);
  border-color: color-mix(in srgb, var(--el-border-color-dark, #373a40) 80%, transparent);
}

.deep-thinking-card.is-error {
  border-color: color-mix(in srgb, var(--el-color-danger) 50%, var(--el-border-color));
}

.dt-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 13px;
  padding: 8px 10px;
  user-select: none;
}

.dt-header:hover {
  background-color: color-mix(in srgb, var(--el-fill-color) 70%, transparent);
}

.deep-thinking-card.is-dark .dt-header:hover {
  background-color: color-mix(in srgb, var(--el-fill-color-dark, #323844) 68%, transparent);
}

.dt-icon-wrap {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-accent);
  flex-shrink: 0;
}

.dt-icon-wrap.is-rotating {
  animation: dt-spin 2.1s linear infinite;
}

.dt-icon {
  display: block;
}

.dt-title,
.dt-time {
  font-size: 12.5px;
  line-height: 1.3;
  color: var(--el-text-color-regular);
}

.dt-title {
  font-weight: 700;
}

.dt-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.92;
}

.dt-spacer {
  flex: 1;
}

.dt-chevron {
  width: 16px;
  height: 16px;
  color: var(--el-text-color-secondary);
  stroke: currentColor;
  stroke-width: 2.25;
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  flex-shrink: 0;
}

.dt-chevron.is-expanded {
  transform: rotate(90deg);
}

.dt-body {
  overflow: hidden;
}

.dt-content {
  max-height: 150px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 10px 10px;
  position: relative;
}

.dt-content.has-fade {
  mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    black 12px,
    black calc(100% - 28px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    black 12px,
    black calc(100% - 28px),
    transparent 100%
  );
}

.dt-content :deep(.elx-xmarkdown-container) {
  background: transparent !important;
  padding: 0;
  color: var(--el-text-color-regular);
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}

.dt-content :deep(.elx-xmarkdown-container > :first-child) {
  margin-top: 0 !important;
}

.dt-content :deep(.elx-xmarkdown-container > :last-child) {
  margin-bottom: 0 !important;
}

.dt-content :deep(pre) {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color) 76%, transparent);
  padding: 10px;
}

.dt-content :deep(.inline-code-tag) {
  border-radius: 4px;
  background: color-mix(in srgb, var(--el-fill-color-dark) 68%, transparent);
}

.dt-placeholder {
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  padding: 2px 0;
}

.dt-expand-enter-active,
.dt-expand-leave-active {
  transition: all 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: top;
}

.dt-expand-enter-from,
.dt-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: scaleY(0.94);
}

.dt-expand-enter-to,
.dt-expand-leave-from {
  max-height: 220px;
  opacity: 1;
  transform: scaleY(1);
}

@keyframes dt-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
