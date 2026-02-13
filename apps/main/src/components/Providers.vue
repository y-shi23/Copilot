<script setup>
import { ref, reactive, onMounted, computed, inject, watch } from 'vue'
import { Plus, Trash2 as Delete, Pencil as Edit, RefreshCw as Refresh, CirclePlus, Search, ListCheck, Minus, Eye, EyeOff } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import draggable from 'vuedraggable';

const { t } = useI18n();

const currentConfig = inject('config');
const provider_key = ref(null);
const showApiKey = ref(false);

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuProviderKey = ref(null);

onMounted(() => {
  if (currentConfig.value.providerOrder && currentConfig.value.providerOrder.length > 0) {
    provider_key.value = currentConfig.value.providerOrder[0];
  } else if (currentConfig.value.providers && Object.keys(currentConfig.value.providers).length > 0) {
    provider_key.value = Object.keys(currentConfig.value.providers)[0];
  } else {
    provider_key.value = null;
  }
});

const selectedProvider = computed(() => {
  if (provider_key.value && currentConfig.value.providers && currentConfig.value.providers[provider_key.value]) {
    return currentConfig.value.providers[provider_key.value];
  }
  return null;
});

const localProviderOrder = ref([]);

watch(() => currentConfig.value.providerOrder, (val) => {
  localProviderOrder.value = val ? [...val] : [];
}, { immediate: true });

function saveProviderOrder() {
  atomicSave(config => {
    config.providerOrder = [...localProviderOrder.value];
  });
}

// 原子化保存函数
const atomicSave = async (updateFunction) => {
  try {
    const latestConfigData = await window.api.getConfig();
    if (!latestConfigData || !latestConfigData.config) {
      throw new Error("Failed to get latest config from DB.");
    }
    const latestConfig = latestConfigData.config;

    updateFunction(latestConfig);

    await window.api.updateConfigWithoutFeatures({ config: latestConfig });

    currentConfig.value = latestConfig;

  } catch (error) {
    console.error("Atomic save failed:", error);
    ElMessage.error(t('providers.alerts.configSaveFailed'));
  }
}

function delete_provider() {
  if (!provider_key.value) return;

  atomicSave(config => {
    const keyToDelete = provider_key.value;
    const index = config.providerOrder.indexOf(keyToDelete);

    delete config.providers[keyToDelete];
    config.providerOrder = config.providerOrder.filter(key => key !== keyToDelete);

    // 更新 provider_key 以选择一个新的服务商
    if (config.providerOrder.length > 0) {
      if (index > 0 && index <= config.providerOrder.length) {
        provider_key.value = config.providerOrder[index - 1];
      } else {
        provider_key.value = config.providerOrder[0];
      }
    } else {
      provider_key.value = null;
    }
  });
}

const addProvider_page = ref(false);
const addprovider_form = reactive({ name: "" });

function add_prvider_function() {
  const timestamp = String(Date.now());
  const newName = addprovider_form.name || `${t('providers.unnamedProvider')} ${timestamp.slice(-4)}`;

  atomicSave(config => {
    config.providers[timestamp] = {
      name: newName,
      url: "", api_key: "", modelList: [], enable: true
    };
    config.providerOrder.push(timestamp);
    provider_key.value = timestamp;
  });

  addprovider_form.name = "";
  addProvider_page.value = false;
}

const change_provider_name_page = ref(false);
const change_provider_name_form = reactive({ name: "" });

function openChangeProviderNameDialog() {
  if (selectedProvider.value) {
    change_provider_name_form.name = selectedProvider.value.name;
    change_provider_name_page.value = true;
  }
}

function change_provider_name_function() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  const newName = change_provider_name_form.name;

  atomicSave(config => {
    if (config.providers[keyToUpdate]) {
      config.providers[keyToUpdate].name = newName;
    }
  });

  change_provider_name_form.name = "";
  change_provider_name_page.value = false;
}

function delete_model(model) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      provider.modelList = provider.modelList.filter(m => m !== model);
    }
  });
}

const addModel_page = ref(false);
const addModel_form = reactive({ name: "" })

function add_model_function() {
  if (!provider_key.value || !addModel_form.name.trim()) return;
  const keyToUpdate = provider_key.value;
  const newModelName = addModel_form.name.trim();

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      provider.modelList.push(newModelName);
    }
  });

  addModel_form.name = "";
  addModel_page.value = false;
}

const getModel_page = ref(false);
const getModel_form = reactive({ modelList: [], isLoading: false, error: null });
const searchQuery = ref('');

const filteredModels = computed(() => {
  if (!searchQuery.value) {
    return getModel_form.modelList;
  }
  const lowerCaseQuery = searchQuery.value.toLowerCase();
  return getModel_form.modelList.filter(model =>
    (model.id && model.id.toLowerCase().includes(lowerCaseQuery)) ||
    (model.owned_by && model.owned_by.toLowerCase().includes(lowerCaseQuery))
  );
});


async function activate_get_model_function() {
  if (!selectedProvider.value || !selectedProvider.value.url) {
    ElMessage.warning(t('providers.alerts.providerUrlNotSet'));
    return;
  }
  getModel_page.value = true;
  getModel_form.isLoading = true;
  getModel_form.error = null;
  getModel_form.modelList = [];
  searchQuery.value = '';

  const url = selectedProvider.value.url;
  const apiKey = selectedProvider.value.api_key;
  const apiKeyToUse = window.api && typeof window.api.getRandomItem === 'function' && apiKey ? window.api.getRandomItem(apiKey) : apiKey;


  const options = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  };
  if (apiKeyToUse) {
    options.headers['Authorization'] = `Bearer ${apiKeyToUse}`;
  }

  try {
    const response = await fetch(`${url}/models`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      const errorMessage = t('providers.alerts.fetchModelsError', { status: response.status, message: errorData.message || t('providers.alerts.fetchModelsFailedDefault') });
      throw new Error(errorMessage);
    }
    const data = await response.json();
    if (data?.data && Array.isArray(data.data)) {
      getModel_form.modelList = data.data.map(m => ({ id: m.id, owned_by: m.owned_by }));
    } else {
      getModel_form.modelList = [];
    }
  } catch (error) {
    console.error(error);
    getModel_form.error = error.message;
    ElMessage.error(error.message);
  } finally {
    getModel_form.isLoading = false;
  }
}

function get_model_function(add, modelId) {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      if (!provider.modelList) {
        provider.modelList = [];
      }
      if (add) {
        if (!provider.modelList.includes(modelId)) {
          provider.modelList.push(modelId);
        }
      } else {
        provider.modelList = provider.modelList.filter(m => m !== modelId);
      }
    }
  });
}

function saveModelOrder() {
  if (!provider_key.value) return;
  const keyToUpdate = provider_key.value;
  // v-model已经更新了selectedProvider.modelList的顺序
  const newOrder = selectedProvider.value.modelList;

  atomicSave(config => {
    const provider = config.providers[keyToUpdate];
    if (provider) {
      provider.modelList = newOrder;
    }
  });
}

// 对于简单的开关和输入框，使用精确的 saveSetting
async function saveSingleProviderSetting(key, value) {
  if (!provider_key.value) return;
  const keyPath = `providers.${provider_key.value}.${key}`;
  try {
    await window.api.saveSetting(keyPath, value);
  } catch (e) {
    ElMessage.error(t('providers.alerts.saveFailed'));
  }
}

const apiKeyCount = computed(() => {
  if (!selectedProvider.value || !selectedProvider.value.api_key || !selectedProvider.value.api_key.trim()) {
    return 0;
  }
  // 同时支持中英文逗号，并过滤空字符串
  const keys = selectedProvider.value.api_key.split(/[,，]/).filter(k => k.trim() !== '');
  return keys.length;
});

function handleProviderContextMenu(event, key_id) {
  event.preventDefault();
  contextMenuProviderKey.value = key_id;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

function hideContextMenu() {
  contextMenuVisible.value = false;
}

function handleContextMenuRename() {
  hideContextMenu();
  provider_key.value = contextMenuProviderKey.value;
  openChangeProviderNameDialog();
}

function handleContextMenuDelete() {
  hideContextMenu();
  const keyToDelete = contextMenuProviderKey.value;
  provider_key.value = keyToDelete;
  delete_provider();
}

watch(contextMenuVisible, (val) => {
  if (val) {
    document.addEventListener('click', hideContextMenu);
  } else {
    document.removeEventListener('click', hideContextMenu);
  }
});
</script>

<template>
  <div class="providers-page-container">
    <div class="providers-content-wrapper">
      <el-container>
        <el-aside width="240px" class="providers-aside">
          <el-scrollbar class="provider-list-scrollbar">
            <draggable v-model="localProviderOrder" :item-key="(el) => el" :animation="250"
              ghost-class="provider-drag-ghost" :force-fallback="true" fallback-class="provider-drag-fallback"
              :fallback-on-body="true" @end="saveProviderOrder">
              <template #item="{ element: key_id }">
                <div class="provider-item" :class="{
                  'active': provider_key === key_id, 'disabled': currentConfig.providers[key_id] && !currentConfig.providers[key_id].enable
                }" @click="provider_key = key_id" @contextmenu="handleProviderContextMenu($event, key_id)">
                  <span class="provider-item-name">{{ currentConfig.providers[key_id]?.name ||
                    t('providers.unnamedProvider') }}</span>
                  <div class="provider-status-wrapper">
                    <transition name="status-flip" mode="out-in">
                      <el-tag 
                        :type="currentConfig.providers[key_id].enable ? 'primary' : 'info'"
                        size="small" 
                        effect="dark" 
                        round
                        :key="currentConfig.providers[key_id].enable ? 'on' : 'off'"
                        class="provider-status-tag">
                        {{ currentConfig.providers[key_id].enable ? t('providers.statusOn') : t('providers.statusOff') }}
                      </el-tag>
                    </transition>
                  </div>
                </div>
              </template>
            </draggable>
            <div v-if="!currentConfig.providerOrder || currentConfig.providerOrder.length === 0" class="no-providers">
              {{ t('providers.noProviders') }}
            </div>
          </el-scrollbar>
          <div class="aside-actions">
            <el-button type="primary" :icon="Plus" @click="addProvider_page = true" class="add-provider-btn">
              {{ t('providers.addProviderBtn') }}
            </el-button>
          </div>
        </el-aside>

        <el-main class="provider-main-content">
          <el-scrollbar class="provider-details-scrollbar">
            <div v-if="selectedProvider" class="provider-details">
              <div class="provider-header">
                <h2 class="provider-name">
                  {{ selectedProvider.name }}
                </h2>
                <el-switch v-model="selectedProvider.enable"
                  @change="(value) => saveSingleProviderSetting('enable', value)" size="large" />
              </div>

              <el-form label-position="left" label-width="75px" class="provider-form">
                <div class="form-item-header">
                  <div class="form-item-description">{{ t('providers.apiKeyDescription') }}</div>
                </div>
                <el-form-item>
                  <template #label>
                    <span class="label-with-badge">
                      {{ t('providers.apiKeyLabel') }}
                      <span v-if="apiKeyCount > 0" class="api-key-count-badge">{{ apiKeyCount }}</span>
                    </span>
                  </template>
                  <el-input 
                    v-model="selectedProvider.api_key" 
                    :type="showApiKey ? 'text' : 'password'"
                    :placeholder="t('providers.apiKeyPlaceholder')"
                    @change="(value) => saveSingleProviderSetting('api_key', value)">
                    <template #suffix>
                      <component 
                        :is="showApiKey ? EyeOff : Eye" 
                        :size="16" 
                        @click="showApiKey = !showApiKey"
                        style="cursor: pointer;" />
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item :label="t('providers.apiUrlLabel')">
                  <el-input v-model="selectedProvider.url" :placeholder="t('providers.apiUrlPlaceholder')"
                    @change="(value) => saveSingleProviderSetting('url', value)" />
                </el-form-item>

                <el-form-item :label="t('providers.modelsLabel')">
                  <div class="models-actions-row">
                    <el-tooltip :content="t('providers.getModelsFromApiBtn')" placement="top">
                      <el-button :icon="ListCheck" @click="activate_get_model_function" circle class="circle-action-btn" />
                    </el-tooltip>
                    <el-tooltip :content="t('providers.addManuallyBtn')" placement="top">
                      <el-button :icon="Plus" @click="addModel_page = true" circle class="circle-action-btn" />
                    </el-tooltip>
                  </div>
                </el-form-item>
                <div class="models-list-wrapper">
                  <draggable v-if="selectedProvider.modelList && selectedProvider.modelList.length > 0"
                    v-model="selectedProvider.modelList" item-key="model"
                    class="models-list-container draggable-models-list" @end="saveModelOrder"
                    ghost-class="sortable-ghost">
                    <template #item="{ element: model }">
                      <div class="model-tag">
                        <span class="model-name">{{ model }}</span>
                        <Minus class="model-remove-icon" :size="16" @click.stop="delete_model(model)" />
                      </div>
                    </template>
                  </draggable>
                  <div v-else class="no-models-message">
                    {{ t('providers.noModelsAdded') }}
                  </div>
                </div>

              </el-form>
            </div>
            <el-empty v-else :description="t('providers.selectProviderOrAdd')" class="empty-state-main" />
          </el-scrollbar>
        </el-main>
      </el-container>
    </div>

    <!-- Dialogs -->
    <el-dialog v-model="addProvider_page" :title="t('providers.addProviderDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="addprovider_form" @submit.prevent="add_prvider_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="addprovider_form.name" autocomplete="off"
            :placeholder="t('providers.providerNamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addProvider_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_prvider_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="change_provider_name_page" :title="t('providers.changeProviderNameDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="change_provider_name_form" @submit.prevent="change_provider_name_function" label-position="top">
        <el-form-item :label="t('providers.providerNameLabel')" required>
          <el-input v-model="change_provider_name_form.name" autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="change_provider_name_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="change_provider_name_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addModel_page" :title="t('providers.addModelDialogTitle')" width="500px"
      :close-on-click-modal="false">
      <el-form :model="addModel_form" @submit.prevent="add_model_function" label-position="top">
        <el-form-item :label="t('providers.modelNameIdLabel')" required>
          <el-input v-model="addModel_form.name" autocomplete="off"
            :placeholder="t('providers.modelNameIdPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addModel_page = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="add_model_function">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="getModel_page" :title="t('providers.availableModelsDialogTitle')" width="700px" top="10vh"
      :close-on-click-modal="false" class="available-models-dialog">
      <el-input v-model="searchQuery" :placeholder="t('providers.searchModelsPlaceholder')" clearable
        :prefix-icon="Search" class="dialog-search-input" />

      <el-alert v-if="getModel_form.error" :title="getModel_form.error" type="error" show-icon :closable="false"
        class="dialog-error-alert" />

      <el-table :data="filteredModels" v-loading="getModel_form.isLoading" style="width: 100%" max-height="50vh"
        :empty-text="searchQuery ? t('providers.noModelsMatchSearch') : t('providers.noModelsFoundError')" stripe
        border>
        <el-table-column prop="id" :label="t('providers.table.modelId')" sortable />
        <el-table-column prop="owned_by" :label="t('providers.table.ownedBy')" width="175" sortable />
        <el-table-column :label="t('providers.table.action')" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              :content="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? t('providers.removeModelTooltip') : t('providers.addModelTooltip')"
              placement="top">
              <el-button
                :type="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? 'danger' : 'success'"
                :icon="selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id) ? Remove : CirclePlus"
                circle size="small" class="circle-action-btn"
                @click="get_model_function(!(selectedProvider && selectedProvider.modelList && selectedProvider.modelList.includes(scope.row.id)), scope.row.id)" />
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="getModel_page = false">{{ t('common.close') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <teleport to="body">
      <div v-if="contextMenuVisible" class="provider-context-menu" :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }">
        <div class="context-menu-item" @click="handleContextMenuRename">
          <el-icon class="context-menu-icon"><Edit /></el-icon>
          <span>{{ t('providers.rename') }}</span>
        </div>
        <div class="context-menu-item context-menu-item-danger" @click="handleContextMenuDelete">
          <el-icon class="context-menu-icon"><Delete /></el-icon>
          <span>{{ t('providers.delete') }}</span>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.providers-page-container {
  height: 100%;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  background-color: var(--bg-primary);
  display: flex;
}

.providers-content-wrapper {
  flex-grow: 1;
  width: 100%;
  background-color: transparent;
  overflow: hidden;
  display: flex;
  padding: 0px 20px 0 20px;
  gap: 20px;
}

.providers-content-wrapper>.el-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-primary);
  overflow: hidden;
}

.providers-aside {
  background-color: transparent;
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.provider-list-scrollbar {
  flex-grow: 1;
  padding: 8px;
}

.no-providers {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  cursor: grab;
  transition: background-color 0.2s, color 0.2s;
  font-size: 14px;
  color: var(--text-primary) !important;
}

.provider-item:active {
  cursor: grabbing;
}

.provider-item-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
  margin-right: 8px;
  font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}

.provider-item:hover {
  background-color: var(--bg-tertiary);
}

.provider-item.active {
  background-color: var(--bg-accent-light);
  color: var(--text-accent);
}

.provider-item.disabled .provider-item-name {
  color: var(--text-tertiary);
}

.provider-status-wrapper {
  perspective: 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.provider-status-tag {
  min-width: 40px;
  width: 40px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  padding: 0 8px;
  transform-style: preserve-3d;
  backface-visibility: hidden;
}

.status-flip-enter-active {
  animation: flipIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-flip-leave-active {
  animation: flipOut 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes flipIn {
  0% {
    transform: rotateY(-90deg);
    opacity: 0;
  }
  100% {
    transform: rotateY(0deg);
    opacity: 1;
  }
}

@keyframes flipOut {
  0% {
    transform: rotateY(0deg);
    opacity: 1;
  }
  100% {
    transform: rotateY(90deg);
    opacity: 0;
  }
}

.provider-status-tag.el-tag--primary {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
  color: var(--text-on-accent);
}

.provider-status-tag.el-tag--info {
  background-color: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-secondary);
}

.aside-actions {
  padding: 12px;
  display: flex;
}

.add-provider-btn {
  width: 100%;
  height: 34px;
  min-height: 34px;
  background-color: var(--bg-accent);
  color: var(--text-on-accent);
  border: none;
  font-weight: 500;
}

.add-provider-btn:hover {
  opacity: 0.9;
  background-color: var(--bg-accent);
}

.provider-main-content {
  padding: 0;
  background-color: var(--bg-secondary);
  height: 100%;
}

.provider-details-scrollbar {
  height: 100%;
}

.provider-details-scrollbar :deep(.el-scrollbar__view) {
  height: 100%;
  display: flex;
  flex-direction: column;
}


.provider-details {
  padding: 0px 30px 0px 30px;
  flex-grow: 1;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 15px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-primary);
}

.provider-title-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.provider-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.provider-name .edit-icon {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 16px;
  opacity: 0;
  transition: opacity 0.2s;
}

.provider-name:hover .edit-icon {
  opacity: 1;
}

.header-buttons {
  display: flex;
  gap: 8px;
}

.provider-form {
  margin-top: 20px !important;
}

.provider-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-secondary);
}

.form-item-description {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
  line-height: 1.4;
}

.models-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.no-models-message {
  width: 100%;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 20px 0;
  background-color: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-primary);
}

.model-tag {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  font-weight: 500;
  border-radius: var(--radius-md);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  box-sizing: border-box;
  cursor: move;
}

.model-name {
  flex: 1;
}

.model-remove-icon {
  color: var(--text-secondary);
  padding: 4px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.model-remove-icon:hover {
  color: var(--color-danger, #ef4444);
  background-color: var(--bg-tertiary);
}

/* Provider list drag & drop */
.provider-drag-ghost {
  opacity: 0 !important;
  transition: none !important;
}

:global(.provider-drag-fallback) {
  opacity: 1 !important;
  background-color: var(--bg-accent-light) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.12),
              0 2px 6px -1px rgba(0, 0, 0, 0.05) !important;
  z-index: 9999 !important;
  transition: box-shadow 0.2s ease !important;
}

:global(html.dark .provider-drag-fallback) {
  background-color: var(--bg-accent-light) !important;
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.5),
              0 2px 6px -1px rgba(0, 0, 0, 0.25) !important;
}

.draggable-models-list .model-tag {
  cursor: move;
}

.draggable-models-list .sortable-ghost {
  opacity: 0.5;
  background-color: var(--bg-accent-light);
  border: 1px dashed var(--border-accent);
}

.empty-state-main {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--bg-accent);
  border-color: var(--bg-accent);
}

:deep(.el-switch .el-switch__core) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-switch .el-switch__action) {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-table__header-wrapper th) {
  background-color: var(--bg-primary) !important;
  font-weight: 500;
  color: var(--text-secondary);
}

:deep(.el-table tr),
:deep(.el-table) {
  background-color: var(--bg-secondary);
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background-color: var(--bg-primary);
}

:deep(.el-table td.el-table__cell),
:deep(.el-table th.el-table__cell.is-leaf) {
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-primary);
}

:deep(.el-table--border .el-table__cell) {
  border-right: 1px solid var(--border-primary);
}

:deep(.el-table--border::after),
:deep(.el-table--border::before) {
  background-color: var(--border-primary);
}

:deep(.el-dialog__header) {
  padding: 5px !important;
}

:deep(.el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.available-models-dialog .dialog-search-input) {
  margin-bottom: 0 !important;
}

:deep(.available-models-dialog .dialog-error-alert) {
  margin-bottom: 15px !important;
}

:deep(.el-dialog__footer) {
  padding: 5px;
}

.label-with-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.api-key-count-badge {
  position: absolute;
  top: -8px;
  right: -12px;
  background-color: var(--bg-accent);
  color: #000000;
  height: 16px;
  min-width: 16px;
  line-height: 16px;
  padding: 0 4px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.form-item-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 2px;
  padding-left: 85px;

}

.form-item-header .form-item-description {
  margin-top: 0;
}

.provider-form {
  margin-top: 20px;
}

.provider-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.models-actions-row {
  display: flex;
  gap: 10px;
}

.models-list-wrapper {
  margin-bottom: 18px;
}

.provider-context-menu {
  position: fixed;
  z-index: 9999;
  border-radius: var(--radius-lg) !important;
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent) !important;
  box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-primary) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden !important;
  padding: 6px !important;
  min-width: 160px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  font-size: 14px;
  color: var(--text-primary);
  border-radius: var(--radius-md);
}

html.dark .context-menu-item:hover {
  background-color: #3d3d3d !important;
}

html:not(.dark) .context-menu-item:hover {
  background-color: var(--bg-tertiary);
}

.context-menu-item-danger:hover {
  color: #ef4444;
}

.context-menu-icon {
  width: 16px;
  height: 16px;
}
</style>
