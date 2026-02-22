import { describe, expect, it } from 'vitest';

import { pickActiveHeading } from './messageOutlineViewport';

describe('messageOutlineViewport', () => {
  it('picks top-most intersecting heading', () => {
    const active = pickActiveHeading(
      [
        { id: 'h2', isIntersecting: true, top: 220, order: 1 },
        { id: 'h1', isIntersecting: true, top: 180, order: 0 },
        { id: 'h3', isIntersecting: false, top: 160, order: 2 },
      ],
      null,
    );
    expect(active).toBe('h1');
  });

  it('breaks ties by heading order and falls back when no heading intersects', () => {
    const byOrder = pickActiveHeading(
      [
        { id: 'h2', isIntersecting: true, top: 100, order: 2 },
        { id: 'h1', isIntersecting: true, top: 100, order: 0 },
      ],
      null,
    );
    expect(byOrder).toBe('h1');

    const fallback = pickActiveHeading(
      [
        { id: 'h1', isIntersecting: false, top: 100, order: 0 },
        { id: 'h2', isIntersecting: false, top: 130, order: 1 },
      ],
      'h2',
    );
    expect(fallback).toBe('h2');
  });
});
