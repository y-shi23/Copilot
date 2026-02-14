import { describe, expect, it } from 'vitest';
import { formatMessageText, sanitizeToolArgs } from './formatters';

describe('formatters', () => {
  it('extracts plain text from mixed message parts', () => {
    const text = formatMessageText([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'x' } },
      { type: 'text', text: ' world' },
    ]);

    expect(text).toBe('hello world');
  });

  it('sanitizes broken JSON strings', () => {
    const fixed = sanitizeToolArgs('prefix {"a":1} suffix');
    expect(fixed).toBe('{"a":1}');
  });
});
