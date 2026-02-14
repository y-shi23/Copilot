<script setup lang="ts">
// -nocheck
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { ElTooltip, ElIcon, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus';
import {
  Download,
  Maximize2,
  X,
  Minus,
  Menu,
  Check,
  Lock,
  LockOpen,
  Pin,
  PinOff,
} from 'lucide-vue-next';

const props = defineProps({
  favicon: String,
  promptName: String,
  conversationName: String,
  isAlwaysOnTop: Boolean,
  autoCloseOnBlur: Boolean,
  isDarkMode: Boolean,
  os: { type: String, default: 'win' },
});

const emit = defineEmits([
  'save-window-size',
  'save-session',
  'toggle-pin',
  'toggle-always-on-top',
  'minimize',
  'maximize',
  'close',
]);

const displayConversationName = computed(() => {
  return props.conversationName || '临时对话';
});

const isMac = computed(() => props.os === 'macos' || props.os === 'darwin');
const isWin = computed(() => props.os === 'win');
const isLinux = computed(() => !isMac.value && !isWin.value);

// --- 响应式布局逻辑 ---
const windowWidth = ref(window.innerWidth);
const isNarrow = computed(() => windowWidth.value < 400); // 阈值：小于520px时折叠

const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  <div class="title-bar" :class="[`os-${os}`, { 'dark-mode': isDarkMode }]">
    <!-- 1. 左侧区域 -->
    <div class="left-container">
      <!-- macOS 原生红绿灯占位，避免与左侧内容重叠 -->
      <div v-if="isMac" class="mac-native-controls-spacer" aria-hidden="true"></div>

      <!-- App 信息 (始终显示) -->
      <div
        class="app-info no-drag"
        @click="emit('save-window-size')"
        @dblclick.stop="emit('maximize')"
      >
        <el-tooltip
          content="点击保存当前窗口大小与位置 / 双击全屏"
          placement="bottom"
          :show-after="500"
        >
          <div class="app-info-inner">
            <img :src="favicon" class="app-logo" alt="Logo" />
            <span class="app-title">{{ promptName || 'Sanft' }}</span>
          </div>
        </el-tooltip>
      </div>

      <!-- 分隔线 (仅在宽模式显示) -->
      <div class="divider-vertical" v-if="!isNarrow"></div>

      <!-- 对话名称 (仅在宽模式显示) -->
      <div
        v-if="!isNarrow"
        class="conversation-info no-drag"
        @click="emit('save-session')"
        @dblclick.stop="emit('maximize')"
      >
        <el-tooltip content="点击保存会话" placement="bottom" :show-after="500">
          <div class="conversation-inner">
            <span class="conversation-title">{{ displayConversationName }}</span>
            <el-icon class="download-icon"><Download :size="13" /></el-icon>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- 2. 右侧区域 -->
    <div class="right-container">
      <!-- A. 宽屏模式：显示功能按钮组 -->
      <div v-if="!isNarrow" class="function-group no-drag">
        <el-tooltip
          :content="autoCloseOnBlur ? '失焦自动关闭: 开' : '失焦自动关闭: 关'"
          placement="bottom"
          :show-after="500"
        >
          <div class="func-btn" @click="emit('toggle-pin')" :class="{ active: !autoCloseOnBlur }">
            <Lock v-if="!autoCloseOnBlur" :size="16" />
            <LockOpen v-else :size="16" />
          </div>
        </el-tooltip>

        <el-tooltip
          :content="isAlwaysOnTop ? '取消置顶' : '置顶窗口'"
          placement="bottom"
          :show-after="500"
        >
          <div
            class="func-btn"
            @click="emit('toggle-always-on-top')"
            :class="{ active: isAlwaysOnTop }"
          >
            <Pin v-if="isAlwaysOnTop" :size="16" />
            <PinOff v-else :size="16" />
          </div>
        </el-tooltip>
      </div>

      <!-- B. 窄屏模式：显示下拉菜单 -->
      <div v-else class="function-group no-drag">
        <el-dropdown trigger="click" placement="bottom-end" popper-class="title-bar-dropdown">
          <div class="func-btn" title="更多选项">
            <el-icon><Menu :size="16" /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <!-- 1. 保存/重命名会话 -->
              <el-dropdown-item @click="emit('save-session')">
                <el-icon><Download :size="16" /></el-icon>
                <div class="dropdown-text-col">
                  <span>保存/重命名</span>
                  <span class="dropdown-subtext">{{ displayConversationName }}</span>
                </div>
              </el-dropdown-item>

              <!-- 2. 失焦关闭开关 -->
              <el-dropdown-item @click="emit('toggle-pin')">
                <div class="dropdown-check-row">
                  <div class="dropdown-text-col">
                    <span>失焦自动关闭</span>
                  </div>
                  <el-icon v-if="autoCloseOnBlur" class="check-icon"><Check :size="14" /></el-icon>
                </div>
              </el-dropdown-item>

              <!-- 3. 置顶开关 -->
              <el-dropdown-item @click="emit('toggle-always-on-top')">
                <div class="dropdown-check-row">
                  <div class="dropdown-text-col">
                    <span>窗口置顶</span>
                  </div>
                  <el-icon v-if="isAlwaysOnTop" class="check-icon"><Check :size="14" /></el-icon>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="divider-vertical" v-if="isWin"></div>

      <!-- Windows 窗口控制 -->
      <div v-if="isWin" class="window-controls win-controls no-drag">
        <div class="win-btn minimize" @click="emit('minimize')" title="最小化">
          <el-icon><Minus :size="14" /></el-icon>
        </div>
        <div class="win-btn maximize" @click="emit('maximize')" title="最大化">
          <el-icon><Maximize2 :size="14" /></el-icon>
        </div>
        <div class="win-btn close" @click="emit('close')" title="关闭">
          <el-icon><X :size="14" /></el-icon>
        </div>
      </div>

      <!-- Linux 窗口控制 -->
      <div v-if="isLinux" class="window-controls linux-controls no-drag">
        <div class="linux-btn minimize" @click="emit('minimize')">
          <el-icon><Minus :size="14" /></el-icon>
        </div>
        <div class="linux-btn maximize" @click="emit('maximize')">
          <el-icon><Maximize2 :size="14" /></el-icon>
        </div>
        <div class="linux-btn close" @click="emit('close')">
          <el-icon><X :size="14" /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.title-bar-dropdown {
  --el-bg-color-overlay: var(--el-bg-color);
  --el-border-color-light: var(--el-border-color);
  --el-text-color-regular: var(--el-text-color-primary);
}

html.dark .title-bar-dropdown {
  background-color: #2c2c2c !important;
  border-color: #444 !important;
}

.title-bar-dropdown .el-dropdown-menu__item {
  border-radius: 6px !important;
  margin: 0 !important;
  padding: 0 12px !important;
  height: 32px !important;
  line-height: 32px !important;
  display: flex !important;
  align-items: center !important;
  transition: background-color 0.15s ease !important;
}

.title-bar-dropdown .el-dropdown-menu__item + .el-dropdown-menu__item {
  margin-top: 2px !important;
}

.title-bar-dropdown .el-dropdown-menu__item:hover {
  background-color: #eeeeee !important;
  color: var(--el-text-color-primary) !important;
}

html.dark .title-bar-dropdown .el-dropdown-menu__item:hover {
  background-color: #444 !important;
  color: var(--el-text-color-primary) !important;
}
</style>

<style scoped>
.title-bar {
  height: 42px;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--el-bg-color);
  user-select: none;
  -webkit-app-region: drag;
  box-sizing: border-box;
  padding: 0 12px 0 14px;
  font-size: 12px;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
  z-index: 100;
  background-color: transparent;
}

.os-macos {
  padding-left: 14px;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.left-container {
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  gap: 7px;
  margin-right: 10px;
}

.mac-native-controls-spacer {
  width: 72px;
  min-width: 72px;
  height: 1px;
  flex-shrink: 0;
}

.right-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  height: 100%;
  margin-left: auto;
}

/* App Info & Conversation Title */
.app-info-inner,
.conversation-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 9px;
  border-radius: 10px;
  transition: background-color 0.18s ease;
  height: 26px;
}

.app-info-inner:hover,
.conversation-inner:hover {
  background-color: var(--el-fill-color-light);
}

.app-logo {
  width: 16px;
  height: 16px;
  display: block;
}

.app-title {
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  line-height: 1;
  padding-top: 2px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-inner {
  max-width: 100%;
}

.conversation-title {
  font-weight: 500;
  font-size: 12px;
  color: var(--el-text-color-regular);
  max-width: 90px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  padding-top: 2px;
}

.download-icon {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.divider-vertical {
  width: 1px;
  height: 16px;
  background-color: var(--el-border-color);
  flex-shrink: 0;
}

/* ============ 功能按钮 (Pin, Top) ============ */
.function-group {
  display: flex;
  gap: 2px;
  margin-right: 2px;
  align-items: center;
  height: 100%;
}

.func-btn {
  width: 34px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: default;
  color: var(--el-text-color-secondary);
  transition: all 0.16s ease;
  background-color: transparent;
}

.func-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.dark-mode .func-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.func-btn.active {
  color: var(--el-text-color-primary);
  font-weight: bold;
}

/* 下拉菜单内部样式 */
.dropdown-text-col {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.dropdown-subtext {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-check-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-width: 120px;
}

.check-icon {
  color: var(--el-color-primary);
  font-weight: bold;
}

/* ============ Windows 样式 ============ */
.win-controls {
  display: flex;
  gap: 2px;
  margin-right: 2px;
  align-items: center;
  height: 100%;
  margin-left: 4px;
}

.win-btn {
  width: 34px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition: all 0.16s ease;
  font-size: 12px;
}

.win-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.win-btn.close:hover {
  background-color: #e81123;
  color: white;
}

/* ============ Linux 样式 ============ */
.linux-controls {
  display: flex;
  gap: 3px;
  margin-right: 6px;
  align-items: center;
}

.linux-btn {
  width: 30px;
  height: 28px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-regular);
  background-color: transparent;
  transition: all 0.16s ease;
  font-size: 12px;
}

.linux-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  transform: none;
}

.linux-btn.close:hover {
  background-color: #e95420;
  color: white;
}
</style>
