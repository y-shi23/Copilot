# Vue 3 Markdown 渲染系统移植指南

本文档基于对某个 React + Electron AI 桌面应用的深度分析，为 Vue 3 项目提供完整的 Markdown 渲染系统移植方案。

---

## 目录

1. [系统架构概述](#系统架构概述)
2. [核心依赖库](#核心依赖库)
3. [组件层次结构](#组件层次结构)
4. [核心实现详解](#核心实现详解)
5. [Vue 3 移植方案](#vue-3-移植方案)
6. [代码示例](#代码示例)
7. [注意事项](#注意事项)

---

## 系统架构概述

当前项目的 Markdown 渲染系统采用了多层架构设计：

```
MessageContent (消息容器)
    └── MessageBlockRenderer (块级渲染器)
        └── MainTextBlock (主文本块)
            └── Markdown (Markdown 主渲染器)
                ├── ReactMarkdown (解析器)
                ├── CodeBlock (代码块)
                │   └── CodeBlockView (代码块视图)
                │       ├── CodeViewer (只读视图)
                │       ├── CodeEditor (可编辑视图)
                │       ├── SpecialView (Mermaid/PlantUML等)
                │       └── CodeToolbar (工具栏)
                └── 其他自定义组件
```

### 核心特性

1. **流式渲染支持** - 支持增量内容更新，平滑显示 AI 回复
2. **高性能代码高亮** - 使用 Shiki + Worker + 虚拟滚动
3. **丰富的图表支持** - Mermaid, PlantUML, Graphviz, SVG
4. **数学公式渲染** - KaTeX 和 MathJax 双引擎支持
5. **主题系统** - 浅色/深色主题自动切换
6. **代码执行** - Python 代码在线执行 (Pyodide)

---

## 核心依赖库

### Markdown 解析与渲染

| 依赖                             | 版本    | 用途                 | Vue 3 替代                                                                   |
| -------------------------------- | ------- | -------------------- | ---------------------------------------------------------------------------- |
| `react-markdown`                 | ^9.0.1  | Markdown 解析器      | `@vueuse/integrations/useMarkdown` 或 `markdown-it` + `markdown-it-renderer` |
| `remark-gfm`                     | ^4.0.0  | GitHub 风格 Markdown | `markdown-it-gfm`                                                            |
| `remark-math`                    | ^6.0.0  | 数学公式语法         | `markdown-it-katex` 或 `@traptitech/markdown-it-katex`                       |
| `remark-cjk-friendly`            | ^2.0.0  | 中日韩友好处理       | 需自定义处理                                                                 |
| `remark-github-blockquote-alert` | ^1.2.2  | GitHub 引用块警告    | 需自定义处理                                                                 |
| `rehype-katex`                   | ^7.0.0  | KaTeX 渲染           | `markdown-it-katex`                                                          |
| `rehype-mathjax`                 | ^5.0.0  | MathJax 渲染         | 自定义 rehype 插件                                                           |
| `rehype-raw`                     | ^7.0.0  | HTML 支持            | `markdown-it` 原生支持                                                       |
| `unified`                        | ^11.0.5 | 统一处理架构         | 可继续使用                                                                   |

### 代码高亮

| 依赖                      | 版本    | 用途         | Vue 3 替代                                          |
| ------------------------- | ------- | ------------ | --------------------------------------------------- |
| `shiki`                   | ^1.22.2 | 代码语法高亮 | `shiki` (兼容 Vue 3)                                |
| `@uiw/react-codemirror`   | ^4.23.6 | 代码编辑器   | `vue-codemirror` 或 `@codemirror/view` + Vue 3 包装 |
| `@tanstack/react-virtual` | ^3.10.8 | 虚拟滚动     | `@tanstack/vue-virtual`                             |

### 图表与可视化

| 依赖      | 版本     | 用途            | Vue 3 替代       |
| --------- | -------- | --------------- | ---------------- |
| `mermaid` | ^11.6.0  | 图表渲染        | `mermaid` (兼容) |
| `katex`   | ^0.16.11 | 数学公式渲染    | `katex` (兼容)   |
| `pyodide` | ^0.25.0  | Python 代码执行 | `pyodide` (兼容) |

### 工具库

| 依赖                | 版本     | 用途          | Vue 3 替代                                    |
| ------------------- | -------- | ------------- | --------------------------------------------- |
| `lodash`            | ^4.17.21 | 工具函数      | `lodash-es` 或原生替代                        |
| `styled-components` | ^6.1.13  | CSS-in-JS     | `vue-styled-components` 或 `@vueuse/css`      |
| `motion/react`      | ^11.15.0 | 动画          | `@vueuse/motion` 或 Vue 3 `<TransitionGroup>` |
| `lru-cache`         | ^11.0.2  | LRU 缓存      | `lru-cache` (兼容)                            |
| `remove-markdown`   | ^0.5.0   | 移除 Markdown | 直接兼容                                      |

---

## 组件层次结构

### 1. Markdown 主渲染器

**文件**: `/workspace/src/renderer/src/pages/home/Markdown/Markdown.tsx`

**职责**:

- Markdown 文本预处理 (LaTeX 括号转换)
- 配置 remark/rehype 插件
- 自定义组件映射
- 流式内容更新处理

**关键代码结构**:

```typescript
// 插件配置
const remarkPlugins = [
  remarkGfm,
  remarkAlert,
  remarkCjkFriendly,
  remarkDisableConstructs(['codeIndented']),
  remarkMath, // 数学公式
];

const rehypePlugins = [
  rehypeRaw,
  rehypeScalableSvg,
  rehypeHeadingIds,
  rehypeKatex, // 或 rehypeMathjax
];

// 组件映射
const components = {
  code: CodeBlock,
  table: Table,
  img: ImageViewer,
  a: Link,
  svg: MarkdownSvgRenderer,
};
```

### 2. 代码块组件

**文件**: `/workspace/src/renderer/src/pages/home/Markdown/CodeBlock.tsx`

**职责**:

- 检测代码语言
- 判断是否为 HTML 特殊代码块
- 路由到 CodeBlockView

### 3. 代码块视图

**文件**: `/workspace/src/renderer/src/components/CodeBlockView/view.tsx`

**职责**:

- 三种视图模式：source / special / split
- 工具栏管理 (复制、下载、运行、编辑等)
- Python 代码执行
- 展开/折叠控制

**视图模式说明**:

- `source`: 源代码视图
- `special`: 特殊预览视图 (Mermaid, PlantUML 等)
- `split`: 分屏同时显示源码和预览

### 4. 代码查看器

**文件**: `/workspace/src/renderer/src/components/CodeViewer.tsx`

**职责**:

- 虚拟滚动渲染 (TanStack Virtual)
- 流式代码高亮 (Shiki)
- 选择和复制处理
- 行号显示

**性能优化**:

- 虚拟滚动减少 DOM 节点
- LRU 缓存 tokenizer
- Worker 隔离高亮任务
- 防抖渐进式高亮

### 5. Shiki 流式服务

**文件**: `/workspace/src/renderer/src/services/ShikiStreamService.ts`

**职责**:

- 管理 Shiki highlighter
- 流式代码增量高亮
- Worker 任务调度
- 降级策略管理

---

## 核心实现详解

### 1. LaTeX 括号转换

**文件**: `/workspace/src/renderer/src/utils/markdown.ts:49-109`

将 LaTeX 原生语法 `\[\]` 和 `\(\)` 转换为 Markdown 兼容的 `$$...$$` 和 `$...$`。

**关键逻辑**:

1. 保护代码块和链接不被处理
2. 平衡括号匹配处理嵌套
3. 转义括号不被处理

### 2. 流式代码高亮

**流程**:

```
CodeViewer
    └── useCodeHighlight Hook
        └── ShikiStreamService
            ├── Worker 处理 (优先)
            └── 主线程处理 (降级)
                └── ShikiStreamTokenizer
                    └── 增量高亮
```

**关键特性**:

- 增量传输 (只传输新增内容)
- 状态保持 (stable/unstable tokens)
- 撤回机制 (recall 字段)
- 自动降级 (Worker 失败时回退)

### 3. 虚拟滚动实现

**文件**: `/workspace/src/renderer/src/components/CodeViewer.tsx:338-351`

使用 TanStack Virtual 实现按需渲染：

```typescript
const virtualizer = useVirtualizer({
  count: rawLines.length,
  getScrollElement,
  getItemKey,
  estimateSize,
  overscan: 20,
});
```

### 4. 特殊视图渲染

**Mermaid 预览** (`/workspace/src/renderer/src/components/Preview/MermaidPreview.tsx`):

- 使用 Shadow DOM 隔离样式
- 防抖渲染优化性能
- 可见性检测触发重渲染

**HTML 预览**:

- 检测 HTML 文档结构
- 提取标题作为文件名
- 支持 iframe 隔离渲染

---

## Vue 3 移植方案

### 推荐技术栈

#### 方案 A: Markdown-It 生态 (推荐)

```json
{
  "dependencies": {
    "markdown-it": "^14.1.0",
    "markdown-it-gfm": "^4.0.0",
    "@traptitech/markdown-it-katex": "^5.0.0",
    "markdown-it-container": "^4.0.0",
    "shiki": "^1.22.2",
    "katex": "^0.16.11",
    "mermaid": "^11.6.0",
    "pyodide": "^0.25.0",
    "codemirror": "^6.0.0",
    "vue-codemirror": "^6.1.1"
  }
}
```

**优点**:

- 生态成熟，插件丰富
- 性能优秀
- Vue 3 兼容性好

#### 方案 B: Unified 生态 (与原项目一致)

```json
{
  "dependencies": {
    "unified": "^11.0.5",
    "remark-parse": "^11.0.0",
    "remark-stringify": "^11.0.0",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.0",
    "rehype-raw": "^7.0.0",
    "shiki": "^1.22.2"
  }
}
```

**优点**:

- 保持与原项目架构一致
- 插件系统灵活

### 组件移植映射表

| React 组件       | Vue 3 组件              | 说明                                 |
| ---------------- | ----------------------- | ------------------------------------ |
| `Markdown.tsx`   | `MarkdownRenderer.vue`  | 主渲染器，使用 `v-html` 或自定义渲染 |
| `CodeBlock.tsx`  | `CodeBlockRenderer.vue` | 代码块容器                           |
| `CodeBlockView`  | `CodeBlockView.vue`     | 代码块视图                           |
| `CodeViewer`     | `CodeViewer.vue`        | 虚拟滚动代码查看器                   |
| `CodeEditor`     | `CodeEditor.vue`        | 基于 CodeMirror 6                    |
| `MermaidPreview` | `MermaidPreview.vue`    | Mermaid 图表预览                     |
| `CodeToolbar`    | `CodeToolbar.vue`       | 工具栏组件                           |

### 核心 Hook/Composable 映射

| React Hook         | Vue 3 Composable      | 说明           |
| ------------------ | --------------------- | -------------- |
| `useSmoothStream`  | `useSmoothStream.ts`  | 流式平滑渲染   |
| `useCodeHighlight` | `useCodeHighlight.ts` | 代码高亮       |
| `useMermaid`       | `useMermaid.ts`       | Mermaid 初始化 |
| `useSettings`      | `useSettings.ts`      | 设置管理       |

---

## 代码示例

### 1. MarkdownRenderer.vue (主渲染器)

```vue
<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import MarkdownIt from 'markdown-it';
import markdownItGfm from 'markdown-it-gfm';
import katex from '@traptitech/markdown-it-katex';
import 'katex/dist/katex.min.css';

import CodeBlockRenderer from './CodeBlockRenderer.vue';
import { processLatexBrackets } from '@/utils/markdown';

interface Props {
  content: string;
  streaming?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
});

// 初始化 Markdown-It
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})
  .use(markdownItGfm)
  .use(katex);

// 自定义代码块渲染
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const lang = info.split(/\s+/g)[0];

  // 返回自定义组件标记
  return `<code-block lang="${lang}" code="${encodeURIComponent(token.content)}"></code-block>`;
};

const displayedContent = ref(props.content);
const htmlContent = computed(() => {
  const processed = processLatexBrackets(displayedContent.value);
  return md.render(processed);
});

// 处理流式更新
watch(
  () => props.content,
  (newContent, oldContent) => {
    if (!oldContent || !newContent.startsWith(oldContent)) {
      displayedContent.value = newContent;
    } else {
      const delta = newContent.substring(oldContent.length);
      displayedContent.value += delta;
    }
  },
);

// 解析后处理自定义组件
onMounted(() => {
  // 处理 code-block 自定义标签
  const codeBlocks = document.querySelectorAll('code-block');
  codeBlocks.forEach((block) => {
    const lang = block.getAttribute('lang');
    const code = decodeURIComponent(block.getAttribute('code') || '');
    // 创建 Vue 组件实例
  });
});
</script>

<template>
  <div class="markdown" v-html="htmlContent"></div>
</template>

<style src="@/assets/styles/markdown.css"></style>
```

### 2. CodeBlockView.vue (代码块视图)

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSettings } from '@/composables/useSettings';
import CodeViewer from './CodeViewer.vue';
import CodeEditor from './CodeEditor.vue';
import MermaidPreview from './MermaidPreview.vue';
import type { ViewMode } from './types';

interface Props {
  code: string;
  language: string;
  streaming?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  save: [code: string];
}>();

const { codeEditor, codeExecution } = useSettings();

const viewMode = ref<ViewMode>('special');
const isExpanded = ref(true);
const isWrapped = ref(true);

// 是否有特殊视图
const hasSpecialView = computed(() => {
  return ['mermaid', 'plantuml', 'dot', 'svg'].includes(props.language.toLowerCase());
});

// 是否在特殊视图模式
const isInSpecialView = computed(() => {
  return hasSpecialView.value && viewMode.value === 'special';
});

const toggleViewMode = () => {
  if (viewMode.value === 'source') {
    viewMode.value = 'special';
  } else {
    viewMode.value = 'source';
  }
};

const toggleSplit = () => {
  viewMode.value = viewMode.value === 'split' ? 'source' : 'split';
};

const handleSave = (newCode: string) => {
  emit('save', newCode);
};
</script>

<template>
  <div class="code-block" :class="{ 'in-special-view': isInSpecialView }">
    <!-- 代码头 -->
    <div class="code-header">
      <span v-if="!isInSpecialView">{{ language.toUpperCase() }}</span>
    </div>

    <!-- 工具栏 -->
    <CodeToolbar
      :view-mode="viewMode"
      :has-special-view="hasSpecialView"
      :is-expanded="isExpanded"
      :is-wrapped="isWrapped"
      @toggle-view="toggleViewMode"
      @toggle-split="toggleSplit"
      @toggle-expand="isExpanded = !isExpanded"
      @toggle-wrap="isWrapped = !isWrapped"
      :code="code"
      :language="language"
    />

    <!-- 内容区域 -->
    <div class="split-view-wrapper" :class="{ 'special-only': isInSpecialView }">
      <!-- 源代码视图 -->
      <CodeViewer
        v-if="viewMode !== 'special'"
        :code="code"
        :language="language"
        :expanded="isExpanded"
        :wrapped="isWrapped"
      />

      <!-- 可编辑视图 -->
      <CodeEditor
        v-if="codeEditor.enabled && viewMode === 'source'"
        :code="code"
        :language="language"
        @save="handleSave"
      />

      <!-- 特殊视图 -->
      <MermaidPreview
        v-if="hasSpecialView && ['special', 'split'].includes(viewMode)"
        :code="code"
      />
    </div>
  </div>
</template>

<style scoped>
.code-block {
  position: relative;
  width: 100%;
  min-width: 35ch;
}

.code-header {
  display: flex;
  align-items: center;
  padding: 0 10px;
  height: 34px;
  background-color: var(--color-background-mute);
  color: var(--color-text);
  font-size: 14px;
  font-weight: bold;
  border-radius: 8px 8px 0 0;
}

.split-view-wrapper {
  display: flex;
  gap: 1px;
}

.split-view-wrapper > * {
  flex: 1;
}

.special-only {
  border-radius: 0 0 8px 8px;
}
</style>
```

### 3. CodeViewer.vue (虚拟滚动代码查看器)

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { useCodeHighlight } from '@/composables/useCodeHighlight';
import { useCodeStyle } from '@/composables/useCodeStyle';

interface Props {
  code: string;
  language: string;
  expanded?: boolean;
  wrapped?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  expanded: true,
  wrapped: true,
});

const scrollerRef = ref<HTMLDivElement | null>(null);
const shikiThemeRef = ref<HTMLDivElement | null>(null);

const rawLines = computed(() => props.code.trimEnd().split('\n'));
const { getShikiPreProperties, isShikiThemeDark } = useCodeStyle();

// 虚拟滚动
const virtualizer = useVirtualizer({
  count: rawLines.value.length,
  getScrollElement: () => scrollerRef.value,
  estimateSize: () => 20,
  overscan: 20,
});

// 代码高亮
const { tokenLines, highlightLines } = useCodeHighlight({
  rawLines,
  language: props.language,
  callerId: `code-viewer-${Math.random()}`,
});

// 渐进式高亮
watch(
  () => virtualizer.value?.getVirtualItems(),
  (items) => {
    if (items && items.length > 0) {
      const lastIndex = items[items.length - 1].index;
      highlightLines(lastIndex + 1);
    }
  },
);
</script>

<template>
  <div ref="shikiThemeRef" class="code-viewer">
    <div ref="scrollerRef" class="scroller" :class="{ wrapped, expanded }">
      <div class="virtual-list" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <div
          class="virtual-item"
          v-for="item in virtualizer.getVirtualItems()"
          :key="item.key"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${item.start}px)`,
          }"
        >
          <VirtualRow
            :raw-line="rawLines[item.index]"
            :token-line="tokenLines[item.index]"
            :index="item.index"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-viewer {
  font-family: var(--code-font-family);
}

.scroller {
  overflow-x: auto;
  max-height: 500px;
}

.scroller.expanded {
  max-height: none;
  overflow-y: hidden;
}

.scroller.wrapped .line {
  white-space: pre-wrap;
  word-break: break-word;
}

.line {
  display: flex;
  padding: 0.5em 1em;
  line-height: 1.6;
}

.line-number {
  margin-right: 1rem;
  opacity: 0.35;
  user-select: none;
}

.line-content {
  flex: 1;
}
</style>
```

### 4. useCodeHighlight.ts (代码高亮 Composable)

```typescript
import { ref, watch } from 'vue';
import { shikiStreamService } from '@/services/shikiStreamService';
import type { ThemedToken } from 'shiki/core';

interface UseCodeHighlightOptions {
  rawLines: string[];
  language: string;
  callerId: string;
}

export function useCodeHighlight(options: UseCodeHighlightOptions) {
  const { rawLines, language, callerId } = options;

  const tokenLines = ref<ThemedToken[][]>([]);
  const theme = ref('github-dark');

  const highlightLines = async (lastIndex: number) => {
    const code = rawLines.slice(0, lastIndex).join('\n');

    try {
      const result = await shikiStreamService.highlightStreamingCode(
        code,
        language,
        theme.value,
        callerId,
      );

      if (result.recall === -1) {
        tokenLines.value = result.lines;
      } else {
        tokenLines.value = [...tokenLines.value.slice(0, result.recall), ...result.lines];
      }
    } catch (error) {
      console.error('Highlight failed:', error);
    }
  };

  // 清理
  watch(
    () => [language, callerId],
    () => {
      shikiStreamService.cleanupTokenizers(callerId);
      tokenLines.value = [];
    },
  );

  return {
    tokenLines,
    highlightLines,
  };
}
```

### 5. ShikiStreamService.ts (可直接复用)

由于 `shikiStreamService.ts` 是纯 TypeScript 类服务，可以直接在 Vue 3 项目中复用，无需修改。

### 6. 样式文件移植

将 `markdown.css` 直接复制到 Vue 项目中，确保 CSS 变量 (`--color-*`, `--code-font-family` 等) 在项目中已定义。

---

## 注意事项

### 1. React vs Vue 差异

| 方面       | React                   | Vue 3                    |
| ---------- | ----------------------- | ------------------------ |
| 组件渲染   | JSX                     | Template / JSX           |
| 状态管理   | useState/Redux          | ref/reactive/Pinia       |
| 样式方案   | styled-components       | CSS Modules / Scoped CSS |
| 虚拟滚动   | @tanstack/react-virtual | @tanstack/vue-virtual    |
| 代码编辑器 | @uiw/react-codemirror   | vue-codemirror           |

### 2. 性能优化要点

1. **虚拟滚动**: 使用 `@tanstack/vue-virtual` 处理大代码块
2. **Worker 隔离**: 代码高亮任务放在 Worker 中执行
3. **防抖处理**: 流式高亮使用防抖减少渲染次数
4. **LRU 缓存**: 缓存 tokenizer 和高亮结果
5. **按需加载**: Mermaid 等库动态导入

### 3. 样式隔离

- 使用 Shadow DOM 渲染特殊视图 (Mermaid, SVG)
- CSS Modules 或 Scoped CSS 避免样式污染
- CSS 变量管理主题

### 4. 流式处理

React 版本使用 `useSmoothStream` hook 实现平滑流式渲染，Vue 3 版本可以通过以下方式实现：

```typescript
// useSmoothStream.ts
import { ref, watch } from 'vue';
import type { Segmenter } from 'Intl';

export function useSmoothStream(options: {
  onUpdate: (text: string) => void;
  streamDone: boolean;
  initialText: string;
}) {
  const { onUpdate, streamDone, initialText } = options;
  const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
  let chunks: string[] = [];
  let index = 0;
  let rafId: number | null = null;

  const addChunk = (chunk: string) => {
    chunks.push(chunk);
    if (!rafId) {
      rafId = requestAnimationFrame(processChunks);
    }
  };

  const processChunks = () => {
    if (index < chunks.length) {
      const text = chunks.slice(0, index + 1).join('');
      onUpdate(text);
      index++;
      rafId = requestAnimationFrame(processChunks);
    } else {
      rafId = null;
    }
  };

  const reset = (text: string) => {
    chunks = [text];
    index = 0;
    onUpdate(text);
  };

  return {
    addChunk,
    reset,
  };
}
```

### 5. TypeScript 类型定义

确保安装相关类型定义：

```bash
npm install -D @types/markdown-it @types/katex
```

### 6. 构建配置

确保 Vite 配置支持 Worker：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['shiki'],
  },
});
```

---

## 移植检查清单

- [ ] 安装核心依赖 (markdown-it, shiki, katex, mermaid)
- [ ] 创建基础组件结构
- [ ] 实现 MarkdownRenderer 主渲染器
- [ ] 实现 CodeBlockView 代码块视图
- [ ] 实现 CodeViewer 虚拟滚动查看器
- [ ] 移植 ShikiStreamService
- [ ] 实现 useCodeHighlight composable
- [ ] 移植 markdown.css 样式
- [ ] 配置 CSS 变量
- [ ] 实现流式渲染逻辑
- [ ] 添加特殊视图支持 (Mermaid, PlantUML)
- [ ] 实现代码编辑器 (可选)
- [ ] 添加工具栏功能
- [ ] 性能测试和优化
- [ ] 主题系统集成

---

## 参考资源

- [Markdown-It 文档](https://github.com/markdown-it/markdown-it)
- [Shiki 文档](https://shiki.style/)
- [TanStack Virtual Vue](https://tanstack.com/virtual/latest/docs/vue/virtual)
- [Vue CodeMirror](https://codemirror.net/docs/ref/#vue)
- [KaTeX 文档](https://katex.org/)
- [Mermaid 文档](https://mermaid.js.org/)

---

_本文档基于对原项目的深度分析生成，提供了完整的 Vue 3 移植方案。如有问题请参考源代码实现。_
