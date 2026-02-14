# AI 性能指标计数实现指南

> 本文档提供在 Vue + TypeScript 项目中实现 AI 性能指标计数的完整技术方案

## 📋 目录

- [功能概述](#功能概述)
- [技术架构](#技术架构)
- [数据结构定义](#数据结构定义)
- [核心实现](#核心实现)
- [Vue 集成](#vue-集成)
- [完整代码示例](#完整代码示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 功能概述

需要实现三个核心性能指标：

1. **首字时延 (Time to First Token, TTFT)**：从发送请求到收到第一个 token 的时间
2. **每秒 Tokens (Tokens Per Second, TPS)**：token 生成速度
3. **上下行 Tokens**：输入(prompt) 和 输出(completion) 的 token 数量

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Vue Component Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ MessageList │  │ MetricsDisplay │  │ TokenCounter      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────┬───────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────┐
│                    Metrics Service Layer                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MetricsTracker - 核心计数逻辑                        │   │
│  │  - 首字时延追踪                                       │   │
│  │  - Token 累积计数                                    │   │
│  │  - 性能指标计算                                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────┘
                                      │
┌─────────────────────────────────────▼───────────────────────┐
│                    AI Stream Layer                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  StreamProcessor - 流式响应处理                       │   │
│  │  - SSE/WebSocket 消息解析                            │   │
│  │  - Chunk 分片处理                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据结构定义

### 1. Metrics 类型定义

```typescript
// src/types/ai-metrics.ts

/**
 * AI 消息性能指标
 */
export interface AIMetrics {
  /** 输出 token 数量 */
  completion_tokens: number;

  /** 输入 token 数量 */
  prompt_tokens: number;

  /** 总 token 数量 */
  total_tokens: number;

  /** 首字时延（毫秒） */
  time_first_token_millsec?: number;

  /** 总完成时间（毫秒） */
  time_completion_millsec: number;

  /** 思考时间（用于推理模型，毫秒） */
  time_thinking_millsec?: number;

  /** Token 生成速度（tokens/秒） */
  token_speed?: number;
}

/**
 * 计数器状态
 */
export interface MetricsTrackerState {
  /** 请求开始时间戳 */
  request_start_timestamp: number;

  /** 首个 token 时间戳 */
  first_token_timestamp?: number;

  /** 完成时间戳 */
  completion_timestamp?: number;

  /** 是否已收到首个 token */
  has_first_token: boolean;

  /** 当前累积的 token 数 */
  accumulated_tokens: number;

  /** 输入 token 数量（预估或从 API 获取） */
  prompt_tokens: number;
}

/**
 * 流式响应 Chunk 数据结构
 */
export interface StreamChunk {
  /** token 内容 */
  content?: string;

  /** Usage 信息（部分 API 提供） */
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };

  /** 是否为思考内容（推理模型） */
  is_thinking?: boolean;
}
```

---

## 核心实现

### 2. MetricsTracker 核心类

````typescript
// src/services/ai/MetricsTracker.ts

import type { AIMetrics, MetricsTrackerState, StreamChunk } from '@/types/ai-metrics';

/**
 * AI 性能指标追踪器
 *
 * @example
 * ```ts
 * const tracker = new MetricsTracker();
 * tracker.start();
 * // ... streaming ...
 * tracker.accumulateChunk(chunk);
 * const metrics = tracker.finalize();
 * ```
 */
export class MetricsTracker {
  private state: MetricsTrackerState;

  constructor() {
    this.state = {
      request_start_timestamp: 0,
      first_token_timestamp: undefined,
      completion_timestamp: undefined,
      has_first_token: false,
      accumulated_tokens: 0,
      prompt_tokens: 0,
    };
  }

  /**
   * 开始追踪（发送请求前调用）
   */
  start(prompt_tokens?: number): void {
    this.state = {
      request_start_timestamp: this.getTimestamp(),
      first_token_timestamp: undefined,
      completion_timestamp: undefined,
      has_first_token: false,
      accumulated_tokens: 0,
      prompt_tokens: prompt_tokens || 0,
    };
  }

  /**
   * 处理流式响应 chunk
   *
   * @param chunk - 流式响应数据块
   */
  accumulateChunk(chunk: StreamChunk): void {
    // 标记首个 token 时间
    if (!this.state.has_first_token && this.shouldCountAsToken(chunk)) {
      this.state.first_token_timestamp = this.getTimestamp();
      this.state.has_first_token = true;
    }

    // 累积 token 数量
    if (chunk.usage?.completion_tokens !== undefined) {
      // API 提供了准确的 token 计数
      this.state.accumulated_tokens = chunk.usage.completion_tokens;
    } else if (chunk.content) {
      // 需要自己估算：简单按字符数估算（1 token ≈ 4 字符）
      // 更精确的方式见 TokenEstimator
      this.state.accumulated_tokens += this.estimateTokens(chunk.content);
    }
  }

  /**
   * 完成追踪并计算最终指标
   *
   * @returns 完整的性能指标
   */
  finalize(): AIMetrics {
    const completion_timestamp = this.getTimestamp();
    this.state.completion_timestamp = completion_timestamp;

    const time_completion_millsec = completion_timestamp - this.state.request_start_timestamp;

    const time_first_token_millsec = this.state.first_token_timestamp
      ? this.state.first_token_timestamp - this.state.request_start_timestamp
      : undefined;

    const token_speed =
      time_completion_millsec > 0
        ? this.state.accumulated_tokens / (time_completion_millsec / 1000)
        : 0;

    const total_tokens = this.state.prompt_tokens + this.state.accumulated_tokens;

    return {
      completion_tokens: this.state.accumulated_tokens,
      prompt_tokens: this.state.prompt_tokens,
      total_tokens,
      time_first_token_millsec,
      time_completion_millsec,
      token_speed,
    };
  }

  /**
   * 判断 chunk 是否应计为 token
   */
  private shouldCountAsToken(chunk: StreamChunk): boolean {
    return Boolean(chunk.content && chunk.content.trim().length > 0 && !chunk.is_thinking);
  }

  /**
   * 简单 token 估算（1 token ≈ 4 字符，针对英文）
   *
   * @note 更精确的估算需要专门的 tokenizer
   */
  private estimateTokens(text: string): number {
    // 简单估算：英文约 4 字符/token，中文约 2 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 获取高精度时间戳
   */
  private getTimestamp(): number {
    // 浏览器环境
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    // Node.js 环境或其他
    return Date.now();
  }

  /**
   * 获取当前状态（用于调试）
   */
  getState(): Readonly<MetricsTrackerState> {
    return { ...this.state };
  }
}
````

---

### 3. Token 估算器（可选，用于更精确的输入 token 预估）

```typescript
// src/services/ai/TokenEstimator.ts

/**
 * Token 估算器
 *
 * 用于在 API 不提供 usage 信息时，预估输入 token 数量
 */
export class TokenEstimator {
  /**
   * 估算文本的 token 数量
   *
   * @param text - 要估算的文本
   * @returns 预估的 token 数量
   */
  static estimateTextTokens(text: string): number {
    if (!text) return 0;

    // 简单策略
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 2 + otherChars / 4);
  }

  /**
   * 估算消息列表的 token 数量
   *
   * @param messages - OpenAI 格式的消息列表
   * @returns 预估的总 token 数量
   */
  static estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    let total = 0;

    // 每条消息的元数据开销（role 等字段）
    const metadataTokensPerMessage = 4;

    for (const message of messages) {
      total += metadataTokensPerMessage;
      total += this.estimateTextTokens(message.content);
    }

    // 回复模板的开销
    total += 3;

    return total;
  }

  /**
   * 估算图片的 token 数量（用于视觉模型）
   *
   * @param file - 图片文件
   * @returns 预估的 token 数量
   */
  static estimateImageTokens(file: File | { size: number }): number {
    // OpenAI 的图片 token 计算：每 100 字节约 1 token
    // 基础开销 85 tokens + 图片尺寸 tokens
    const baseTokens = 85;
    const sizeTokens = Math.ceil(file.size / 100);
    return baseTokens + sizeTokens;
  }
}
```

---

### 4. 流式请求处理器

```typescript
// src/services/ai/StreamProcessor.ts

import type { AIMetrics } from '@/types/ai-metrics';
import { MetricsTracker } from './MetricsTracker';
import { TokenEstimator } from './TokenEstimator';

/**
 * 流式 AI 请求处理器
 *
 * 整合了流式请求处理和性能指标追踪
 */
export class StreamProcessor {
  private tracker: MetricsTracker;
  private abortController: AbortController | null = null;

  constructor() {
    this.tracker = new MetricsTracker();
  }

  /**
   * 发送流式请求
   *
   * @param endpoint - API 端点
   * @param messages - 消息列表
   * @param onChunk - 接收到 chunk 时的回调
   * @param onComplete - 完成时的回调
   * @param onError - 错误回调
   */
  async streamChat(
    endpoint: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string, metrics: AIMetrics) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    try {
      // 1. 预估输入 tokens
      const prompt_tokens = TokenEstimator.estimateMessagesTokens(messages);

      // 2. 开始追踪
      this.tracker.start(prompt_tokens);

      // 3. 创建请求
      this.abortController = new AbortController();

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages, stream: true }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 4. 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // 解码并解析 SSE 格式
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            // 跳过 [DONE] 标记
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // 提取内容
              const content = parsed.choices?.[0]?.delta?.content || '';

              // 提取 usage（部分 API 在最后返回）
              const usage = parsed.usage;

              // 更新追踪器
              this.tracker.accumulateChunk({
                content,
                usage: usage
                  ? {
                      completion_tokens: usage.completion_tokens,
                      prompt_tokens: usage.prompt_tokens,
                      total_tokens: usage.total_tokens,
                    }
                  : undefined,
              });

              // 回调
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // 5. 完成追踪
      const metrics = this.tracker.finalize();
      onComplete(fullResponse, metrics);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        onError(error as Error);
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 取消当前请求
   */
  abort(): void {
    this.abortController?.abort();
  }
}
```

---

## Vue 集成

### 5. Vue Composable（推荐方式）

````typescript
// src/composables/useAIMetrics.ts

import { ref, computed, type Ref } from 'vue';
import type { AIMetrics } from '@/types/ai-metrics';
import { MetricsTracker } from '@/services/ai/MetricsTracker';
import { TokenEstimator } from '@/services/ai/TokenEstimator';

/**
 * AI 性能指标 Composable
 *
 * @example
 * ```ts
 * const { metrics, startTracking, accumulateChunk, finalizeTracking } = useAIMetrics();
 * ```
 */
export function useAIMetrics() {
  const tracker = new MetricsTracker();

  // 响应式状态
  const metrics = ref<AIMetrics | null>(null);
  const isTracking = ref(false);

  /**
   * 开始追踪
   */
  const startTracking = (messages: Array<{ role: string; content: string }>) => {
    const prompt_tokens = TokenEstimator.estimateMessagesTokens(messages);
    tracker.start(prompt_tokens);
    isTracking.value = true;
    metrics.value = null;
  };

  /**
   * 累积 chunk
   */
  const accumulateChunk = (chunk: { content?: string; usage?: any }) => {
    if (isTracking.value) {
      tracker.accumulateChunk(chunk);
    }
  };

  /**
   * 完成追踪
   */
  const finalizeTracking = () => {
    if (isTracking.value) {
      metrics.value = tracker.finalize();
      isTracking.value = false;
    }
    return metrics.value;
  };

  /**
   * 格式化显示
   */
  const formattedMetrics = computed(() => {
    if (!metrics.value) return null;

    return {
      首字时延: metrics.value.time_first_token_millsec
        ? `${metrics.value.time_first_token_millsec.toFixed(0)} ms`
        : '-',

      每秒Tokens: metrics.value.token_speed ? `${metrics.value.token_speed.toFixed(0)} tok/s` : '-',

      输入: `${metrics.value.prompt_tokens} tokens`,
      输出: `${metrics.value.completion_tokens} tokens`,
    };
  });

  return {
    metrics,
    isTracking,
    startTracking,
    accumulateChunk,
    finalizeTracking,
    formattedMetrics,
  };
}
````

---

### 6. Vue 组件示例

```vue
<!-- src/components/ChatMessage.vue -->

<template>
  <div class="chat-message">
    <div class="message-header">
      <span class="role">{{ message.role }}</span>
      <span v-if="metrics" class="metrics">
        ↑{{ metrics.prompt_tokens }} ↓{{ metrics.completion_tokens }}
      </span>
    </div>

    <div class="message-content">
      {{ message.content }}
    </div>

    <!-- 性能指标悬浮提示 -->
    <el-popover v-if="metrics" placement="top" :width="200" trigger="hover">
      <template #reference>
        <div class="metrics-badge">
          <el-icon><InfoFilled /></el-icon>
        </div>
      </template>

      <div class="metrics-detail">
        <div class="metric-row">
          <span>首字时延:</span>
          <span>{{ formatFirstToken }}</span>
        </div>
        <div class="metric-row">
          <span>生成速度:</span>
          <span>{{ formatTokenSpeed }}</span>
        </div>
        <div class="metric-row">
          <span>总耗时:</span>
          <span>{{ formatTotalTime }}</span>
        </div>
        <div class="metric-row">
          <span>输入 Tokens:</span>
          <span>{{ metrics.prompt_tokens }}</span>
        </div>
        <div class="metric-row">
          <span>输出 Tokens:</span>
          <span>{{ metrics.completion_tokens }}</span>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
import type { AIMetrics } from '@/types/ai-metrics';

interface Props {
  message: {
    role: 'user' | 'assistant';
    content: string;
  };
  metrics?: AIMetrics | null;
}

const props = defineProps<Props>();

const formatFirstToken = computed(() => {
  if (!props.metrics?.time_first_token_millsec) return '-';
  return `${props.metrics.time_first_token_millsec.toFixed(0)} ms`;
});

const formatTokenSpeed = computed(() => {
  if (!props.metrics?.token_speed) return '-';
  return `${props.metrics.token_speed.toFixed(0)} tok/s`;
});

const formatTotalTime = computed(() => {
  if (!props.metrics?.time_completion_millsec) return '-';
  return `${(props.metrics.time_completion_millsec / 1000).toFixed(2)} s`;
});
</script>

<style scoped>
.chat-message {
  position: relative;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: #f5f5f5;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: #666;
}

.metrics {
  font-family: monospace;
}

.metrics-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.metrics-badge:hover {
  opacity: 1;
}

.metrics-detail {
  font-size: 12px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid #eee;
}

.metric-row:last-child {
  border-bottom: none;
}
</style>
```

---

### 7. 完整使用示例

```vue
<!-- src/views/ChatView.vue -->

<template>
  <div class="chat-view">
    <div class="messages">
      <ChatMessage v-for="msg in messages" :key="msg.id" :message="msg" :metrics="msg.metrics" />
    </div>

    <div class="input-area">
      <el-input
        v-model="userInput"
        type="textarea"
        placeholder="输入消息..."
        @keydown.enter.ctrl="sendMessage"
      />
      <el-button type="primary" :loading="isLoading" @click="sendMessage"> 发送 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAIMetrics } from '@/composables/useAIMetrics';
import { StreamProcessor } from '@/services/ai/StreamProcessor';
import type { AIMetrics } from '@/types/ai-metrics';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metrics?: AIMetrics;
}

const messages = ref<Message[]>([]);
const userInput = ref('');
const isLoading = ref(false);

// AI 指标追踪
const { startTracking, accumulateChunk, finalizeTracking } = useAIMetrics();

// 流式处理器
let streamProcessor: StreamProcessor | null = null;

const sendMessage = async () => {
  if (!userInput.value.trim() || isLoading.value) return;

  // 1. 添加用户消息
  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: userInput.value,
  };
  messages.value.push(userMessage);

  const input = userInput.value;
  userInput.value = '';
  isLoading.value = true;

  // 2. 准备助手消息占位
  const assistantMessage: Message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: '',
  };
  messages.value.push(assistantMessage);

  // 3. 准备消息列表
  const requestMessages = messages.value
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  // 4. 开始追踪
  startTracking(requestMessages);

  // 5. 发送流式请求
  streamProcessor = new StreamProcessor();

  await streamProcessor.streamChat(
    '/api/chat', // 你的 API 端点
    requestMessages,
    // onChunk: 接收到内容时更新 UI
    (chunk: string) => {
      assistantMessage.content += chunk;
      accumulateChunk({ content: chunk });
    },
    // onComplete: 完成时保存指标
    (fullResponse: string, metrics: AIMetrics) => {
      assistantMessage.metrics = finalizeTracking();
      isLoading.value = false;
    },
    // onError: 错误处理
    (error: Error) => {
      assistantMessage.content = `Error: ${error.message}`;
      isLoading.value = false;
    },
  );
};
</script>
```

---

## 完整代码示例

### 文件结构

```
src/
├── types/
│   └── ai-metrics.ts          # 类型定义
├── services/
│   └── ai/
│       ├── MetricsTracker.ts  # 核心追踪器
│       ├── TokenEstimator.ts  # Token 估算器
│       └── StreamProcessor.ts # 流式处理器
├── composables/
│   └── useAIMetrics.ts       # Vue Composable
└── components/
    └── ChatMessage.vue        # 消息组件
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用 performance.now()**

   ```typescript
   // ✅ 高精度
   const timestamp = performance.now();

   // ❌ 低精度
   const timestamp = Date.now();
   ```

2. **在请求前立即开始追踪**

   ```typescript
   // ✅ 准确
   tracker.start();
   await fetch(endpoint, ...);

   // ❌ 不准确
   tracker.start();
   await someAsyncOperation();
   await fetch(endpoint, ...);
   ```

3. **处理 API 提供的 usage 信息**

   ```typescript
   // ✅ 优先使用 API 提供的数据
   if (chunk.usage?.completion_tokens) {
     this.accumulated_tokens = chunk.usage.completion_tokens;
   } else {
     // 回退到估算
     this.accumulated_tokens += this.estimateTokens(chunk.content);
   }
   ```

4. **使用 TypeScript 类型**

   ```typescript
   // ✅ 类型安全
   const metrics: AIMetrics = tracker.finalize();
   ```

5. **在组件销毁时清理**

   ```typescript
   import { onUnmounted } from 'vue';

   onUnmounted(() => {
     streamProcessor?.abort();
   });
   ```

---

## 常见问题

### Q1: 如何处理推理模型（如 o1）的"思考"时间？

```typescript
// 扩展 AIMetrics 类型
interface ExtendedAIMetrics extends AIMetrics {
  time_thinking_millsec?: number;
}

// 在 accumulateChunk 中
if (chunk.is_thinking) {
  // 思考内容不计入首字时延
  if (!this.state.thinking_start_timestamp) {
    this.state.thinking_start_timestamp = this.getTimestamp();
  }
} else if (!this.state.has_first_token) {
  // 第一个非思考内容才作为首字
  this.state.first_token_timestamp = this.getTimestamp();
  this.state.has_first_token = true;
}
```

---

### Q2: 如何提高 token 估算精度？

**方法一：使用专门的 tokenizer**

```typescript
// 安装：npm install gpt-tokenizer
import { encode } from 'gpt-tokenizer';

export class TokenEstimator {
  static estimateTextTokens(text: string): number {
    return encode(text).length;
  }
}
```

**方法二：API 预估算（推荐）**

```typescript
// 发送一个无流式的请求获取准确的 usage
async preEstimateTokens(messages: Message[]) {
  const response = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ messages, max_tokens: 1 }),
  });
  return response.usage.prompt_tokens;
}
```

---

### Q3: 如何处理 SSE 之外的协议（WebSocket）？

```typescript
export class WebSocketStreamProcessor {
  private ws: WebSocket | null = null;
  private tracker: MetricsTracker;

  async streamChat(
    url: string,
    messages: Message[],
    onChunk: (chunk: string) => void,
    onComplete: (metrics: AIMetrics) => void,
  ) {
    this.tracker = new MetricsTracker();
    this.tracker.start();

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ messages, stream: true }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // WebSocket 协议的 chunk 解析
      const content = data.content;
      const usage = data.usage;

      this.tracker.accumulateChunk({ content, usage });

      if (content) {
        onChunk(content);
      }

      if (data.done) {
        const metrics = this.tracker.finalize();
        onComplete(metrics);
        this.ws?.close();
      }
    };
  }
}
```

---

### Q4: 多轮对话中如何计算上下文 tokens？

```typescript
// 假设 messages 是完整的历史消息
const calculateContextTokens = (messages: Message[]) => {
  let total = 0;

  // 遍历所有历史消息
  for (const msg of messages) {
    total += TokenEstimator.estimateTextTokens(msg.content);

    // 每条消息的元数据开销
    total += 4; // role 字段等
  }

  // 系统提示词额外开销
  total += 10;

  return total;
};
```

---

### Q5: 如何在 Pinia Store 中集成？

```typescript
// src/stores/aiMetrics.ts
import { defineStore } from 'pinia';
import type { AIMetrics } from '@/types/ai-metrics';
import { MetricsTracker } from '@/services/ai/MetricsTracker';

export const useAIMetricsStore = defineStore('aiMetrics', {
  state: () => ({
    currentTracker: null as MetricsTracker | null,
    history: [] as Array<{ messageId: string; metrics: AIMetrics }>,
  }),

  actions: {
    startTracking() {
      this.currentTracker = new MetricsTracker();
      this.currentTracker.start();
    },

    accumulateChunk(chunk: any) {
      this.currentTracker?.accumulateChunk(chunk);
    },

    finalizeTracking(messageId: string) {
      if (!this.currentTracker) return null;

      const metrics = this.currentTracker.finalize();
      this.history.push({ messageId, metrics });
      this.currentTracker = null;

      return metrics;
    },

    getMetricsById(messageId: string) {
      return this.history.find((h) => h.messageId === messageId)?.metrics;
    },
  },
});
```

---

## 总结

本文档提供了在 Vue + TypeScript 项目中实现 AI 性能指标计数的完整方案，包括：

1. ✅ **首字时延** - 使用 `performance.now()` 精确计时
2. ✅ **每秒 Tokens** - 完成后计算 `tokens / time`
3. ✅ **上下行 Tokens** - 流式累积 + API usage 信息

核心优势：

- **高精度计时** - 毫秒级准确度
- **流式实时更新** - 不阻塞 UI
- **类型安全** - 完整 TypeScript 支持
- **易于集成** - Composable 设计
- **可扩展** - 支持推理模型、多轮对话等

按本文档实现，即可在你的 Vue 项目中获得与参考项目相同的性能指标追踪能力！
