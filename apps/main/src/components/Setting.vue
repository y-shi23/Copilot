<script setup lang="ts">
// -nocheck
import { ref, onMounted, computed, inject, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { Upload, Download, Plus, Link, Unlink } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';

const { t, locale } = useI18n();

const currentConfig = inject('config');
const selectedLanguage = ref(locale.value);

const storageHealth = ref({
  mode: 'sqlite-only',
  postgresConfigured: false,
  postgresConnected: false,
  postgresTarget: '',
  queueSize: 0,
  lastSyncAt: '',
  lastError: '',
});
const isTestingPostgres = ref(false);
const isSyncingStorage = ref(false);
let storageHealthTimer = null;

onMounted(() => {
  selectedLanguage.value = locale.value;
  if (currentConfig.value) {
    currentConfig.value.database = currentConfig.value.database || { postgresUrl: '' };
  }
  refreshStorageHealth();
  storageHealthTimer = window.setInterval(() => {
    refreshStorageHealth();
  }, 10000);
});

onBeforeUnmount(() => {
  if (storageHealthTimer) {
    clearInterval(storageHealthTimer);
    storageHealthTimer = null;
  }
});

// 新的、更精确的保存函数
async function saveSingleSetting(keyPath, value) {
  try {
    if (window.api && window.api.saveSetting) {
      // 调用 preload 暴露的新 API，只传递变更
      const result = await window.api.saveSetting(keyPath, value);
      if (result && result.success === false) {
        throw new Error(result.message || `Failed to save ${keyPath}`);
      }
      return true;
    } else {
      console.warn('window.api.saveSetting is not available.');
      return false;
    }
  } catch (error) {
    console.error(`Error saving setting for ${keyPath}:`, error);
    ElMessage.error(`${t('setting.alerts.saveFailedPrefix')} ${keyPath}`);
    return false;
  }
}

async function refreshStorageHealth() {
  if (!window.api?.getStorageHealth) return;
  try {
    const next = await window.api.getStorageHealth();
    if (next && typeof next === 'object') {
      storageHealth.value = {
        ...storageHealth.value,
        ...next,
      };
    }
  } catch (error) {
    console.error('Failed to fetch storage health:', error);
  }
}

const storageStatusText = computed(() => {
  if (!storageHealth.value.postgresConfigured) {
    return '未配置 Postgres，当前使用 SQLite';
  }
  if (storageHealth.value.postgresConnected) {
    return `Postgres 在线${storageHealth.value.postgresTarget ? ` (${storageHealth.value.postgresTarget})` : ''}`;
  }
  return 'Postgres 离线，正在使用 SQLite 缓存并等待补写';
});

async function savePostgresUrl(url) {
  if (!currentConfig.value) return;
  const normalized = String(url || '').trim();
  currentConfig.value.database = currentConfig.value.database || { postgresUrl: '' };
  currentConfig.value.database.postgresUrl = normalized;
  const ok = await saveSingleSetting('database.postgresUrl', normalized);
  if (!ok) return;
  await refreshStorageHealth();
}

async function testPostgresConnection() {
  const postgresUrl = String(currentConfig.value?.database?.postgresUrl || '').trim();
  if (!postgresUrl) {
    ElMessage.warning('请先填写 Postgres 连接串');
    return;
  }
  if (!window.api?.testPostgresConnection) return;

  isTestingPostgres.value = true;
  try {
    const result = await window.api.testPostgresConnection(postgresUrl);
    if (result?.ok) {
      ElMessage.success('连接测试成功');
    } else {
      ElMessage.error(`连接测试失败: ${result?.error || 'Unknown error'}`);
    }
  } catch (error: any) {
    ElMessage.error(`连接测试失败: ${error?.message || error}`);
  } finally {
    isTestingPostgres.value = false;
    await refreshStorageHealth();
  }
}

async function triggerStorageSync() {
  if (!window.api?.triggerStorageSync) return;
  isSyncingStorage.value = true;
  try {
    const result = await window.api.triggerStorageSync();
    if (result?.ok === false) {
      ElMessage.warning(`同步未完成: ${result?.error || 'Unknown error'}`);
    } else {
      ElMessage.success('已触发同步');
    }
  } catch (error: any) {
    ElMessage.error(`触发同步失败: ${error?.message || error}`);
  } finally {
    isSyncingStorage.value = false;
    await refreshStorageHealth();
  }
}

//  保存整个配置的函数，仅用于语音列表等复杂操作
async function saveFullConfig() {
  if (!currentConfig.value) return;
  try {
    const configToSave = { config: JSON.parse(JSON.stringify(currentConfig.value)) };
    // 注意：这里我们仍然使用旧的保存方式，因为它适用于整个列表的修改
    // 更好的做法是也为列表创建增删改的原子操作，但为了节省工作量，这里暂时保留
    if (window.api && window.api.updateConfigWithoutFeatures) {
      await window.api.updateConfigWithoutFeatures(configToSave);
    } else {
      console.warn('window.api.updateConfigWithoutFeatures is not available.');
    }
  } catch (error) {
    console.error('Error saving settings config:', error);
  }
}

function handleLanguageChange(lang) {
  locale.value = lang;
  localStorage.setItem('language', lang);
  selectedLanguage.value = lang;
  // 语言设置不属于config，所以不需要保存到utools数据库
}

// --- 全局开关处理函数 ---
async function handleGlobalToggleChange(key, value) {
  if (!currentConfig.value || !currentConfig.value.prompts) return;

  // 1. 更新全局开关自身的状态
  if (key === 'isAlwaysOnTop') {
    currentConfig.value.isAlwaysOnTop_global = value;
  } else if (key === 'autoCloseOnBlur') {
    currentConfig.value.autoCloseOnBlur_global = value;
  } else if (key === 'autoSaveChat') {
    currentConfig.value.autoSaveChat_global = value;
  }

  // 2. 批量更新所有快捷助手的对应设置
  Object.keys(currentConfig.value.prompts).forEach((promptKey) => {
    const prompt = currentConfig.value.prompts[promptKey];
    if (prompt) {
      // 这里的 key 分别对应 prompts 对象中的属性名：
      // 'isAlwaysOnTop', 'autoCloseOnBlur', 'autoSaveChat'
      prompt[key] = value;
    }
  });

  // 3. 保存整个更新后的配置
  await saveFullConfig();
  ElMessage.success(t('setting.alerts.saveSuccess'));
}

async function exportConfig() {
  if (!currentConfig.value) return;
  try {
    // 创建配置的深拷贝以进行修改，不影响当前应用的配置
    const configToExport = JSON.parse(JSON.stringify(currentConfig.value));

    // 在导出前移除 Skill 路径 (不同设备路径不同)
    if (configToExport.skillPath !== undefined) {
      delete configToExport.skillPath;
    }

    const jsonString = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Sanft_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Configuration exported successfully.');
  } catch (error) {
    console.error('Error exporting config:', error);
  }
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // 保存当前的 Skill 路径
          const currentSkillPath = currentConfig.value.skillPath;

          const importedData = JSON.parse(e.target.result);
          if (typeof importedData !== 'object' || importedData === null) {
            throw new Error('Imported file is not a valid configuration object.');
          }

          // 将保存的 Skill 路径写回
          if (currentSkillPath) {
            importedData.skillPath = currentSkillPath;
          }

          if (window.api && window.api.updateConfig) {
            await window.api.updateConfig({ config: importedData });
            const result = await window.api.getConfig();
            if (result && result.config) {
              currentConfig.value = result.config;
            }
            await refreshStorageHealth();
          }
          console.log('Configuration imported and replaced successfully.');
          ElMessage.success(t('setting.alerts.importSuccess'));
        } catch (err) {
          console.error('Error importing configuration:', err);
          ElMessage.error(t('setting.alerts.importFailed'));
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

async function handleThemeChange(mode) {
  if (!currentConfig.value) return;

  // 1. 保存用户选择的模式
  await saveSingleSetting('themeMode', mode);

  // 2. 计算实际的布尔值
  let newIsDarkMode = currentConfig.value.isDarkMode;

  if (mode === 'system') {
    // 检测系统当前主题
    newIsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else if (mode === 'dark') {
    newIsDarkMode = true;
  } else {
    newIsDarkMode = false;
  }

  // 3. 更新本地状态并保存布尔值（为了兼容旧逻辑和其他窗口）
  currentConfig.value.isDarkMode = newIsDarkMode;
  await saveSingleSetting('isDarkMode', newIsDarkMode);
}

async function handleLauncherHotkeyChange(value) {
  if (!currentConfig.value) return;
  const normalized = (value || '').trim() || 'CommandOrControl+Shift+Space';
  currentConfig.value.launcherHotkey = normalized;
  const saved = await saveSingleSetting('launcherHotkey', normalized);
  if (!saved) {
    currentConfig.value.launcherHotkey = 'CommandOrControl+Shift+Space';
  }
}

// --- Voice Management (使用 saveFullConfig 因为它修改的是一个数组) ---
const addNewVoice = () => {
  ElMessageBox.prompt(t('setting.voice.addPromptMessage'), t('setting.voice.addPromptTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValidator: (value) => {
      if (!value || value.trim() === '') return t('setting.voice.addFailEmpty');
      if (currentConfig.value.voiceList.includes(value.trim()))
        return t('setting.voice.addFailExists');
      return true;
    },
  })
    .then(({ value }) => {
      const newVoice = value.trim();
      if (!currentConfig.value.voiceList) {
        currentConfig.value.voiceList = [];
      }
      currentConfig.value.voiceList.push(newVoice);
      saveFullConfig();
      ElMessage.success(t('setting.voice.addSuccess'));
    })
    .catch(() => {});
};

const editVoice = (oldVoice) => {
  ElMessageBox.prompt(t('setting.voice.editPromptMessage'), t('setting.voice.editPromptTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    inputValue: oldVoice,
    inputValidator: (value) => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return t('setting.voice.addFailEmpty');
      if (trimmedValue !== oldVoice && currentConfig.value.voiceList.includes(trimmedValue)) {
        return t('setting.voice.addFailExists');
      }
      return true;
    },
  })
    .then(({ value }) => {
      const newVoice = value.trim();
      if (newVoice === oldVoice) return;
      const index = currentConfig.value.voiceList.indexOf(oldVoice);
      if (index > -1) {
        currentConfig.value.voiceList[index] = newVoice;
        Object.values(currentConfig.value.prompts).forEach((prompt) => {
          if (prompt.voice === oldVoice) {
            prompt.voice = newVoice;
          }
        });
        saveFullConfig();
        ElMessage.success(t('setting.voice.editSuccess'));
      }
    })
    .catch(() => {});
};

const deleteVoice = (voiceToDelete) => {
  const index = currentConfig.value.voiceList.indexOf(voiceToDelete);
  if (index > -1) {
    currentConfig.value.voiceList.splice(index, 1);
    Object.values(currentConfig.value.prompts).forEach((prompt) => {
      if (prompt.voice === voiceToDelete) {
        prompt.voice = null;
      }
    });
    saveFullConfig();
  }
};
</script>

<template>
  <div class="settings-page-container">
    <el-scrollbar class="settings-scrollbar-wrapper">
      <div class="settings-content">
        <!-- 通用设置 -->
        <section class="settings-section">
          <h2 class="section-title">{{ t('setting.title') }}</h2>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.language.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.language.selectPlaceholder')
              }}</span>
            </div>
            <el-select
              v-model="selectedLanguage"
              @change="handleLanguageChange"
              size="default"
              style="width: 120px"
              class="setting-inline-select"
              popper-class="settings-select-popper"
            >
              <el-option :label="t('setting.language.chinese')" value="zh"></el-option>
              <el-option :label="t('setting.language.english')" value="en"></el-option>
              <el-option :label="t('setting.language.japanese')" value="ja"></el-option>
              <el-option :label="t('setting.language.russian')" value="ru"></el-option>
            </el-select>
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.darkMode.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.darkMode.description')
              }}</span>
            </div>
            <el-select
              v-model="currentConfig.themeMode"
              @change="handleThemeChange"
              size="default"
              style="width: 120px"
              class="setting-inline-select"
              popper-class="settings-select-popper"
            >
              <el-option :label="t('setting.darkMode.system')" value="system"></el-option>
              <el-option :label="t('setting.darkMode.light')" value="light"></el-option>
              <el-option :label="t('setting.darkMode.dark')" value="dark"></el-option>
            </el-select>
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{
                t('setting.isAlwaysOnTop_global.label')
              }}</span>
              <span class="setting-option-description">{{
                t('setting.isAlwaysOnTop_global.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.isAlwaysOnTop_global"
              @change="(value) => handleGlobalToggleChange('isAlwaysOnTop', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{
                t('setting.autoCloseOnBlur_global.label')
              }}</span>
              <span class="setting-option-description">{{
                t('setting.autoCloseOnBlur_global.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.autoCloseOnBlur_global"
              @change="(value) => handleGlobalToggleChange('autoCloseOnBlur', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.autoSaveChat_global.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.autoSaveChat_global.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.autoSaveChat_global"
              @change="(value) => handleGlobalToggleChange('autoSaveChat', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.skipLineBreak.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.skipLineBreak.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.skipLineBreak"
              @change="(value) => saveSingleSetting('skipLineBreak', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.ctrlEnter.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.ctrlEnter.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.CtrlEnterToSend"
              @change="(value) => saveSingleSetting('CtrlEnterToSend', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.notification.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.notification.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.showNotification"
              @change="(value) => saveSingleSetting('showNotification', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.fixPosition.label') }}</span>
              <span class="setting-option-description">{{
                t('setting.fixPosition.description')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.fix_position"
              @change="(value) => saveSingleSetting('fix_position', value)"
            />
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.launcher.enabledLabel') }}</span>
              <span class="setting-option-description">{{
                t('setting.launcher.enabledDescription')
              }}</span>
            </div>
            <el-switch
              v-model="currentConfig.launcherEnabled"
              @change="(value) => saveSingleSetting('launcherEnabled', value)"
            />
          </div>
          <div class="setting-option-item no-border">
            <div class="setting-text-content">
              <span class="setting-option-label">{{ t('setting.launcher.hotkeyLabel') }}</span>
              <span class="setting-option-description">{{
                t('setting.launcher.hotkeyDescription')
              }}</span>
            </div>
            <el-input
              v-model="currentConfig.launcherHotkey"
              :disabled="!currentConfig.launcherEnabled"
              :placeholder="t('setting.launcher.hotkeyPlaceholder')"
              style="width: 320px"
              @change="handleLauncherHotkeyChange"
            />
          </div>
        </section>

        <!-- [MODIFIED] 语音设置 -->
        <section class="settings-section">
          <div class="section-title section-title-inline">
            <el-tooltip :content="t('setting.voice.description')" placement="top">
              <span>{{ t('setting.voice.title') }}</span>
            </el-tooltip>
          </div>
          <div class="voice-list-container">
            <el-tag
              v-for="voice in currentConfig.voiceList"
              :key="voice"
              closable
              @click="editVoice(voice)"
              @close="deleteVoice(voice)"
              class="voice-tag"
              size="large"
            >
              {{ voice }}
            </el-tag>
            <el-button
              class="add-voice-button"
              type="primary"
              plain
              :icon="Plus"
              @click="addNewVoice"
            >
              {{ t('setting.voice.add') }}
            </el-button>
          </div>
        </section>

        <!-- 数据管理 -->
        <section class="settings-section">
          <h2 class="section-title">{{ t('setting.dataManagement.title') }}</h2>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{
                t('setting.dataManagement.exportLabel')
              }}</span>
              <span class="setting-option-description">{{
                t('setting.dataManagement.exportDesc')
              }}</span>
            </div>
            <el-button @click="exportConfig" :icon="Download" size="default" plain>{{
              t('setting.dataManagement.exportButton')
            }}</el-button>
          </div>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">{{
                t('setting.dataManagement.importLabel')
              }}</span>
              <span class="setting-option-description">{{
                t('setting.dataManagement.importDesc')
              }}</span>
            </div>
            <el-button @click="importConfig" :icon="Upload" size="default" plain>{{
              t('setting.dataManagement.importButton')
            }}</el-button>
          </div>
        </section>

        <!-- Database -->
        <section class="settings-section">
          <h2 class="section-title">数据库</h2>
          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">Postgres 连接串</span>
              <span class="setting-option-description"
                >未配置时仅使用本地 SQLite。配置后自动同步到 Postgres（支持 postgres:// 与
                postgresql://）。</span
              >
            </div>
            <el-input
              :model-value="currentConfig.database?.postgresUrl || ''"
              @update:model-value="
                (value) => {
                  currentConfig.database = currentConfig.database || { postgresUrl: '' };
                  currentConfig.database.postgresUrl = value;
                }
              "
              @change="savePostgresUrl"
              placeholder="postgresql://postgres:YOUR_PASSWORD@YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
              style="width: 520px; max-width: 100%"
              clearable
            />
          </div>

          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">连接状态</span>
              <span class="setting-option-description">{{ storageStatusText }}</span>
            </div>
            <div class="db-status-inline">
              <span class="db-status-icon" :class="{ online: storageHealth.postgresConnected }">
                <Link
                  v-if="storageHealth.postgresConfigured && storageHealth.postgresConnected"
                  :size="16"
                />
                <Unlink v-else :size="16" />
              </span>
              <span class="db-status-meta">队列: {{ storageHealth.queueSize }}</span>
            </div>
          </div>

          <div class="setting-option-item">
            <div class="setting-text-content">
              <span class="setting-option-label">同步诊断</span>
              <span class="setting-option-description"
                >连接测试与手动触发补写。若离线，将继续缓存并后台重试。</span
              >
            </div>
            <div class="db-actions">
              <el-button :loading="isTestingPostgres" @click="testPostgresConnection"
                >测试连接</el-button
              >
              <el-button
                type="primary"
                plain
                :loading="isSyncingStorage"
                @click="triggerStorageSync"
                >立即同步</el-button
              >
            </div>
          </div>

          <div v-if="storageHealth.lastError" class="setting-option-item no-border">
            <div class="setting-text-content">
              <span class="setting-option-label">最近错误</span>
              <span class="setting-option-description error-text">{{
                storageHealth.lastError
              }}</span>
            </div>
          </div>
        </section>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
/* [MODIFIED] Voice settings styles */
.voice-list-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 15px 0;
}

.voice-tag {
  font-size: 14px;
  height: 32px;
  padding: 0 12px;
  cursor: pointer;
  transition:
    transform 0.2s ease-in-out,
    filter 0.2s ease-in-out;
}

.voice-tag:hover {
  transform: scale(1.05);
  filter: brightness(1.2);
}

.add-voice-button {
  border-style: dashed;
}

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

.settings-section + .settings-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-primary);
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
}

.setting-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  gap: 20px;
  flex-wrap: wrap;
}

.setting-option-item + .setting-option-item {
  margin-top: 2px;
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

.el-switch {
  --el-switch-on-color: var(--bg-accent);
  flex-shrink: 0;
}

.el-select,
.el-button,
.el-input-number {
  flex-shrink: 0;
}

:deep(.setting-inline-select .el-select__wrapper) {
  border-radius: var(--radius-lg);
}

:deep(.el-form-item__label) {
  line-height: 1.5;
  color: var(--text-secondary);
  font-weight: 500;
}

.action-buttons-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
}

.action-buttons-container .el-divider--vertical {
  height: 1em;
  border-left: 1px solid var(--border-primary);
  margin: 0 8px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-center {
  flex-grow: 1;
  display: flex;
  justify-content: center;
}

:deep(.el-pagination.is-background .el-pager li),
:deep(.el-pagination.is-background .btn-prev),
:deep(.el-pagination.is-background .btn-next) {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

:deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
  background-color: var(--bg-accent);
  color: var(--text-on-accent);
}

:deep(.el-table__header-wrapper th) {
  background-color: var(--bg-primary) !important;
  color: var(--text-secondary);
  font-weight: 600;
}

:deep(.el-table),
:deep(.el-table tr) {
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

:deep(.backup-manager-dialog .el-dialog__header) {
  padding: 5px !important;
}

:deep(.backup-manager-dialog .el-dialog__body) {
  padding: 15px 20px 10px 20px !important;
}

:deep(.backup-manager-dialog .el-dialog__footer) {
  padding: 5px;
}

.path-input-wrapper {
  display: flex;
  align-items: center;
  width: 320px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 9999px;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.path-input-wrapper:focus-within {
  border-color: var(--bg-accent);
  box-shadow: 0 0 0 2px rgba(51, 156, 255, 0.15);
}

.path-input {
  flex: 1;
  min-width: 0;
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: none;
}

.path-input::placeholder {
  color: var(--text-tertiary);
}

.path-input-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 32px;
  margin-right: 4px;
  background: transparent;
  border: none;
  border-radius: 9999px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.path-input-btn:hover {
  background-color: var(--bg-tertiary);
  color: var(--bg-accent);
}

.db-status-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.db-status-icon {
  display: inline-flex;
  align-items: center;
  color: #d97706;
}

.db-status-icon.online {
  color: #15803d;
}

.db-status-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.db-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.error-text {
  color: #cf5c5c;
}
</style>
