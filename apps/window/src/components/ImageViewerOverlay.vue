<script setup lang="ts">
import { ElImageViewer } from 'element-plus';
import { Copy, Download } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: boolean;
  urlList: string[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'copy', url: string): void;
  (e: 'download', url: string): void;
}>();

const handleCopy = () => {
  emit('copy', props.urlList?.[0] || '');
};

const handleDownload = () => {
  emit('download', props.urlList?.[0] || '');
};
</script>

<template>
  <el-image-viewer
    v-if="props.modelValue"
    :url-list="props.urlList"
    :initial-index="props.initialIndex"
    @close="emit('update:modelValue', false)"
    :hide-on-click-modal="true"
    teleported
  />
  <div v-if="props.modelValue" class="custom-viewer-actions">
    <el-button type="primary" circle @click="handleCopy" title="复制图片">
      <Copy :size="16" />
    </el-button>
    <el-button type="primary" circle @click="handleDownload" title="下载图片">
      <Download :size="16" />
    </el-button>
  </div>
</template>
