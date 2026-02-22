import type { MermaidConfig } from 'mermaid';

let initializedTheme: string | null = null;

const decodeMermaidSource = (encoded: string) => {
  try {
    return decodeURIComponent(encoded);
  } catch (_error) {
    return encoded;
  }
};

const toMermaidTheme = (
  theme: string | undefined,
): 'default' | 'base' | 'neutral' | 'dark' | 'forest' => {
  if (!theme) return 'neutral';
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'default';
  if (theme === 'default' || theme === 'base' || theme === 'neutral' || theme === 'forest') {
    return theme;
  }
  return 'neutral';
};

export const renderMermaidBlocks = async (
  root: ParentNode,
  options: {
    theme?: string;
  } = {},
) => {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('.markdown-mermaid[data-mermaid-code]'),
  );
  if (blocks.length === 0) return;

  const mermaidModule = await import('mermaid');
  const mermaidApi = (mermaidModule.default || mermaidModule) as typeof import('mermaid').default;
  const theme = toMermaidTheme(options.theme);

  if (initializedTheme !== theme) {
    const config: MermaidConfig = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
    };
    mermaidApi.initialize(config);
    initializedTheme = theme;
  }

  for (const block of blocks) {
    const preview = block.querySelector<HTMLElement>('.mermaid-preview');
    if (!preview) continue;

    const encoded = block.getAttribute('data-mermaid-code') || '';
    const source = decodeMermaidSource(encoded);
    if (!source.trim()) {
      preview.textContent = 'Empty mermaid diagram.';
      continue;
    }

    const renderId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const result = await mermaidApi.render(renderId, source);
      preview.innerHTML = result.svg;
      preview.removeAttribute('data-mermaid-error');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      preview.setAttribute('data-mermaid-error', '1');
      preview.innerHTML = `<pre class="mermaid-error">${message}</pre>`;
    }
  }
};
