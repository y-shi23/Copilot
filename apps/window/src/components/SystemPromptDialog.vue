<script setup lang="ts">
import { computed } from 'vue';
import { ElDialog } from 'element-plus';

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
    width="60%"
    :show-close="false"
    :lock-scroll="false"
    :append-to-body="true"
    center
    :close-on-click-modal="true"
    :close-on-press-escape="true"
  >
    <template #header="{ close, titleId, titleClass }">
      <div class="dialog-hidden-header"></div>
    </template>
    <el-input
      v-model="promptContent"
      type="textarea"
      :autosize="{ minRows: 4, maxRows: 15 }"
      class="system-prompt-full-content"
      resize="none"
      @keydown="handleKeydown"
    />
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>
