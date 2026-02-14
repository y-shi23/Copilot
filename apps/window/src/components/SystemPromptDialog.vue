<script setup lang="ts">
import { computed } from 'vue';
import { ElDialog, ElInput, ElButton } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  content: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:content', value: string): void;
  (e: 'save'): void;
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const promptContent = computed({
  get: () => props.content,
  set: (value: string) => emit('update:content', value),
});

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    emit('save');
  }
};
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title=""
    custom-class="system-prompt-dialog"
    width="min(480px, 88vw)"
    :show-close="false"
    :lock-scroll="false"
    :append-to-body="true"
    center
    :close-on-click-modal="true"
    :close-on-press-escape="true"
  >
    <template #header>
      <div class="dialog-hidden-header"></div>
    </template>

    <div class="prompt-dialog-body">
      <div class="prompt-input-wrapper">
        <el-input
          v-model="promptContent"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 10 }"
          class="prompt-textarea"
          resize="none"
          placeholder="输入系统提示词..."
          @keydown="handleKeydown"
        />
      </div>
    </div>

    <template #footer>
      <div class="prompt-dialog-footer">
        <el-button class="footer-btn cancel-btn" @click="dialogVisible = false"> 取消 </el-button>
        <el-button class="footer-btn save-btn" @click="emit('save')"> 保存 </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.system-prompt-dialog {
  border-radius: 18px !important;
  border: none !important;
  overflow: hidden;
  box-shadow: var(--el-box-shadow-dark) !important;
  background: transparent !important;
  margin: auto !important;
}

.system-prompt-dialog .el-dialog__header {
  display: none !important;
  padding: 0 !important;
}

.system-prompt-dialog .el-dialog__body {
  padding: 16px 18px 12px !important;
  background: var(--el-bg-color-overlay);
}

.system-prompt-dialog .el-dialog__footer {
  padding: 0 18px 16px !important;
  background: var(--el-bg-color-overlay);
}
</style>

<style scoped>
.prompt-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.prompt-input-wrapper {
  position: relative;
  border-radius: 14px;
  padding: 2px;
  background: linear-gradient(96deg, rgba(229, 190, 120, 0.55) 0%, rgba(163, 153, 221, 0.55) 100%);
}

html.dark .prompt-input-wrapper {
  background: linear-gradient(96deg, rgba(140, 121, 189, 0.45) 0%, rgba(109, 145, 177, 0.45) 100%);
}

.prompt-textarea {
  font-family:
    SFMono-Regular,
    Consolas,
    Liberation Mono,
    Menlo,
    Courier,
    monospace;
  width: 100%;
}

.prompt-textarea :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background-color: var(--el-bg-color-overlay) !important;
  border: none !important;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--el-text-color-primary);
  min-height: 100px;
}

.prompt-textarea :deep(.el-textarea__inner::placeholder) {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.prompt-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.footer-btn {
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  height: auto;
  border: none;
  transition: all 0.18s ease;
}

.cancel-btn {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}

.cancel-btn:hover {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

.save-btn {
  background-color: var(--el-color-primary);
  color: var(--text-on-accent);
}

.save-btn:hover {
  opacity: 0.88;
}

html.dark .save-btn {
  color: #1a1a1a;
}

@media (max-width: 480px) {
  .prompt-textarea :deep(.el-textarea__inner) {
    font-size: 12px;
    padding: 10px 12px;
  }

  .footer-btn {
    padding: 7px 14px;
    font-size: 12px;
  }
}
</style>
