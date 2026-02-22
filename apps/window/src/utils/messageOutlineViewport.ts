export interface ViewportMetrics {
  top: number;
  bottom: number;
  centerY: number;
  height: number;
}

export interface VerticalBounds {
  top: number;
  bottom: number;
}

export type OutlinePosition = 'before' | 'active' | 'after';

export interface HeadingIntersectionState {
  id: string;
  isIntersecting: boolean;
  top: number;
  order: number;
}

const toFiniteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export const buildViewportMetrics = (top: number, bottom: number): ViewportMetrics => {
  const safeTop = toFiniteOr(top, 0);
  const safeBottom = toFiniteOr(bottom, safeTop);
  const normalizedTop = Math.min(safeTop, safeBottom);
  const normalizedBottom = Math.max(safeTop, safeBottom);
  const height = Math.max(0, normalizedBottom - normalizedTop);
  return {
    top: normalizedTop,
    bottom: normalizedBottom,
    centerY: normalizedTop + height / 2,
    height,
  };
};

export const resolveOutlinePosition = (
  messageRect: VerticalBounds | null | undefined,
  viewport: ViewportMetrics | null | undefined,
): OutlinePosition => {
  if (!messageRect || !viewport) return 'active';

  if (messageRect.bottom <= viewport.centerY) return 'before';
  if (messageRect.top >= viewport.centerY) return 'after';
  return 'active';
};

export const pickActiveHeading = (
  candidates: HeadingIntersectionState[],
  fallbackId: string | null = null,
): string | null => {
  let bestId: string | null = null;
  let bestTop = Number.POSITIVE_INFINITY;
  let bestOrder = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate?.isIntersecting) continue;

    const top = Number.isFinite(candidate.top) ? candidate.top : Number.POSITIVE_INFINITY;
    const order = Number.isFinite(candidate.order) ? candidate.order : Number.POSITIVE_INFINITY;

    if (top < bestTop || (top === bestTop && order < bestOrder)) {
      bestId = candidate.id;
      bestTop = top;
      bestOrder = order;
    }
  }

  return bestId ?? fallbackId;
};
