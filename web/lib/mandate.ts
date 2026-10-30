import type { AssetSym, Mandate, State } from "./types";
import { ASSET_LABEL, duration, num, realisedDrawdown, usd } from "./format";

export type NumField = Exclude<keyof Mandate, "assets" | "paused">;

export interface Clause {
  field: NumField;
  title: string; // short name
  /** Plain-words clause as it reads in the charter. */
  sentence: (v: number, m: Mandate) => string;
  value: (v: number) => string;
  /** Which direction is stricter. */
  stricter: "lower" | "higher";
  min: number;
  max: number;
  step: number;
  rosette: string; // which harmonic it drives
  guard: string; // where the contract checks it
  /** Editor display: value shown = raw / scale, with this unit. */
  unit: string;
  scale?: number;
}

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

export const CLAUSES: Clause[] = [
  {
    field: "maxNotionalUsd", title: "Largest note", stricter: "lower", min: 5, max: 500, step: 5, unit: "USD",
    value: (v) => usd(v, { dp: 0 }),
    sentence: (v) => `No note may be written for more than ${usd(v, { dp: 0 })}. Until Avow earns the top tier, its denomination is a share of this.`,
    rosette: "loop depth of the main rosette", guard: "swear(): notional ≤ min(denomination, maxNotional)",
  },
  {
    field: "maxExposureUsd", title: "Open exposure", stricter: "lower", min: 10, max: 3000, step: 10, unit: "USD",
    value: (v) => usd(v, { dp: 0 }),
    sentence: (v) => `All outstanding notes together may never hold more than ${usd(v, { dp: 0 })} of the vault.`,
    rosette: "outer loops of the main rosette", guard: "swear(): open exposure + notional ≤ maxExposure",
  },
  {
    field: "maxStopBps", title: "Stop distance", stricter: "lower", min: 100, max: 2000, step: 25, unit: "bps",
    value: (v) => pct(v),
    sentence: (v) => `No note may risk more than ${pct(v)} to its void level.`,
    rosette: "petal depth", guard: "swear(): |entry − void| / entry ≤ maxStopBps",
  },
  {
    field: "minRewardRisk", title: "Reward to risk", stricter: "higher", min: 1, max: 4, step: 0.05, unit: ": 1",
    value: (v) => `${v.toFixed(2)} : 1`,
    sentence: (v) => `Every note must stand to gain at least ${v.toFixed(2)} times what it stands to lose: target distance over void distance.`,
    rosette: "folds of the centre knot", guard: "swear(): (target − entry) ≥ minRewardRisk × (entry − void)",
  },
  {
    field: "maxHorizonSec", title: "Horizon", stricter: "lower", min: 3600, max: 7 * 86400, step: 3600, unit: "hours", scale: 3600,
    value: (v) => duration(v),
    sentence: (v) => `Every note expires within ${duration(v)} of being sworn. A note that has not reached either level by then lapses.`,
    rosette: "radius of the petal ring", guard: "swear(): expiry − now ≤ maxHorizon",
  },
  {
    field: "maxSlippageBps", title: "Slippage", stricter: "lower", min: 10, max: 200, step: 5, unit: "bps",
    value: (v) => `${num(v)} bps`,
    sentence: (v) => `No swap may fill more than ${num(v)} bps away from the HSKSwap 5-minute TWAP.`,
    rosette: "depth of the outer band", guard: "swear(), settle(): fill price within maxSlippage of the TWAP",
  },
  {
    field: "maxSpotDevBps", title: "No swearing into a spike", stricter: "lower", min: 20, max: 500, step: 5, unit: "bps",
    value: (v) => `${num(v)} bps`,
    sentence: (v) => `No note may be sworn while the live pool price is more than ${num(v)} bps from its 5-minute TWAP.`,
    rosette: "ripple of the outer band", guard: "swear(): |spot − TWAP| / TWAP ≤ maxSpotDev",
  },
  {
    field: "cooldownSec", title: "Cooldown", stricter: "higher", min: 0, max: 3600, step: 60, unit: "min", scale: 60,
    value: (v) => (v === 0 ? "none" : duration(v)),
    sentence: (v) => (v === 0 ? "Avow may swear notes back to back." : `Avow must wait ${duration(v)} after one note before it swears the next.`),
    rosette: "spread of the main rosette strands", guard: "swear(): now − lastSwear ≥ cooldown",
  },
  {
    field: "dailyLossLimitUsd", title: "Daily loss", stricter: "lower", min: 1, max: 500, step: 1, unit: "USD",
    value: (v) => usd(v, { dp: 0 }),
    sentence: (v) => `Once realised losses reach ${usd(v, { dp: 0 })} in a day, no new note may be sworn until the next day (UTC).`,
    rosette: "size of the centre knot", guard: "swear(): dailyLoss < dailyLossLimit",
  },
  {
    field: "maxDrawdownBps", title: "Drawdown", stricter: "lower", min: 200, max: 5000, step: 50, unit: "bps",
    value: (v) => pct(v),
    sentence: (v) => `If Avow's realised losses take the vault's realised equity ${pct(v)} below its high-water mark, it freezes until the owner unfreezes it. Price moves in the owner's own holdings do not count.`,
    rosette: "waves of the inner band", guard: "settle(): realised equity ≥ HWM × (1 − maxDrawdown) or freeze",
  },
];

export const ALL_ASSETS: AssetSym[] = ["WETH", "WBTC", "WHSK"];

export type ProposalValue = number | string | boolean;
export interface ProposalRow {
  field: string;
  from: ProposalValue;
  to: ProposalValue;
  stricter: boolean;
}

export function diffMandate(a: Mandate, b: Mandate): ProposalRow[] {
  const rows: ProposalRow[] = [];
  for (const c of CLAUSES) {
    const from = a[c.field];
    const to = b[c.field];
    if (from === to) continue;
    rows.push({ field: c.field, from, to, stricter: c.stricter === "lower" ? to < from : to > from });
  }
  const fa = [...a.assets].sort().join(",");
  const fb = [...b.assets].sort().join(",");
  if (fa !== fb) {
    const subset = b.assets.every((x) => a.assets.includes(x));
    rows.push({ field: "assets", from: fa, to: fb, stricter: subset });
  }
  if (a.paused !== b.paused) rows.push({ field: "paused", from: a.paused, to: b.paused, stricter: b.paused });
  return rows;
}

export function fieldTitle(field: string): string {
  if (field === "assets") return "Assets";
  if (field === "paused") return "Paused";
  return CLAUSES.find((c) => c.field === field)?.title ?? field;
}

export function fieldValue(field: string, v: ProposalValue): string {
  if (field === "assets") {
    const list = String(v).split(",").filter(Boolean) as AssetSym[];
    return list.length ? list.map((a) => ASSET_LABEL[a] ?? a).join(", ") : "none";
  }
  if (field === "paused") return v ? "paused" : "trading";
  const c = CLAUSES.find((x) => x.field === field);
  return c && typeof v === "number" ? c.value(v) : String(v);
}

/** Live usage for a clause from the state, in plain words, plus a 0..1 fill. */
export function clauseUsage(field: NumField, s: State): { text: string; fill: number | null } {
  const m = s.mandate;
  const notes = s.notes;
  const open = notes.filter((n) => n.status === "outstanding");
  switch (field) {
    case "maxNotionalUsd": {
      const big = notes.reduce((a, n) => Math.max(a, n.notionalUsd), 0);
      return { text: `Largest note so far ${usd(big)}. Denomination now ${usd(s.record.tier.capUsd)} (${s.record.tier.name}).`, fill: big / m.maxNotionalUsd };
    }
    case "maxExposureUsd": {
      const ex = open.reduce((a, n) => a + n.notionalUsd, 0);
      return { text: `${open.length} outstanding, ${usd(ex)} exposed now.`, fill: ex / m.maxExposureUsd };
    }
    case "maxStopBps": {
      const w = notes.reduce((a, n) => Math.max(a, (Math.abs(n.entryPx - (n.swornVoidPx ?? n.voidPx)) / n.entryPx) * 1e4), 0);
      return { text: `Widest stop sworn ${pct(w)}.`, fill: w / m.maxStopBps };
    }
    case "minRewardRisk": {
      const r = notes.reduce((a, n) => Math.min(a, Math.abs(n.targetPx - n.entryPx) / Math.abs(n.entryPx - (n.swornVoidPx ?? n.voidPx))), Infinity);
      return { text: Number.isFinite(r) ? `Lowest sworn ${r.toFixed(2)} : 1.` : "No notes yet.", fill: Number.isFinite(r) ? m.minRewardRisk / r : null };
    }
    case "maxHorizonSec": {
      const h = notes.reduce((a, n) => Math.max(a, n.expiry - n.openedAt), 0);
      return { text: `Longest horizon sworn ${duration(h)}.`, fill: h / m.maxHorizonSec };
    }
    case "maxSlippageBps":
      return { text: "Fills so far inside the bound; the last refusal is in the journal.", fill: null };
    case "maxSpotDevBps": {
      const d = s.market.reduce((a, r) => (r.dexPx && r.twapPx ? Math.max(a, (Math.abs(r.dexPx - r.twapPx) / r.twapPx) * 1e4) : a), 0);
      return { text: `Live price is ${num(d, 1)} bps from the TWAP at the widest pool right now.`, fill: d / m.maxSpotDevBps };
    }
    case "cooldownSec": {
      const ts = notes.map((n) => n.openedAt).sort((a, b) => a - b);
      let g = Infinity;
      for (let i = 1; i < ts.length; i++) g = Math.min(g, ts[i] - ts[i - 1]);
      return { text: Number.isFinite(g) ? `Shortest gap between notes ${duration(g)}.` : "No notes yet.", fill: null };
    }
    case "dailyLossLimitUsd":
      return { text: `Realised loss today ${usd(s.record.dailyLossUsd)}.`, fill: s.record.dailyLossUsd / m.dailyLossLimitUsd };
    case "maxDrawdownBps": {
      const d = realisedDrawdown(s);
      if (d.hwm == null) return { text: "No note sworn yet: the high-water mark of realised equity is set at the first note.", fill: 0 };
      return { text: `Realised equity ${usd(d.equity)} against its high-water mark of ${usd(d.hwm)}: ${pct(d.dd * 1e4)} down.`, fill: (d.dd * 1e4) / m.maxDrawdownBps };
    }
  }
}

/** Journal entries of kind "blocked" that name this clause. */
const BLOCK_WORDS: Partial<Record<NumField, RegExp>> = {
  maxNotionalUsd: /denomination|notional|size/i,
  maxExposureUsd: /exposure/i,
  maxStopBps: /stop/i,
  minRewardRisk: /reward/i,
  maxHorizonSec: /horizon/i,
  maxSlippageBps: /slippage/i,
  maxSpotDevBps: /spike|spot/i,
  cooldownSec: /cooldown/i,
  dailyLossLimitUsd: /daily loss/i,
  maxDrawdownBps: /drawdown|freeze/i,
};

export function blockedFor(field: NumField, s: State) {
  const re = BLOCK_WORDS[field];
  return s.journal.filter((j) => j.kind === "blocked" && re && re.test(j.title));
}

/** Clauses written into the contract itself. No one can amend them. */
export const STANDING_CLAUSES: { title: string; sentence: string; guard: string; test: string }[] = [
  {
    title: "Swear before trading",
    sentence: "No swap may happen without a sworn note in the same transaction: asset, side, target, void level, expiry and confidence.",
    guard: "swear() is the agent's only way to trade",
    test: "test_honouredLong",
  },
  {
    title: "Not fulfilled by its own trade",
    sentence: "No note may be fulfilled by its own trade: after the opening swap, the live price must still be short of the target.",
    guard: "swear(): post-swap spot strictly between void and target",
    test: "test_aNoteCannotBeFulfilledByItsOwnSwap",
  },
  {
    title: "No note that loses at its stated odds",
    sentence: "Avow cannot swear a note that loses at the odds it publicly states: confidence × reward must exceed (1 − confidence) × risk. Overstated odds are punished by the Brier grade and keep it on Probation.",
    guard: "swear(): p·reward > (1 − p)·risk, odds 50–99%",
    test: "test_noNegativeExpectancyNotes",
  },
  {
    title: "One note per asset",
    sentence: "Only one note per asset may be outstanding at a time.",
    guard: "swear(): no outstanding note on this asset",
    test: "test_cooldownOnePerAssetAndHorizon",
  },
  {
    title: "Stops only tighten",
    sentence: "Avow may move a void level toward the entry, never away from it.",
    guard: "tightenStop(): new void strictly between old void and entry",
    test: "test_tightenStopOnlyTowardEntry",
  },
  {
    title: "Locked funds stay locked",
    sentence: "Funds inside an outstanding note cannot be withdrawn, not even by the owner, until the note is settled or revoked.",
    guard: "withdraw(): amount ≤ free balance",
    test: "test_ownerCannotWithdrawLockedFunds",
  },
];
