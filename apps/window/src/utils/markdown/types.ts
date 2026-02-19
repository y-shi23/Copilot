export type MarkdownRenderMode = 'interactive' | 'static';

export type MermaidRenderMode = 'preview-source' | 'source-only';

export interface MarkdownRenderOptions {
  isDarkMode?: boolean;
  allowHtml?: boolean;
  enableLatex?: boolean;
  renderMode?: MarkdownRenderMode;
  mermaidMode?: MermaidRenderMode;
  headingIdPrefix?: string;
}

export interface MarkdownRenderResult {
  html: string;
}
