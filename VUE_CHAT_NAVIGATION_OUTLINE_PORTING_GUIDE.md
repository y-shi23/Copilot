# Vue 聊天项目移植指南：对话锚点与消息大纲功能

> 本文档详细分析当前 React 项目中的**对话锚点线（MessageAnchorLine）**和**消息大纲（MessageOutline）**功能，为 Vue 项目提供完整的移植方案。

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

### 对话锚点线（MessageAnchorLine）

**设置路径**: `messageNavigation: 'anchor'`

**功能描述**：在聊天界面右侧显示一条垂直锚点线，包含：

- 所有消息的缩略图标点
- 鼠标悬停时展开显示消息预览（用户名 + 内容摘要）
- 根据鼠标距离动态调整图标大小和透明度
- 点击锚点快速滚动到对应消息
- 底部固定"滚动到底部"按钮

**交互特点**：

- 默认收起为 14px 宽的细线
- 鼠标悬停时展开为 500px 宽的面板
- 鼠标位置决定列表的垂直偏移（双向滚动效果）
- 使用距离算法实现动态缩放和透明度
- 支持分组消息的折叠状态处理

### 消息大纲锚点（MessageOutline）

**设置路径**: `showMessageOutline: true`

**功能描述**：在 AI 助手回复的消息左侧显示标题层级大纲，用户可以：

- 鼠标悬停时展开显示完整标题文本
- 点击锚点项平滑滚动到对应标题位置
- 根据标题层级（H1-H6）显示不同视觉层级

**交互特点**：

- 默认隐藏标题文本，仅显示小圆点
- 悬停时显示卡片式大纲面板
- 支持 sticky 定位，随滚动保持可见
- 不支持 grid 布局的消息样式

---

## 核心组件分析

### 1. MessageAnchorLine 组件

**文件位置**: `src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx`

#### 核心数据结构

```typescript
interface MessageLineProps {
  messages: Message[]; // 所有消息列表
}

// 状态管理
const [mouseY, setMouseY] = useState<number | null>(null); // 鼠标在列表中的Y坐标
const [listOffsetY, setListOffsetY] = useState(0); // 列表垂直偏移量
const [containerHeight, setContainerHeight] = useState<number | null>(null);
const messageItemsRef = useRef<Map<string, HTMLDivElement>>(new Map());
```

#### 距离计算算法（核心）

```typescript
// 根据鼠标距离计算动态值（透明度、缩放、大小）
const calculateValueByDistance = useCallback(
  (itemId: string, maxValue: number) => {
    if (mouseY === null) return 0;

    const element = messageItemsRef.current.get(itemId);
    if (!element) return 0;

    // 计算元素中心点到鼠标位置的距离
    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(
      centerY - (messagesListRef.current?.getBoundingClientRect().top || 0) - mouseY,
    );

    const maxDistance = 100; // 最大影响距离 100px

    // 距离越近，返回值越大（0 ~ maxValue）
    return Math.max(0, maxValue * (1 - distance / maxDistance));
  },
  [mouseY],
);
```

#### 视觉效果计算

```typescript
// 对消息锚点应用动态样式
const opacity = 0.5 + calculateValueByDistance(message.id, 0.5); // 0.5 ~ 1.0
const scale = 1 + calculateValueByDistance(message.id, 0.2); // 1.0 ~ 1.2
const size = 10 + calculateValueByDistance(message.id, 20); // 10px ~ 30px

// 默认状态（无鼠标悬停）
const defaultOpacity = Math.max(0, 0.6 - (0.3 * Math.abs(index - messages.length / 2)) / 5);
// 中间的消息不透明度更高（0.6），两端的消息更低（渐隐效果）
```

#### 列表偏移算法

```typescript
// 当鼠标在容器中移动时，根据鼠标位置调整列表偏移
const handleMouseMove = (e: React.MouseEvent) => {
  const containerRect = e.currentTarget.getBoundingClientRect();
  const listRect = messagesListRef.current.getBoundingClientRect();

  // 计算鼠标在列表中的相对位置
  setMouseY(e.clientY - listRect.top);

  // 如果列表高度超过容器高度，计算偏移量
  if (listRect.height > containerRect.height) {
    const mousePositionRatio = (e.clientY - containerRect.top) / containerRect.height;
    const maxOffset = (containerRect.height - listRect.height) / 2 - 20;

    // 根据鼠标在容器中的位置比例，计算列表偏移
    setListOffsetY(-maxOffset + mousePositionRatio * (maxOffset * 2));
  } else {
    setListOffsetY(0);
  }
};
```

#### 分组消息处理

```typescript
// 处理分组消息的点击
const setSelectedMessage = useCallback(
  (message: Message) => {
    // 找到同一组的所有消息（通过 askId 关联）
    const groupMessages = messages.filter((m) => m.askId === message.askId);

    if (groupMessages.length > 1) {
      // 更新所有消息的折叠状态
      for (const m of groupMessages) {
        dispatch(
          newMessagesActions.updateMessage({
            topicId: m.topicId,
            messageId: m.id,
            updates: { foldSelected: m.id === message.id }, // 只展开选中的
          }),
        );
      }

      // 延迟滚动以确保 DOM 更新完成
      setTimeoutTimer(
        'setSelectedMessage',
        () => {
          const messageElement = document.getElementById(`message-${message.id}`);
          if (messageElement) {
            scrollIntoView(messageElement, {
              behavior: 'auto',
              block: 'start',
              container: 'nearest',
            });
          }
        },
        100,
      );
    }
  },
  [dispatch, messages, setTimeoutTimer],
);
```

#### 样式设计

| 元素         | 默认状态   | 悬停状态            |
| ------------ | ---------- | ------------------- |
| **容器宽度** | 14px       | 500px               |
| **overflow** | hidden     | visible             |
| **消息卡片** | opacity: 0 | opacity: 1          |
| **头像大小** | 固定       | 10px ~ 30px（动态） |

### 2. MessageOutline 组件

**文件位置**: `src/renderer/src/pages/home/Messages/MessageOutline.tsx`

#### 标题提取流程

```typescript
// 1. 从 Redux 获取 blocks
const blockEntities = useSelector((state: RootState) =>
  messageBlocksSelectors.selectEntities(state),
);

// 2. 筛选 MAIN_TEXT 类型的 blocks
const mainTextBlocks = message.blocks
  .map((blockId) => blockEntities[blockId])
  .filter((b) => b?.type === MessageBlockType.MAIN_TEXT);

// 3. 解析 Markdown 提取标题
const tree = unified().use(remarkParse).parse(mainTextBlock?.content);
const slugger = createSlugger();

visit(tree, ['heading', 'html'], (node) => {
  if (node.type === 'heading') {
    // 处理 Markdown 标题 (# heading)
    const level = node.depth ?? 0;
    const text = extractTextFromNode(node);
    const id = `heading-${mainTextBlock.id}--` + slugger.slug(text);
    result.push({ id, level, text });
  } else if (node.type === 'html') {
    // 处理 HTML 标题 (<h1>heading</h1>)
    const match = node.value.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
    if (match) {
      const level = parseInt(match[1], 10);
      const text = match[2].replace(/<[^>]*>/g, '').trim();
      const id = `heading-${mainTextBlock.id}--${slugger.slug(text)}`;
      result.push({ id, level, text });
    }
  }
});
```

#### 滚动定位

```typescript
const scrollToHeading = (id: string) => {
  const parent = messageOutlineContainerRef.current?.parentElement;
  const messageContentContainer = parent?.querySelector('.message-content-container');

  if (messageContentContainer) {
    const headingElement = messageContentContainer.querySelector<HTMLElement>(`#${id}`);
    if (headingElement) {
      // 根据消息样式选择滚动方式
      const scrollBlock = ['horizontal', 'grid'].includes(message.multiModelMessageStyle ?? '')
        ? 'nearest'
        : 'start';

      scrollIntoView(headingElement, {
        behavior: 'smooth',
        block: scrollBlock,
        container: 'nearest',
      });
    }
  }
};
```

---

## 数据结构与状态管理

### Redux 状态结构

```typescript
// src/renderer/src/store/settings.ts
export interface SettingsState {
  // 消息导航模式：none | buttons | anchor
  messageNavigation: 'none' | 'buttons' | 'anchor';

  // 是否显示消息大纲（左侧标题锚点）
  showMessageOutline: boolean;

  // 话题列表位置（影响锚点线位置）
  topicPosition: 'left' | 'right';
  showTopics: boolean;
}

// src/renderer/src/types/newMessage.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  askId?: string; // 用于关联分组消息
  topicId: string;
  blocks: string[]; // Block ID 引用数组
  model?: Model;
  multiModelMessageStyle?: 'horizontal' | 'vertical' | 'fold' | 'grid';
  type?: 'clear' | 'default';
}

export interface MessageBlock {
  id: string;
  type: MessageBlockType; // MAIN_TEXT | IMAGE | FILE | etc.
  content: string; // Markdown 内容
}
```

### 标题 ID 生成规则

**文件位置**: `src/renderer/src/pages/home/Markdown/plugins/rehypeHeadingIds.ts`

```typescript
// GitHub 风格的 slug 生成算法
const normalize = (text: string): string => {
  return (text || 'section')
    .toLowerCase()
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 移除零宽字符
    .replace(/["'`(){}[\]:;!?.,]/g, '') // 移除标点符号
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-') // 支持中文，将非字母数字转为 '-'
    .replace(/-{2,}/g, '-') // 合并连续的 '-'
    .replace(/^-|-$/g, ''); // 移除首尾的 '-'
};

// 去重逻辑：重复的标题添加递增数字后缀
const slug = (text: string): string => {
  const base = normalize(text);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return `${base}-${count}`; // 第一个无后缀，后续为 -1, -2, -3...
};

// 最终 ID 格式：heading-{blockId}--{slug}
const id = `heading-${blockId}--${slugger.slug(text)}`;
```

---

## Vue 移植方案

### 技术栈对比

| 功能          | React 项目            | Vue 项目建议                   |
| ------------- | --------------------- | ------------------------------ |
| 状态管理      | Redux Toolkit         | Pinia                          |
| 样式方案      | styled-components     | CSS Modules / UnoCSS           |
| Markdown 解析 | unified + remarkParse | unified + remarkParse（相同）  |
| DOM 操作      | scrollIntoView        | scrollIntoView（原生）         |
| Ref 管理      | useRef                | ref / templateRef              |
| 图标库        | ant-design icons      | @iconify/vue / lucide-vue-next |

### 组件结构设计

```
src/components/chat/
├── navigation/
│   ├── MessageAnchorLine.vue      # 消息锚点线（右侧）
│   ├── MessageOutline.vue         # 消息大纲锚点（左侧）
│   └── hooks/
│       ├── useAnchorDistance.ts   # 距离计算逻辑
│       └── useMessageNavigation.ts # 导航滚动逻辑
├── markdown/
│   ├── plugins/
│   │   └── rehypeHeadingIds.ts    # 标题 ID 生成（直接复用）
│   └── MarkdownRenderer.vue       # Markdown 渲染器
└── utils/
    └── scroll.ts                  # 滚动工具函数
```

### Pinia Store 设计

```typescript
// src/stores/settings.ts
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    messageNavigation: 'none' as 'none' | 'buttons' | 'anchor',
    showMessageOutline: false,
    topicPosition: 'left' as 'left' | 'right',
    showTopics: true,
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
    blocks: {} as Record<string, MessageBlock>,
  }),

  getters: {
    // 获取消息的主文本内容
    getMessageMainText: (state) => (messageId: string) => {
      const message = state.messages.find((m) => m.id === messageId);
      if (!message) return '';

      return message.blocks
        .map((id) => state.blocks[id])
        .filter((b) => b?.type === 'MAIN_TEXT')
        .map((b) => b.content)
        .join('\n\n');
    },

    // 获取分组消息
    getMessageGroup: (state) => (askId: string) => {
      return state.messages.filter((m) => m.askId === askId);
    },
  },

  actions: {
    updateMessageFoldSelected(topicId: string, messageId: string, foldSelected: boolean) {
      const message = this.messages.find((m) => m.id === messageId && m.topicId === topicId);
      if (message) {
        // 更新消息状态
      }
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
    "remark-rehype": "^11.0.0",
    "rehype-stringify": "^10.0.0",
    "rehype-raw": "^7.0.0",
    "unist-util-visit": "^5.0.0",
    "hast": "^3.0.0",
    "pinia": "^2.1.0",
    "pinia-plugin-persistedstate": "^3.2.0"
  }
}
```

### 可选依赖

```json
{
  "dependencies": {
    "@iconify/vue": "^4.1.0",
    "lucide-vue-next": "^0.400.0",
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
 * 在容器内智能滚动
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

### 2. 标题 ID 生成插件（直接复用）

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

### 3. 距离计算 Hook

```typescript
// src/components/chat/navigation/hooks/useAnchorDistance.ts
import { ref, Ref } from 'vue';

interface DistanceOptions {
  maxDistance?: number; // 最大影响距离，默认 100px
}

/**
 * 根据鼠标距离计算动态值的 Hook
 */
export function useAnchorDistance(
  itemsRef: Ref<Map<string, HTMLElement>>,
  options: DistanceOptions = {},
) {
  const { maxDistance = 100 } = options;
  const mouseY = ref<number | null>(null);

  /**
   * 计算指定元素到鼠标的距离相关值
   * @param itemId 元素 ID
   * @param maxValue 最大值
   * @returns 0 ~ maxValue 之间的值，距离越近值越大
   */
  function calculateValueByDistance(itemId: string, maxValue: number): number {
    if (mouseY.value === null) return 0;

    const element = itemsRef.value.get(itemId);
    if (!element) return 0;

    const rect = element.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;

    // 需要传入列表容器的 top
    const listTop =
      itemsRef.value.values().next().value?.closest('.messages-list')?.getBoundingClientRect()
        .top ?? 0;

    const distance = Math.abs(centerY - listTop - mouseY.value);

    return Math.max(0, maxValue * (1 - distance / maxDistance));
  }

  return {
    mouseY,
    setMouseY: (y: number | null) => {
      mouseY.value = y;
    },
    calculateValueByDistance,
  };
}
```

### 4. MessageAnchorLine 组件

```vue
<!-- src/components/chat/navigation/MessageAnchorLine.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useMessagesStore } from '@/stores/messages';
import { scrollIntoView } from '@/utils/scroll';
import { CircleChevronDown } from 'lucide-vue-next';
import EmojiAvatar from '@/components/Avatar/EmojiAvatar.vue';

interface Props {
  messages: Message[];
}

const props = defineProps<Props>();
const settings = useSettingsStore();
const messagesStore = useMessagesStore();

// Refs
const containerRef = ref<HTMLElement>();
const messagesListRef = ref<HTMLElement>();
const messageItemsRef = new Map<string, HTMLElement>();

// State
const mouseY = ref<number | null>(null);
const listOffsetY = ref(0);
const containerHeight = ref<number | null>(null);

// 计算容器高度
function updateHeight() {
  if (containerRef.value) {
    const parentElement = containerRef.value.parentElement;
    if (parentElement) {
      containerHeight.value = parentElement.clientHeight;
    }
  }
}

onMounted(() => {
  updateHeight();
  window.addEventListener('resize', updateHeight);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateHeight);
});

// 距离计算
function calculateValueByDistance(itemId: string, maxValue: number): number {
  if (mouseY.value === null) return 0;

  const element = messageItemsRef.get(itemId);
  if (!element) return 0;

  const rect = element.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const listTop = messagesListRef.value?.getBoundingClientRect().top || 0;
  const distance = Math.abs(centerY - listTop - mouseY.value);
  const maxDistance = 100;

  return Math.max(0, maxValue * (1 - distance / maxDistance));
}

// 获取用户名
function getUserName(message: Message): string {
  if (message.role === 'assistant') {
    return message.model?.name || message.modelId || 'AI';
  }
  return settings.userName || 'You';
}

// 获取消息摘要
function getMessageContent(message: Message): string {
  return messagesStore.getMessageMainText(message.id).substring(0, 50);
}

// 滚动到消息
function scrollToMessage(message: Message) {
  const messageElement = document.getElementById(`message-${message.id}`);
  if (!messageElement) return;

  const display = window.getComputedStyle(messageElement).display;
  if (display === 'none') {
    // 处理分组消息
    setSelectedMessage(message);
    return;
  }

  scrollIntoView(messageElement, {
    behavior: 'smooth',
    block: 'start',
  });
}

// 处理分组消息
function setSelectedMessage(message: Message) {
  const groupMessages = props.messages.filter((m) => m.askId === message.askId);

  if (groupMessages.length > 1) {
    // 更新所有消息的折叠状态
    for (const m of groupMessages) {
      messagesStore.updateMessageFoldSelected(m.topicId, m.id, m.id === message.id);
    }

    // 延迟滚动
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${message.id}`);
      if (messageElement) {
        scrollIntoView(messageElement, {
          behavior: 'auto',
          block: 'start',
        });
      }
    }, 100);
  }
}

// 滚动到底部
function scrollToBottom() {
  const messagesContainer = document.getElementById('messages');
  if (messagesContainer) {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth',
    });
  }
}

// 鼠标移动处理
function handleMouseMove(e: MouseEvent) {
  if (!messagesListRef.value) return;

  const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const listRect = messagesListRef.value.getBoundingClientRect();

  setMouseY(e.clientY - listRect.top);

  // 计算列表偏移
  if (listRect.height > containerRect.height) {
    const mousePositionRatio = (e.clientY - containerRect.top) / containerRect.height;
    const maxOffset = (containerRect.height - listRect.height) / 2 - 20;
    listOffsetY.value = -maxOffset + mousePositionRatio * (maxOffset * 2);
  } else {
    listOffsetY.value = 0;
  }
}

function handleMouseLeave() {
  mouseY.value = null;
  listOffsetY.value = 0;
}

// 计算消息样式
function getMessageStyle(message: Message, index: number) {
  const opacity = mouseY.value
    ? 0.5 + calculateValueByDistance(message.id, 0.5)
    : Math.max(0, 0.6 - (0.3 * Math.abs(index - props.messages.length / 2)) / 5);

  const scale = 1 + calculateValueByDistance(message.id, 0.2);
  const size = 10 + calculateValueByDistance(message.id, 20);

  return { opacity, scale, size };
}

// 获取头像
function getAvatarSource(message: Message) {
  if (message.role === 'assistant') {
    return message.model?.logo || null;
  }
  return null;
}
</script>

<template>
  <div
    v-if="messages.length > 0"
    ref="containerRef"
    class="message-anchor-line"
    :style="{ height: containerHeight ? `${containerHeight - 20}px` : 'auto' }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <div
      ref="messagesListRef"
      class="messages-list"
      :style="{ transform: `translateY(${listOffsetY}px)` }"
    >
      <!-- 底部锚点 -->
      <div
        :ref="
          (el: any) =>
            el ? messageItemsRef.set('bottom-anchor', el) : messageItemsRef.delete('bottom-anchor')
        "
        class="message-item bottom-anchor"
        :style="{
          opacity: mouseY ? 0.5 : Math.max(0, 0.6 - (0.3 * Math.abs(0 - messages.length / 2)) / 5),
        }"
        @click="scrollToBottom"
      >
        <CircleChevronDown :size="10 + calculateValueByDistance('bottom-anchor', 20)" />
      </div>

      <!-- 消息锚点 -->
      <div
        v-for="(message, index) in messages"
        :key="message.id"
        :ref="
          (el: any) =>
            el ? messageItemsRef.set(message.id, el) : messageItemsRef.delete(message.id)
        "
        class="message-item"
        :style="{ opacity: getMessageStyle(message, index).opacity }"
        @click="() => scrollToMessage(message)"
      >
        <div
          class="message-item-content"
          :style="{ transform: `scale(${getMessageStyle(message, index).scale})` }"
        >
          <div class="message-item-title">
            {{ getUserName(message) }}
          </div>
          <div class="message-item-text">
            {{ getMessageContent(message) }}
          </div>
        </div>

        <!-- 头像 -->
        <img
          v-if="message.role === 'assistant'"
          class="message-item-avatar"
          :src="getAvatarSource(message)"
          :style="{
            width: `${getMessageStyle(message, index).size}px`,
            height: `${getMessageStyle(message, index).size}px`,
          }"
        />
        <EmojiAvatar v-else :size="getMessageStyle(message, index).size">
          {{ userAvatar }}
        </EmojiAvatar>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-anchor-line {
  width: 14px;
  position: fixed;
  top: calc(50% - var(--status-bar-height) - 10px);
  right: 13px;
  max-height: calc(100% - var(--status-bar-height) * 2 - 20px);
  transform: translateY(-50%);
  z-index: 0;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 5px;
  overflow: hidden;
  transition: width 0.3s ease;
}

.message-anchor-line:hover {
  width: 500px;
  overflow-x: visible;
  overflow-y: hidden;
}

.messages-list {
  display: flex;
  flex-direction: column-reverse;
  will-change: transform;
}

.message-item {
  display: flex;
  position: relative;
  cursor: pointer;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  transform-origin: right center;
  padding: 2px 0;
  will-change: opacity;
  opacity: 0.4;
  transition: opacity 0.1s linear;
}

.message-item-content {
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  text-align: right;
  gap: 3px;
  opacity: 0;
  transform-origin: right center;
  transition: transform cubic-bezier(0.25, 1, 0.5, 1) 150ms;
  will-change: transform;
}

.message-anchor-line:hover .message-item-content {
  opacity: 1;
}

.message-item-title {
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
}

.message-item-text {
  color: var(--color-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.message-item-avatar {
  transition:
    width 150ms cubic-bezier(0.25, 1, 0.5, 1),
    height 150ms cubic-bezier(0.25, 1, 0.5, 1);
  will-change: width, height;
}

.bottom-anchor {
  color: var(--color-primary);
}
</style>
```

### 5. MessageOutline 组件

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
  messageStyle?: 'horizontal' | 'vertical' | 'fold' | 'grid';
}

const props = defineProps<Props>();
const messagesStore = useMessagesStore();
const containerRef = ref<HTMLElement>();

// 从 store 获取主文本内容
const mainTextContent = computed(() => {
  return messagesStore.getMessageMainText(props.messageId);
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
      const scrollBlock = ['horizontal', 'grid'].includes(props.messageStyle ?? '')
        ? 'nearest'
        : 'start';

      scrollIntoView(headingElement, {
        behavior: 'smooth',
        block: scrollBlock,
      });
    }
  }
}

// 检查是否应该显示（grid 布局不显示）
const shouldShow = computed(() => {
  return props.messageStyle !== 'grid' && headings.value.length > 0;
});
</script>

<template>
  <div v-if="shouldShow" ref="containerRef" class="message-outline-container">
    <div class="message-outline-body">
      <div
        v-for="(heading, index) in headings"
        :key="index"
        class="message-outline-item"
        @click="scrollToHeading(heading.id)"
      >
        <div class="message-outline-dot" :data-level="heading.level" />
        <div
          class="message-outline-text"
          :data-level="heading.level"
          :style="{
            paddingLeft: `${(heading.level - miniLevel) * 8}px`,
          }"
        >
          {{ heading.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-outline-container {
  position: absolute;
  inset: 63px 0 36px 10px;
  z-index: 999;
  pointer-events: none;
}

.message-outline-container ~ .message-content-container {
  padding-left: 46px !important;
}

.message-outline-container ~ .message-footer {
  margin-left: 46px !important;
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
  display: block;
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
  display: none;
  transition: opacity 0.2s ease;
  padding: 2px 8px;
  font-size: calc(16px - var(--level) px);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.message-outline-item:hover .message-outline-text {
  color: var(--color-text-2);
}
</style>
```

### 6. 在 Messages 组件中使用

```vue
<!-- src/components/chat/Messages.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import MessageAnchorLine from './navigation/MessageAnchorLine.vue';
import MessageItem from './MessageItem.vue';

const settings = useSettingsStore();

// 根据 messageNavigation 设置显示不同的导航方式
const showAnchorLine = computed(() => {
  return settings.messageNavigation === 'anchor';
});
</script>

<template>
  <div class="messages-container">
    <!-- 消息列表 -->
    <div class="messages-list">
      <MessageItem v-for="message in messages" :key="message.id" :message="message" />
    </div>

    <!-- 消息锚点线（右侧） -->
    <MessageAnchorLine v-if="showAnchorLine" :messages="messages" />
  </div>
</template>
```

---

## 移植检查清单

### 对话锚点线（MessageAnchorLine）

- [ ] 右侧固定显示的细线（14px 宽）
- [ ] 悬停展开为预览面板（500px 宽）
- [ ] 消息缩略图标点显示
- [ ] 鼠标距离动态效果（透明度、缩放、大小）
- [ ] 列表偏移算法（鼠标位置决定）
- [ ] 分组消息的折叠状态处理
- [ ] 滚动到指定消息
- [ ] 底部"滚动到底部"按钮
- [ ] 响应式高度调整

### 消息大纲锚点（MessageOutline）

- [ ] 左侧显示的标题层级锚点
- [ ] Markdown 标题提取（# ~ ######）
- [ ] HTML 标题支持（<h1> ~ <h6>）
- [ ] 唯一 ID 生成（GitHub 风格 slug + 去重）
- [ ] 中文 slug 支持
- [ ] 点击滚动到标题
- [ ] 悬停展开效果
- [ ] 层级缩进显示
- [ ] Grid 布局禁用

---

## 注意事项

### 1. 性能优化

- **防抖鼠标移动**：距离计算使用节流（throttle）避免频繁计算
- **虚拟滚动**：消息列表很长时考虑虚拟滚动
- **缓存标题解析**：使用 `computed` 缓存 Markdown 解析结果
- **Ref 管理**：使用 Map 存储 DOM 引用，避免重复查询

### 2. 边界情况

- **Grid 布局**：MessageOutline 在 grid 模式下禁用（会导致渲染错位）
- **空内容**：无标题时不显示大纲
- **分组消息**：处理 `askId` 关联的消息组
- **消息隐藏**：检查 `display: none` 处理折叠消息

### 3. 样式适配

- **CSS 变量**：使用 CSS 变量支持明暗主题切换
- **响应式**：容器高度动态计算
- **will-change**：对动画属性使用 `will-change` 优化性能
- **backdrop-filter**：注意浏览器兼容性

### 4. 状态持久化

```typescript
// Pinia 状态持久化
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    messageNavigation: 'anchor',
    showMessageOutline: true,
  }),

  persist: {
    key: 'chat-settings',
    storage: localStorage,
  },
});
```

---

## 参考资料

- [MDN: scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)
- [unified 文档](https://unifiedjs.com/)
- [remark-parse 文档](https://github.com/remarkjs/remark/tree/main/packages/remark-parse)
- [unist-util-visit 文档](https://github.com/syntax-tree/unist-util-visit)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
- [Pinia 持久化插件](https://prazdevs.github.io/pinia-plugin-persistedstate/)
