// Brier arithmetic for explainers (pure, safe for client components).

/** Expected Brier when an agent states p and is right a share h of the time. */
export const expectedBrier = (p: number, h: number) => h * (1 - p) ** 2 + (1 - h) * p ** 2;

/** The hit rate at which stating p scores b (where the line crosses), or null if it never does in 0..1. */
export function hitRateFor(p: number, b: number): number | null {
  const lo = p ** 2; // h = 0
  const hi = (1 - p) ** 2; // h = 1
  if (lo === hi) return null;
  const h = (lo - b) / (lo - hi);
  return h >= 0 && h <= 1 ? h : null;
}
