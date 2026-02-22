export interface OutlineMessageCandidate {
  id: string | number;
  role?: string;
  top: number;
  bottom: number;
  order: number;
}

const normalizeRole = (role: unknown) =>
  String(role || '')
    .trim()
    .toLowerCase();

const normalizeBounds = (top: number, bottom: number) => {
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return {
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  };
};

export const pickActiveOutlineMessageId = (
  candidates: OutlineMessageCandidate[],
  centerY: number,
): string | number | null => {
  if (!Number.isFinite(centerY)) return null;

  let intersectingBest: { id: string | number; distance: number; order: number } | null = null;
  let nearestBest: { id: string | number; distance: number; order: number } | null = null;

  for (const candidate of candidates) {
    if (normalizeRole(candidate?.role) !== 'assistant') continue;

    const bounds = normalizeBounds(candidate.top, candidate.bottom);
    if (!bounds) continue;

    const order = Number.isFinite(candidate.order) ? candidate.order : Number.POSITIVE_INFINITY;
    const intersects = bounds.top <= centerY && bounds.bottom >= centerY;
    const distance = intersects
      ? Math.abs(centerY - bounds.top)
      : Math.min(Math.abs(centerY - bounds.top), Math.abs(centerY - bounds.bottom));

    if (intersects) {
      if (
        !intersectingBest ||
        distance < intersectingBest.distance ||
        (distance === intersectingBest.distance && order < intersectingBest.order)
      ) {
        intersectingBest = { id: candidate.id, distance, order };
      }
      continue;
    }

    if (
      !nearestBest ||
      distance < nearestBest.distance ||
      (distance === nearestBest.distance && order < nearestBest.order)
    ) {
      nearestBest = { id: candidate.id, distance, order };
    }
  }

  return intersectingBest?.id ?? nearestBest?.id ?? null;
};
