// The shadow ledger: every candidate the rules produce — sworn or declined — is entered at the real HSK mainnet pool price and
// graded by the contract's own rules (5-minute TWAP and live price past the target or void level; lapsed at expiry) against real
// mainnet prices. Declined candidates show what Avow's restraint saved; sworn ones should match the vault. Costs: both 0.30% pool fees
// and gas at 500 gwei; price impact is not modelled here (research/REPLAY.md measures it: 4.5–18 bps on a $50 trade).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, type Sym } from "./config.js";
import type { Candidate } from "./signals.js";
import type { MainnetPool } from "./market.js";

export interface Shadow {
  id: number;
  t: number;
  sym: Sym;
  side: "long" | "short";
  kind: string;
  entry: number; // mainnet pool TWAP when the candidate appeared
  target: number;
  void: number;
  expiry: number;
  pMin: number;
  notionalUsd: number;
  decision: "sworn" | "declined" | "passed";
  status: "open" | "honoured" | "void" | "lapsed";
  exitPx?: number;
  settledAt?: number;
  pnlUsd?: number;
}

const FILE = join(DATA_DIR, "shadow.json");
const rows: Shadow[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
const save = () => writeFileSync(FILE, JSON.stringify(rows));
const GAS_USD = 920_000 * 500e-9 * 0.087; // swear + settle at 500 gwei, HSK ≈ $0.087

/** Enter a candidate unless one of the same asset and kind is already open. */
export function enter(c: Candidate, decision: Shadow["decision"], main: MainnetPool | undefined, now: number) {
  if (!main?.twapPx) return;
  if (rows.some((r) => r.status === "open" && r.sym === c.sym && r.kind === c.kind)) return;
  const dir = c.side === "long" ? 1 : -1;
  const e = main.twapPx;
  rows.push({
    id: rows.length + 1,
    t: now,
    sym: c.sym,
    side: c.side,
    kind: c.kind,
    entry: e,
    target: e * (1 + (dir * c.rewardBps) / 1e4),
    void: e * (1 - (dir * c.riskBps) / 1e4),
    expiry: now + c.horizonSec,
    pMin: c.pMin,
    notionalUsd: c.notionalUsd || 50,
    decision,
    status: "open",
  });
  save();
}

/** Grade open shadows against the real mainnet pools. */
export function grade(pools: Record<string, MainnetPool>, now: number) {
  let changed = false;
  for (const r of rows.filter((x) => x.status === "open")) {
    const p = pools[r.sym];
    if (!p?.twapPx || !p.spotPx) continue;
    const long_ = r.side === "long";
    const hit = long_ ? p.twapPx >= r.target && p.spotPx >= r.target : p.twapPx <= r.target && p.spotPx <= r.target;
    const broke = long_ ? p.twapPx <= r.void && p.spotPx <= r.void : p.twapPx >= r.void && p.spotPx >= r.void;
    const lapsed = now >= r.expiry;
    if (!hit && !broke && !lapsed) continue;
    r.status = broke ? "void" : hit ? "honoured" : "lapsed";
    r.exitPx = p.spotPx;
    r.settledAt = now;
    const move = ((p.spotPx - r.entry) / r.entry) * (long_ ? 1 : -1);
    r.pnlUsd = Number((r.notionalUsd * (move - 0.006) - GAS_USD).toFixed(4));
    changed = true;
  }
  if (changed) save();
}

/** Record what was decided about the open shadow of this asset and kind. */
export function mark(sym: Sym, kind: string, decision: Shadow["decision"]) {
  const r = rows.find((x) => x.status === "open" && x.sym === sym && x.kind === kind);
  if (r && r.decision !== "sworn") {
    r.decision = decision;
    save();
  }
}

export function shadowState() {
  const settled = rows.filter((r) => r.status !== "open");
  const sum = (xs: Shadow[]) => Number(xs.reduce((s, r) => s + (r.pnlUsd ?? 0), 0).toFixed(4));
  const refused = settled.filter((r) => r.decision !== "sworn");
  return {
    method: "Every candidate the rules produced, entered at the real HSK mainnet pool TWAP and graded by the vault's own settlement rules against real mainnet prices; both 0.30% fees and gas at 500 gwei included, price impact not.",
    since: rows[0]?.t ?? null,
    counts: { total: rows.length, open: rows.length - settled.length, honoured: settled.filter((r) => r.status === "honoured").length, void: settled.filter((r) => r.status === "void").length, lapsed: settled.filter((r) => r.status === "lapsed").length },
    pnlUsd: sum(settled),
    refusedPnlUsd: sum(refused), // what the declined candidates would have made (negative = loss avoided)
    swornPnlUsd: sum(settled.filter((r) => r.decision === "sworn")),
    recent: rows.slice(-30).reverse(),
  };
}
