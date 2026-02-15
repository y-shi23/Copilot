<script setup lang="ts">
// -nocheck
import { computed } from 'vue';
import { ElHeader, ElTooltip } from 'element-plus';
import { ChevronsUpDown, Sparkles, Search } from 'lucide-vue-next';
import { handleModelLogoError, resolveModelLogoUrl } from '../utils/modelLogos';

const props = defineProps({
  modelMap: Object,
  model: String,
  isMcpLoading: Boolean,
  systemPrompt: String,
});

const emit = defineEmits([
  'open-model-dialog',
  'show-system-prompt',
  'open-search', // 新增事件
]);

const currentModelMeta = computed(() => {
  const selectedModelKey = String(props.model || '');
  const selectedModelLabel = String(props.modelMap?.[props.model] || selectedModelKey || '');

  const [providerName = '', ...nameFromLabelParts] = selectedModelLabel.split('|');
  const [providerId = '', ...nameFromValueParts] = selectedModelKey.split('|');
  const modelName =
    nameFromValueParts.join('|') || nameFromLabelParts.join('|') || selectedModelLabel;

  return {
    providerId,
    providerName,
    modelName,
    modelText: selectedModelLabel || '选择模型',
  };
});

const currentModelLogo = computed(() => {
  if (!currentModelMeta.value.modelName) return '';
  return resolveModelLogoUrl(currentModelMeta.value.modelName, {
    providerName: currentModelMeta.value.providerName,
    metadataProviderId: currentModelMeta.value.providerId,
  });
});
</script>

<template>
  <el-header class="model-header">
    <div class="model-header-wrapper">
      <div class="header-content-group">
        <!-- 1. 模型选择器 -->
        <div
          class="model-pill expandable-pill"
          :class="{ 'is-disabled': isMcpLoading, 'is-loading': isMcpLoading }"
          @click="!isMcpLoading && emit('open-model-dialog')"
        >
          <!-- Logo -->
          <div class="model-logo-container">
            <img
              class="model-logo"
              :src="currentModelLogo"
              :alt="currentModelMeta.modelName || 'Model Logo'"
              loading="lazy"
              @error="handleModelLogoError"
            />
          </div>

          <!-- 隐藏内容，hover 时显示 -->
          <div class="expandable-content">
            <span class="model-text">
              {{ isMcpLoading ? 'MCP工具加载中...' : currentModelMeta.modelText }}
            </span>

            <ChevronsUpDown :size="12" class="arrow-icon" />
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="header-divider"></div>

        <!-- 2. 系统提示词展示/编辑 -->
        <div class="model-pill prompt-pill" @click="emit('show-system-prompt')">
          <Sparkles :size="14" class="prompt-icon" />
          <span v-if="systemPrompt" class="model-text prompt-text">{{ systemPrompt }}</span>
          <span v-else class="model-text prompt-text placeholder">系统提示词</span>
        </div>

        <!-- 3. [新增] 搜索按钮 -->
        <el-tooltip content="搜索内容 (Ctrl/Cmd+F)" placement="bottom" :show-after="500">
          <button
            type="button"
            class="model-pill icon-pill circle-action-btn"
            @click="emit('open-search')"
          >
            <Search :size="14" class="header-icon" />
          </button>
        </el-tooltip>
      </div>
    </div>
  </el-header>
</template>

<style scoped>
.model-header {
  height: 54px;
  width: 100%;
  padding: 0px 20px 0;
  flex-shrink: 0;
  z-index: 9;
  background-color: transparent;
}

.model-header-wrapper {
  width: 100%;
  height: 46px;
  display: flex;
  align-items: center;
  border: none;
  background-color: transparent;
  box-shadow: none;
  padding: 0 10px;
}

.header-content-group {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
}

.header-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-primary);
  margin: 0 10px;
  flex-shrink: 0;
}

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid transparent;
  background-color: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  box-sizing: border-box;
  flex-shrink: 0;
  color: var(--text-secondary);
  font: inherit;
  appearance: none;
}

.model-pill:hover {
  color: var(--text-primary);
  border-color: var(--border-primary);
  background-color: var(--bg-secondary);
}

.model-pill:active {
  transform: none;
}

.model-pill:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--text-accent) 45%, transparent);
  outline-offset: 1px;
}

.model-pill.is-disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.expandable-pill .expandable-content {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-width 0.24s ease,
    opacity 0.2s ease;
}

.expandable-pill:hover .expandable-content,
.expandable-pill.is-loading .expandable-content {
  max-width: 260px;
  opacity: 1;
}

.expandable-pill:hover,
.expandable-pill.is-loading {
  padding-right: 12px;
  border-color: var(--border-primary);
  background-color: var(--bg-secondary);
}

@keyframes rotate-logo {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.model-logo-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.model-logo {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: contain;
  transition:
    transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1),
    color 0.3s;
}

.expandable-pill:hover .model-logo {
  transform: rotate(360deg);
}

/* 加载状态下的 Logo 动画 */
.expandable-pill.is-loading .model-logo {
  animation: rotate-logo 0.6s linear infinite;
}

.prompt-pill {
  color: var(--text-secondary);
  flex: 1;
  min-width: 0;
}

.prompt-pill:hover {
  background-color: var(--bg-secondary);
}

.prompt-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.prompt-text {
  font-size: 12px;
  color: var(--text-secondary);
  padding-right: 4px;
}

.prompt-text.placeholder {
  color: var(--text-tertiary);
  font-style: italic;
}

.model-text {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.icon-pill {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  justify-content: center;
  margin-left: 4px;
}

.header-icon {
  flex-shrink: 0;
}
</style>
