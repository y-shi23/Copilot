<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'katex/dist/katex.min.css';

import { renderMarkdownToHtml } from '../../utils/markdown/renderer';
import { renderMermaidBlocks } from '../../utils/markdown/mermaid';
import type { MermaidRenderMode } from '../../utils/markdown/types';

interface MermaidConfigLike {
  theme?: string;
}

interface Props {
  markdown: string;
  isDark?: boolean;
  enableLatex?: boolean;
  allowHtml?: boolean;
  headingIdPrefix?: string;
  mermaidConfig?: MermaidConfigLike;
  defaultThemeMode?: 'light' | 'dark';
  themes?: Record<string, string>;
  mermaidMode?: MermaidRenderMode;
}

const props = withDefaults(defineProps<Props>(), {
  markdown: '',
  isDark: false,
  enableLatex: true,
  allowHtml: true,
  mermaidConfig: () => ({}),
  defaultThemeMode: 'light',
  themes: () => ({}),
  mermaidMode: 'preview-source',
});

const rootRef = ref<HTMLElement | null>(null);
const renderedHtml = ref(' ');
let renderTicket = 0;

const updateMermaidView = (container: HTMLElement, targetView: 'preview' | 'source') => {
  const previewPanel = container.querySelector<HTMLElement>('[data-mermaid-panel="preview"]');
  const sourcePanel = container.querySelector<HTMLElement>('[data-mermaid-panel="source"]');
  const buttons = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-toggle-btn'));

  if (previewPanel) previewPanel.hidden = targetView !== 'preview';
  if (sourcePanel) sourcePanel.hidden = targetView !== 'source';
  container.setAttribute('data-mermaid-view', targetView);

  buttons.forEach((button) => {
    const isActive = button.getAttribute('data-mermaid-target') === targetView;
    button.classList.toggle('is-active', isActive);
  });
};

const copyCodeFromBlock = async (button: HTMLElement) => {
  const codeBlock = button.closest('.md-code-block');
  const codeElement = codeBlock?.querySelector('pre code');
  const codeText = codeElement?.textContent ?? '';
  if (!codeText) return;

  try {
    await navigator.clipboard.writeText(codeText);
    const previousLabel = button.textContent || 'Copy';
    button.textContent = 'Copied';
    window.setTimeout(() => {
      if (button.textContent === 'Copied') {
        button.textContent = previousLabel;
      }
    }, 1200);
  } catch (_error) {
    const previousLabel = button.textContent || 'Copy';
    button.textContent = 'Failed';
    window.setTimeout(() => {
      if (button.textContent === 'Failed') {
        button.textContent = previousLabel;
      }
    }, 1200);
  }
};

const handleRootClick = (event: Event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const copyButton = target.closest<HTMLElement>('.md-copy-button');
  if (copyButton) {
    event.preventDefault();
    void copyCodeFromBlock(copyButton);
    return;
  }

  const toggleButton = target.closest<HTMLElement>('.mermaid-toggle-btn');
  if (toggleButton) {
    event.preventDefault();
    const mermaidContainer = toggleButton.closest<HTMLElement>('.markdown-mermaid');
    if (!mermaidContainer) return;

    const targetView =
      toggleButton.getAttribute('data-mermaid-target') === 'source' ? 'source' : 'preview';
    updateMermaidView(mermaidContainer, targetView);
  }
};

const refreshMarkdown = async () => {
  const ticket = ++renderTicket;
  const rendered = renderMarkdownToHtml(props.markdown || '', {
    isDarkMode: props.isDark,
    allowHtml: props.allowHtml,
    enableLatex: props.enableLatex,
    renderMode: 'interactive',
    mermaidMode: props.mermaidMode,
    headingIdPrefix: props.headingIdPrefix || '',
  });

  renderedHtml.value = rendered.html || ' ';
  await nextTick();
  if (ticket !== renderTicket) return;

  const container = rootRef.value;
  if (!container) return;

  await renderMermaidBlocks(container, {
    theme: props.mermaidConfig?.theme || (props.isDark ? 'dark' : 'light'),
  });
};

onMounted(() => {
  rootRef.value?.addEventListener('click', handleRootClick);
});

onBeforeUnmount(() => {
  rootRef.value?.removeEventListener('click', handleRootClick);
});

watch(
  () => [
    props.markdown,
    props.isDark,
    props.allowHtml,
    props.enableLatex,
    props.headingIdPrefix,
    props.mermaidConfig?.theme,
    props.mermaidMode,
  ],
  () => {
    void refreshMarkdown();
  },
  { immediate: true },
);
</script>

<template>
  <div ref="rootRef" class="markdown-renderer">
    <div class="elx-xmarkdown-container" v-html="renderedHtml"></div>
  </div>
</template>

<style scoped>
.markdown-renderer {
  width: 100%;
}

.markdown-renderer :deep(.md-code-block) {
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color-light) 92%, transparent);
  overflow: hidden;
  margin: 0 0 1em;
}

.markdown-renderer :deep(.md-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-fill-color) 88%, transparent);
}

.markdown-renderer :deep(.md-code-lang) {
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.markdown-renderer :deep(.md-copy-button) {
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 8px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.markdown-renderer :deep(.md-copy-button:hover) {
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color-darker);
}

.markdown-renderer :deep(.md-code-block pre) {
  margin: 0;
  border: none;
  border-radius: 0;
}

.markdown-renderer :deep(.markdown-mermaid .mermaid-toggle-btn) {
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.markdown-renderer :deep(.markdown-mermaid .mermaid-toggle-btn.is-active) {
  border-color: var(--text-accent);
  color: var(--text-accent);
}

.markdown-renderer :deep(.markdown-mermaid .mermaid-preview svg) {
  max-width: 100%;
}

.markdown-renderer :deep(.markdown-mermaid .mermaid-error) {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
