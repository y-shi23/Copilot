<script setup lang="ts">
// -nocheck
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Rocket } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const { t } = useI18n();
const currentConfig = inject('config');

const selectedQuickModel = ref('');
const isSavingQuickModel = ref(false);

const availableModels = computed(() => {
  const models = [];
  const configData = currentConfig?.value;
  if (!configData?.providers || typeof configData.providers !== 'object') return models;

  const providerOrder = Array.isArray(configData.providerOrder)
    ? configData.providerOrder
    : Object.keys(configData.providers);

  providerOrder.forEach((providerId) => {
    const provider = configData.providers?.[providerId];
    if (!provider || provider.enable === false) return;

    const modelList = Array.isArray(provider.modelList) ? provider.modelList : [];
    modelList.forEach((modelName) => {
      const normalizedModelName = String(modelName || '').trim();
      if (!normalizedModelName) return;
      models.push({
        value: `${providerId}|${normalizedModelName}`,
        label: `${provider.name || providerId}|${normalizedModelName}`,
      });
    });
  });

  return models;
});

const availableModelSet = computed(() => {
  return new Set(availableModels.value.map((item) => item.value));
});

const syncSelectedQuickModel = () => {
  const currentQuickModel = String(currentConfig?.value?.quickModel || '').trim();
  selectedQuickModel.value = availableModelSet.value.has(currentQuickModel)
    ? currentQuickModel
    : '';
};

watch(
  [() => currentConfig?.value?.quickModel, availableModels],
  () => {
    syncSelectedQuickModel();
  },
  { immediate: true, deep: true },
);

async function handleQuickModelChange(value) {
  if (!currentConfig?.value) return;

  const nextValue = String(value || '').trim();
  const previousValue = String(currentConfig.value.quickModel || '').trim();

  currentConfig.value.quickModel = nextValue;
  isSavingQuickModel.value = true;

  try {
    const result = await window.api.saveSetting('quickModel', nextValue);
    if (result && result.success === false) {
      throw new Error(result.message || 'Failed to save quickModel');
    }
  } catch (error) {
    console.error('Error saving quick model:', error);
    currentConfig.value.quickModel = previousValue;
    selectedQuickModel.value = availableModelSet.value.has(previousValue) ? previousValue : '';
    ElMessage.error(t('setting.alerts.saveFailedPrefix') + ' quickModel');
  } finally {
    isSavingQuickModel.value = false;
  }
}
</script>

<template>
  <div class="settings-page-container">
    <el-scrollbar class="settings-scrollbar-wrapper">
      <div class="settings-content">
        <section class="settings-section">
          <h2 class="section-title section-title-inline">
            <Rocket :size="16" class="default-model-title-icon" />
            <span>{{ t('defaultModel.title') }}</span>
          </h2>

          <div class="setting-option-item no-border">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('defaultModel.quickModel.label') }}</span>
              <span class="setting-option-description">{{
                t('defaultModel.quickModel.description')
              }}</span>
            </div>
            <el-select
              v-model="selectedQuickModel"
              filterable
              clearable
              size="default"
              style="width: 320px; max-width: 100%"
              class="setting-inline-select"
              popper-class="settings-select-popper"
              :loading="isSavingQuickModel"
              :placeholder="t('defaultModel.quickModel.placeholder')"
              @change="handleQuickModelChange"
            >
              <el-option
                v-for="item in availableModels"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>
        </section>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.settings-page-container {
  height: 100%;
  width: 100%;
  background-color: var(--bg-primary);
  display: flex;
  justify-content: center;
  overflow: hidden;
}

.settings-scrollbar-wrapper {
  height: 100%;
  width: 100%;
  max-width: 900px;
}

.settings-content {
  padding: 10px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.settings-section {
  padding: 6px 12px 4px;
}

.section-title {
  margin: 0 0 8px;
  padding: 2px 0 6px;
  font-size: 17px;
  color: var(--text-primary);
  font-weight: 650;
  letter-spacing: 0.01em;
}

.section-title.section-title-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.default-model-title-icon {
  color: var(--text-accent);
}

.setting-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  gap: 20px;
  flex-wrap: wrap;
}

.setting-text-content {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.setting-option-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.setting-option-description {
  font-size: 13px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

:deep(.setting-inline-select .el-select__wrapper) {
  border-radius: var(--radius-lg);
}
</style>
