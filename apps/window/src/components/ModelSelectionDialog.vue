<script setup lang="ts">
// -nocheck
import { ref, computed } from 'vue';
import { ElDialog, ElButton, ElInput } from 'element-plus';
import { Search } from 'lucide-vue-next';

const props = defineProps({
  modelValue: Boolean,
  modelList: Array,
  currentModel: String,
});

const emit = defineEmits(['update:modelValue', 'select', 'save-model']);

const searchQuery = ref('');
const searchInputRef = ref(null);

const handleOpened = () => {
  if (searchInputRef.value) {
    searchInputRef.value.focus();
  }
};

const filteredModelList = computed(() => {
  if (!searchQuery.value) {
    return props.modelList || [];
  }
  const lowerCaseQuery = searchQuery.value.toLowerCase();
  return (props.modelList || []).filter((model) =>
    model.label.toLowerCase().includes(lowerCaseQuery),
  );
});

const groupedModelList = computed(() => {
  const groups = new Map();
  for (const model of filteredModelList.value) {
    const [provider = '', ...nameParts] = String(model.label || '').split('|');
    const modelName = nameParts.join('|') || model.value || model.label;
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    groups.get(provider).push({
      ...model,
      provider,
      modelName,
    });
  }

  return Array.from(groups.entries()).map(([provider, models]) => ({
    provider,
    models,
  }));
});

const onModelClick = (model) => {
  if (model.value === props.currentModel) {
    emit('save-model', model.value);
  } else {
    emit('select', model.value);
  }
};

const handleClose = () => {
  searchQuery.value = '';
  emit('update:modelValue', false);
};
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="handleClose"
    width="min(640px, 88vw)"
    custom-class="model-dialog no-header-dialog"
    @opened="handleOpened"
    :show-close="false"
  >
    <template #header>
      <div class="dialog-hidden-header"></div>
    </template>

    <div class="model-search-container">
      <el-input
        ref="searchInputRef"
        v-model="searchQuery"
        placeholder="搜索服务商或模型名称..."
        clearable
      >
        <template #prefix>
          <Search :size="14" />
        </template>
      </el-input>
    </div>

    <div class="model-dropdown-wrapper app-dropdown-surface custom-scrollbar">
      <div v-if="groupedModelList.length === 0" class="model-empty">暂无匹配模型</div>

      <div v-for="group in groupedModelList" :key="group.provider" class="provider-group">
        <div class="provider-title">{{ group.provider || '未命名服务商' }}</div>

        <button
          v-for="model in group.models"
          :key="model.value"
          type="button"
          class="app-dropdown-item model-option"
          :class="{ 'is-selected': model.value === currentModel }"
          @click="onModelClick(model)"
        >
          <span class="model-name">{{ model.modelName }}</span>
          <span class="model-hint">{{
            model.value === currentModel ? '当前模型（点击保存默认）' : '点击切换'
          }}</span>
        </button>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.model-search-container {
  padding: 0 0 12px;
}

.model-dropdown-wrapper {
  max-height: 54vh;
  overflow-y: auto;
}

.model-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px 8px;
  font-size: 13px;
}

.provider-group + .provider-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-secondary);
}

.provider-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 2px 10px 6px;
}

.model-option {
  min-height: 38px;
  height: auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.3;
  padding-top: 8px;
  padding-bottom: 8px;
}

.model-name {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 13px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-hint {
  color: var(--text-tertiary);
  font-size: 11px;
  flex-shrink: 0;
  text-align: right;
}

.model-option.is-selected {
  background-color: var(--bg-tertiary);
}
</style>
