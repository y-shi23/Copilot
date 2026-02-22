# Vue 聊天项目消息大纲实现完整方案

> 本文档详细分析当前 React + Redux 项目中的消息大纲实现，并提供 Vue 3 项目的完整移植方案。

---

## 目录

- [一、当前实现分析](#一当前实现分析)
- [二、核心组件详解](#二核心组件详解)
- [三、关键功能实现](#三关键功能实现)
- [四、Vue 3 移植方案](#四vue-3-移植方案)
- [五、代码示例](#五代码示例)
- [六、注意事项](#六注意事项)

---

## 一、当前实现分析

### 1.1 架构概览

当前项目使用 **React + Redux + TypeScript** 实现，消息大纲系统包含三个核心组件：

```
src/renderer/src/pages/home/Messages/
├── MessageOutline.tsx          # 消息大纲（左侧标题列表）
├── MessageAnchorLine.tsx       # 消息锚点线（右侧消息导航）
├── ChatNavigation.tsx          # 聊天导航（按钮式导航）
└── Markdown/
    └── plugins/
        └── rehypeHeadingIds.ts # 标题 ID 生成
```

### 1.2 功能对比

| 组件                  | 功能                     | 滚动交互                 |
| --------------------- | ------------------------ | ------------------------ |
| **MessageOutline**    | 显示单条消息内的标题大纲 | 点击跳转，**无自动高亮** |
| **MessageAnchorLine** | 显示所有消息的快速导航   | 动态视觉反馈             |
| **ChatNavigation**    | 上下条消息/顶部/底部按钮 | 鼠标靠近显示             |

### 1.3 重要发现

⚠️ **当前 `MessageOutline` 没有实现滚动时自动高亮当前标题的功能**

它只提供了：

- 显示标题层级列表
- 点击滚动到对应标题
- Hover 展开显示完整文本

---

## 二、核心组件详解

### 2.1 MessageOutline（消息大纲）

**文件路径**: `src/renderer/src/pages/home/Messages/MessageOutline.tsx`

#### 核心功能

1. **标题提取与解析**
2. **大纲展示**
3. **点击滚动定位**

#### 数据结构

```typescript
interface HeadingItem {
  id: string; // 格式: `heading-${blockId}--${slug}`
  level: number; // 1-6，标题层级
  text: string; // 标题文本
}
```

#### 标题解析流程

```typescript
// 1. 获取主文本块
const mainTextBlocks = message.blocks
  .map((blockId) => blockEntities[blockId])
  .filter((b) => b?.type === MessageBlockType.MAIN_TEXT);

// 2. 解析 Markdown AST
const tree = unified().use(remarkParse).parse(mainTextBlock?.content);

// 3. 遍历提取标题
visit(tree, ['heading', 'html'], (node) => {
  if (node.type === 'heading') {
    // Markdown 标题: # ## ### 等
    const level = node.depth ?? 0;
    const text = extractTextFromNode(node);
    const id = `heading-${mainTextBlock.id}--` + slugger.slug(text);
    result.push({ id, level, text });
  } else if (node.type === 'html') {
    // HTML 标题: <h1>-<h6>
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

#### 滚动定位实现

```typescript
const scrollToHeading = (id: string) => {
  const parent = messageOutlineContainerRef.current?.parentElement;
  const messageContentContainer = parent?.querySelector('.message-content-container');
  if (messageContentContainer) {
    const headingElement = messageContentContainer.querySelector<HTMLElement>(`#${id}`);
    if (headingElement) {
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

#### 样式特点

```css
/* 绝对定位，左侧固定 */
MessageOutlineContainer {
  position: absolute;
  inset: 63px 0 36px 10px;
  z-index: 999;
  pointer-events: none; /* 默认不拦截 */
}

/* Sticky 定位，随滚动保持可见 */
MessageOutlineBody {
  max-height: min(100%, 70vh);
  position: sticky;
  top: max(calc(50% - (${count} * 24) / 2 + 10px), 20px);
  overflow: hidden;
}

/* Hover 时展开 */
MessageOutlineBody:hover {
  overflow-y: auto;
  background: var(--color-background);
  box-shadow: 0 0 10px rgba(128, 128, 128, 0.2);
  /* 显示文本 */
}
```

---

### 2.2 MessageAnchorLine（消息锚点线）

**文件路径**: `src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx`

#### 核心功能

1. **显示所有消息的缩略导航**
2. **鼠标悬停动态展开**
3. **距离计算动态效果**

#### 距离计算算法

```typescript
const calculateValueByDistance = (itemId: string, maxValue: number) => {
  if (mouseY === null) return 0;

  const element = messageItemsRef.current.get(itemId);
  if (!element) return 0;

  // 计算元素中心与鼠标位置的垂直距离
  const rect = element.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const distance = Math.abs(
    centerY - (messagesListRef.current?.getBoundingClientRect().top || 0) - mouseY,
  );
  const maxDistance = 100;

  // 距离越近，值越大
  return Math.max(0, maxValue * (1 - distance / maxDistance));
};
```

#### 双向滚动效果

```typescript
const handleMouseMove = (e: React.MouseEvent) => {
  if (messagesListRef.current) {
    const containerRect = e.currentTarget.getBoundingClientRect();
    const listRect = messagesListRef.current.getBoundingClientRect();
    setMouseY(e.clientY - listRect.top);

    // 列表高度超过容器时产生滚动效果
    if (listRect.height > containerRect.height) {
      const mousePositionRatio = (e.clientY - containerRect.top) / containerRect.height;
      const maxOffset = (containerRect.height - listRect.height) / 2 - 20;
      setListOffsetY(-maxOffset + mousePositionRatio * (maxOffset * 2));
    } else {
      setListOffsetY(0);
    }
  }
};
```

#### 动态样式应用

```typescript
// 透明度、缩放、大小根据距离动态变化
const opacity = 0.5 + calculateValueByDistance(message.id, 1)
const scale = 1 + calculateValueByDistance(message.id, 1.2)
const size = 10 + calculateValueByDistance(message.id, 20)

<MessageItem
  style={{ opacity }}
  onClick={() => scrollToMessage(message)}>
  <MessageItemContainer style={{ transform: ` scale(${scale})` }}>
    {/* 内容 */}
  </MessageItemContainer>
  <Avatar size={size} />
</MessageItem>
```

---

### 2.3 ChatNavigation（聊天导航按钮）

**文件路径**: `src/renderer/src/pages/home/Messages/ChatNavigation.tsx`

#### 核心功能

1. **上/下一条消息导航**
2. **顶部/底部快速跳转**
3. **智能显示/隐藏**

#### 智能显示逻辑

```typescript
// 鼠标靠近右侧边缘时显示
const handleMouseMove = (e: MouseEvent) => {
  const now = Date.now();
  if (now - lastMoveTime.current < 50) return; // 节流 50ms
  lastMoveTime.current = now;

  const triggerWidth = 60;
  const rightOffset = showRightTopics ? RIGHT_GAP + 275 : RIGHT_GAP;
  const rightPosition = window.innerWidth - rightOffset - triggerWidth;
  const topPosition = window.innerHeight * 0.35;
  const height = window.innerHeight * 0.3;

  const isInTriggerArea =
    e.clientX > rightPosition &&
    e.clientX < rightPosition + triggerWidth + RIGHT_GAP &&
    e.clientY > topPosition &&
    e.clientY < topPosition + height;

  if (isInTriggerArea) {
    showNavigation();
  }
};
```

#### 当前可见消息检测

```typescript
const getCurrentVisibleIndex = (direction: 'up' | 'down') => {
  const userMessages = findUserMessages();
  const container = document.getElementById(containerId);
  if (!container) return -1;

  const containerRect = container.getBoundingClientRect();
  const visibleThreshold = containerRect.height * 0.1;

  let visibleIndices: number[] = [];

  // 检查哪些消息可见
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
};
```

---

### 2.4 rehypeHeadingIds（标题 ID 生成）

**文件路径**: `src/renderer/src/pages/home/Markdown/plugins/rehypeHeadingIds.ts`

#### Slug 生成规则（GitHub 风格）

```typescript
const normalize = (text: string): string => {
  return (text || 'section')
    .toLowerCase()
    .trim()
    .removeZeroWidthChars() // 移除零宽字符
    .removePunctuation() // 移除标点
    .replaceNonAlnumWithDash() // 非字母数字转 '-'
    .removeDuplicateDashes() // 合并多个 '-'
    .trimDashes(); // 去除首尾 '-'
};

// 去重处理
const slug = (text: string): string => {
  const base = normalize(text);
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return `${base}-${count}`; // section, section-1, section-2...
};
```

#### 支持特性

- ✅ 中文字符（`\u4e00-\u9fa5`）
- ✅ 自动去重（添加后缀）
- ✅ 零宽字符处理
- ✅ GitHub 兼容

---

## 三、关键功能实现

### 3.1 滚动时高亮当前标题（待实现功能）

⚠️ **这是当前项目缺失但需要实现的功能**

#### 实现方案

使用 `IntersectionObserver` 监听标题元素，自动高亮当前可见的标题：

```typescript
// 伪代码示例
const useActiveHeading = (headingIds: string[]) => {
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    const observers = new Map<string, IntersectionObserver>();

    headingIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveId(id);
            }
          });
        },
        {
          root: document.querySelector('.message-content-container'),
          rootMargin: '-10% 0px -80% 0px', // 顶部 10%-90% 区域
          threshold: 0,
        },
      );

      observer.observe(element);
      observers.set(id, observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, [headingIds]);

  return activeId;
};
```

---

### 3.2 Markdown 解析与标题提取

#### 使用 unist-util-visit 遍历 AST

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

const extractHeadings = (markdown: string): HeadingItem[] => {
  const tree = unified().use(remarkParse).parse(markdown);
  const headings: HeadingItem[] = [];
  const slugger = createSlugger();

  visit(tree, ['heading', 'html'], (node) => {
    if (node.type === 'heading') {
      headings.push({
        id: `heading-${slugger.slug(extractText(node))}`,
        level: node.depth,
        text: extractText(node),
      });
    }
  });

  return headings;
};
```

---

### 3.3 性能优化策略

#### 1. 虚拟滚动支持

```typescript
// 仅处理可见区域的消息
const visibleMessages = useMemo(() => {
  return messages.filter((m) => m.id >= firstVisibleId && m.id <= lastVisibleId);
}, [messages, firstVisibleId, lastVisibleId]);
```

#### 2. 事件节流

```typescript
const handleMouseMove = useThrottleFn(
  (e: MouseEvent) => {
    // 处理逻辑
  },
  { wait: 50 },
);
```

#### 3. React.memo 优化

```typescript
export default React.memo(MessageOutline, (prev, next) => {
  return prev.message.blocks === next.message.blocks;
});
```

---

## 四、Vue 3 移植方案

### 4.1 技术栈映射

| React                              | Vue 3                          |
| ---------------------------------- | ------------------------------ |
| `useState`                         | `ref` / `reactive`             |
| `useEffect`                        | `onMounted` / `watch`          |
| `useMemo`                          | `computed`                     |
| `useCallback`                      | 普通函数（Vue 自动优化）       |
| `styled-components`                | CSS Modules / `<style scoped>` |
| Redux                              | Pinia                          |
| `remarkParse` + `unist-util-visit` | 相同（通用库）                 |

### 4.2 组件结构映射

```
src/components/message/
├── MessageOutline.vue           # 消息大纲
├── MessageAnchorLine.vue        # 消息锚点线
├── ChatNavigation.vue           # 聊天导航
└── utils/
    ├── markdown.ts              # Markdown 解析
    └── slugger.ts               # Slug 生成
```

### 4.3 状态管理（Pinia）

```typescript
// stores/messageOutline.ts
import { defineStore } from 'pinia';

export const useMessageOutlineStore = defineStore('messageOutline', {
  state: () => ({
    showMessageOutline: false,
    activeHeadingId: null as string | null,
    expandedOutlineIds: [] as string[],
  }),

  actions: {
    setActiveHeading(id: string) {
      this.activeHeadingId = id;
    },

    toggleOutline(id: string) {
      const index = this.expandedOutlineIds.indexOf(id);
      if (index >= 0) {
        this.expandedOutlineIds.splice(index, 1);
      } else {
        this.expandedOutlineIds.push(id);
      }
    },
  },
});
```

---

## 五、代码示例

### 5.1 Vue 3 MessageOutline 组件

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { createSlugger, extractTextFromNode } from '@/utils/slugger';
import { useMessageOutlineStore } from '@/stores/messageOutline';

interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

interface Props {
  message: Message;
}

const props = defineProps<Props>();
const outlineStore = useMessageOutlineStore();

const outlineContainer = ref<HTMLElement>();
const headings = ref<HeadingItem[]>([]);
const activeHeadingId = ref<string>();

// 解析标题
const parseHeadings = (content: string): HeadingItem[] => {
  const tree = unified().use(remarkParse).parse(content);
  const result: HeadingItem[] = [];
  const slugger = createSlugger();

  visit(tree, ['heading', 'html'], (node) => {
    if (node.type === 'heading') {
      const level = node.depth ?? 0;
      if (!level || level < 1 || level > 6) return;

      const text = extractTextFromNode(node);
      if (!text) return;

      const id = `heading-${slugger.slug(text)}`;
      result.push({ id, level, text });
    } else if (node.type === 'html') {
      const match = node.value.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
      if (match) {
        const level = parseInt(match[1], 10);
        const text = match[2].replace(/<[^>]*>/g, '').trim();
        if (text) {
          const id = `heading-${slugger.slug(text)}`;
          result.push({ id, level, text });
        }
      }
    }
  });

  return result;
};

// 提取消息中的标题
const extractMessageHeadings = () => {
  const mainTextBlocks = props.message.blocks.filter((b) => b.type === 'MAIN_TEXT');

  const allHeadings: HeadingItem[] = [];
  mainTextBlocks.forEach((block) => {
    const blockHeadings = parseHeadings(block.content);
    allHeadings.push(...blockHeadings);
  });

  headings.value = allHeadings;
};

// 滚动到标题
const scrollToHeading = (id: string) => {
  const container = outlineContainer.value?.closest('.message-content-container');
  if (!container) return;

  const element = container.querySelector<HTMLElement>(`#${id}`);
  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
};

// 最小层级（用于缩进计算）
const minLevel = computed(() => {
  if (headings.value.length === 0) return 1;
  return Math.min(...headings.value.map((h) => h.level));
});

// IntersectionObserver 监听滚动高亮
let observer: IntersectionObserver | null = null;

const setupIntersectionObserver = () => {
  const container = outlineContainer.value?.closest('.message-content-container');
  if (!container) return;

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          activeHeadingId.value = entry.target.id;
          outlineStore.setActiveHeading(entry.target.id);
        }
      });
    },
    {
      root: container as Element,
      rootMargin: '-10% 0px -80% 0px',
      threshold: 0,
    },
  );

  headings.value.forEach((heading) => {
    const element = document.getElementById(heading.id);
    if (element) {
      observer?.observe(element);
    }
  });
};

// 监听消息变化
watch(() => props.message.id, extractMessageHeadings, { immediate: true });

onMounted(() => {
  extractMessageHeadings();
  setupIntersectionObserver();
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div
    v-if="headings.length > 0 && message.multiModelMessageStyle !== 'grid'"
    ref="outlineContainer"
    class="message-outline-container"
  >
    <div class="message-outline-body">
      <div
        v-for="heading in headings"
        :key="heading.id"
        class="message-outline-item"
        :class="{ active: heading.id === activeHeadingId }"
        @click="scrollToHeading(heading.id)"
      >
        <div class="message-outline-item-dot" :data-level="heading.level" />
        <div
          class="message-outline-item-text"
          :data-level="heading.level"
          :data-min-level="minLevel"
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

.message-outline-body {
  max-width: 50%;
  max-height: min(100%, 70vh);
  position: sticky;
  top: max(calc(50% - (var(--heading-count) * 24) / 2 + 10px), 20px);
  overflow: hidden;
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
  box-shadow: 0 0 10px rgba(128, 128, 128, 0.2);
}

.message-outline-item {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.message-outline-item-dot {
  width: calc(16px - var(--level) * 2px);
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  margin-right: 4px;
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.message-outline-item:hover .message-outline-item-dot {
  background: var(--color-text-3);
}

.message-outline-item.active .message-outline-item-dot {
  background: var(--color-primary);
}

.message-outline-item-text {
  overflow: hidden;
  color: var(--color-text-3);
  opacity: 0;
  display: none;
  transition: opacity 0.2s ease;
  padding: 2px 8px;
  padding-left: calc((var(--level) - var(--min-level)) * 8px);
  font-size: calc(16px - var(--level));
  white-space: nowrap;
  text-overflow: ellipsis;
}

.message-outline-body:hover .message-outline-item-text {
  opacity: 1;
  display: block;
}

.message-outline-item:hover .message-outline-item-text {
  color: var(--color-text-2);
}

.message-outline-item.active .message-outline-item-text {
  color: var(--color-primary);
  font-weight: 500;
}
</style>
```

---

### 5.2 Vue 3 MessageAnchorLine 组件

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMessageStore } from '@/stores/message';

interface Props {
  messages: Message[];
}

const props = defineProps<Props>();
const messageStore = useMessageStore();

const containerRef = ref<HTMLElement>();
const messagesListRef = ref<HTMLElement>();
const messageItemsRef = new Map<string, HTMLElement>();

const mouseY = ref<number | null>(null);
const listOffsetY = ref(0);
const containerHeight = ref<number | null>(null);

// 根据距离计算动态值
const calculateValueByDistance = (itemId: string, maxValue: number): number => {
  if (mouseY.value === null) return 0;

  const element = messageItemsRef.get(itemId);
  if (!element) return 0;

  const rect = element.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  const listRect = messagesListRef.value?.getBoundingClientRect();
  if (!listRect) return 0;

  const distance = Math.abs(centerY - listRect.top - mouseY.value);
  const maxDistance = 100;

  return Math.max(0, maxValue * (1 - distance / maxDistance));
};

// 滚动到消息
const scrollToMessage = (message: Message) => {
  const element = document.getElementById(`message-${message.id}`);
  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
};

// 滚动到底部
const scrollToBottom = () => {
  const container = document.getElementById('messages');
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth',
  });
};

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (!messagesListRef.value) return;

  const containerRect = containerRef.value?.getBoundingClientRect();
  const listRect = messagesListRef.value.getBoundingClientRect();

  if (!containerRect) return;

  mouseY.value = e.clientY - listRect.top;

  // 列表高度超过容器时产生滚动效果
  if (listRect.height > containerRect.height) {
    const mousePositionRatio = (e.clientY - containerRect.top) / containerRect.height;
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

// 设置元素引用
const setItemRef = (id: string, el: HTMLElement | null) => {
  if (el) {
    messageItemsRef.set(id, el);
  } else {
    messageItemsRef.delete(id);
  }
};

// 更新容器高度
const updateHeight = () => {
  if (containerRef.value) {
    const parent = containerRef.value.parentElement;
    if (parent) {
      containerHeight.value = parent.clientHeight;
    }
  }
};

onMounted(() => {
  updateHeight();
  window.addEventListener('resize', updateHeight);
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateHeight);
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<template>
  <div
    v-if="messages.length > 0"
    ref="containerRef"
    class="message-anchor-line-container"
    :style="{ height: containerHeight ? `${containerHeight - 20}px` : 'auto' }"
    @mouseleave="handleMouseLeave"
  >
    <div
      ref="messagesListRef"
      class="messages-list"
      :style="{ transform: `translateY(${listOffsetY}px)` }"
    >
      <!-- 底部锚点 -->
      <div
        class="message-item bottom-anchor"
        :style="{
          opacity: mouseY ? 0.5 : Math.max(0, 0.6 - (0.3 * Math.abs(0 - messages.length / 2)) / 5),
        }"
        @click="scrollToBottom"
      >
        <svg
          :width="10 + calculateValueByDistance('bottom-anchor', 20)"
          :height="10 + calculateValueByDistance('bottom-anchor', 20)"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <!-- 消息列表 -->
      <div
        v-for="(message, index) in messages"
        :key="message.id"
        :ref="(el) => setItemRef(message.id, el as HTMLElement)"
        class="message-item"
        :style="{
          opacity: mouseY
            ? 0.5 + calculateValueByDistance(message.id, 1)
            : Math.max(0, 0.6 - (0.3 * Math.abs(index - messages.length / 2)) / 5),
        }"
        @click="scrollToMessage(message)"
      >
        <div
          class="message-item-container"
          :style="{ transform: `scale(${1 + calculateValueByDistance(message.id, 1.2)})` }"
        >
          <div class="message-item-title">
            {{ getUserName(message) }}
          </div>
          <div class="message-item-content">
            {{ getMainTextContent(message).substring(0, 50) }}
          </div>
        </div>

        <img
          v-if="message.role === 'assistant'"
          class="message-item-avatar"
          :width="10 + calculateValueByDistance(message.id, 20)"
          :height="10 + calculateValueByDistance(message.id, 20)"
          :src="getModelLogo(message.modelId)"
          alt=""
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-anchor-line-container {
  width: 14px;
  position: fixed;
  top: calc(50% - var(--status-bar-height) - 10px);
  right: 13px;
  transform: translateY(-50%);
  z-index: 0;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  transition: width 0.3s ease;
}

.message-anchor-line-container:hover {
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
  padding: 2px 0;
  opacity: 0.4;
  transition: opacity 0.1s linear;
}

.message-item-container {
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  opacity: 0;
  transform-origin: right center;
  transition: transform cubic-bezier(0.25, 1, 0.5, 1) 150ms;
  will-change: transform, opacity;
}

.message-anchor-line-container:hover .message-item-container {
  opacity: 1;
}

.message-item-title {
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
}

.message-item-content {
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
</style>
```

---

### 5.3 Slug 工具函数

```typescript
// utils/slugger.ts

/**
 * 创建 GitHub 风格的 slug 生成器
 */
export function createSlugger() {
  const seen = new Map<string, number>();

  const normalize = (text: string): string => {
    const slug = (text || 'section')
      .toLowerCase()
      .trim()
      // 移除零宽字符
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 移除标点符号
      .replace(/["'`(){}[\]:;!?.,]/g, '')
      // 将空白和非字母数字转换为 '-'
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      // 合并多个 '-'
      .replace(/-{2,}/g, '-')
      // 去除首尾 '-'
      .replace(/^-|-$/g, '');

    return slug;
  };

  const slug = (text: string): string => {
    const base = normalize(text);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return `${base}-${count}`;
  };

  return { slug };
}

/**
 * 从 AST 节点提取文本内容
 */
export function extractTextFromNode(node: any): string {
  if (!node) return '';

  if (typeof node.value === 'string') {
    return node.value;
  }

  if (node.children?.length) {
    return node.children.map(extractTextFromNode).join('');
  }

  return '';
}

/**
 * 解析 Markdown 内容提取标题
 */
export function extractMarkdownHeadings(markdown: string, blockId?: string) {
  const { unified } = require('unified');
  const remarkParse = require('remark-parse');
  const { visit } = require('unist-util-visit');

  const tree = unified().use(remarkParse).parse(markdown);
  const headings: Array<{ id: string; level: number; text: string }> = [];
  const slugger = createSlugger();

  visit(tree, ['heading', 'html'], (node: any) => {
    if (node.type === 'heading') {
      const level = node.depth ?? 0;
      if (!level || level < 1 || level > 6) return;

      const text = extractTextFromNode(node);
      if (!text) return;

      const id = blockId
        ? `heading-${blockId}--${slugger.slug(text)}`
        : `heading-${slugger.slug(text)}`;

      headings.push({ id, level, text });
    } else if (node.type === 'html') {
      const match = node.value.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
      if (match) {
        const level = parseInt(match[1], 10);
        const text = match[2].replace(/<[^>]*>/g, '').trim();
        if (text) {
          const id = blockId
            ? `heading-${blockId}--${slugger.slug(text)}`
            : `heading-${slugger.slug(text)}`;
          headings.push({ id, level, text });
        }
      }
    }
  });

  return headings;
}
```

---

## 六、注意事项

### 6.1 滚动高亮实现要点

1. **rootMargin 设置**

   ```typescript
   rootMargin: '-10% 0px -80% 0px'; // 顶部 10%-90% 区域作为触发区
   ```

2. **多标题同时可见的处理**

   ```typescript
   // 选择最接近顶部的标题
   const getTopMostVisibleHeading = () => {
     const visibleHeadings = headings.filter((h) => isVisible(h.id));
     return visibleHeadings.sort((a, b) => a.element.offsetTop - b.element.offsetTop)[0];
   };
   ```

3. **性能优化**
   - 使用 `IntersectionObserver` 而非 `scroll` 事件
   - 设置合理的 `threshold`
   - 及时断开观察器

### 6.2 虚拟滚动兼容

如果使用虚拟滚动（如 `vue-virtual-scroller`），需要注意：

1. **元素可能不存在**

   ```typescript
   const element = document.getElementById(heading.id);
   if (!element) return; // 虚拟滚动中元素可能未渲染
   ```

2. **观察器需要动态管理**
   ```typescript
   watch(
     () => virtualListData,
     (newData) => {
       // 重新观察可见元素
       resetObserver();
     },
   );
   ```

### 6.3 样式兼容性

1. **CSS 变量**

   ```css
   /* 确保定义了必要的 CSS 变量 */
   :root {
     --color-background: #fff;
     --color-border: #e0e0e0;
     --color-text: #333;
     --color-text-2: #666;
     --color-text-3: #999;
     --color-primary: #1890ff;
   }
   ```

2. **深色模式**
   ```css
   @media (prefers-color-scheme: dark) {
     :root {
       --color-background: #1a1a1a;
       --color-text: #fff;
       /* ... */
     }
   }
   ```

### 6.4 TypeScript 类型定义

```typescript
// types/message.ts
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
  multiModelMessageStyle?: 'horizontal' | 'grid' | 'default';
}

export interface MessageBlock {
  id: string;
  type: MessageBlockType;
  content: string;
}

export enum MessageBlockType {
  MAIN_TEXT = 'MAIN_TEXT',
  CODE = 'CODE',
  IMAGE = 'IMAGE',
  // ...
}

// types/outline.ts
export interface HeadingItem {
  id: string;
  level: number;
  text: string;
}

export interface OutlineConfig {
  showMessageOutline: boolean;
  messageNavigation: 'none' | 'buttons' | 'anchor';
}
```

---

## 总结

本方案提供了完整的消息大纲实现细节，包括：

1. ✅ **标题解析与提取** - 支持 Markdown 和 HTML
2. ✅ **大纲展示** - 层级可视化，Sticky 定位
3. ✅ **滚动定位** - 平滑滚动到目标标题
4. ⚠️ **滚动高亮** - 当前项目缺失，提供了实现方案
5. ✅ **消息锚点线** - 动态距离计算，视觉反馈
6. ✅ **Vue 3 移植代码** - 完整的组件示例

移植时重点注意：

- `IntersectionObserver` 的正确使用
- 虚拟滚动的兼容性
- CSS 变量的定义
- 性能优化（节流、防抖、memo）
