import { describe, expect, it } from 'vitest';

import {
  buildViewportMetrics,
  pickActiveHeading,
  resolveOutlinePosition,
} from './messageOutlineViewport';

describe('messageOutlineViewport', () => {
  it('builds normalized viewport metrics from top/bottom values', () => {
    const metrics = buildViewportMetrics(200, 100);
    expect(metrics).toEqual({
      top: 100,
      bottom: 200,
      centerY: 150,
      height: 100,
    });
  });

  it('resolves outline position around viewport center', () => {
    const viewport = buildViewportMetrics(100, 500); // center = 300

    expect(resolveOutlinePosition({ top: 120, bottom: 350 }, viewport)).toBe('active');
    expect(resolveOutlinePosition({ top: 40, bottom: 300 }, viewport)).toBe('before');
    expect(resolveOutlinePosition({ top: 300, bottom: 420 }, viewport)).toBe('after');
  });

  it('returns active when geometry is missing', () => {
    expect(resolveOutlinePosition(null, null)).toBe('active');
    expect(resolveOutlinePosition({ top: 0, bottom: 10 }, null)).toBe('active');
  });

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
