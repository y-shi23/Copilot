# 深度思考动画效果 Vue + TypeScript + Electron 复刻指南

## 目录

- [概述](#概述)
- [原始实现分析](#原始实现分析)
- [核心技术栈](#核心技术栈)
- [完整实现](#完整实现)
  - [1. SVG 图标组件](#1-svg-图标组件)
  - [2. Shimmer 闪光动画组件](#2-shimmer-闪光动画组件)
  - [3. 三点波浪加载动画](#3-三点波浪加载动画)
  - [4. 深度思考卡片组件](#4-深度思考卡片组件)
  - [5. Markdown 内容渲染](#5-markdown-内容渲染)
- [状态管理](#状态管理)
- [样式主题](#样式主题)
- [性能优化](#性能优化)

---

## 概述

本文档详细说明了如何在 Vue 3 + TypeScript + Electron 项目中完全复刻当前项目（Flutter）中推理模型的"深度思考"动画效果。

### 效果预览

"深度思考"效果包含以下视觉元素：

1. **旋转的原子图标** - 两个交叉的椭圆环组成的 SVG 图标
2. **Shimmer 闪光动画** - 文字上的渐变闪光扫过效果
3. **实时计时器** - 显示已用时间 (秒)
4. **可折叠卡片** - 带有展开/收起动画的思考内容区域
5. **渐变遮罩** - 内容溢出时的顶部/底部淡入淡出效果
6. **自动滚动** - 加载时自动滚动到底部

---

## 原始实现分析

### Flutter 实现位置

| 组件         | 文件路径                                             | 行号      |
| ------------ | ---------------------------------------------------- | --------- |
| 深度思考卡片 | `lib/features/chat/widgets/chat_message_widget.dart` | 2705-2990 |
| Shimmer 动画 | `lib/features/chat/widgets/chat_message_widget.dart` | 2992-3056 |
| 三点加载动画 | `lib/features/chat/widgets/chat_message_widget.dart` | 2053-2119 |
| SVG 图标     | `assets/icons/deepthink.svg`                         | -         |

### 核心技术要点

1. **Shimmer 闪光效果**：使用 `ShaderMask` + `LinearGradient` 创建扫光动画
2. **Ticker 计时器**：Flutter 的 `Ticker` 用于高频更新而不重建整个 widget
3. **ValueNotifier**：局部状态更新，避免不必要的重建
4. **AnimatedSize**：平滑的高度变化动画
5. **ShaderMask 遮罩**：内容区域的顶部/底部渐变淡出

---

## 核心技术栈

### Vue 3 + TypeScript 项目依赖

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "markdown-it": "^14.0.0",
    "highlight.js": "^11.9.0",
    "pinia": "^2.1.7"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

---

## 完整实现

### 1. SVG 图标组件

**文件**: `src/components/icons/DeepThinkIcon.vue`

```vue
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="5 5 90 90" :width="size" :height="size">
    <!-- 第一个椭圆环 - 45度旋转 -->
    <g transform="rotate(45, 50, 50)">
      <ellipse cx="50" cy="50" rx="44" ry="18" fill="none" :stroke="color" stroke-width="8" />
    </g>

    <!-- 第二个椭圆环 - -45度旋转 -->
    <g transform="rotate(-45, 50, 50)">
      <ellipse cx="50" cy="50" rx="44" ry="18" fill="none" :stroke="color" stroke-width="8" />
    </g>
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number;
  color?: string;
}

withDefaults(defineProps<Props>(), {
  size: 18,
  color: 'currentColor',
});
</script>
```

---

### 2. Shimmer 闪光动画组件

**文件**: `src/components/effects/ShimmerEffect.vue`

```vue
<template>
  <component
    :is="tag"
    :class="['shimmer-wrapper', { 'shimmer-enabled': enabled }]"
    :style="wrapperStyle"
  >
    <span class="shimmer-content">
      <slot />
    </span>
    <span v-if="enabled" class="shimmer-shine" :style="shineStyle" />
  </component>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';

interface Props {
  enabled?: boolean;
  tag?: string;
  duration?: number;
  gradientWidth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  enabled: false,
  tag: 'span',
  duration: 1200,
  gradientWidth: 0.4, // 百分比
});

// 动画状态
const progress = ref(0);
let animationFrameId: number | null = null;
let startTime: number | null = null;

// 动画循环
const animate = (timestamp: number) => {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  progress.value = (elapsed % props.duration) / props.duration;
  animationFrameId = requestAnimationFrame(animate);
};

// 启动/停止动画
watch(
  () => props.enabled,
  (enabled) => {
    if (enabled) {
      startTime = null;
      animationFrameId = requestAnimationFrame(animate);
    } else {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      startTime = null;
      progress.value = 0;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});

// 计算闪光位置
const shineStyle = computed(() => {
  const percentage = progress.value * 100;
  return {
    left: `${percentage}%`,
    width: `${props.gradientWidth * 100}%`,
  };
});

const wrapperStyle = computed(() => ({
  position: 'relative' as const,
  overflow: 'hidden',
  display: 'inline-block',
}));
</script>

<style scoped>
.shimmer-wrapper {
  display: inline-block;
  position: relative;
  overflow: hidden;
}

.shimmer-content {
  display: inline-block;
}

.shimmer-shine {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.35) 50%,
    transparent 100%
  );
  transform: translateX(-50%);
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .shimmer-shine {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%
    );
  }
}
</style>
```

**核心原理**：

- 使用 `requestAnimationFrame` 实现流畅动画（60fps）
- 渐变从左到右扫过，通过 `transform: translateX(-50%)` 中心对齐
- `blend-mode: srcATop` 对应 CSS 的 `mix-blend-mode`

---

### 3. 三点波浪加载动画

**文件**: `src/components/effects/ThreeDotLoading.vue`

```vue
<template>
  <div class="three-dot-loading">
    <span v-for="i in 3" :key="i" class="dot" :style="getDotStyle(i - 1)" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
  duration?: number;
  dotSize?: number;
  dotGap?: number;
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  duration: 1100,
  dotSize: 9,
  dotGap: 6,
  color: 'currentColor',
});

const progress = ref(0);
let animationFrameId: number | null = null;
let startTime: number | null = null;

const animate = (timestamp: number) => {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;
  progress.value = (elapsed % props.duration) / props.duration;
  animationFrameId = requestAnimationFrame(animate);
};

onMounted(() => {
  animationFrameId = requestAnimationFrame(animate);
});

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});

// 计算每个点的波浪值 (正弦波)
const getDotValue = (index: number) => {
  const phase = (progress.value - index * 0.22) * 2 * Math.PI;
  return (Math.sin(phase) + 1) / 2; // 0 -> 1 wave
};

const getDotStyle = (index: number) => {
  const wave = getDotValue(index);
  const scale = 0.85 + 0.15 * wave;
  const opacity = 0.45 + 0.45 * wave;

  return {
    width: `${props.dotSize}px`,
    height: `${props.dotSize}px`,
    marginRight: index === 2 ? '0' : `${props.dotGap}px`,
    backgroundColor: props.color,
    opacity,
    transform: `scale(${scale})`,
  };
};
</script>

<style scoped>
.three-dot-loading {
  display: inline-flex;
  align-items: center;
  height: 16px;
}

.dot {
  border-radius: 50%;
  transition:
    transform 0.1s ease-out,
    opacity 0.1s ease-out;
}
</style>
```

---

### 4. 深度思考卡片组件

**文件**: `src/components/chat/DeepThinkingCard.vue`

```vue
<template>
  <div :class="['deep-thinking-card', themeClass, { 'is-loading': loading }]" :style="cardStyle">
    <!-- 头部：图标 + 标题 + 时间 + 展开/收起 -->
    <div class="dt-header" @click="handleToggle">
      <DeepThinkIcon :size="18" :color="themeColors.icon" />

      <span class="dt-title">
        <ShimmerEffect :enabled="loading">
          {{ t('deep_thinking') }}
        </ShimmerEffect>
      </span>

      <span v-if="startAt" class="dt-time">
        <ShimmerEffect :enabled="loading">
          {{ elapsedTime }}
        </ShimmerEffect>
      </span>

      <div class="dt-spacer" />

      <svg
        :class="['dt-chevron', { 'is-expanded': expanded }]"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        :stroke="themeColors.icon"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>

    <!-- 内容区域 -->
    <Transition name="dt-expand" @after-enter="handleExpandComplete">
      <div v-show="expanded || loading" class="dt-body">
        <div ref="contentRef" :class="['dt-content', { 'has-fade': hasOverflow }]">
          <!-- Markdown 内容或纯文本 -->
          <component :is="contentComponent" v-if="sanitizedText" :content="sanitizedText" />
          <span v-else class="dt-placeholder">…</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import DeepThinkIcon from '@/components/icons/DeepThinkIcon.vue';
import ShimmerEffect from '@/components/effects/ShimmerEffect.vue';

// 类型定义
interface Props {
  text?: string;
  expanded?: boolean;
  loading?: boolean;
  startAt?: Date | null;
  finishedAt?: Date | null;
  theme?: 'light' | 'dark' | 'auto';
}

const props = withDefaults(defineProps<Props>(), {
  text: '',
  expanded: false,
  loading: false,
  startAt: null,
  finishedAt: null,
  theme: 'auto',
});

const emit = defineEmits<{
  toggle: [];
}>();

const { t } = useI18n();

// 状态
const contentRef = ref<HTMLElement | null>(null);
const hasOverflow = ref(false);
const elapsedSeconds = ref(0);
let timerInterval: ReturnType<typeof setInterval> | null = null;

// 计时器
const startTimer = () => {
  stopTimer();
  timerInterval = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - props.startAt!.getTime()) / 100);
  }, 100);
};

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};

// 监听 loading 状态
watch(
  () => props.loading,
  (loading) => {
    if (loading && props.startAt && !props.finishedAt) {
      startTimer();
    } else {
      stopTimer();
    }
  },
  { immediate: true },
);

// 计算经过时间
const elapsedTime = computed(() => {
  const start = props.startAt;
  if (!start) return '';

  const end = props.finishedAt || new Date();
  const ms = end.getTime() - start.getTime();
  return `(${(ms / 1000).toFixed(1)}s)`;
});

// 文本清理
const sanitizedText = computed(() => {
  let s = props.text;

  // 统一换行
  s = s.replace(/\r\n/g, '\n');

  // 去掉零宽字符
  s = s.replace(/^[\u200B\u200C\u200D\uFEFF]+/, '');
  s = s.replace(/[\u200B\u200C\u200D\uFEFF]+$/, '');

  // 去掉首尾空白行
  s = s.replace(/^\s*\n+/, '');
  s = s.replace(/\n+\s*$/, '');

  return s;
});

// 检查内容溢出
const checkOverflow = () => {
  if (!contentRef.value) return;
  const el = contentRef.value;
  hasOverflow.value = el.scrollHeight > el.clientHeight + 0.5;
};

// 监听内容变化
watch(
  () => props.text,
  async () => {
    await nextTick();
    checkOverflow();
  },
  { immediate: true },
);

// 自动滚动到底部
watch(
  () => props.loading,
  async (loading) => {
    if (loading) {
      await nextTick();
      if (contentRef.value) {
        contentRef.value.scrollTop = contentRef.value.scrollHeight;
      }
    }
  },
);

// 主题颜色
const themeColors = computed(() => {
  const isDark =
    props.theme === 'dark' ||
    (props.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    icon: isDark ? '#a78bfa' : '#7c3aed',
    text: isDark ? '#e5e7eb' : '#374151',
  };
});

const themeClass = computed(() => {
  const isDark =
    props.theme === 'dark' ||
    (props.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return isDark ? 'theme-dark' : 'theme-light';
});

const cardStyle = computed(() => ({
  backgroundColor: themeColors.value.background,
}));

// 事件处理
const handleToggle = () => {
  emit('toggle');
};

const handleExpandComplete = () => {
  checkOverflow();
};

// 清理
onUnmounted(() => {
  stopTimer();
});

// 动态加载 Markdown 组件
const contentComponent = computed(() => {
  // 这里可以根据配置返回 Markdown 组件或纯文本
  // 示例: return 'MarkdownRenderer'
  return 'span';
});
</script>

<style scoped>
.deep-thinking-card {
  border-radius: 16px;
  padding: 8px 10px;
  transition: background-color 0.2s ease;
}

.dt-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 6px 8px;
  margin: -8px -10px 0 -10px;
  border-radius: 12px;
  transition: background-color 0.15s ease;
}

.dt-header:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.theme-dark .dt-header:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

.dt-title {
  font-size: 13px;
  font-weight: 700;
}

.dt-time {
  font-size: 13px;
  opacity: 0.9;
}

.dt-spacer {
  flex: 1;
}

.dt-chevron {
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.dt-chevron.is-expanded {
  transform: rotate(90deg);
}

.dt-body {
  overflow: hidden;
}

.dt-content {
  padding: 2px 8px 6px 8px;
  font-size: 12.5px;
  line-height: 1.65;
  max-height: 80px;
  overflow-y: auto;
  position: relative;
}

/* 渐变遮罩 - 顶部和底部淡入淡出 */
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

.dt-content::-webkit-scrollbar {
  width: 6px;
}

.dt-content::-webkit-scrollbar-track {
  background: transparent;
}

.dt-content::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
  border-radius: 3px;
}

.dt-placeholder {
  opacity: 0.5;
}

/* 展开/收起动画 */
.dt-expand-enter-active,
.dt-expand-leave-active {
  transition: all 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform-origin: top;
}

.dt-expand-enter-from,
.dt-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: scaleY(0);
}

.dt-expand-enter-to,
.dt-expand-leave-from {
  max-height: 500px;
  opacity: 1;
  transform: scaleY(1);
}
</style>
```

---

### 5. Markdown 内容渲染

**文件**: `src/components/chat/MarkdownRenderer.vue`

```vue
<template>
  <div class="markdown-renderer" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

interface Props {
  content: string;
}

const props = defineProps<Props>();

// 配置 markdown-it
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) {
        // 忽略错误
      }
    }
    return '';
  },
});

const renderedHtml = computed(() => {
  return md.render(props.content);
});
</script>

<style scoped>
.markdown-renderer {
  font-size: 12.5px;
  line-height: 1.65;
}

.markdown-renderer :deep(pre) {
  background: #1e293b;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-renderer :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.markdown-renderer :deep(p) {
  margin: 6px 0;
}

.markdown-renderer :deep(ul),
.markdown-renderer :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}
</style>
```

---

## 状态管理

使用 Pinia 进行全局状态管理：

**文件**: `src/stores/reasoning.ts`

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ReasoningState {
  text: string;
  expanded: boolean;
  loading: boolean;
  startAt: Date | null;
  finishedAt: Date | null;
}

export const useReasoningStore = defineStore('reasoning', () => {
  const state = ref<ReasoningState>({
    text: '',
    expanded: false,
    loading: false,
    startAt: null,
    finishedAt: null,
  });

  const elapsedTime = computed(() => {
    const { startAt, finishedAt } = state.value;
    if (!startAt) return '';
    const end = finishedAt || new Date();
    const ms = end.getTime() - startAt.getTime();
    return `(${(ms / 1000).toFixed(1)}s)`;
  });

  function startReasoning() {
    state.value.loading = true;
    state.value.startAt = new Date();
    state.value.finishedAt = null;
    state.value.text = '';
  }

  function updateReasoning(text: string) {
    state.value.text = text;
  }

  function finishReasoning() {
    state.value.loading = false;
    state.value.finishedAt = new Date();
  }

  function toggleExpanded() {
    state.value.expanded = !state.value.expanded;
  }

  function reset() {
    state.value = {
      text: '',
      expanded: false,
      loading: false,
      startAt: null,
      finishedAt: null,
    };
  }

  return {
    state,
    elapsedTime,
    startReasoning,
    updateReasoning,
    finishReasoning,
    toggleExpanded,
    reset,
  };
});
```

---

## 样式主题

### 全局 CSS 变量

**文件**: `src/styles/theme.css`

```css
:root {
  /* 浅色主题 */
  --dt-bg-light: rgba(0, 0, 0, 0.05);
  --dt-icon-light: #7c3aed;
  --dt-text-light: #374151;
  --dt-border-light: rgba(0, 0, 0, 0.1);

  /* 深色主题 */
  --dt-bg-dark: rgba(255, 255, 255, 0.08);
  --dt-icon-dark: #a78bfa;
  --dt-text-dark: #e5e7eb;
  --dt-border-dark: rgba(255, 255, 255, 0.1);

  /* 动画时长 */
  --dt-shimmer-duration: 1200ms;
  --dt-expand-duration: 300ms;
  --dt-chevron-duration: 220ms;

  /* 遮罩渐变 */
  --dt-fade-top: 12px;
  --dt-fade-bottom: 28px;
}

[data-theme='light'] {
  --dt-bg: var(--dt-bg-light);
  --dt-icon: var(--dt-icon-light);
  --dt-text: var(--dt-text-light);
  --dt-border: var(--dt-border-light);
}

[data-theme='dark'] {
  --dt-bg: var(--dt-bg-dark);
  --dt-icon: var(--dt-icon-dark);
  --dt-text: var(--dt-text-dark);
  --dt-border: var(--dt-border-dark);
}

/* 自动主题 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --dt-bg: var(--dt-bg-dark);
    --dt-icon: var(--dt-icon-dark);
    --dt-text: var(--dt-text-dark);
    --dt-border: var(--dt-border-dark);
  }
}

:root:not([data-theme]) {
  --dt-bg: var(--dt-bg-light);
  --dt-icon: var(--dt-icon-light);
  --dt-text: var(--dt-text-light);
  --dt-border: var(--dt-border-light);
}
```

---

## 性能优化

### 1. 使用 requestAnimationFrame

所有动画都使用 `requestAnimationFrame` 而非 `setInterval`，确保：

- 与浏览器刷新率同步（通常 60fps）
- 页面不可见时自动暂停
- 更流畅的动画效果

### 2. RepaintBoundary 对等方案

Vue 中不需要手动处理，但可以使用以下优化：

```vue
<script setup>
import { defineAsyncComponent } from 'vue';

// 懒加载 Markdown 组件
const MarkdownRenderer = defineAsyncComponent(
  () => import('@/components/chat/MarkdownRenderer.vue'),
);
</script>
```

### 3. 防抖溢出检测

```typescript
import { debounce } from 'lodash-es';

const checkOverflowDebounced = debounce(checkOverflow, 100);

watch(
  () => props.text,
  () => {
    checkOverflowDebounced();
  },
);
```

### 4. 虚拟滚动（长内容）

对于超长的思考内容，可以使用虚拟滚动：

```bash
npm install vue-virtual-scroller
```

```vue
<template>
  <RecycleScroller :items="lines" :item-size="20" key-field="id" v-slot="{ item }">
    <div>{{ item.text }}</div>
  </RecycleScroller>
</template>
```

---

## 完整使用示例

**文件**: `src/views/ChatView.vue`

```vue
<template>
  <div class="chat-view">
    <div v-for="message in messages" :key="message.id" class="message">
      <!-- 普通消息 -->
      <div v-if="message.type === 'normal'" class="normal-message">
        {{ message.content }}
      </div>

      <!-- 带思考的消息 -->
      <div v-else class="message-with-reasoning">
        <DeepThinkingCard
          v-if="message.reasoning"
          :text="message.reasoning.text"
          :expanded="message.reasoning.expanded"
          :loading="message.reasoning.loading"
          :start-at="message.reasoning.startAt"
          :finished-at="message.reasoning.finishedAt"
          @toggle="handleToggleReasoning(message.id)"
        />

        <div class="message-content">
          {{ message.content }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DeepThinkingCard from '@/components/chat/DeepThinkingCard.vue';

interface ReasoningData {
  text: string;
  expanded: boolean;
  loading: boolean;
  startAt: Date | null;
  finishedAt: Date | null;
}

interface Message {
  id: string;
  type: 'normal' | 'reasoning';
  content: string;
  reasoning?: ReasoningData;
}

const messages = ref<Message[]>([
  {
    id: '1',
    type: 'reasoning',
    content: '最终答案',
    reasoning: {
      text: '这是一个思考过程...\n包含多行内容',
      expanded: false,
      loading: true,
      startAt: new Date(),
      finishedAt: null,
    },
  },
]);

const handleToggleReasoning = (messageId: string) => {
  const message = messages.value.find((m) => m.id === messageId);
  if (message?.reasoning) {
    message.reasoning.expanded = !message.reasoning.expanded;
  }
};
</script>
```

---

## Electron 集成

### 主进程

**文件**: `electron/main.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1e1e1e',
    show: false,
  });

  win.loadFile('dist/index.html');

  win.once('ready-to-show', () => {
    win.show();
  });
}

app.whenReady().then(createWindow);
```

### 预加载脚本

**文件**: `electron/preload.ts`

```typescript
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getTheme: () => {
    return localStorage.getItem('theme') || 'auto';
  },
  setTheme: (theme: string) => {
    localStorage.setItem('theme', theme);
  },
});
```

---

## 总结

### 核心实现要点

| 特性     | Flutter             | Vue 3                 |
| -------- | ------------------- | --------------------- |
| 动画驱动 | AnimationController | requestAnimationFrame |
| 状态管理 | ValueNotifier       | ref/reactive          |
| 局部更新 | RepaintBoundary     | 组件级更新            |
| 遮罩效果 | ShaderMask          | CSS mask-image        |
| 尺寸动画 | AnimatedSize        | Vue Transition        |
| 计时器   | Ticker              | setInterval + watch   |

### 关键差异处理

1. **动画性能**：Flutter 的 Ticker 自动处理帧同步，Vue 需要手动使用 requestAnimationFrame
2. **局部重建**：Flutter 的 ValueNotifier + ValueListenableBuilder，Vue 的 computed 自动处理
3. **样式系统**：Flutter 需要显式传递主题，Vue 可用 CSS 变量 + provide/inject

### 文件结构

```
src/
├── components/
│   ├── chat/
│   │   ├── DeepThinkingCard.vue
│   │   └── MarkdownRenderer.vue
│   ├── effects/
│   │   ├── ShimmerEffect.vue
│   │   └── ThreeDotLoading.vue
│   └── icons/
│       └── DeepThinkIcon.vue
├── stores/
│   └── reasoning.ts
├── styles/
│   └── theme.css
└── types/
    └── reasoning.d.ts
```

---

## 参考资源

- [Vue 3 文档](https://vuejs.org/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [Electron 文档](https://www.electronjs.org/)
- [markdown-it](https://github.com/markdown-it/markdown-it)
- [highlight.js](https://highlightjs.org/)
- CSS mask-image: [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image)
- requestAnimationFrame: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/requestAnimationFrame)
