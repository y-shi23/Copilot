<script setup lang="ts">
// -nocheck
import { ref, computed } from 'vue';
import { ElInput } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { handleModelLogoError, resolveModelLogoUrl } from '../utils/modelLogos';
import AppDialogCard from './ui/AppDialogCard.vue';

const props = defineProps({
  modelValue: Boolean,
  modelList: Array,
  currentModel: String,
});

const emit = defineEmits(['update:modelValue', 'select', 'save-model']);

const searchQuery = ref('');
const searchInputRef = ref(null);
const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    if (!value) {
      searchQuery.value = '';
    }
    emit('update:modelValue', value);
  },
});

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
    const [providerId = '', ...idParts] = String(model.value || '').split('|');
    const modelName = nameParts.join('|') || model.value || model.label;
    const modelId = idParts.join('|') || modelName;
    if (!groups.has(provider)) {
      groups.set(provider, []);
    }
    groups.get(provider).push({
      ...model,
      provider,
      providerId,
      modelName,
      logoUrl: resolveModelLogoUrl(modelId, {
        providerName: provider,
        metadataProviderId: providerId,
      }),
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
</script>

<template>
  <AppDialogCard
    v-model="dialogVisible"
    width="min(640px, 88vw)"
    variant="standard"
    hide-header
    dialog-class="model-dialog"
    :close-on-click-modal="true"
    @opened="handleOpened"
    :show-close="false"
  >
    <div class="model-dialog-content custom-scrollbar">
      <div class="model-search-area">
        <Search :size="16" class="search-icon" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="model-search-input"
          placeholder="搜索服务商或模型名称..."
        />
      </div>

      <div class="model-list-area">
        <div v-if="groupedModelList.length === 0" class="model-empty">暂无匹配模型</div>

        <div v-for="group in groupedModelList" :key="group.provider" class="provider-group">
          <div class="provider-title">{{ group.provider || '未命名服务商' }}</div>

          <button
            v-for="model in group.models"
            :key="model.value"
            type="button"
            class="model-tag"
            :class="{ 'is-selected': model.value === currentModel }"
            @click="onModelClick(model)"
          >
            <img
              class="model-logo"
              :src="model.logoUrl"
              :alt="model.modelName"
              loading="lazy"
              @error="handleModelLogoError"
            />
            <span class="model-name">{{ model.modelName }}</span>
            <span v-if="model.value === currentModel" class="model-current-badge">当前</span>
          </button>
        </div>
      </div>
    </div>
  </AppDialogCard>
</template>

<style>
/* Global (non-scoped) styles for model-dialog because el-dialog uses append-to-body */
.app-dialog-card.model-dialog .el-dialog__body {
  padding: 0 !important;
}
</style>

<style scoped>
.model-dialog-content {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
  overflow-y: auto;
}

.model-search-area {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background-color: var(--bg-secondary);
  position: sticky;
  top: 0;
  z-index: 10;
}

.search-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-right: 10px;
}

.model-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-primary);
}

.model-search-input::placeholder {
  color: var(--text-tertiary);
}

.model-list-area {
  padding: 8px 14px 14px;
}

.model-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 24px 8px;
  font-size: 13px;
}

.provider-group + .provider-group {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-secondary);
}

.provider-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 4px 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-tag {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 9999px;
  border: 1px solid var(--border-primary);
  background-color: var(--bg-tertiary);
  margin-bottom: 6px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.model-tag:last-child {
  margin-bottom: 0;
}

.model-tag:hover {
  background-color: color-mix(in srgb, var(--bg-tertiary) 82%, var(--bg-secondary));
}

.model-logo {
  width: 18px;
  height: 18px;
  min-width: 18px;
  border-radius: 50%;
  object-fit: contain;
  flex-shrink: 0;
}

.model-name {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 13px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.model-current-badge {
  font-size: 11px;
  color: var(--text-accent);
  background-color: color-mix(in srgb, var(--text-accent) 12%, transparent);
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.model-tag.is-selected {
  border-color: color-mix(in srgb, var(--text-accent) 38%, var(--border-primary));
}
</style>
