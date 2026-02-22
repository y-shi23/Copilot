export interface HeadingIntersectionState {
  id: string;
  isIntersecting: boolean;
  top: number;
  order: number;
}

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
