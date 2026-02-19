# Vue 聊天项目移植指南：对话导航锚点与消息大纲功能

> 本文档详细分析了当前 React 项目中的对话导航锚点（MessageOutline）和消息大纲功能，为 Vue 项目提供完整的移植方案。

---

## 目录

1. [功能概述](#功能概述)
2. [核心组件分析](#核心组件分析)
3. [数据结构与状态管理](#数据结构与状态管理)
4. [Vue 移植方案](#vue-移植方案)
5. [依赖清单](#依赖清单)
6. [完整代码示例](#完整代码示例)

---

## 功能概述

### 对话导航锚点（MessageOutline）

**功能描述**：在 AI 助手回复的消息左侧显示标题层级大纲，用户可以：

- 鼠标悬停时展开显示完整标题文本
- 点击锚点项平滑滚动到对应标题位置
- 根据标题层级（H1-H6）显示不同视觉层级

**交互特点**：

- 默认隐藏标题文本，仅显示小圆点
- 悬停时显示卡片式大纲面板
- 支持 sticky 定位，随滚动保持可见
- 不支持 grid 布局的消息样式

### 全局导航栏（ChatNavigation）

**功能描述**：屏幕右侧固定的导航控制面板，包含：

- 关闭按钮：手动隐藏导航栏（1分钟内不响应鼠标靠近）
- 顶部/底部：快速滚动到对话首尾
- 上/下一个：在用户消息间导航
- 历史记录：打开聊天历史抽屉

**交互特点**：

- 鼠标靠近时自动显示
- 离开后延迟 500ms 隐藏
- 手动关闭后 1 分钟内不自动显示
- 智能检测当前可见消息

---

## 核心组件分析

### 1. MessageOutline 组件

**文件位置**: `src/renderer/src/pages/home/Messages/MessageOutline.tsx`

#### 核心逻辑

```typescript
// 数据结构
interface HeadingItem {
  id: string    // 格式: "heading-{blockId}--{slug}"
  level: number // 1-6
  text: string  // 标题文本
}

// 主要流程
1. 从 Redux 获取 message blocks
2. 筛选 MAIN_TEXT 类型的 blocks
3. 使用 unified + remarkParse 解析 markdown
4. 遍历 AST 提取 heading 和 html 节点
5. 为每个标题生成唯一 slug ID
6. 渲染锚点列表
```

#### 样式设计

| 元素     | 样式特点                                                        |
| -------- | --------------------------------------------------------------- |
| **容器** | `position: absolute`, `inset: 63px 0 36px 10px`, `z-index: 999` |
| **锚点** | 宽度随层级递减 (`16px - level * 2px`), 圆角 2px                 |
| **文本** | 默认 `opacity: 0`, 悬停时 `opacity: 1`                          |
| **字体** | 随层级递减 (`16px - level`px)                                   |
| **缩进** | `(level - miniLevel) * 8px`                                     |

### 2. ChatNavigation 组件

**文件位置**: `src/renderer/src/pages/home/Messages/ChatNavigation.tsx`

#### 显示/隐藏机制

```typescript
// 状态管理
const [isVisible, setIsVisible] = useState(false);
const [manuallyClosedUntil, setManuallyClosedUntil] = useState<number | null>(null);
const isHoveringNavigationRef = useRef(false);
const isPointerInTriggerAreaRef = useRef(false);

// 触发区域计算
const triggerWidth = 60;
const rightOffset = RIGHT_GAP + (showRightTopics ? 275 : 0);
const rightPosition = window.innerWidth - rightOffset - triggerWidth;
const topPosition = window.innerHeight * 0.35; // 35% from top
const height = window.innerHeight * 0.3; // 30% height
```

#### 消息导航算法

```typescript
// 查找当前可见消息
const getCurrentVisibleIndex = (direction: 'up' | 'down') => {
  const containerRect = container.getBoundingClientRect();
  const visibleThreshold = containerRect.height * 0.1;

  // 计算消息可见高度
  const visibleHeight =
    Math.min(messageRect.bottom, containerRect.bottom) -
    Math.max(messageRect.top, containerRect.top);

  // 判断是否可见（至少 10% 容器高度或消息自身高度）
  if (visibleHeight > 0 && visibleHeight >= Math.min(messageRect.height, visibleThreshold)) {
    return true;
  }
};
```

### 3. 滚动工具函数

**文件位置**: `src/renderer/src/utils/dom.ts`

```typescript
// 标准滚动函数
export function scrollIntoView(element: HTMLElement, options?: ChromiumScrollIntoViewOptions): void;

// 容器内智能滚动
export function scrollElementIntoView(
  element: HTMLElement,
  scrollContainer?: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
): void;
```

**参数说明**:

- `container: 'nearest'` - 在最近的滚动容器内滚动（Chromium 特有）
- `block: 'start' | 'center' | 'end'` - 对齐方式
- `behavior: 'smooth' | 'auto'` - 滚动行为

---

## 数据结构与状态管理

### Redux 状态结构

```typescript
// src/renderer/src/store/settings.ts
export interface SettingsState {
  showMessageOutline: boolean; // 是否显示消息大纲
  messageNavigation: 'none' | 'buttons' | 'anchor';
  // ... 其他设置
}

// src/renderer/src/types/newMessage.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  blocks: string[]; // Block ID 引用
  multiModelMessageStyle?: 'horizontal' | 'vertical' | 'fold' | 'grid';
  // ... 其他字段
}

export interface MessageBlock {
  id: string;
  type: MessageBlockType; // MAIN_TEXT | IMAGE | etc.
  content: string; // Markdown 内容
}
```

### 标题 ID 生成规则

**文件位置**: `src/renderer/src/pages/home/Markdown/plugins/rehypeHeadingIds.ts`

```typescript
// GitHub 风格的 slug 生成算法
const normalize = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 移除零宽字符
    .replace(/["'`(){}[\]:;!?.,]/g, '') // 移除标点
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-') // 合并非字母数字
    .replace(/-{2,}/g, '-') // 合并多余 '-'
    .replace(/^-|-$/g, ''); // 去除首尾 '-'
};

// 去重逻辑
const slug = (text: string): string => {
  const base = normalize(text);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return `${base}-${count}`; // 重复时添加 -1, -2, ...
};

// 最终 ID 格式
const id = `heading-${blockId}--${slug}`;
```

---

## Vue 移植方案

### 技术栈对比

| 功能          | React 项目            | Vue 项目建议                  |
| ------------- | --------------------- | ----------------------------- |
| 状态管理      | Redux Toolkit         | Pinia                         |
| 样式方案      | styled-components     | CSS Modules / UnoCSS          |
| Markdown 解析 | unified + remarkParse | unified + remarkParse         |
| DOM 操作      | scrollIntoView        | scrollIntoView (原生)         |
| 图标库        | ant-design icons      | @iconify/vue / unplugin-icons |

### 组件结构设计

```
src/components/chat/
├── navigation/
│   ├── ChatNavigation.vue          # 全局导航栏
│   ├── MessageOutline.vue          # 消息大纲锚点
│   ├── MessageAnchorLine.vue       # 消息锚点线（可选）
│   └── hooks/
│       ├── useNavigationVisible.ts # 显示/隐藏逻辑
│       └── useMessageScroll.ts     # 滚动导航逻辑
├── markdown/
│   ├── plugins/
│   │   └── rehypeHeadingIds.ts     # 标题 ID 生成
│   └── MarkdownRenderer.vue        # Markdown 渲染器
└── utils/
    └── scroll.ts                   # 滚动工具函数
```

### Pinia Store 设计

```typescript
// src/stores/settings.ts
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    showMessageOutline: false,
    messageNavigation: 'none' as 'none' | 'buttons' | 'anchor',
  }),

  persist: {
    key: 'chat-settings',
    storage: localStorage,
  },
});

// src/stores/messages.ts
export const useMessagesStore = defineStore('messages', {
  state: () => ({
    messages: [] as Message[],
    currentTopicId: '',
  }),

  getters: {
    assistantMessages: (state) => state.messages.filter((m) => m.role === 'assistant'),

    getMainTextBlocks: (state) => (messageId: string) => {
      const message = state.messages.find((m) => m.id === messageId);
      return message?.blocks.map((id) => blockEntities[id]).filter((b) => b?.type === 'MAIN_TEXT');
    },
  },
});
```

---

## 依赖清单

### 核心依赖

```json
{
  "dependencies": {
    "unified": "^11.0.0",
    "remark-parse": "^11.0.0",
    "unist-util-visit": "^5.0.0",
    "rehype-raw": "^7.0.0",
    "hast": "^3.0.0",
    "pinia": "^2.1.0"
  }
}
```

### 可选依赖

```json
{
  "dependencies": {
    "@iconify/vue": "^4.1.0",
    "@vueuse/core": "^10.7.0"
  }
}
```

---

## 完整代码示例

### 1. 滚动工具函数

```typescript
// src/utils/scroll.ts

interface ScrollIntoViewOptions extends ScrollIntoViewOptions {
  container?: 'all' | 'nearest';
}

/**
 * 统一的滚动到视图函数
 */
export function scrollIntoView(element: HTMLElement, options: ScrollIntoViewOptions = {}): void {
  const defaultOptions: ScrollIntoViewOptions = {
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  };

  element.scrollIntoView({ ...defaultOptions, ...options });
}

/**
 * 在容器内滚动到指定元素
 */
export function scrollElementIntoView(
  element: HTMLElement,
  scrollContainer?: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!scrollContainer) {
    scrollIntoView(element, { behavior, block: 'center', inline: 'nearest' });
    return;
  }

  const canScroll =
    scrollContainer.scrollHeight > scrollContainer.clientHeight ||
    scrollContainer.scrollWidth > scrollContainer.clientWidth;

  if (canScroll) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    const elementTopWithinContainer = elRect.top - containerRect.top + scrollContainer.scrollTop;
    const desiredTop =
      elementTopWithinContainer - Math.max(0, scrollContainer.clientHeight - elRect.height) / 2;

    scrollContainer.scrollTo({
      top: Math.max(0, desiredTop),
      behavior,
    });
  } else {
    scrollIntoView(element, { behavior, block: 'center', inline: 'nearest' });
  }
}
```

### 2. 标题 ID 生成插件

```typescript
// src/components/chat/markdown/plugins/rehypeHeadingIds.ts
import type { Element, Node, Root, Text } from 'hast';
import { visit } from 'unist-util-visit';

interface Slugger {
  slug: (text: string) => string;
}

export function createSlugger(): Slugger {
  const seen = new Map<string, number>();

  const normalize = (text: string): string => {
    return (text || 'section')
      .toLowerCase()
      .trim()
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/["'`(){}[\]:;!?.,]/g, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  };

  const slug = (text: string): string => {
    const base = normalize(text);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return `${base}-${count}`;
  };

  return { slug };
}

export function extractTextFromNode(node: Node | Text | Element | null | undefined): string {
  if (!node) return '';

  if (typeof (node as Text).value === 'string') {
    return (node as Text).value;
  }

  if ((node as Element).children?.length) {
    return (node as Element).children.map(extractTextFromNode).join('');
  }

  return '';
}

export default function rehypeHeadingIds(options?: { prefix?: string }) {
  return (tree: Root) => {
    const slugger = createSlugger();
    const prefix = options?.prefix ? `${options.prefix}--` : '';

    visit(tree, 'element', (node) => {
      if (!node || typeof node.tagName !== 'string') return;
      const tag = node.tagName.toLowerCase();
      if (!/^h[1-6]$/.test(tag)) return;

      const text = extractTextFromNode(node);
      const id = prefix + slugger.slug(text);
      node.properties = node.properties || {};
      if (!node.properties.id) {
        node.properties.id = id;
      }
    });
  };
}
```

### 3. MessageOutline 组件

```vue
<!-- src/components/chat/navigation/MessageOutline.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMessagesStore } from '@/stores/messages';
import { scrollIntoView } from '@/utils/scroll';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { createSlugger, extractTextFromNode } from '../markdown/plugins/rehypeHeadingIds';

interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

interface Props {
  messageId: string;
}

const props = defineProps<Props>();
const messagesStore = useMessagesStore();
const containerRef = ref<HTMLElement>();

// 从 store 获取主文本内容
const mainTextContent = computed(() => {
  return (
    messagesStore
      .getMainTextBlocks(props.messageId)
      ?.map((b) => b.content)
      .join('\n\n') || ''
  );
});

// 提取标题
const headings = computed<HeadingItem[]>(() => {
  if (!mainTextContent.value) return [];

  const result: HeadingItem[] = [];
  const tree = unified().use(remarkParse).parse(mainTextContent.value);
  const slugger = createSlugger();

  visit(tree, ['heading', 'html'], (node) => {
    if (node.type === 'heading') {
      const level = node.depth ?? 0;
      if (!level || level < 1 || level > 6) return;

      const text = extractTextFromNode(node);
      if (!text) return;

      const id = `heading-${props.messageId}--${slugger.slug(text)}`;
      result.push({ id, level, text });
    } else if (node.type === 'html') {
      const match = node.value.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
      if (match) {
        const level = parseInt(match[1], 10);
        const text = match[2].replace(/<[^>]*>/g, '').trim();
        if (text) {
          const id = `heading-${props.messageId}--${slugger.slug(text)}`;
          result.push({ id, level, text });
        }
      }
    }
  });

  return result;
});

// 计算最小层级用于缩进
const miniLevel = computed(() => {
  return headings.value.length ? Math.min(...headings.value.map((h) => h.level)) : 1;
});

// 滚动到指定标题
function scrollToHeading(id: string) {
  const parent = containerRef.value?.parentElement;
  const messageContentContainer = parent?.querySelector('.message-content-container');

  if (messageContentContainer) {
    const headingElement = messageContentContainer.querySelector<HTMLElement>(`#${id}`);
    if (headingElement) {
      scrollIntoView(headingElement, {
        behavior: 'smooth',
        block: 'start',
      });
    }
  }
}
</script>

<template>
  <div v-if="headings.length > 0" ref="containerRef" class="message-outline-container">
    <div class="message-outline-body">
      <div
        v-for="(heading, index) in headings"
        :key="index"
        class="message-outline-item"
        @click="scrollToHeading(heading.id)"
      >
        <div class="message-outline-dot" :class="`level-${heading.level}`" />
        <div
          class="message-outline-text"
          :style="{
            paddingLeft: `${(heading.level - miniLevel) * 8}px`,
            fontSize: `${16 - heading.level}px`,
          }"
        >
          {{ heading.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style module>
.message-outline-container {
  position: absolute;
  inset: 63px 0 36px 10px;
  z-index: 999;
  pointer-events: none;
}

.message-outline-container ~ .message-content-container {
  padding-left: 46px !important;
}

.message-outline-body {
  max-width: 50%;
  max-height: min(100%, 70vh);
  position: sticky;
  top: max(calc(50% - (v-bind('headings.length * 24') / 2 + 10) px), 20px);
  overflow-x: hidden;
  overflow-y: hidden;
  display: inline-flex;
  flex-direction: column;
  padding: 10px 0 10px 10px;
  gap: 4px;
  border-radius: 10px;
  pointer-events: auto;
  transition: all 0.2s ease;
}

.message-outline-body:hover {
  padding: 10px;
  overflow-y: auto;
  background: var(--color-background);
  box-shadow: 0 0 10px 0 rgba(128, 128, 128, 0.2);
}

.message-outline-body:hover .message-outline-text {
  opacity: 1;
}

.message-outline-item {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.message-outline-dot {
  width: calc(16px - (var(--level) * 2px));
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin-right: 4px;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.message-outline-item:hover .message-outline-dot {
  background: var(--color-text-3);
}

.message-outline-text {
  overflow: hidden;
  color: var(--color-text-3);
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 2px 8px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.message-outline-item:hover .message-outline-text {
  color: var(--color-text-2);
}
</style>
```

### 4. ChatNavigation 组件

```vue
<!-- src/components/chat/navigation/ChatNavigation.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { scrollIntoView } from '@/utils/scroll';

interface Props {
  containerId: string;
}

const props = defineProps<Props>();
const settings = useSettingsStore();

const isVisible = ref(false);
const manuallyClosedUntil = ref<number | null>(null);
const isHovering = ref(false);
const isInTriggerArea = ref(false);
const lastMoveTime = ref(0);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

// 计算右侧偏移
const rightOffset = computed(() => {
  let offset = 16; // RIGHT_GAP
  if (settings.topicPosition === 'right' && settings.showTopics) {
    offset += 275;
  }
  return offset;
});

// 清除隐藏定时器
function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

// 调度隐藏
function scheduleHide(delay: number) {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    if (!isHovering.value && !isInTriggerArea.value) {
      isVisible.value = false;
    }
  }, delay);
}

// 显示导航
function showNavigation() {
  if (manuallyClosedUntil.value && Date.now() < manuallyClosedUntil.value) {
    return;
  }
  isVisible.value = true;
  clearHideTimer();
}

// 查找用户消息
function findUserMessages(): HTMLElement[] {
  const container = document.getElementById(props.containerId);
  if (!container) return [];
  return Array.from(container.getElementsByClassName('message-user')) as HTMLElement[];
}

// 滚动到消息
function scrollToMessage(element: HTMLElement) {
  scrollIntoView(element, {
    behavior: 'smooth',
    block: 'start',
  });
}

// 滚动到顶部
function scrollToTop() {
  const container = document.getElementById(props.containerId);
  if (container) {
    container.scrollTo({ top: -container.scrollHeight, behavior: 'smooth' });
  }
}

// 滚动到底部
function scrollToBottom() {
  const container = document.getElementById(props.containerId);
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

// 获取当前可见消息索引
function getCurrentVisibleIndex(direction: 'up' | 'down'): number {
  const container = document.getElementById(props.containerId);
  if (!container) return -1;

  const userMessages = findUserMessages();
  const containerRect = container.getBoundingClientRect();
  const visibleThreshold = containerRect.height * 0.1;

  let visibleIndices: number[] = [];

  for (let i = 0; i < userMessages.length; i++) {
    const messageRect = userMessages[i].getBoundingClientRect();
    const visibleHeight =
      Math.min(messageRect.bottom, containerRect.bottom) -
      Math.max(messageRect.top, containerRect.top);

    if (visibleHeight > 0 && visibleHeight >= Math.min(messageRect.height, visibleThreshold)) {
      visibleIndices.push(i);
    }
  }

  if (visibleIndices.length > 0) {
    return direction === 'up' ? Math.max(...visibleIndices) : Math.min(...visibleIndices);
  }

  return -1;
}

// 下一个消息
function handleNextMessage() {
  showNavigation();
  const userMessages = findUserMessages();

  if (userMessages.length === 0) {
    return scrollToBottom();
  }

  const visibleIndex = getCurrentVisibleIndex('down');

  if (visibleIndex === -1) {
    return scrollToBottom();
  }

  const targetIndex = visibleIndex - 1;

  if (targetIndex < 0) {
    return scrollToBottom();
  }

  scrollToMessage(userMessages[targetIndex]);
}

// 上一个消息
function handlePrevMessage() {
  showNavigation();
  const userMessages = findUserMessages();

  if (userMessages.length === 0) {
    return scrollToTop();
  }

  const visibleIndex = getCurrentVisibleIndex('up');

  if (visibleIndex === -1) {
    return scrollToTop();
  }

  const targetIndex = visibleIndex + 1;

  if (targetIndex >= userMessages.length) {
    return scrollToTop();
  }

  scrollToMessage(userMessages[targetIndex]);
}

// 关闭导航
function handleClose() {
  isVisible.value = false;
  isHovering.value = false;
  isInTriggerArea.value = false;
  clearHideTimer();
  // 1分钟内不响应鼠标靠近
  manuallyClosedUntil.value = Date.now() + 60000;
}

// 鼠标进入导航区域
function handleMouseEnter() {
  if (manuallyClosedUntil.value && Date.now() < manuallyClosedUntil.value) {
    return;
  }
  isHovering.value = true;
  showNavigation();
}

// 鼠标离开导航区域
function handleMouseLeave() {
  isHovering.value = false;
  scheduleHide(500);
}

// 处理全局鼠标移动
function handleMouseMove(e: MouseEvent) {
  if (manuallyClosedUntil.value && Date.now() < manuallyClosedUntil.value) {
    return;
  }

  const now = Date.now();
  if (now - lastMoveTime.value < 50) return;
  lastMoveTime.value = now;

  const triggerWidth = 60;
  const rightPosition = window.innerWidth - rightOffset.value - triggerWidth;
  const topPosition = window.innerHeight * 0.35;
  const height = window.innerHeight * 0.3;

  const target = e.target as HTMLElement;
  const isInExcludedArea = [
    '.MessageFooter',
    '.code-toolbar',
    '.ant-collapse-header',
    '.group-menu-bar',
    '.code-block',
    '.message-editor',
    '.table-wrapper',
  ].some((selector) => target.closest(selector));

  const inTriggerArea =
    !isInExcludedArea &&
    e.clientX > rightPosition &&
    e.clientX < rightPosition + triggerWidth + 16 &&
    e.clientY > topPosition &&
    e.clientY < topPosition + height;

  if (inTriggerArea) {
    if (!isInTriggerArea.value) {
      isInTriggerArea.value = true;
      showNavigation();
    }
  } else if (isInTriggerArea.value) {
    isInTriggerArea.value = false;
    if (!isHovering.value) {
      scheduleHide(500);
    }
  }
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  clearHideTimer();
});
</script>

<template>
  <div
    v-if="settings.messageNavigation === 'buttons'"
    class="chat-navigation"
    :class="{ visible: isVisible }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="button-group">
      <button class="nav-button" :title="$t('chat.navigation.close')" @click="handleClose">
        <Icon icon="mdi:close" />
      </button>

      <div class="divider" />

      <button class="nav-button" :title="$t('chat.navigation.top')" @click="scrollToTop">
        <Icon icon="mdi:arrow-collapse-up" />
      </button>

      <div class="divider" />

      <button class="nav-button" :title="$t('chat.navigation.prev')" @click="handlePrevMessage">
        <Icon icon="mdi:arrow-up" />
      </button>

      <div class="divider" />

      <button class="nav-button" :title="$t('chat.navigation.next')" @click="handleNextMessage">
        <Icon icon="mdi:arrow-down" />
      </button>

      <div class="divider" />

      <button class="nav-button" :title="$t('chat.navigation.bottom')" @click="scrollToBottom">
        <Icon icon="mdi:arrow-collapse-down" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-navigation {
  position: fixed;
  right: v-bind('rightOffset + "px"');
  top: 50%;
  transform: translateY(-50%) translateX(32px);
  z-index: 999;
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
}

.chat-navigation.visible {
  transform: translateY(-50%) translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.button-group {
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.nav-button {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-button:hover {
  background-color: var(--color-hover);
  color: var(--color-primary);
}

.divider {
  height: 1px;
  background: var(--color-border);
  margin: 0;
}
</style>
```

### 5. 在 Message 组件中使用

```vue
<!-- src/components/chat/MessageItem.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import MessageOutline from './navigation/MessageOutline.vue';

interface Props {
  message: Message;
}

const props = defineProps<Props>();
const settings = useSettingsStore();

const showOutline = computed(() => {
  return (
    settings.showMessageOutline &&
    props.message.role === 'assistant' &&
    props.message.multiModelMessageStyle !== 'grid'
  );
});
</script>

<template>
  <div class="message-item" :id="`message-${message.id}`">
    <MessageOutline v-if="showOutline" :message-id="message.id" />

    <div class="message-content-container">
      <!-- 消息内容 -->
    </div>

    <div v-if="showOutline" class="message-footer" />
  </div>
</template>
```

### 6. Markdown 渲染集成

```vue
<!-- src/components/chat/markdown/MarkdownRenderer.vue -->
<script setup lang="ts">
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeRaw from 'rehype-raw';
import rehypeHeadingIds from './plugins/rehypeHeadingIds';

interface Props {
  content: string;
  blockId: string;
  mathEngine?: 'KaTeX' | 'MathJax';
}

const props = withDefaults(defineProps<Props>(), {
  mathEngine: 'KaTeX',
});

const html = computed(() => {
  const processor = unified().use(remarkParse).use(remarkRehype, { allowDangerousHtml: true });

  // 添加标题 ID 插件
  processor.use(rehypeHeadingIds, {
    prefix: `heading-${props.blockId}`,
  });

  // 如果需要支持 HTML
  processor.use(rehypeRaw);

  // 数学公式支持
  if (props.mathEngine === 'KaTeX') {
    // processor.use(rehypeKatex)
  }

  processor.use(rehypeStringify);

  const result = processor.processSync(props.content);
  return result.toString();
});
</script>

<template>
  <div class="markdown-content" v-html="html" />
</template>
```

---

## 移植检查清单

### 必需功能

- [ ] 消息大纲显示与隐藏
- [ ] 标题提取与层级识别
- [ ] 唯一 ID 生成（去重）
- [ ] 锚点点击滚动
- [ ] 悬停展开效果
- [ ] 全局导航栏显示/隐藏
- [ ] 消息间上下导航
- [ ] 顶部/底部快速滚动

### 优化功能

- [ ] 手动关闭与 1 分钟静默
- [ ] 触发区域智能检测
- [ ] 可见消息计算算法
- [ ] 平滑滚动动画
- [ ] 响应式布局适配
- [ ] 键盘快捷键支持

### 边界情况处理

- [ ] Grid 布局禁用大纲
- [ ] 空内容/无标题处理
- [ ] 中文 slug 生成
- [ ] 重复标题去重
- [ ] 滚动容器检测

---

## 注意事项

### 1. CSS 模块化

原文档使用 styled-components，Vue 建议使用：

- **CSS Modules**: 作用域样式隔离
- **UnoCSS/Tailwind**: 原子化 CSS
- **SCSS**: 嵌套和变量支持

### 2. 性能优化

- 使用 `computed` 缓存标题计算
- 虚拟滚动处理长列表
- 防抖鼠标移动事件
- 避免不必要的 DOM 查询

### 3. 兼容性

- `container: 'nearest'` 是 Chromium 特有参数
- Firefox/Safari 不支持，需回退到默认滚动

### 4. 主题适配

- 使用 CSS 变量支持明暗主题
- 注意 `backdrop-filter` 的浏览器兼容性

---

## 参考资料

- [MDN: scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)
- [unified 文档](https://unifiedjs.com/)
- [remark-parse 文档](https://github.com/remarkjs/remark/tree/main/packages/remark-parse)
- [unist-util-visit 文档](https://github.com/syntax-tree/unist-util-visit)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
