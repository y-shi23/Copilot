<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { ElTooltip, ElIcon, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus';
import { __iconNode as downloadIconNode } from 'lucide-react/dist/esm/icons/download.js';
import { __iconNode as maximize2IconNode } from 'lucide-react/dist/esm/icons/maximize-2.js';
import { __iconNode as xIconNode } from 'lucide-react/dist/esm/icons/x.js';
import { __iconNode as minusIconNode } from 'lucide-react/dist/esm/icons/minus.js';
import { __iconNode as menuIconNode } from 'lucide-react/dist/esm/icons/menu.js';
import { __iconNode as checkIconNode } from 'lucide-react/dist/esm/icons/check.js';
import { __iconNode as lockIconNode } from 'lucide-react/dist/esm/icons/lock.js';
import { __iconNode as circleIconNode } from 'lucide-react/dist/esm/icons/circle.js';
import { __iconNode as pinIconNode } from 'lucide-react/dist/esm/icons/pin.js';
import { __iconNode as pinOffIconNode } from 'lucide-react/dist/esm/icons/pin-off.js';
import LucideIcon from './LucideIcon.vue';

const props = defineProps({
  favicon: String,
  promptName: String, 
  conversationName: String,
  isAlwaysOnTop: Boolean,
  autoCloseOnBlur: Boolean,
  isDarkMode: Boolean,
  os: { type: String, default: 'win' }
});

const emit = defineEmits([
  'save-window-size',
  'save-session',
  'toggle-pin',
  'toggle-always-on-top',
  'minimize',
  'maximize',
  'close'
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
      <!-- macOS 红绿灯 -->
      <div v-if="isMac" class="window-controls mac-traffic-lights no-drag">
        <div class="traffic-btn close" @click="emit('close')">
          <el-icon class="traffic-icon"><LucideIcon :icon-node="xIconNode" :size="8" /></el-icon>
        </div>
        <div class="traffic-btn minimize" @click="emit('minimize')">
          <el-icon class="traffic-icon icon-minus"><LucideIcon :icon-node="minusIconNode" :size="8" /></el-icon>
        </div>
        <div class="traffic-btn maximize" @click="emit('maximize')">
          <el-icon class="traffic-icon icon-fullscreen"><LucideIcon :icon-node="maximize2IconNode" :size="8" /></el-icon>
        </div>
      </div>

      <!-- App 信息 (始终显示) -->
      <div class="app-info no-drag" @click="emit('save-window-size')" @dblclick.stop="emit('maximize')">
        <el-tooltip content="点击保存当前窗口大小与位置 / 双击全屏" placement="bottom" :show-after="500">
          <div class="app-info-inner">
            <img :src="favicon" class="app-logo" alt="Logo">
            <span class="app-title">{{ promptName || 'Anywhere' }}</span>
          </div>
        </el-tooltip>
      </div>

      <!-- 分隔线 (仅在宽模式显示) -->
      <div class="divider-vertical" v-if="!isNarrow"></div>

      <!-- 对话名称 (仅在宽模式显示) -->
      <div v-if="!isNarrow" class="conversation-info no-drag" @click="emit('save-session')" @dblclick.stop="emit('maximize')">
        <el-tooltip content="点击保存会话" placement="bottom" :show-after="500">
          <div class="conversation-inner">
            <span class="conversation-title">{{ displayConversationName }}</span>
            <el-icon class="download-icon"><LucideIcon :icon-node="downloadIconNode" :size="13" /></el-icon>
          </div>
        </el-tooltip>
      </div>
    </div>

    <!-- 2. 右侧区域 -->
    <div class="right-container">
      
      <!-- A. 宽屏模式：显示功能按钮组 -->
      <div v-if="!isNarrow" class="function-group no-drag">
        <el-tooltip :content="autoCloseOnBlur ? '失焦自动关闭: 开' : '失焦自动关闭: 关'" placement="bottom" :show-after="500">
          <div class="func-btn" @click="emit('toggle-pin')" :class="{ 'active': !autoCloseOnBlur }">
             <LucideIcon v-if="!autoCloseOnBlur" :icon-node="lockIconNode" :size="16" />
             <LucideIcon v-else :icon-node="circleIconNode" :size="16" />
          </div>
        </el-tooltip>

        <el-tooltip :content="isAlwaysOnTop ? '取消置顶' : '置顶窗口'" placement="bottom" :show-after="500">
          <div class="func-btn" @click="emit('toggle-always-on-top')" :class="{ 'active': isAlwaysOnTop }">
            <LucideIcon v-if="isAlwaysOnTop" :icon-node="pinIconNode" :size="16" />
            <LucideIcon v-else :icon-node="pinOffIconNode" :size="16" />
          </div>
        </el-tooltip>
      </div>

      <!-- B. 窄屏模式：显示下拉菜单 -->
      <div v-else class="function-group no-drag">
        <el-dropdown trigger="click" placement="bottom-end" popper-class="title-bar-dropdown">
          <div class="func-btn" title="更多选项">
            <el-icon><LucideIcon :icon-node="menuIconNode" :size="16" /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <!-- 1. 保存/重命名会话 -->
              <el-dropdown-item @click="emit('save-session')">
                <el-icon><LucideIcon :icon-node="downloadIconNode" :size="16" /></el-icon>
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
                  <el-icon v-if="autoCloseOnBlur" class="check-icon"><LucideIcon :icon-node="checkIconNode" :size="14" /></el-icon>
                </div>
              </el-dropdown-item>

              <!-- 3. 置顶开关 -->
              <el-dropdown-item @click="emit('toggle-always-on-top')">
                <div class="dropdown-check-row">
                  <div class="dropdown-text-col">
                    <span>窗口置顶</span>
                  </div>
                  <el-icon v-if="isAlwaysOnTop" class="check-icon"><LucideIcon :icon-node="checkIconNode" :size="14" /></el-icon>
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
          <el-icon><LucideIcon :icon-node="minusIconNode" :size="14" /></el-icon>
        </div>
        <div class="win-btn maximize" @click="emit('maximize')" title="最大化">
          <el-icon><LucideIcon :icon-node="maximize2IconNode" :size="14" /></el-icon>
        </div>
        <div class="win-btn close" @click="emit('close')" title="关闭">
          <el-icon><LucideIcon :icon-node="xIconNode" :size="14" /></el-icon>
        </div>
      </div>

      <!-- Linux 窗口控制 -->
      <div v-if="isLinux" class="window-controls linux-controls no-drag">
        <div class="linux-btn minimize" @click="emit('minimize')">
          <el-icon><LucideIcon :icon-node="minusIconNode" :size="14" /></el-icon>
        </div>
        <div class="linux-btn maximize" @click="emit('maximize')">
          <el-icon><LucideIcon :icon-node="maximize2IconNode" :size="14" /></el-icon>
        </div>
        <div class="linux-btn close" @click="emit('close')">
          <el-icon><LucideIcon :icon-node="xIconNode" :size="14" /></el-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* 全局覆盖 Element Plus Dropdown 样式以适配主题 */
.title-bar-dropdown {
  --el-bg-color-overlay: var(--el-bg-color);
  --el-border-color-light: var(--el-border-color);
  --el-text-color-regular: var(--el-text-color-primary);
}

html.dark .title-bar-dropdown {
  background-color: #2c2c2c !important;
  border-color: #444 !important;
}

.title-bar-dropdown .el-dropdown-menu__item:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

html.dark .title-bar-dropdown .el-dropdown-menu__item:hover {
  background-color: #444;
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

.right-container {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  height: 100%;
  margin-left: auto;
}

/* App Info & Conversation Title */
.app-info-inner, .conversation-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 9px;
  border-radius: 10px;
  transition: background-color 0.18s ease;
  height: 26px;
}

.app-info-inner:hover, .conversation-inner:hover {
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
  background-color: #E81123;
  color: white;
}

/* ============ macOS 样式 ============ */
.mac-traffic-lights {
  display: flex;
  gap: 8px; 
  margin-right: 12px;
  align-items: center;
  height: 100%;
  padding-left: 2px;
}

.traffic-btn {
  width: 13px; /* 微调尺寸 */
  height: 13px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
  
  transform-origin: center center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}

.traffic-btn.close { background-color: #FF5F57; border: 0.5px solid #E0443E; }
.traffic-btn.minimize { background-color: #FFBD2E; border: 0.5px solid #D69E2E; }
.traffic-btn.maximize { background-color: #28C840; border: 0.5px solid #1C9A29; }

.mac-traffic-lights:hover .traffic-btn {
  transform: scale(1.1); 
}

.mac-traffic-lights:hover .traffic-icon {
  opacity: 1;
  color: rgba(0, 0, 0, 0.6);
}

.traffic-btn:active {
  transform: scale(0.95) !important;
  filter: brightness(0.9);
}

.traffic-icon {
  font-size: 7px; 
  color: rgba(0, 0, 0, 0.6);
  opacity: 0; 
  transition: opacity 0.2s ease, color 0.1s ease;
}

.traffic-icon :deep(.lucide) {
  width: 8px;
  height: 8px;
  stroke: currentColor;
  stroke-width: 2.2;
}

.icon-minus :deep(.lucide) { stroke-width: 2.6; }
.icon-fullscreen :deep(.lucide) { stroke-width: 2; }

.dark-mode .traffic-btn {
  border: none;
  box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.1);
}
.dark-mode .traffic-icon {
  color: rgba(0, 0, 0, 0.7);
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
  background-color: #E95420;
  color: white;
}
</style>
