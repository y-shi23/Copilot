import { describe, expect, it } from 'vitest';

interface InputModule {
  getRandomItem: (list: string | string[]) => string;
}

const { getRandomItem } = require('../src/input.ts') as InputModule;

describe('input.getRandomItem', () => {
  it('returns a value from comma-separated string', () => {
    const result = getRandomItem('a,b,c');
    expect(['a', 'b', 'c']).toContain(result);
  });

  it('returns original string when no separator exists', () => {
    const result = getRandomItem('single');
    expect(result).toBe('single');
  });

  it('returns empty string for empty list', () => {
    const result = getRandomItem([]);
    expect(result).toBe('');
  });
});
