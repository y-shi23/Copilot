import { describe, expect, it } from 'vitest';

import { pickActiveOutlineMessageId } from './activeOutlineMessage';

describe('activeOutlineMessage', () => {
  it('returns assistant message that intersects chat center first', () => {
    const id = pickActiveOutlineMessageId(
      [
        { id: 'u1', role: 'user', top: 80, bottom: 140, order: 0 },
        { id: 'a1', role: 'assistant', top: 120, bottom: 220, order: 1 },
        { id: 'a2', role: 'assistant', top: 230, bottom: 330, order: 2 },
      ],
      200,
    );
    expect(id).toBe('a1');
  });

  it('falls back to nearest assistant when none intersects center', () => {
    const id = pickActiveOutlineMessageId(
      [
        { id: 'a1', role: 'assistant', top: 20, bottom: 90, order: 0 },
        { id: 'a2', role: 'assistant', top: 280, bottom: 350, order: 1 },
      ],
      200,
    );
    expect(id).toBe('a2');
  });

  it('ignores non-assistant roles', () => {
    const id = pickActiveOutlineMessageId(
      [
        { id: 'u1', role: 'user', top: 180, bottom: 260, order: 0 },
        { id: 'sys', role: 'system', top: 170, bottom: 250, order: 1 },
      ],
      200,
    );
    expect(id).toBeNull();
  });

  it('breaks ties by order', () => {
    const id = pickActiveOutlineMessageId(
      [
        { id: 'a2', role: 'assistant', top: 110, bottom: 190, order: 2 },
        { id: 'a1', role: 'assistant', top: 110, bottom: 190, order: 1 },
      ],
      220,
    );
    expect(id).toBe('a1');
  });
});
