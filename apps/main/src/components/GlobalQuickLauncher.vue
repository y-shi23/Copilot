<script setup lang="ts">
// -nocheck
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Search, Image as ImageIcon, FileText, X, ChevronRight } from 'lucide-vue-next';

const launcherApi = window.launcherApi || {};

const BASE_WINDOW_HEIGHT = 56;
const LIST_GAP = 0;
const MAX_LIST_HEIGHT = 340;
const LIST_SHOW_TRANSITION_MS = 200;
const LIST_HIDE_TRANSITION_MS = 160;

const inputRef = ref(null);
const listRef = ref(null);
const isDragging = ref(false);

const query = ref('');
const prompts = ref([]);
const selectedIndex = ref(-1);
const attachment = ref(null);
const isListMounted = ref(false);
const isListVisible = ref(false);
const hideListTimer = ref(0);
const listActualHeight = ref(0);

const isMacOS = computed(() => {
  const platform = String(
    launcherApi.platform || navigator.userAgentData?.platform || navigator.platform || '',
  ).toLowerCase();
  return platform.includes('darwin') || platform.includes('mac');
});

const layoutState = reactive({
  resizeRaf: 0,
  queuedHeight: BASE_WINDOW_HEIGHT,
  lastSentHeight: 0,
});

const dragState = reactive({
  pointerId: null,
  pointerDown: false,
  dragging: false,
  startScreenX: 0,
  startScreenY: 0,
  startWindowX: 0,
  startWindowY: 0,
  currentWindowX: 0,
  currentWindowY: 0,
  suppressClickUntil: 0,
  moveRaf: 0,
  queuedMove: null,
});

const showResults = computed(() => query.value.trim().length > 0 || !!attachment.value);

const inputPlaceholder = computed(() => {
  if (attachment.value?.kind === 'img') return '已附加图片，选择截图/通用助手';
  if (attachment.value?.kind === 'files') return '已附加文件，选择文件/通用助手';
  return '输入文本，或粘贴图片/文件';
});

const attachmentLabel = computed(() => {
  if (!attachment.value) return '';
  if (attachment.value.kind === 'img') {
    return attachment.value.name || 'clipboard-image.png';
  }
  const fileCount = Array.isArray(attachment.value.files) ? attachment.value.files.length : 0;
  return fileCount > 0 ? `${fileCount} file${fileCount > 1 ? 's' : ''}` : '0 files';
});

function normalizePromptType(rawType) {
  const value = String(rawType || 'general').toLowerCase();
  if (value === 'text') return 'over';
  if (value === 'image') return 'img';
  if (value === 'file') return 'files';
  return value;
}

function parseRegexLiteral(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;

  const tail = trimmed.lastIndexOf('/');
  if (tail <= 0) return null;

  const body = trimmed.slice(1, tail);
  const flags = trimmed.slice(tail + 1);

  try {
    return new RegExp(body, flags);
  } catch (_error) {
    return null;
  }
}

function supportsAttachment(prompt, attachmentKind) {
  if (!attachmentKind) return true;
  const type = normalizePromptType(prompt.type);
  if (attachmentKind === 'img') return type === 'general' || type === 'img';
  if (attachmentKind === 'files') return type === 'general' || type === 'files';
  return true;
}

function supportsTextPayload(prompt, textPayload) {
  const type = normalizePromptType(prompt.type);
  if (type !== 'general' && type !== 'over') return false;

  if (type === 'over' && textPayload) {
    const regex = parseRegexLiteral(prompt.matchRegex);
    if (regex) return regex.test(textPayload);
  }

  return true;
}

function promptScore(prompt, queryText) {
  if (!queryText) return 0;
  const name = String(prompt.code || '').toLowerCase();
  const description = String(prompt.prompt || '').toLowerCase();

  if (name === queryText) return 1000;
  if (name.startsWith(queryText)) return 620;
  if (name.includes(queryText)) return 420;
  if (description.includes(queryText)) return 120;
  return 0;
}

function promptContextPriority(prompt, attachmentKind, textPayload) {
  const type = normalizePromptType(prompt.type);

  if (attachmentKind === 'img') {
    if (type === 'img') return 2;
    if (type === 'general') return 1;
    return 0;
  }

  if (attachmentKind === 'files') {
    if (type === 'files') return 2;
    if (type === 'general') return 1;
    return 0;
  }

  if (textPayload) {
    if (type === 'over') return 2;
    if (type === 'general') return 1;
    return 0;
  }

  return 0;
}

const filteredPrompts = computed(() => {
  if (!showResults.value) return [];

  const queryText = query.value.trim();
  const queryTextLower = queryText.toLowerCase();
  const attachmentKind = attachment.value?.kind || '';

  let list = prompts.value.slice();
  if (attachmentKind) {
    list = list.filter((prompt) => supportsAttachment(prompt, attachmentKind));
  } else {
    list = list.filter((prompt) => supportsTextPayload(prompt, queryText));
  }

  list.sort((a, b) => {
    const contextDiff =
      promptContextPriority(b, attachmentKind, queryText) -
      promptContextPriority(a, attachmentKind, queryText);
    if (contextDiff !== 0) return contextDiff;

    const scoreDiff = promptScore(b, queryTextLower) - promptScore(a, queryTextLower);
    if (scoreDiff !== 0) return scoreDiff;
    return String(a.code || '').localeCompare(String(b.code || ''));
  });

  return list;
});

watch(
  filteredPrompts,
  async (list) => {
    if (list.length === 0) {
      selectedIndex.value = -1;
    } else if (selectedIndex.value < 0 || selectedIndex.value >= list.length) {
      selectedIndex.value = 0;
    }

    await nextTick();
    scrollSelectedIntoView();
    syncWindowSize();
  },
  { immediate: true },
);

watch(showResults, async (visible) => {
  if (hideListTimer.value) {
    clearTimeout(hideListTimer.value);
    hideListTimer.value = 0;
  }

  if (visible) {
    isListMounted.value = true;
    await nextTick();
    requestAnimationFrame(() => {
      isListVisible.value = true;
      syncWindowSize();
    });
    return;
  }

  isListVisible.value = false;
  hideListTimer.value = window.setTimeout(() => {
    hideListTimer.value = 0;
    if (showResults.value) return;
    isListMounted.value = false;
    listActualHeight.value = 0;
    syncWindowSize();
  }, LIST_HIDE_TRANSITION_MS);
});

function queueWindowResize(height) {
  if (typeof launcherApi.setWindowSize !== 'function') return;

  const nextHeight = Math.round(height);
  if (nextHeight === layoutState.lastSentHeight && !layoutState.resizeRaf) return;

  layoutState.queuedHeight = nextHeight;
  if (layoutState.resizeRaf) return;

  layoutState.resizeRaf = requestAnimationFrame(() => {
    layoutState.resizeRaf = 0;
    if (layoutState.queuedHeight === layoutState.lastSentHeight) return;
    launcherApi.setWindowSize({ height: layoutState.queuedHeight });
    layoutState.lastSentHeight = layoutState.queuedHeight;
  });
}

function syncWindowSize() {
  let nextHeight = BASE_WINDOW_HEIGHT;
  if (isListMounted.value && isListVisible.value) {
    const listHeight = Math.min(listRef.value?.scrollHeight || 0, MAX_LIST_HEIGHT);
    if (listHeight > 0) {
      listActualHeight.value = listHeight;
      nextHeight = BASE_WINDOW_HEIGHT + LIST_GAP + listHeight;
    }
  } else if (isListMounted.value && listActualHeight.value > 0) {
    nextHeight = BASE_WINDOW_HEIGHT + LIST_GAP + listActualHeight.value;
  }
  queueWindowResize(nextHeight);
}

function getPromptIconSource(prompt) {
  const icon = typeof prompt.icon === 'string' ? prompt.icon : '';
  if (!icon) return '';
  if (icon.startsWith('data:')) return icon;
  return `data:image/png;base64,${icon}`;
}

function getPromptInitial(prompt) {
  return String(prompt?.code || '?')
    .slice(0, 2)
    .toUpperCase();
}

function clearAttachment() {
  attachment.value = null;
}

function buildAction(prompt, useTextPayload) {
  if (attachment.value?.kind === 'img') {
    return {
      code: prompt.code,
      type: 'img',
      payload: attachment.value.dataUrl,
    };
  }

  if (attachment.value?.kind === 'files') {
    return {
      code: prompt.code,
      type: 'files',
      payload: attachment.value.files,
    };
  }

  const currentQuery = query.value.trim();
  if (useTextPayload && currentQuery) {
    return {
      code: prompt.code,
      type: 'over',
      payload: currentQuery,
    };
  }

  return {
    code: prompt.code,
    type: 'over',
    payload: '',
  };
}

function executeCurrent(useTextPayload) {
  if (selectedIndex.value < 0 || selectedIndex.value >= filteredPrompts.value.length) return;
  const prompt = filteredPrompts.value[selectedIndex.value];
  if (!prompt || typeof launcherApi.execute !== 'function') return;

  const currentQuery = query.value.trim();
  if (attachment.value && !supportsAttachment(prompt, attachment.value.kind)) return;

  let shouldUseTextPayload = useTextPayload;
  if (
    !attachment.value &&
    shouldUseTextPayload &&
    currentQuery &&
    !supportsTextPayload(prompt, currentQuery)
  ) {
    shouldUseTextPayload = false;
  }

  launcherApi.execute(buildAction(prompt, shouldUseTextPayload));
}

function executeByIndex(index, useTextPayload = true) {
  selectedIndex.value = index;
  executeCurrent(useTextPayload);
}

function shiftSelection(step) {
  const count = filteredPrompts.value.length;
  if (count === 0) return;

  if (selectedIndex.value < 0) {
    selectedIndex.value = 0;
  } else {
    selectedIndex.value = (selectedIndex.value + step + count) % count;
  }
  scrollSelectedIntoView();
}

function scrollSelectedIntoView() {
  if (selectedIndex.value < 0 || !listRef.value) return;
  const selected = listRef.value.querySelector('.launcher-option.selected');
  if (selected && typeof selected.scrollIntoView === 'function') {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function queueWindowMove(x, y) {
  dragState.queuedMove = { x, y };
  if (dragState.moveRaf) return;

  dragState.moveRaf = requestAnimationFrame(() => {
    dragState.moveRaf = 0;
    if (!dragState.queuedMove || typeof launcherApi.setWindowPosition !== 'function') return;
    const target = dragState.queuedMove;
    dragState.queuedMove = null;
    launcherApi.setWindowPosition(target);
    dragState.currentWindowX = target.x;
    dragState.currentWindowY = target.y;
  });
}

async function syncWindowBounds() {
  if (typeof launcherApi.getWindowBounds !== 'function') return;
  try {
    const bounds = await launcherApi.getWindowBounds();
    if (!bounds) return;
    dragState.currentWindowX = Number(bounds.x) || 0;
    dragState.currentWindowY = Number(bounds.y) || 0;
  } catch (_error) {
    // Ignore bounds read errors.
  }
}

function handlePointerDown(event) {
  if (event.button !== 0) return;

  dragState.pointerId = event.pointerId;
  dragState.pointerDown = true;
  dragState.dragging = false;
  dragState.startScreenX = event.screenX;
  dragState.startScreenY = event.screenY;
  dragState.startWindowX = dragState.currentWindowX;
  dragState.startWindowY = dragState.currentWindowY;

  if (typeof launcherApi.getWindowBounds === 'function') {
    launcherApi
      .getWindowBounds()
      .then((bounds) => {
        if (!dragState.pointerDown || dragState.pointerId !== event.pointerId || !bounds) return;
        dragState.currentWindowX = Number(bounds.x) || dragState.currentWindowX;
        dragState.currentWindowY = Number(bounds.y) || dragState.currentWindowY;
        dragState.startWindowX = dragState.currentWindowX;
        dragState.startWindowY = dragState.currentWindowY;
      })
      .catch(() => {});
  }
}

function handlePointerMove(event) {
  if (!dragState.pointerDown || event.pointerId !== dragState.pointerId) return;

  const deltaX = event.screenX - dragState.startScreenX;
  const deltaY = event.screenY - dragState.startScreenY;

  if (!dragState.dragging && Math.abs(deltaX) + Math.abs(deltaY) >= 3) {
    dragState.dragging = true;
    isDragging.value = true;
  }

  if (!dragState.dragging) return;

  queueWindowMove(
    Math.round(dragState.startWindowX + deltaX),
    Math.round(dragState.startWindowY + deltaY),
  );
}

function handlePointerEnd(event) {
  if (!dragState.pointerDown || event.pointerId !== dragState.pointerId) return;

  if (dragState.dragging) {
    dragState.suppressClickUntil = Date.now() + 120;
    event.preventDefault();
  }

  dragState.pointerDown = false;
  dragState.dragging = false;
  isDragging.value = false;
}

function handleClickCapture(event) {
  if (Date.now() < dragState.suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function isImageFile(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;

  const name = String(file?.name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(name);
}

async function consumeFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;

  if (files.length === 1 && isImageFile(files[0])) {
    const dataUrl = await fileToDataUrl(files[0]);
    if (dataUrl) {
      attachment.value = {
        kind: 'img',
        dataUrl,
        name: files[0].name || 'clipboard-image.png',
      };
      return;
    }
  }

  const filePayload = files
    .map((file) => ({
      name: file.name || 'file',
      path: typeof file.path === 'string' ? file.path : '',
      isFile: true,
    }))
    .filter((file) => !!file.path);

  if (filePayload.length > 0) {
    attachment.value = {
      kind: 'files',
      files: filePayload,
    };
  }
}

async function handleDrop(event) {
  event.preventDefault();
  await consumeFiles(event.dataTransfer?.files);
}

function handleDragOver(event) {
  event.preventDefault();
}

async function handlePaste(event) {
  const clipboardFiles = event.clipboardData?.files;
  if (clipboardFiles && clipboardFiles.length > 0) {
    event.preventDefault();
    await consumeFiles(clipboardFiles);
    return;
  }

  const imageData =
    typeof launcherApi.readClipboardImage === 'function' ? launcherApi.readClipboardImage() : '';

  if (imageData) {
    event.preventDefault();
    attachment.value = {
      kind: 'img',
      dataUrl: imageData,
      name: 'clipboard-image.png',
    };
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (attachment.value) {
      clearAttachment();
      return;
    }
    if (typeof launcherApi.close === 'function') launcherApi.close();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    shiftSelection(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    shiftSelection(-1);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    if (!showResults.value) return;
    const useTextPayload = !(event.ctrlKey || event.metaKey);
    executeCurrent(useTextPayload);
  }
}

function focusInput(selectText = false) {
  if (!inputRef.value) return;
  inputRef.value.focus();
  if (selectText) inputRef.value.select();
}

async function refreshPrompts() {
  try {
    const list = await launcherApi.getPrompts?.();
    prompts.value = Array.isArray(list) ? list : [];
  } catch (_error) {
    prompts.value = [];
  }
}

async function resetAndRefresh() {
  query.value = '';
  clearAttachment();
  await refreshPrompts();
  await syncWindowBounds();
  await nextTick();
  focusInput(true);
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('pointerup', handlePointerEnd, true);
  document.addEventListener('pointercancel', handlePointerEnd, true);
  document.addEventListener('click', handleClickCapture, true);
  window.addEventListener('drop', handleDrop);
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('paste', handlePaste);

  if (typeof launcherApi.onRefresh === 'function') {
    launcherApi.onRefresh(() => {
      resetAndRefresh();
    });
  }

  if (typeof launcherApi.onFocusInput === 'function') {
    launcherApi.onFocusInput(() => {
      focusInput(false);
    });
  }

  resetAndRefresh();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('pointerup', handlePointerEnd, true);
  document.removeEventListener('pointercancel', handlePointerEnd, true);
  document.removeEventListener('click', handleClickCapture, true);
  window.removeEventListener('drop', handleDrop);
  window.removeEventListener('dragover', handleDragOver);
  window.removeEventListener('paste', handlePaste);

  if (layoutState.resizeRaf) cancelAnimationFrame(layoutState.resizeRaf);
  if (dragState.moveRaf) cancelAnimationFrame(dragState.moveRaf);
  if (hideListTimer.value) {
    clearTimeout(hideListTimer.value);
    hideListTimer.value = 0;
  }
});
</script>

<template>
  <main
    class="launcher-shell"
    :class="{ dragging: isDragging, 'native-vibrancy': isMacOS, 'fallback-vibrancy': !isMacOS }"
  >
    <div
      class="launcher-container"
      :class="{ 'has-list': isListVisible && filteredPrompts.length > 0 }"
    >
      <div class="launcher-input-wrap">
        <Search :size="24" class="launcher-input-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="launcher-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="inputPlaceholder"
        />
        <div v-if="attachment" class="attachment-pill">
          <ImageIcon v-if="attachment.kind === 'img'" :size="12" />
          <FileText v-else :size="12" />
          <span class="attachment-label">{{ attachmentLabel }}</span>
          <button
            type="button"
            class="circle-action-btn-sm attachment-clear-btn"
            @click="clearAttachment"
          >
            <X :size="12" />
          </button>
        </div>
      </div>

      <section
        v-show="isListMounted"
        ref="listRef"
        class="result-list"
        :class="{ visible: isListVisible }"
      >
        <div v-if="filteredPrompts.length === 0" class="result-empty">无匹配助手</div>

        <button
          v-for="(prompt, index) in filteredPrompts"
          :key="prompt.code"
          type="button"
          class="launcher-option"
          :class="{ selected: index === selectedIndex }"
          :style="{ '--option-delay': `${Math.min(index * 12, 96)}ms` }"
          @mouseenter="selectedIndex = index"
          @mousedown.prevent
          @click="executeByIndex(index)"
        >
          <span class="launcher-option-icon">
            <img v-if="getPromptIconSource(prompt)" :src="getPromptIconSource(prompt)" alt="" />
            <span v-else>{{ getPromptInitial(prompt) }}</span>
          </span>
          <span class="launcher-option-name">{{ prompt.code }}</span>
          <ChevronRight :size="14" class="prompt-arrow" />
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#launcher-app) {
  background: transparent !important;
}

.launcher-shell {
  width: 100%;
  height: 100%;
  position: relative;
  isolation: isolate;
  overflow: visible;
  display: flex;
  flex-direction: column;
  cursor: default;
  background: transparent;
}

.launcher-container {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  border: 1px solid color-mix(in srgb, var(--border-primary) 72%, transparent);
  box-shadow:
    var(--shadow-md),
    0 0 0 1px color-mix(in srgb, #ffffff 18%, transparent);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
  overflow: hidden;
}

.launcher-container::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
}

.launcher-shell .launcher-container {
  background: var(--bg-secondary);
  backdrop-filter: saturate(145%) blur(28px);
  -webkit-backdrop-filter: saturate(145%) blur(28px);
}

.launcher-shell .launcher-container::before {
  background: color-mix(in srgb, #ffffff 5%, transparent);
}

.launcher-shell:focus-within .launcher-container {
  border-color: color-mix(in srgb, var(--text-accent) 44%, var(--border-primary));
  box-shadow:
    var(--shadow-md),
    0 0 0 1px color-mix(in srgb, var(--text-accent) 16%, transparent);
}

.launcher-container.has-list {
  border-radius: 20px;
}

.launcher-shell.dragging,
.launcher-shell.dragging * {
  cursor: grabbing !important;
}

.launcher-input-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 54px;
  height: 54px;
  display: flex;
  align-items: center;
  border-radius: 28px;
  background-color: transparent;
  transition: border-radius 0.15s ease;
}

.launcher-container.has-list .launcher-input-wrap {
  border-radius: 20px 20px 0 0;
}

.launcher-input-icon {
  margin-left: 16px;
  color: var(--text-secondary);
  flex-shrink: 0;
  opacity: 0.92;
}

.launcher-input {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1.2;
  padding: 0 18px 0 12px;
  outline: none;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', sans-serif;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.launcher-input::placeholder {
  color: color-mix(in srgb, var(--text-tertiary) 88%, transparent);
}

.attachment-pill {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  height: 26px;
  max-width: 52%;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
  background-color: color-mix(in srgb, var(--bg-tertiary) 88%, transparent);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 0 8px;
}

.attachment-label {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 155px;
}

.attachment-clear-btn {
  width: 20px !important;
  height: 20px !important;
}

.result-list {
  position: relative;
  z-index: 1;
  border-top: 1px solid transparent;
  padding: 0 10px;
  max-height: 0;
  opacity: 0;
  transform: scaleY(0.95) translateY(-4px);
  transform-origin: top center;
  pointer-events: none;
  overflow: hidden;
  will-change: transform, opacity;
  transition:
    transform 160ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 140ms ease,
    padding 160ms cubic-bezier(0.32, 0.72, 0, 1),
    border-color 160ms ease;
  background: transparent;
}

.result-list.visible {
  border-top-color: color-mix(in srgb, var(--border-primary) 72%, transparent);
  padding: 8px 10px 10px;
  max-height: 340px;
  opacity: 1;
  transform: scaleY(1) translateY(0);
  pointer-events: auto;
  overflow: auto;
}

.result-list::-webkit-scrollbar {
  width: 7px;
}

.result-list::-webkit-scrollbar-thumb {
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-secondary) 35%, transparent);
}

.result-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 10px 8px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
}

.launcher-option {
  width: 100%;
  appearance: none;
  color: inherit;
  border: none !important;
  box-shadow: none !important;
  border-radius: 11px !important;
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  height: 42px !important;
  padding: 0 10px !important;
  cursor: pointer;
  text-align: left;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
  line-height: 1;
  background: transparent;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 160ms cubic-bezier(0.32, 0.72, 0, 1),
    transform 180ms cubic-bezier(0.32, 0.72, 0, 1),
    background-color 120ms ease,
    color 120ms ease;
  transition-delay: var(--option-delay, 0ms);
}

.result-list.visible .launcher-option {
  opacity: 1;
  transform: translateY(0);
}

.result-list:not(.visible) .launcher-option {
  transition-delay: 0ms !important;
  transition-duration: 80ms !important;
}

.launcher-option:hover {
  background: color-mix(in srgb, var(--bg-tertiary) 48%, transparent);
}

.launcher-option-icon {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  overflow: hidden;
}

.launcher-option-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.launcher-option-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.25;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

.prompt-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
  opacity: 0.7;
}

.launcher-option.selected .prompt-arrow {
  color: var(--text-secondary);
  opacity: 0.96;
}

.launcher-option.selected {
  background: color-mix(in srgb, var(--bg-tertiary) 74%, transparent);
}

html.dark .launcher-container {
  border-color: color-mix(in srgb, var(--border-primary) 88%, transparent);
  box-shadow:
    var(--shadow-md),
    0 0 0 1px rgba(255, 255, 255, 0.06);
}

html.dark .launcher-shell.native-vibrancy .launcher-container::before {
  background: linear-gradient(180deg, rgba(43, 41, 40, 0.58) 0%, rgba(34, 33, 35, 0.68) 100%);
}

html.dark .launcher-shell.fallback-vibrancy .launcher-container {
  background: color-mix(in srgb, var(--bg-secondary) 34%, transparent);
}

html.dark .launcher-shell.fallback-vibrancy .launcher-container::before {
  background: color-mix(in srgb, #ffffff 4%, transparent);
}

html.dark .result-list {
  border-top-color: color-mix(in srgb, var(--border-primary) 88%, transparent);
}

html.dark .launcher-option:hover {
  background: color-mix(in srgb, var(--bg-tertiary) 60%, transparent);
}

html.dark .launcher-option.selected {
  background: color-mix(in srgb, var(--bg-tertiary) 78%, transparent);
}
</style>
