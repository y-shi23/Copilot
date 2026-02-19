import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import katex from 'katex';

import { isLikelyLocalPath, normalizeLocalPath, preprocessMarkdownText } from './preprocess';
import { injectHeadingIdsIntoHtml } from './headingIds';
import type { MarkdownRenderOptions, MarkdownRenderResult } from './types';

const parserCache = new Map<string, MarkdownIt>();

const escapeHtml = (value: string) => MarkdownIt().utils.escapeHtml(value);

const toSafeLang = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');

const highlightCode = (code: string, lang: string) => {
  const safeLang = toSafeLang(lang);
  if (safeLang && hljs.getLanguage(safeLang)) {
    return hljs.highlight(code, { language: safeLang, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(code).value;
};

const renderCopyButton = (label = 'Copy') =>
  `<button class="md-copy-button" type="button" aria-label="${label}">${label}</button>`;

const renderCodeBlock = (rawCode: string, lang: string, mode: 'interactive' | 'static') => {
  const safeLang = toSafeLang(lang);
  const highlightedHtml = highlightCode(rawCode, safeLang);
  const languageLabel = (safeLang || 'text').toUpperCase();
  const copyButtonHtml = mode === 'interactive' ? renderCopyButton() : '';

  return [
    `<div class="md-code-block" data-code-lang="${safeLang || 'text'}">`,
    `<div class="md-code-toolbar"><span class="md-code-lang">${languageLabel}</span>${copyButtonHtml}</div>`,
    `<pre><code class="hljs${safeLang ? ` language-${safeLang}` : ''}">${highlightedHtml}</code></pre>`,
    `</div>`,
  ].join('');
};

const renderMermaidBlock = (
  rawCode: string,
  options: Required<Pick<MarkdownRenderOptions, 'renderMode' | 'mermaidMode'>>,
) => {
  if (options.renderMode === 'static' || options.mermaidMode === 'source-only') {
    return renderCodeBlock(rawCode, 'mermaid', 'static');
  }

  const encodedCode = encodeURIComponent(rawCode);
  return [
    `<div class="markdown-mermaid" data-mermaid-code="${encodedCode}" data-mermaid-view="preview">`,
    `<div class="mermaid-toolbar">`,
    `<button class="mermaid-toggle-btn is-active" type="button" data-mermaid-target="preview">Preview</button>`,
    `<button class="mermaid-toggle-btn" type="button" data-mermaid-target="source">Source</button>`,
    `</div>`,
    `<div class="mermaid-content" data-mermaid-panel="preview"><div class="mermaid-preview">Rendering diagram...</div></div>`,
    `<pre class="mermaid-source-code" data-mermaid-panel="source" hidden><code class="language-mermaid">${escapeHtml(rawCode)}</code></pre>`,
    `</div>`,
  ].join('');
};

const renderKatex = (source: string, displayMode = false) => {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
    });
  } catch (_error) {
    return `<code>${escapeHtml(source)}</code>`;
  }
};

const katexPlugin = (md: MarkdownIt) => {
  const inlineRule = (state: any, silent: boolean) => {
    const start = state.pos;
    const src = state.src;
    if (src[start] !== '$') return false;
    if (src[start + 1] === '$') return false;
    if (start > 0 && src[start - 1] === '\\') return false;

    let match = start + 1;
    while ((match = src.indexOf('$', match)) !== -1) {
      if (src[match - 1] === '\\') {
        match += 1;
        continue;
      }
      if (match === start + 1) {
        match += 1;
        continue;
      }

      const content = src.slice(start + 1, match);
      if (/^\s|\s$/.test(content)) {
        match += 1;
        continue;
      }

      if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.content = content;
      }
      state.pos = match + 1;
      return true;
    }
    return false;
  };

  const blockRule = (state: any, startLine: number, endLine: number, silent: boolean) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const lineText = state.src.slice(startPos, maxPos);
    if (!lineText.startsWith('$$')) return false;

    const lineAfter = lineText.slice(2);
    if (lineAfter.trim().endsWith('$$') && lineAfter.trim() !== '$$') {
      if (silent) return true;
      const content = lineAfter.trim().slice(0, -2).trim();
      const token = state.push('math_block', 'math', 0);
      token.block = true;
      token.content = content;
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    }

    let nextLine = startLine + 1;
    let found = false;
    let content = lineAfter.length > 0 ? `${lineAfter}\n` : '';

    while (nextLine < endLine) {
      const pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      const nextText = state.src.slice(pos, max);
      if (nextText.trim().endsWith('$$')) {
        found = true;
        content += nextText.replace(/\$\$\s*$/, '');
        break;
      }
      content += `${nextText}\n`;
      nextLine += 1;
    }

    if (!found) return false;
    if (silent) return true;

    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  };

  md.inline.ruler.after('backticks', 'math_inline', inlineRule);
  md.block.ruler.after('blockquote', 'math_block', blockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderKatex(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="katex-display-wrapper">${renderKatex(tokens[idx].content, true)}</div>`;
};

const buildMarkdownParser = (options: Required<MarkdownRenderOptions>) => {
  const cacheKey = [
    options.allowHtml ? '1' : '0',
    options.enableLatex ? '1' : '0',
    options.renderMode,
    options.mermaidMode,
  ].join(':');
  const cached = parserCache.get(cacheKey);
  if (cached) return cached;

  const md = new MarkdownIt({
    html: options.allowHtml,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  if (options.enableLatex) {
    md.use(katexPlugin);
  }

  md.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx];
    const rawText = token.content || '';
    if (isLikelyLocalPath(rawText)) {
      const cleanPath = normalizeLocalPath(rawText);
      return `<a href="#" data-filepath="${encodeURIComponent(cleanPath)}" class="local-file-link" style="text-decoration:none;" title="点击打开文件"><code class="inline-code-tag">${escapeHtml(rawText)}</code></a>`;
    }
    return `<code class="inline-code-tag">${escapeHtml(rawText)}</code>`;
  };

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const lang = info.split(/\s+/g)[0] || '';
    const rawCode = token.content.replace(/\n$/, '');

    if (toSafeLang(lang) === 'mermaid') {
      return renderMermaidBlock(rawCode, {
        renderMode: options.renderMode || 'interactive',
        mermaidMode: options.mermaidMode || 'preview-source',
      });
    }
    return renderCodeBlock(rawCode, lang, options.renderMode || 'interactive');
  };

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, _opts, _env, self) => self.renderToken(tokens, idx, _opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') || '';
    if (/^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  const defaultTableOpen =
    md.renderer.rules.table_open ||
    ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));
  const defaultTableClose =
    md.renderer.rules.table_close ||
    ((tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts));

  md.renderer.rules.table_open = (tokens, idx, opts, env, self) =>
    `<div class="table-scroll-wrapper">${defaultTableOpen(tokens, idx, opts, env, self)}`;
  md.renderer.rules.table_close = (tokens, idx, opts, env, self) =>
    `${defaultTableClose(tokens, idx, opts, env, self)}</div>`;

  parserCache.set(cacheKey, md);
  return md;
};

const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['audio', 'video', 'source', 'button'],
    ADD_ATTR: [
      'class',
      'style',
      'title',
      'target',
      'rel',
      'data-filepath',
      'data-mermaid-code',
      'data-mermaid-view',
      'data-mermaid-target',
      'data-mermaid-panel',
      'data-mermaid-error',
      'data-code-lang',
      'hidden',
      'type',
      'aria-label',
      'controls',
      'autoplay',
      'preload',
      'src',
      'id',
    ],
  });

export const renderMarkdownToHtml = (
  markdown: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderResult => {
  const normalizedOptions: Required<MarkdownRenderOptions> = {
    isDarkMode: Boolean(options.isDarkMode),
    allowHtml: options.allowHtml !== false,
    enableLatex: options.enableLatex !== false,
    renderMode: options.renderMode || 'interactive',
    mermaidMode: options.mermaidMode || 'preview-source',
    headingIdPrefix: options.headingIdPrefix || '',
  };

  const source = preprocessMarkdownText(markdown || '', normalizedOptions.enableLatex);
  const parser = buildMarkdownParser(normalizedOptions);
  const rawHtml = parser.render(source);
  const headingAwareHtml = injectHeadingIdsIntoHtml(rawHtml, {
    idPrefix: normalizedOptions.headingIdPrefix,
  });
  const safeHtml = sanitizeHtml(headingAwareHtml);
  return {
    html: safeHtml || ' ',
  };
};
