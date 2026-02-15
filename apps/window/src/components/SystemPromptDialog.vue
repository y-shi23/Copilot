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
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="emit('save')">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.system-prompt-dialog {
  border-radius: var(--radius-xl) !important;
  margin: auto !important;
}

.system-prompt-dialog .el-dialog__header {
  display: none !important;
  padding: 0 !important;
}

.system-prompt-dialog .el-dialog__body {
  padding: 14px 18px 10px !important;
  background: transparent;
}

.system-prompt-dialog .el-dialog__footer {
  padding: 4px 18px 14px !important;
  background: transparent;
}
</style>

<style scoped>
.prompt-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.prompt-input-wrapper {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
  background-color: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  overflow: hidden;
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
  background-color: transparent !important;
  border: none !important;
  border-radius: 0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
  min-height: 100px;
}

.prompt-textarea :deep(.el-textarea__inner::placeholder) {
  color: var(--text-tertiary);
  font-size: 13px;
}

.prompt-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 480px) {
  .prompt-textarea :deep(.el-textarea__inner) {
    font-size: 12px;
    padding: 10px 12px;
  }
}
</style>
