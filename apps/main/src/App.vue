<script setup>
import { ref, watch, onMounted, provide, onBeforeUnmount, computed, h } from 'vue'
import Chats from './components/Chats.vue'
import Prompts from './components/Prompts.vue'
import Mcp from './components/Mcp.vue'
import Setting from './components/Setting.vue'
import Providers from './components/Providers.vue'
import Skills from './components/Skills.vue'

import { useI18n } from 'vue-i18n'
import {
  Bell,
  ChatDotRound,
  MagicStick,
  Collection,
  Cloudy,
  Setting as SettingIcon,
  Document
} from '@element-plus/icons-vue'
import { marked } from 'marked';
import { ElBadge } from 'element-plus'; // 确保引入 ElBadge

const { t, locale } = useI18n()
const tab = ref(0);
const header_text = ref(t('app.header.chats'));

const McpToolIcon = {
  name: 'McpToolIcon',
  render() {
    return h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      [
        h('path', { d: 'm15 12-8.373 8.373a1 1 0 1 1-3-3L12 9' }),
        h('path', { d: 'm18 15 4-4' }),
        h('path', { d: 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5' })
      ]
    );
  }
};

const navItems = computed(() => ([
  { id: 0, label: t('app.tabs.chats'), icon: ChatDotRound },
  { id: 1, label: t('app.tabs.prompts'), icon: MagicStick },
  { id: 2, label: t('app.tabs.mcp'), icon: McpToolIcon },
  { id: 3, label: t('app.tabs.skills'), icon: Collection },
  { id: 4, label: t('app.tabs.providers'), icon: Cloudy },
  { id: 5, label: t('app.tabs.settings'), icon: SettingIcon }
]));

const config = ref(null);
const platformName = String(navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
const isMacOS = computed(() => platformName.includes('mac'));

const SIDEBAR_WIDTH_STORAGE_KEY = 'anywhere_main_sidebar_width_v1';
const SIDEBAR_DEFAULT_WIDTH = 230;
const SIDEBAR_MIN_WIDTH = 230; // About 15% wider than the previous 220px fixed width.
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_MOBILE_BREAKPOINT = 700;
const SIDEBAR_KEYBOARD_STEP = 12;

const viewportWidth = ref(window.innerWidth || 1200);
const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH);
const isSidebarResizing = ref(false);

const isSidebarResizable = computed(() => viewportWidth.value > SIDEBAR_MOBILE_BREAKPOINT);
const sidebarMaxWidth = computed(() => {
  const byViewport = Math.floor(viewportWidth.value * 0.46);
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, byViewport));
});
const rootInlineStyles = computed(() => ({
  '--sidebar-region-width': isSidebarResizable.value ? `${sidebarWidth.value}px` : '100%',
}));

let sidebarResizeStartX = 0;
let sidebarResizeStartWidth = SIDEBAR_DEFAULT_WIDTH;

const clampSidebarWidth = (rawWidth) => {
  const width = Number(rawWidth);
  if (!Number.isFinite(width)) return SIDEBAR_MIN_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(Math.round(width), sidebarMaxWidth.value));
};

const persistSidebarWidth = () => {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth.value));
  } catch (_error) {
    // ignore localStorage failures
  }
};

const applySidebarWidth = (nextWidth, options = {}) => {
  const persist = options.persist === true;
  const clamped = clampSidebarWidth(nextWidth);
  if (sidebarWidth.value !== clamped) {
    sidebarWidth.value = clamped;
  }
  if (persist) {
    persistSidebarWidth();
  }
};

const handleSidebarResizeMove = (event) => {
  if (!isSidebarResizing.value) return;
  const deltaX = event.clientX - sidebarResizeStartX;
  applySidebarWidth(sidebarResizeStartWidth + deltaX);
};

const stopSidebarResize = () => {
  if (!isSidebarResizing.value) return;
  isSidebarResizing.value = false;
  document.body?.classList.remove('sidebar-resizing');
  window.removeEventListener('mousemove', handleSidebarResizeMove);
  window.removeEventListener('mouseup', stopSidebarResize);
  persistSidebarWidth();
};

const startSidebarResize = (event) => {
  if (!isSidebarResizable.value) return;
  if (event.button !== 0) return;

  isSidebarResizing.value = true;
  sidebarResizeStartX = event.clientX;
  sidebarResizeStartWidth = sidebarWidth.value;
  document.body?.classList.add('sidebar-resizing');

  window.addEventListener('mousemove', handleSidebarResizeMove);
  window.addEventListener('mouseup', stopSidebarResize);
  event.preventDefault();
};

const nudgeSidebarWidth = (delta) => {
  if (!isSidebarResizable.value) return;
  applySidebarWidth(sidebarWidth.value + delta, { persist: true });
};

const handleViewportResize = () => {
  viewportWidth.value = window.innerWidth || 1200;
  if (!isSidebarResizable.value) {
    stopSidebarResize();
    return;
  }
  applySidebarWidth(sidebarWidth.value);
};

const applyMainVibrancyBodyClass = () => {
  const enableNativeVibrancy = isMacOS.value;
  document.documentElement.classList.toggle('macos-vibrancy-main', enableNativeVibrancy);
  document.body?.classList.toggle('macos-vibrancy-main', enableNativeVibrancy);
};

//将 config provide 给所有子组件
provide('config', config);

// This watcher is now very effective because of the CSS variables and shared state.
watch(() => config.value?.isDarkMode, (isDark) => {
  if (isDark === undefined) return;
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}, { deep: true });

const handleGlobalEsc = (e) => {
  if (e.key === 'Escape') {
    // 1. 优先检查图片预览组件 (Image Viewer)
    const imageViewerCloseBtn = document.querySelector('.el-image-viewer__close');
    if (imageViewerCloseBtn && window.getComputedStyle(imageViewerCloseBtn).display !== 'none') {
      e.stopPropagation(); // 阻止 uTools 退出
      imageViewerCloseBtn.click(); // 手动触发关闭
      return;
    }

    // 2. 检查可见的弹窗遮罩层 (Dialog Overlays)
    const overlays = Array.from(document.querySelectorAll('.el-overlay')).filter(el => {
      return el.style.display !== 'none' && !el.classList.contains('is-hidden');
    });

    if (overlays.length > 0) {
      // 找到层级最高（最上层）的弹窗
      const topOverlay = overlays.reduce((max, current) => {
        return (parseInt(window.getComputedStyle(current).zIndex) || 0) >
               (parseInt(window.getComputedStyle(max).zIndex) || 0) ? current : max;
      });

      // 阻止 uTools 退出
      e.stopPropagation();

      // A. 尝试点击右上角的关闭(X)按钮
      const headerBtn = topOverlay.querySelector('.el-dialog__headerbtn, .el-message-box__headerbtn');
      if (headerBtn) {
        headerBtn.click();
        return;
      }

      // B. 尝试点击底部的取消/关闭按钮
      const footer = topOverlay.querySelector('.el-dialog__footer, .el-message-box__btns');
      if (footer) {
        // 特殊处理 Setting.vue 中备份管理的布局 (关闭按钮在 .footer-right)
        const rightBtn = footer.querySelector('.footer-right .el-button');
        if (rightBtn) {
          rightBtn.click();
          return;
        }
        // 通用处理：点击底部第一个按钮 (通常是 取消/Cancel)
        const buttons = footer.querySelectorAll('.el-button');
        if (buttons.length > 0) {
          buttons[0].click();
          return;
        }
      }
    }
  }
};

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleSystemThemeChange = (e) => {
  // 只有当设置为 "system" 时才响应
  if (config.value?.themeMode === 'system') {
    const isDark = e.matches;
    if (config.value.isDarkMode !== isDark) {
      config.value.isDarkMode = isDark;
      // 同步更新到数据库，确保独立窗口打开时也是正确的颜色
      if (window.api && window.api.saveSetting) {
        window.api.saveSetting('isDarkMode', isDark);
      }
    }
  }
};

const showDocDialog = ref(false);
const docLoading = ref(false);
const currentDocContent = ref('');
const activeDocIndex = ref('0');

// 文档列表配置，增加 i18nKey 用于动态标题，lastUpdated 动态获取
const docList = ref([
  { i18nKey: 'doc.titles.chat', file: 'chat_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.ai', file: 'ai_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.mcp', file: 'mcp_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.skill', file: 'skill_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.provider', file: 'provider_doc.md', lastUpdated: null },
  { i18nKey: 'doc.titles.setting', file: 'setting_doc.md', lastUpdated: null }
]);

// 阅读状态管理
const readStatusKey = 'anywhere_doc_last_read';
const docReadMap = ref({});

// 初始化读取状态
const loadReadStatus = () => {
  try {
    const stored = localStorage.getItem(readStatusKey);
    docReadMap.value = stored ? JSON.parse(stored) : {};
  } catch (e) {
    docReadMap.value = {};
  }
};

// 预取所有文档的元数据（更新时间）
const fetchAllDocsMetadata = async () => {
  // 使用镜像代理
  const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
  // 正则匹配：**文档更新时间：2026年1月28日**
  const dateRegex = /\*\*文档更新时间：(\d{4})年(\d{1,2})月(\d{1,2})日\*\*/;

  const promises = docList.value.map(async (doc) => {
    try {
      const response = await fetch(`${baseUrl}${doc.file}`);
      if (!response.ok) return;
      const text = await response.text();
      
      const match = text.match(dateRegex);
      if (match) {
        // 转换为兼容格式 YYYY/MM/DD 00:00:00
        const year = match[1];
        const month = match[2];
        const day = match[3];
        // 假设更新时间为当天的开始，确保只要用户在当天任意时刻阅读过，updatedTime(00:00) <= readTime(XX:XX) 就会不显示红点
        doc.lastUpdated = `${year}/${month}/${day} 00:00:00`;
      }
    } catch (e) {
      console.warn(`Failed to fetch metadata for ${doc.file}`, e);
    }
  });

  await Promise.all(promises);
};

// 检查是否有更新
const checkDocHasUpdate = (index) => {
  const doc = docList.value[index];
  if (!doc || !doc.lastUpdated) return false;
  
  // 从配置中读取状态
  const readMap = config.value?.docReadStatus || {};
  const lastRead = readMap[doc.file];
  
  // 如果从未读过，或者更新时间晚于阅读时间，显示红点
  if (!lastRead) return true;
  
  // Date比较
  const updateTime = new Date(doc.lastUpdated).getTime();
  const readTime = new Date(lastRead).getTime();
  
  return updateTime > readTime;
};

// 检查是否有任意文档更新（用于铃铛图标）
const hasAnyUpdate = computed(() => {
  return docList.value.some((_, index) => checkDocHasUpdate(index));
});

// 标记文档为已读
const markDocAsRead = async (filename) => {
  if (!config.value) return;

  // 1. 初始化对象 (如果不存在)
  if (!config.value.docReadStatus) {
    config.value.docReadStatus = {};
  }

  // 2. 更新内存中的配置 (触发界面响应)
  config.value.docReadStatus[filename] = new Date().toISOString();

  // 3. 持久化保存到 uTools 数据库，这里保存整个 docReadStatus 对象
  try {
    await window.api.saveSetting('docReadStatus', JSON.parse(JSON.stringify(config.value.docReadStatus)));
  } catch (e) {
    console.error("保存阅读状态失败:", e);
  }
};

const fetchAndParseDoc = async (filename) => {
  // 标记当前文档为已读
  markDocAsRead(filename);

  docLoading.value = true;
  try {
    // 使用 GitHub 镜像代理地址
    const baseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/docs/';
    const response = await fetch(`${baseUrl}${filename}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    let text = await response.text();

    // 图片路径修正逻辑 (同样使用镜像)
    const imgBaseUrl = 'https://raw.githubusercontent.com/Komorebi-yaodong/Anywhere/main/image/';
    
    // 替换 Windows 风格反斜杠路径 (..\image\) 和 Unix 风格路径 (../image/)
    text = text.replace(/!\[(.*?)\]\((\.\.[\\/])?image[\\/](.*?)\)/g, (match, alt, prefix, filename) => {
        // 对文件名进行 encodeURI 处理，防止中文乱码
        return `![${alt}](${imgBaseUrl}${encodeURIComponent(filename)})`;
    });

    currentDocContent.value = marked.parse(text);
  } catch (error) {
    console.error('Failed to load doc:', error);
    currentDocContent.value = `<h3>${t('doc.loadFailed')}</h3><p>${t('doc.checkNetwork')}</p>`;
  } finally {
    docLoading.value = false;
  }
};

// 监听文档切换
watch(activeDocIndex, (newIndex) => {
  const doc = docList.value[newIndex];
  if (doc) {
    fetchAndParseDoc(doc.file);
  }
});

// 打开弹窗时加载第一个文档，并更新阅读状态
const openHelpDialog = () => {
  showDocDialog.value = true;
  
  const index = parseInt(activeDocIndex.value) || 0;
  const targetDoc = docList.value[index];
  
  if (targetDoc) {
    // 无论是首次打开还是切换，都重新加载（可能内容有变）并标记已读
    fetchAndParseDoc(targetDoc.file);
  }
};

const handleDocLinks = (event) => {
  const target = event.target.closest('a');
  if (!target) return;

  // 阻止默认跳转（防止在当前窗口打开导致页面白屏）
  event.preventDefault();
  
  const href = target.getAttribute('href');
  if (!href) return;

  // 1. 处理 HTTP/HTTPS 外部链接 -> 调用系统浏览器打开
  if (href.startsWith('http://') || href.startsWith('https://')) {
    if (window.utools && window.utools.shellOpenExternal) {
      window.utools.shellOpenExternal(href);
    } else {
      window.open(href, '_blank'); // 兜底方案
    }
    return;
  }

  // 2. 处理文档间跳转 (例如: ./mcp_doc.md) -> 切换左侧菜单
  if (href.endsWith('.md')) {
    // 提取文件名 (兼容 ./xxx.md 或 xxx.md)
    const filename = href.split(/[/\\]/).pop();
    const targetIndex = docList.value.findIndex(doc => doc.file === filename);
    
    if (targetIndex !== -1) {
      activeDocIndex.value = String(targetIndex);
    }
  }
};

onMounted(async () => {
  applyMainVibrancyBodyClass();
  try {
    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(storedWidth)) {
      sidebarWidth.value = storedWidth;
    }
  } catch (_error) {
    // ignore localStorage failures
  }
  handleViewportResize();
  window.addEventListener('resize', handleViewportResize);

  // 异步获取文档更新时间，获取后会自动更新UI红点
  fetchAllDocsMetadata();

  window.addEventListener('keydown', handleGlobalEsc, true);
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  try {
    const result = await window.api.getConfig();
    if (result && result.config) {
      const baseConfig = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
      config.value = Object.assign({}, baseConfig, result.config);
      if (config.value.themeMode === 'system') {
        const systemDark = mediaQuery.matches;
        if (config.value.isDarkMode !== systemDark) {
          config.value.isDarkMode = systemDark;
          window.api.saveSetting('isDarkMode', systemDark);
        }
      }
    } else {
      config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in App.vue:", error);
    config.value = JSON.parse(JSON.stringify(window.api.defaultConfig.config));
  }

  // Immediately apply dark mode on mount
  if (config.value?.isDarkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
});

onBeforeUnmount(() => {
  stopSidebarResize();
  window.removeEventListener('resize', handleViewportResize);
  window.removeEventListener('keydown', handleGlobalEsc, true);
  mediaQuery.removeEventListener('change', handleSystemThemeChange);
  document.documentElement.classList.remove('macos-vibrancy-main');
  document.body?.classList.remove('macos-vibrancy-main');
  document.body?.classList.remove('sidebar-resizing');
});

function changeTab(newTab) {
  tab.value = newTab;
  updateHeaderText();
}

function updateHeaderText() {
  const tabMap = {
    0: 'app.header.chats',
    1: 'app.header.prompts',
    2: 'app.header.mcp',
    3: 'app.header.skills',
    4: 'app.header.providers',
    5: 'app.header.settings'
  };
  header_text.value = t(tabMap[tab.value]);
}

watch(locale, () => {
  updateHeaderText();
});
</script>

<template>
  <div
    class="window-root"
    :class="{ 'native-vibrancy': isMacOS, 'fallback-vibrancy': !isMacOS }"
    :style="rootInlineStyles"
  >
    <el-container class="common-layout">
      <el-aside class="app-sidebar">
        <div class="sidebar-panel">
          <div class="brand-section" :class="{ 'window-drag-region': isMacOS }">
            <div class="brand-left-spacer" aria-hidden="true"></div>
            <el-tooltip :content="t('app.header.help') || '使用指南'" placement="right">
              <el-button class="help-button no-drag" text @click="openHelpDialog">
                <el-badge :is-dot="hasAnyUpdate" class="bell-badge">
                  <el-icon :size="18"><Bell /></el-icon>
                </el-badge>
              </el-button>
            </el-tooltip>
          </div>

          <nav class="sidebar-nav">
            <button
              v-for="item in navItems"
              :key="item.id"
              type="button"
              class="nav-item"
              @click="changeTab(item.id)"
              :class="{ 'active-tab': tab === item.id }"
            >
              <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
              <span class="nav-label">{{ item.label }}</span>
            </button>
          </nav>
        </div>
      </el-aside>
      <div
        v-if="isSidebarResizable"
        class="sidebar-resize-handle no-drag"
        :class="{ 'is-resizing': isSidebarResizing }"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar width"
        :aria-valuemin="SIDEBAR_MIN_WIDTH"
        :aria-valuemax="sidebarMaxWidth"
        :aria-valuenow="sidebarWidth"
        tabindex="0"
        @mousedown="startSidebarResize"
        @keydown.left.prevent="nudgeSidebarWidth(-SIDEBAR_KEYBOARD_STEP)"
        @keydown.right.prevent="nudgeSidebarWidth(SIDEBAR_KEYBOARD_STEP)"
      ></div>

      <el-main class="workspace-main" v-if="config">
        <header class="workspace-header" :class="{ 'window-drag-region': isMacOS }">
          <el-text class="header-title-text">{{ header_text }}</el-text>
        </header>
        <div class="workspace-content">
          <Chats v-if="tab === 0" key="chats" />
          <Prompts v-if="tab === 1" key="prompts" />
          <Mcp v-if="tab === 2" key="mcp" />
          <Skills v-if="tab === 3" key="skills" />
          <Providers v-if="tab === 4" key="providers" />
          <Setting v-if="tab === 5" key="settings" />
        </div>
      </el-main>

      <!-- 帮助文档弹窗 -->
      <el-dialog v-model="showDocDialog" :title="t('doc.title')" width="80%" :lock-scroll="false" class="doc-dialog">
        <div class="doc-container">
          <div class="doc-sidebar">
            <el-menu :default-active="activeDocIndex" @select="(index) => activeDocIndex = index" class="doc-menu">
              <el-menu-item v-for="(doc, index) in docList" :key="index" :index="String(index)">
                <el-icon><Document /></el-icon>
                <span class="menu-item-text">
                  {{ t(doc.i18nKey) }}
                  <!-- 文档具体红点 -->
                  <span v-if="checkDocHasUpdate(index)" class="doc-update-dot"></span>
                </span>
              </el-menu-item>
            </el-menu>
          </div>
          <div class="doc-content" v-loading="docLoading" :element-loading-text="t('doc.loading')">
            <el-scrollbar height="60vh">
              <div class="markdown-body" v-html="currentDocContent" @click="handleDocLinks"></div>
            </el-scrollbar>
          </div>
        </div>
      </el-dialog>
    </el-container>
  </div>
</template>

<style scoped>
:global(html.macos-vibrancy-main),
:global(body.macos-vibrancy-main),
:global(html.macos-vibrancy-main #app) {
  background: transparent !important;
}

:global(body.sidebar-resizing),
:global(body.sidebar-resizing *) {
  user-select: none !important;
  cursor: col-resize !important;
}

.window-root {
  --layout-shell-bg: rgba(245, 244, 243, 0.9);
  --workspace-surface-bg: #ffffff;
  --workspace-edge-color: color-mix(in srgb, var(--border-primary) 55%, transparent);
  --sidebar-vibrancy-tint: rgba(255, 255, 255, 0.1);
  --sidebar-fallback-tint: rgba(247, 246, 244, 0.62);
  --sidebar-vibrancy-divider: color-mix(in srgb, var(--border-primary) 62%, transparent);
  --sidebar-region-width: 268px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--layout-shell-bg);
}

.window-root.native-vibrancy {
  --layout-shell-bg: transparent;
}

.window-root.fallback-vibrancy {
  --layout-shell-bg: #f1efec;
  --workspace-surface-bg: #fcfcfb;
  --sidebar-fallback-tint: rgba(238, 235, 231, 0.86);
}

.window-drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.common-layout,
.el-container {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  gap: 0;
  overflow: hidden;
  background-color: var(--layout-shell-bg);
  display: flex;
  flex-direction: row;
}

.window-root.native-vibrancy .common-layout::before,
.window-root.fallback-vibrancy .common-layout::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: calc(var(--sidebar-region-width) + var(--radius-xl));
  pointer-events: none;
  z-index: 0;
}

.window-root.native-vibrancy .common-layout::before {
  background-color: var(--sidebar-vibrancy-tint);
  box-shadow: inset -1px 0 0 var(--sidebar-vibrancy-divider);
}

.window-root.fallback-vibrancy .common-layout::before {
  background-color: var(--sidebar-fallback-tint);
  backdrop-filter: blur(20px) saturate(125%);
  -webkit-backdrop-filter: blur(20px) saturate(125%);
  box-shadow: inset -1px 0 0 var(--sidebar-vibrancy-divider);
}

.app-sidebar {
  --el-aside-width: var(--sidebar-region-width);
  width: var(--sidebar-region-width);
  min-width: var(--sidebar-region-width);
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
  margin-right: 0;
  background-color: transparent;
}

.sidebar-panel {
  height: 100%;
  padding: 10px 8px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: transparent;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--sidebar-region-width);
  width: 12px;
  transform: translateX(-50%);
  z-index: 3;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: col-resize;
}

.sidebar-resize-handle::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background-color: color-mix(in srgb, var(--border-primary) 78%, transparent);
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

.sidebar-resize-handle:hover::before,
.sidebar-resize-handle.is-resizing::before,
.sidebar-resize-handle:focus-visible::before {
  background-color: color-mix(in srgb, var(--text-accent) 74%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--text-accent) 16%, transparent);
}

.sidebar-resize-handle:focus-visible {
  outline: none;
}

.brand-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 2px 2px 10px 4px;
}

.brand-left-spacer {
  width: 70px;
  min-width: 70px;
  height: 1px;
}

.help-button {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.help-button:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.65);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.nav-item {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background-color: transparent;
  cursor: pointer;
  appearance: none;
  text-align: left;
  font: inherit;
  color: var(--text-secondary);
  transition: all 0.18s ease;
}

.nav-item:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.62);
}

.nav-item.active-tab {
  color: var(--text-primary);
  border-color: transparent;
  background-color: #EAE9E8;
  box-shadow: none;
}

.nav-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--text-accent) 45%, transparent);
  outline-offset: 1px;
}

.nav-icon {
  font-size: 16px;
  width: 18px;
  min-width: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-label {
  font-size: 13px;
  font-weight: 520;
  letter-spacing: 0.01em;
}

.workspace-main {
  padding: 0;
  margin: 0;
  overflow: hidden;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  border-radius: var(--radius-xl);
  border: 1px solid var(--workspace-edge-color);
  border-left: none;
  background-color: var(--workspace-surface-bg);
  box-shadow: none;
}

.workspace-header {
  padding: 10px 12px 14px;
  flex-shrink: 0;
  background-color: var(--workspace-surface-bg);
}

.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 0 0;
  background-color: var(--workspace-surface-bg);
}

html.dark .app-sidebar {
  background-color: transparent;
}

html.dark .help-button {
  color: #b9b7b4;
}

html.dark .help-button:hover {
  color: #f0eeea;
  background-color: rgba(255, 255, 255, 0.1);
}

html.dark .nav-item {
  color: #bfbcb8;
}

html.dark .nav-item:hover {
  color: #efede9;
  background-color: rgba(255, 255, 255, 0.08);
}

html.dark .nav-item.active-tab {
  border-color: transparent;
  color: #f7f4ef;
  background-color: rgba(255, 255, 255, 0.14);
  box-shadow: none;
}

html.dark .workspace-main {
  background-color: var(--workspace-surface-bg);
  border-top-color: var(--workspace-edge-color);
  border-right-color: var(--workspace-edge-color);
  border-bottom-color: var(--workspace-edge-color);
}

html.dark .workspace-header {
  background-color: var(--workspace-surface-bg);
}

html.dark .workspace-content {
  background-color: var(--workspace-surface-bg);
}

html.dark .window-root {
  --layout-shell-bg: #1a1b1d;
  --workspace-surface-bg: #181818;
  --sidebar-vibrancy-divider: rgba(255, 255, 255, 0.07);
  --workspace-edge-color: rgba(6, 8, 11, 0.88);
}

html.dark .window-root.fallback-vibrancy {
  --layout-shell-bg: #191b1e;
  --workspace-surface-bg: #181818;
  --sidebar-fallback-tint: rgba(44, 42, 42, 0.92);
}

html.dark .window-root.native-vibrancy {
  --layout-shell-bg: transparent;
}

html.dark .window-root.native-vibrancy .common-layout::before {
  background: linear-gradient(180deg, rgba(43, 41, 40, 0.58) 0%, rgba(34, 33, 35, 0.68) 100%);
}

html.dark .window-root.fallback-vibrancy .common-layout::before {
  background: linear-gradient(180deg, rgba(44, 42, 42, 0.9) 0%, rgba(36, 35, 37, 0.94) 100%);
}

.header-title-text {
  font-size: 19px;
  font-weight: 620;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.bell-badge :deep(.el-badge__content.is-fixed.is-dot) {
  right: 3px;
  top: 3px;
  background-color: var(--text-accent);
}

.doc-container {
  display: flex;
  height: 60vh;
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.doc-sidebar {
  width: 190px;
  border-right: 1px solid var(--border-primary);
  background-color: var(--bg-secondary);
  flex-shrink: 0;
}

.doc-menu {
  border-right: none;
  background-color: transparent;
}

.doc-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  color: var(--text-secondary);
  font-size: 13px;
  margin: 4px 8px;
  border-radius: var(--radius-md);
}

.doc-menu :deep(.el-menu-item:hover) {
  background-color: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
}

.doc-menu :deep(.el-menu-item.is-active) {
  color: var(--text-accent);
  background-color: color-mix(in srgb, var(--text-accent) 12%, transparent);
  font-weight: 600;
  border-right: none;
}

.menu-item-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.doc-update-dot {
  width: 6px;
  height: 6px;
  background-color: var(--text-accent);
  border-radius: 50%;
  margin-left: 8px;
  display: inline-block;
}

.doc-content {
  flex: 1;
  background-color: var(--bg-primary);
  padding: 0;
  overflow: hidden;
}

.markdown-body {
  padding: 0px 40px;
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 15px; /* 稍微调大字号更易阅读 */
  line-height: 1.75; /* 增加行高，增加呼吸感 */
  -webkit-font-smoothing: antialiased; /* 让字体在 Mac 上更清晰 */
}

/* 标题样式优化 */
.markdown-body :deep(h1), 
.markdown-body :deep(h2) {
  padding-bottom: 0.4em;
  margin-top: 1.5em;
  margin-bottom: 1em;
  color: var(--text-primary);
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.markdown-body :deep(h3), 
.markdown-body :deep(h4) {
  margin-top: 1.4em;
  margin-bottom: 0.8em;
  color: var(--text-primary);
  font-weight: 600; /* 强制加粗 */
  line-height: 1.4;
}

/* 正文段落 */
.markdown-body :deep(p) {
  margin-bottom: 1.2em;
  text-align: justify; /* 两端对齐，使大段文字更整齐 */
}

/* 列表优化 */
.markdown-body :deep(ul), 
.markdown-body :deep(ol) {
  padding-left: 24px;
  margin-bottom: 1.2em;
}

.markdown-body :deep(li) {
  margin-bottom: 0.4em; /* 列表项之间增加一点间距 */
}

/* 粗体优化 */
.markdown-body :deep(strong),
.markdown-body :deep(b) {
  font-weight: 700;
  color: var(--text-primary);
}

/* 行内代码块优化 */
.markdown-body :deep(code) {
  background-color: color-mix(in srgb, var(--bg-tertiary) 78%, transparent);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 0.85em;
  color: var(--text-primary);
  margin: 0 2px;
}

.markdown-body :deep(pre) {
  background-color: color-mix(in srgb, var(--bg-tertiary) 72%, transparent);
  padding: 16px;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin-bottom: 1.2em;
  line-height: 1.5;
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: var(--text-primary);
  margin: 0;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

.markdown-body :deep(blockquote) {
  margin: 1.2em 0;
  padding: 8px 16px;
  color: var(--text-secondary);
  border-left: 3px solid var(--text-accent);
  background-color: color-mix(in srgb, var(--bg-tertiary) 50%, transparent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.markdown-body :deep(blockquote p) {
  margin-bottom: 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 12px 0;
  display: block;
}

/* 链接优化 */
.markdown-body :deep(a) {
  color: var(--text-accent);
  text-decoration: none;
  font-weight: 500;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
  cursor: pointer;
}
.markdown-body :deep(a:hover) {
  border-bottom-color: var(--text-accent); /* 悬浮时显示下划线效果 */
}

/* 弹窗样式微调 */
:deep(.doc-dialog .el-dialog__body) {
  padding: 0 !important;
}
:deep(.doc-dialog .el-dialog__header) {
  padding: 12px 20px 8px 20px !important;
  margin-right: 0;
  border-bottom: none;
}

@media (max-width: 860px) {
  .common-layout,
  .el-container {
    padding: 8px 10px;
    gap: 0;
  }

  .workspace-header {
    padding: 6px 4px 12px;
  }
}

@media (max-width: 700px) {
  .window-root {
    --sidebar-region-width: 100%;
  }

  .common-layout,
  .el-container {
    flex-direction: column;
    padding: 0;
  }

  .window-root.native-vibrancy .common-layout::before,
  .window-root.fallback-vibrancy .common-layout::before {
    display: none;
  }

  .app-sidebar {
    --el-aside-width: 100%;
    width: 100%;
    min-width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(227, 224, 221, 0.9);
    margin-right: 0;
    margin-bottom: 0;
  }

  .workspace-main {
    border: none;
    border-top: none;
    border-radius: 0;
    box-shadow: none;
  }

  html.dark .app-sidebar {
    border-bottom-color: rgba(255, 255, 255, 0.12);
  }

  .sidebar-panel {
    height: auto;
    padding: 4px 0;
  }

  .sidebar-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
}
</style>
