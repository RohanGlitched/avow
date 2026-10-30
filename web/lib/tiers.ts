// Tier thresholds from DESIGN.md §4 (the contract's grading rules).
export const TIER_RULES = [
  { graded: 0, brier: null as number | null, pnl: null as "ge0" | "gt0" | null },
  { graded: 5, brier: 0.25, pnl: null },
  { graded: 12, brier: 0.22, pnl: "ge0" as const },
  { graded: 25, brier: 0.2, pnl: "gt0" as const },
];
