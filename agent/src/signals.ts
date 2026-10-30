import { CHAINLINK_MAX_AGE_S, CHAINLINK_MAX_DEV_BPS, POOL_FEE_BPS, ASSETS, type Sym } from "./config.js";
import type { Snap } from "./market.js";
import type { VaultView } from "./vault.js";

/** A trade the rules allow, with levels computed here (never by the model). */
export interface Candidate {
  key: string; // "WETH:long:catch-up"
  sym: Sym;
  assetId: number;
  side: "long" | "short";
  kind: "catch-up" | "momentum";
  entry: number; // TWAP now
  target: number;
  void: number;
  horizonSec: number;
  notionalUsd: number;
  rewardBps: number;
  riskBps: number;
  pMin: number; // break-even probability at these levels: risk / (reward + risk)
  facts: string[]; // the numbers the model may quote
  why: string; // one deterministic line
}

export interface Pass {
  sym: Sym;
  reason: string; // why there is no candidate for this asset now
}

const r = (x: number, p = 2) => Number(x.toFixed(p));

export function candidates(snaps: Snap[], v: VaultView): { list: Candidate[]; passes: Pass[] } {
  const list: Candidate[] = [];
  const passes: Pass[] = [];
  const m = v.mandate;
  const now = v.blockTime;
  const maxStop = m.maxStopBps;
  const minRR = m.minRewardRiskX100 / 100;
  const cap = Math.min(v.denomination, Number(m.maxExposure) / 1e6 - v.exposure);

  for (const s of snaps) {
    const a = ASSETS.find((x) => x.sym === s.sym)!;
    if (!((m.assetMask >> a.id) & 1)) { passes.push({ sym: s.sym, reason: "the mandate does not allow this asset" }); continue; }
    if (v.notes.some((n) => n.asset === a.id && n.status === "outstanding")) { passes.push({ sym: s.sym, reason: "a note on this asset is already outstanding" }); continue; }
    if (s.twapPx === null || s.fairPx === null) { passes.push({ sym: s.sym, reason: "no price: the pool TWAP or the exchange mid could not be read" }); continue; }
    if (s.chainlinkPx === null || s.chainlinkAgeSec === null || s.chainlinkAgeSec > CHAINLINK_MAX_AGE_S) { passes.push({ sym: s.sym, reason: `Chainlink ${s.label}/USD is stale or unreadable, so the off-chain seatbelt refuses` }); continue; }
    if ((s.chainlinkDevBps ?? 1e9) > CHAINLINK_MAX_DEV_BPS) { passes.push({ sym: s.sym, reason: `the pool is ${r((s.chainlinkDevBps ?? 0) / 100)}% from Chainlink, beyond the 3% seatbelt` }); continue; }
    if (s.spotPx !== null && (Math.abs(s.spotPx - s.twapPx) / s.twapPx) * 1e4 > m.maxSpotDevBps) { passes.push({ sym: s.sym, reason: "the live price is away from the 5-minute TWAP (a spike); waiting for it to settle" }); continue; }
    if (cap < 1) { passes.push({ sym: s.sym, reason: `no room: denomination $${r(v.denomination)} and open exposure $${r(v.exposure)}` }); continue; }

    const gap = s.gapBps ?? 0; // + = HSKSwap cheap vs exchanges
    const absGap = Math.abs(gap);
    const facts = [
      `HSKSwap ${s.label} 5-minute TWAP ${r(s.twapPx, a.pricePlaces + 2)}`,
      `exchange mid (HashKey Global ${s.hashkeyPx ? r(s.hashkeyPx, a.pricePlaces + 2) : "n/a"}, Gate ${s.gatePx ? r(s.gatePx, a.pricePlaces + 2) : "n/a"}) ${r(s.fairPx, a.pricePlaces + 2)}`,
      `gap ${r(gap / 100, 2)}% (positive means HSKSwap is cheaper)`,
      `Chainlink ${r(s.chainlinkPx, a.pricePlaces + 2)}, ${Math.round((s.chainlinkAgeSec ?? 0) / 60)} min old`,
      `last swap in the pool ${s.lastSwapAgoSec !== null ? Math.round(s.lastSwapAgoSec / 60) + " min ago" : "unknown"}`,
      `${s.swaps3h ?? "unknown"} swaps in the pool in the last ~3 hours, net ${s.netFlowUsd3h !== null ? (s.netFlowUsd3h >= 0 ? "buying" : "selling") + " of $" + Math.abs(s.netFlowUsd3h).toFixed(0) : "unknown"}, largest $${s.maxSwapUsd3h !== null ? s.maxSwapUsd3h.toFixed(0) : "?"}`,
      `pool depth ${s.poolUsdt !== null ? "$" + Math.round(s.poolUsdt).toLocaleString("en-US") : "n/a"} USDT side`,
      `exchange returns 1 h ${s.r1h !== null ? r(s.r1h * 100) : "n/a"}%, 4 h ${s.r4h !== null ? r(s.r4h * 100) : "n/a"}%, 24 h ${s.r24h !== null ? r(s.r24h * 100) : "n/a"}%`,
      `1 h volatility ${s.vol1h !== null ? r(s.vol1h * 100) : "n/a"}%`,
    ];

    // 1. catch-up: HSKSwap lags the exchanges; trade toward fair value and claim the pool will follow
    const edge = absGap - POOL_FEE_BPS - 10;
    let made = false;
    if (edge > 0) {
      const side = gap > 0 ? "long" : "short";
      const rewardBps = Math.min(absGap * 0.8, maxStop * 2);
      const riskBps = Math.min(maxStop, rewardBps / (Math.max(minRR, 1.2) * 1.06));
      if (riskBps >= 28) list.push(build(s, a.id, side, "catch-up", rewardBps, riskBps, 12 * 3600, cap, facts, `HSKSwap is ${r(absGap / 100)}% ${gap > 0 ? "below" : "above"} the exchanges; the pool fee is 0.30%`, now, v));
      made = riskBps >= 28;
    }
    // 2. momentum: the exchanges have trended for 4 hours with the last hour agreeing
    if (s.r4h !== null && s.r1h !== null && s.vol1h !== null) {
      const trend = s.r4h;
      const agree = Math.sign(s.r1h) === Math.sign(trend);
      const strong = Math.abs(trend) > Math.max(0.012, 2.2 * s.vol1h);
      const notAgainstGap = trend > 0 ? gap > -60 : gap < 60;
      if (agree && strong && notAgainstGap) {
        const side = trend > 0 ? "long" : "short";
        const riskBps = Math.max(40, Math.min(maxStop, s.vol1h * 1e4 * 2.5));
        const rewardBps = riskBps * Math.max(minRR * 1.06, 1.5);
        list.push(build(s, a.id, side, "momentum", rewardBps, riskBps, 8 * 3600, cap, facts, `the exchanges moved ${r(trend * 100)}% in 4 hours and the last hour agrees`, now, v));
        made = true;
      }
    }
    if (!made) passes.push({ sym: s.sym, reason: edge <= 0 ? `HSKSwap is within ${r(absGap / 100)}% of the exchanges, under the 0.40% needed to beat the fee` : "no trend strong enough" });
  }
  return { list, passes };
}

function build(s: Snap, assetId: number, side: "long" | "short", kind: Candidate["kind"], rewardBps: number, riskBps: number, horizon: number, cap: number, facts: string[], why: string, now: number, v: VaultView): Candidate {
  const e = s.twapPx!;
  const dir = side === "long" ? 1 : -1;
  const target = e * (1 + (dir * rewardBps) / 1e4);
  const voidPx = e * (1 - (dir * riskBps) / 1e4);
  const horizonSec = Math.min(horizon, v.mandate.maxHorizon);
  // short notes sell free inventory: size to what the vault holds
  let notional = cap;
  if (side === "short") {
    const bal = v.balances.find((b) => b.sym === s.sym)!;
    notional = Math.min(cap, (bal.amount - bal.locked) * e * 0.98);
  }
  return {
    key: `${s.sym}:${side}:${kind}`,
    sym: s.sym,
    assetId,
    side,
    kind,
    entry: e,
    target,
    void: voidPx,
    horizonSec,
    notionalUsd: Math.max(0, Math.floor(notional * 100) / 100),
    rewardBps,
    riskBps,
    pMin: riskBps / (rewardBps + riskBps),
    facts,
    why,
  };
}
