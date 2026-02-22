import { describe, expect, it } from 'vitest';

import { createSlugger, extractMarkdownHeadings, injectHeadingIdsIntoHtml } from './headingIds';

describe('headingIds', () => {
  it('generates normalized slugs for english/chinese headings and deduplicates them', () => {
    const slugger = createSlugger();
    expect(slugger.slug('Hello, World!')).toBe('hello-world');
    expect(slugger.slug('中文 标题')).toBe('中文-标题');
    expect(slugger.slug('Hello, World!')).toBe('hello-world-1');
  });

  it('extracts markdown and html headings with heading prefix ids', () => {
    const source = [
      '# Main Title',
      '## 子标题',
      '',
      '```ts',
      '# ignored',
      '```',
      '<h3>HTML <em>Heading</em></h3>',
      '# Main Title',
    ].join('\n');

    const headings = extractMarkdownHeadings(source, { idPrefix: 'heading-123' });
    expect(headings).toHaveLength(4);
    expect(headings.map((item) => item.text)).toEqual([
      'Main Title',
      '子标题',
      'HTML Heading',
      'Main Title',
    ]);
    expect(headings.map((item) => item.id)).toEqual([
      'heading-123--main-title',
      'heading-123--子标题',
      'heading-123--html-heading',
      'heading-123--main-title-1',
    ]);
  });

  it('injects heading ids into rendered html while preserving existing ids', () => {
    const html = [
      '<h1>Repeat</h1>',
      '<h2>Repeat</h2>',
      '<h3 id="preset-id">Keep Existing</h3>',
    ].join('');
    const injected = injectHeadingIdsIntoHtml(html, { idPrefix: 'heading-9' });

    expect(injected).toContain('<h1 id="heading-9--repeat">Repeat</h1>');
    expect(injected).toContain('<h2 id="heading-9--repeat-1">Repeat</h2>');
    expect(injected).toContain('<h3 id="preset-id">Keep Existing</h3>');
  });
});
