// Calibration study of the Avow model agent (research/CALIBRATION.md). NOT imported by index.ts or any runtime file.
//
// For every historical candidate in research/calib-candidates.json (written by `node research/replay.mjs --calib`), it asks
// the model what the live agent would ask, with only what was known at that moment:
//   arm "decide":   the live decide() from brain.ts, unchanged (same system prompt, schema, model call), followed by the
//                   live agent's own handling in agent.ts think()/swearNote(): reshape(), then decline unless the stated
//                   odds clear pMin + 1 point. The model's own sworn record so far is fed back in, as the vault would show it.
//   arm "forecast": the same facts and market lines, but a forecast-only instruction that always returns a probability
//                   in [0, 1] for the candidate exactly as given (decide() only states odds when it swears, floored at 0.50).
// Each call is appended to a JSONL file (resumable). Hard budget cap via CALIB_MAX_USD (default 1.90).
//
// Build:  npx esbuild src/calibrate.ts --bundle --platform=node --format=esm --target=node22 --outfile=<out>/calibrate.mjs
// Run:    DICTUM_DATA_DIR=<scratch> DICTUM_MODELS=gemini-3.5-flash-lite,gemini-3.5-flash node calibrate.mjs <calib-candidates.json> <out.jsonl>
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { decide } from "./brain.js";
import { generate } from "./llm.js";
import { reshape, type Candidate, type Pass } from "./signals.js";
import type { Snap } from "./market.js";
import type { VaultView } from "./vault.js";
import { ASSETS, MODELS, POOL_FEE_BPS, type Sym } from "./config.js";

type Outcome = { status: string; closeT?: number; pnlUsd?: number; netUsd?: number };
interface SnapRow {
  sym: Sym; twapPx: number; spotPx: number; gatePx: number | null; hashkeyPx: number | null; fairPx: number | null; gapBps: number | null;
  lastSwapAgoSec: number | null; swaps3h: number; netFlowUsd3h: number; maxSwapUsd3h: number;
  r1h: number | null; r4h: number | null; r24h: number | null; vol1h: number | null; outstanding: boolean;
  ruleFires: Record<string, boolean> | null; prior: { bucket: string; episodes: number; moved: number; days: number } | null;
}
interface Row {
  id: number; book: string; asset: Sym; kind: "catch-up" | "momentum"; side: "long" | "short"; openT: number; expiry: number;
  entry: number; target: number; void: number; rewardBps: number; riskBps: number; costBps: number; gapBps: number; pMin: number; pMinContract: number; gasUsd: number;
  notional: number; snap: SnapRow[]; variants: Record<string, Outcome>;
}

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) throw new Error("usage: calibrate.mjs <calib-candidates.json> <out.jsonl>");
const MAX_USD = Number(process.env.CALIB_MAX_USD ?? 1.9);
const ONLY = process.env.CALIB_LIMIT ? Number(process.env.CALIB_LIMIT) : Infinity;
const data = JSON.parse(readFileSync(inFile, "utf8")) as { candidates: Row[]; notionalUsd: number };
const rows = data.candidates.slice(0, ONLY);

const r = (x: number, p = 2) => Number(x.toFixed(p));
const asset = (sym: Sym) => ASSETS.find((a) => a.sym === sym)!;

// ── the live Snap shape, rebuilt from the replay's snapshot (Chainlink and pool depth are not in the cache: null)
function toSnap(s: SnapRow, t: number): Snap {
  return {
    sym: s.sym, label: asset(s.sym).label, t, twapPx: s.twapPx, twapPx8: null, spotPx: s.spotPx, poolUsdt: null, poolAsset: null,
    lastSwapAgoSec: s.lastSwapAgoSec, hashkeyPx: s.hashkeyPx, gatePx: s.gatePx, fairPx: s.fairPx, chainlinkPx: null, chainlinkAgeSec: null,
    gapBps: s.gapBps, chainlinkDevBps: null, r1h: s.r1h, r4h: s.r4h, r24h: s.r24h, vol1h: s.vol1h,
    swaps3h: s.swaps3h, netFlowUsd3h: s.netFlowUsd3h, maxSwapUsd3h: s.maxSwapUsd3h,
  };
}

// ── facts and why, in signals.ts's exact wording; the two lines that need uncached data (Chainlink, pool depth) are left out
function factsFor(s: SnapRow, gasUsd: number, cap: number): string[] {
  const a = asset(s.sym);
  const gap = s.gapBps ?? 0;
  const facts = [
    `HSKSwap ${a.label} 5-minute TWAP ${r(s.twapPx, a.pricePlaces + 2)}`,
    `exchange mid (HashKey Global ${s.hashkeyPx ? r(s.hashkeyPx, a.pricePlaces + 2) : "n/a"}, Gate ${s.gatePx ? r(s.gatePx, a.pricePlaces + 2) : "n/a"}) ${r(s.fairPx!, a.pricePlaces + 2)}`,
    `gap ${r(gap / 100, 2)}% (positive means HSKSwap is cheaper)`,
    `last swap in the pool ${s.lastSwapAgoSec !== null ? Math.round(s.lastSwapAgoSec / 60) + " min ago" : "unknown"}`,
    `${s.swaps3h} swaps in the pool in the last ~3 hours, net ${(s.netFlowUsd3h >= 0 ? "buying" : "selling") + " of $" + Math.abs(s.netFlowUsd3h).toFixed(0)}, largest $${s.maxSwapUsd3h.toFixed(0)}`,
    `exchange returns 1 h ${s.r1h !== null ? r(s.r1h * 100) : "n/a"}%, 4 h ${s.r4h !== null ? r(s.r4h * 100) : "n/a"}%, 24 h ${s.r24h !== null ? r(s.r24h * 100) : "n/a"}%`,
    `1 h volatility ${s.vol1h !== null ? r(s.vol1h * 100) : "n/a"}%`,
  ];
  const p = s.prior;
  if (p && p.episodes) facts.push(`measured over ${p.days} days of real HSKSwap swaps: of ${p.episodes} past gaps of ${p.bucket} on this pool, the pool itself moved half-way toward the exchanges within 12 h in ${p.moved} (${Math.round((p.moved / p.episodes) * 100)}%)`);
  const costBps = 2 * POOL_FEE_BPS, gasBps = (gasUsd / Math.max(1, cap)) * 1e4;
  facts.push(`round trip in the vault ${r(costBps, 0)} bps (two 0.30% pool fees); gas about $${r(gasUsd, 3)} a note, paid by the agent's wallet (${r(gasBps, 0)} bps of a $${r(cap)} note)`);
  return facts;
}

function candidateFor(x: Row): Candidate {
  const s = x.snap.find((z) => z.sym === x.asset)!;
  const cap = x.notional;
  const absGap = Math.abs(s.gapBps ?? 0);
  const why = x.kind === "catch-up"
    ? `HSKSwap is ${r(absGap / 100)}% ${(s.gapBps ?? 0) > 0 ? "below" : "above"} the exchanges; the pool fees are ${r((2 * POOL_FEE_BPS) / 100)}% round trip`
    : `the exchanges moved ${r((s.r4h ?? 0) * 100)}% in 4 hours and the last hour agrees`;
  return {
    key: `${x.asset}:${x.side}:${x.kind}`, sym: x.asset, assetId: asset(x.asset).id, side: x.side, kind: x.kind,
    entry: x.entry, target: x.target, void: x.void, horizonSec: x.expiry - x.openT, notionalUsd: cap,
    // today's Candidate: costBps is the vault's two pool fees, gas is separate, pMin is the vault's break-even (pMinContract)
    rewardBps: x.rewardBps, riskBps: x.riskBps, costBps: 2 * POOL_FEE_BPS, gasBps: (x.gasUsd / Math.max(1, cap)) * 1e4, pMin: x.pMinContract, facts: factsFor(s, x.gasUsd, cap), why,
  };
}

// the other assets, with the reason signals.ts would give for no candidate (the 3% seatbelt is judged against the exchange mid,
// as in the replay; the no-edge wording is the one that went with the replayed rule set, whose threshold is cost incl. gas + 20 bps);
// an asset whose own rule fires at this moment is left out (it is asked in its own prompt)
function passesFor(x: Row): Pass[] {
  const out: Pass[] = [];
  for (const s of x.snap) {
    if (s.sym === x.asset) continue;
    if (s.outstanding) { out.push({ sym: s.sym, reason: "a note on this asset is already outstanding" }); continue; }
    if (s.fairPx === null) { out.push({ sym: s.sym, reason: "no price: the pool TWAP or the exchange mid could not be read" }); continue; }
    const dev = (Math.abs(s.twapPx - s.fairPx) / s.fairPx) * 1e4;
    if (dev > 300) { out.push({ sym: s.sym, reason: `the pool is ${r(dev / 100)}% from Chainlink, beyond the 3% seatbelt` }); continue; }
    if ((Math.abs(s.spotPx - s.twapPx) / s.twapPx) * 1e4 > 100) { out.push({ sym: s.sym, reason: "the live price is away from the 5-minute TWAP (a spike); waiting for it to settle" }); continue; }
    if (s.ruleFires && (s.ruleFires["catch-up"] || s.ruleFires.momentum)) continue;
    const absGap = Math.abs(s.gapBps ?? 0);
    out.push({ sym: s.sym, reason: absGap <= x.costBps + 20 ? `HSKSwap is within ${r(absGap / 100)}% of the exchanges; a round trip costs ${r(x.costBps / 100)}%, so there is no edge` : "no trend strong enough" });
  }
  return out;
}

// ── the vault as the model would see it: its own sworn notes, graded once they closed before now
interface Sworn { id: number; openT: number; closeT: number; sym: Sym; side: string; p: number; outcome: Outcome }
function vaultAt(T: number, sworn: Sworn[]): { v: VaultView; recent: string[] } {
  const graded = sworn.filter((n) => n.outcome.closeT !== undefined && n.outcome.closeT <= T);
  const hit = (n: Sworn) => (n.outcome.status === "honoured" ? 1 : 0);
  const ledger = {
    graded: graded.length, honoured: graded.filter((n) => n.outcome.status === "honoured").length, voided: graded.filter((n) => n.outcome.status === "void").length,
    lapsed: graded.filter((n) => n.outcome.status === "lapsed").length, retracted: 0, revoked: 0, voidStreak: 0, windowCount: 0,
    realisedPnl: graded.reduce((s, n) => s + (n.outcome.pnlUsd ?? 0), 0),
  };
  const brier = graded.length ? graded.reduce((s, n) => s + (n.p - hit(n)) ** 2, 0) / graded.length : null;
  const recent = [...graded].sort((a, b) => b.openT - a.openT).slice(0, 6).map((n) => `${asset(n.sym).label} ${n.side} at ${Math.round(n.p * 10000) / 100}% → ${n.outcome.status}`);
  const v = { blockTime: T, ledger, brier, denomination: data.notionalUsd, mandate: { minRewardRiskX100: 120, maxHorizon: 24 * 3600 } } as unknown as VaultView;
  return { v, recent };
}

// ── forecast-only arm: decide()'s prompt text, verbatim, with a forecast instruction in place of the decision instruction
const SYSTEM_FORECAST = `You are Avow, an autonomous trader on HSKSwap (HSK Chain mainnet). You may only trade by swearing a note on chain:
"Avow swears that <asset> will trade above/below <target> on HSKSwap before <time>, or this note is void at <level>."
Every note is graded: it is honoured only if the pool's 5-minute TWAP and live price reach the target before the void level and expiry.
Your stated probability is scored with a Brier score; the size you are allowed to trade (your denomination) grows only if you are calibrated
and profitable, and shrinks if you are overconfident. Honesty about uncertainty is rewarded; bravado is punished.

Facts about this venue you must weigh: HSKSwap pools are thin and quiet (a swap every few hours on some pools). A pool only moves when someone
trades it, so a note that needs the pool to move needs other traders to arrive within the horizon. Your own swap is excluded: the contract
rejects a note its own trade would fulfil. The pool fee is 0.30% each way.

You receive a candidate whose levels and size were computed by deterministic rules from live data. In this task you do not decide whether
to trade and you may not reshape it: give only your probability (0.00–1.00) that this candidate, exactly as given (its target, void level
and horizon), is honoured, i.e. the target is reached before the void level and expiry. Any value from 0 to 1 is allowed; state a value
below 0.50 whenever that is what you believe. pMin is the break-even probability after the round-trip cost, shown for reference only.
Use any measured prior in the facts (how often real HSKSwap gaps closed) as your starting point.
"rationale" is 1–3 short sentences (under 400 characters). Never invent prices, times, or events.`;
const SCHEMA_FORECAST = { type: "OBJECT", properties: { probability: { type: "NUMBER" }, rationale: { type: "STRING" } }, required: ["probability", "rationale"] };

/** brain.ts decide()'s user prompt, copied line for line. */
function decidePrompt(cands: Candidate[], passes: Pass[], snaps: Snap[], v: VaultView, recent: string[]) {
  const record = v.ledger.graded
    ? `${v.ledger.graded} graded notes: ${v.ledger.honoured} honoured, ${v.ledger.voided} void, ${v.ledger.lapsed} lapsed, ${v.ledger.retracted} retracted; Brier ${v.brier?.toFixed(3)}; realised P&L $${v.ledger.realisedPnl.toFixed(2)}`
    : "no graded notes yet (Probation)";
  return [
    `Now: ${new Date(v.blockTime * 1000).toISOString()}`,
    `Your record: ${record}. Denomination (largest note allowed now): $${v.denomination.toFixed(2)}.`,
    `Recent outcomes: ${recent.length ? recent.join("; ") : "none"}`,
    "",
    "Market:",
    ...snaps.map((s) => `- ${s.label}: TWAP ${s.twapPx?.toPrecision(7)}, exchanges ${s.fairPx?.toPrecision(7)}, gap ${s.gapBps?.toFixed(0)} bps, last pool swap ${s.lastSwapAgoSec !== null ? Math.round(s.lastSwapAgoSec / 60) + " min" : "?"} ago, ${s.swaps3h ?? "?"} swaps in ~3 h (net $${s.netFlowUsd3h?.toFixed(0) ?? "?"}), 4 h ${s.r4h !== null ? (s.r4h * 100).toFixed(2) + "%" : "?"}`),
    "",
    "Candidates:",
    ...cands.map((c) =>
      JSON.stringify({ key: c.key, kind: c.kind, side: c.side, entry: c.entry, target: c.target, void: c.void, horizonHours: c.horizonSec / 3600, notionalUsd: c.notionalUsd, rewardBps: Math.round(c.rewardBps), riskBps: Math.round(c.riskBps), costBps: Math.round(c.costBps), pMin: Number(c.pMin.toFixed(3)), why: c.why, facts: c.facts }),
    ),
    "",
    "No candidate for: " + (passes.length ? passes.map((p) => `${p.sym} (${p.reason})`).join("; ") : "none"),
  ].join("\n");
}

// outcome of the note as the agent would actually have sworn it (reshape snapped to the 0.05 grid the replay simulated)
function outcomeOf(x: Row, c: Candidate): { key: string; o: Outcome } {
  const k = Math.round((c.rewardBps / x.rewardBps) * 20) / 20;
  const key = `${k.toFixed(2)}@${c.horizonSec / 3600}`;
  return { key, o: x.variants[key] ?? { status: "missing" } };
}

async function retry<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { await new Promise((z) => setTimeout(z, 4000)); try { return await f(); } catch (e2) { throw new Error(`${(e as Error).message} || ${(e2 as Error).message}`.slice(0, 500)); } }
}

async function main() {
  const done = new Map<number, Record<string, unknown>>();
  if (existsSync(outFile)) for (const l of readFileSync(outFile, "utf8").split("\n").filter(Boolean)) { const j = JSON.parse(l); done.set(j.id, j); }
  const sworn: Sworn[] = [];
  let usd = 0, tokens = 0;
  for (const j of done.values()) {
    usd += Number(j.usd ?? 0); tokens += Number(j.tokens ?? 0);
    const a = j.decide as { sworn: boolean; p: number; outcome: Outcome } | undefined;
    const x = rows.find((z) => z.id === j.id)!;
    if (a?.sworn) sworn.push({ id: x.id, openT: x.openT, closeT: a.outcome.closeT ?? Infinity, sym: x.asset, side: x.side, p: a.p, outcome: a.outcome });
  }
  // up-front estimate from the prompt size (≈ 4 chars per token) plus the 512-token thinking budget and a short answer
  const { v: v0, recent: r0 } = vaultAt(rows[0].openT, []);
  const sample = decidePrompt([candidateFor(rows[0])], passesFor(rows[0]), rows[0].snap.map((s) => toSnap(s, rows[0].openT)), v0, r0);
  const inTok = Math.ceil((sample.length + 3200) / 4); // + the system prompt
  const est = rows.length * 2 * (inTok * 0.1 + 900 * 0.4) / 1e6;
  const estFlash = rows.length * 2 * (inTok * 0.3 + 900 * 2.5) / 1e6;
  console.log(`models ${MODELS.join(",")}; ${rows.length} candidates x 2 arms; ~${inTok} input tokens per call; estimate $${est.toFixed(3)} (flash-lite) / $${estFlash.toFixed(3)} (if every call fell back to flash); cap $${MAX_USD}`);
  if (est > MAX_USD) throw new Error("estimate over budget, aborting");

  for (const x of rows) {
    if (done.has(x.id)) continue;
    if (usd > MAX_USD) { console.log(`budget cap reached at $${usd.toFixed(4)}; stopping`); break; }
    const T = x.openT;
    const cand = candidateFor(x);
    const passes = passesFor(x);
    const snaps = x.snap.map((s) => toSnap(s, T));
    const { v, recent } = vaultAt(T, sworn);
    const userPrompt = decidePrompt([cand], passes, snaps, v, recent);

    const [dA, dB] = await Promise.allSettled([
      retry(() => decide([cand], passes, snaps, v, recent)),
      retry(() => generate({ system: SYSTEM_FORECAST, contents: [{ role: "user", parts: [{ text: userPrompt }] }], schema: SCHEMA_FORECAST, purpose: "calibrate-forecast", maxTokens: 4000 })),
    ]);
    const row: Record<string, unknown> = { id: x.id, openT: T, asset: x.asset, kind: x.kind, prompt: userPrompt };
    let callUsd = 0, callTok = 0;
    if (dA.status === "fulfilled") {
      const d = dA.value;
      callUsd += d.usd; callTok += d.tokens;
      // agent.ts think(): the candidate must be named; reshape() may stretch it; then swearNote()'s break-even check
      const c0 = d.candidate === cand.key ? cand : undefined;
      const c = c0 ? reshape(c0, v, d.targetScale, d.horizonHours) ?? c0 : undefined;
      let sworn1 = false, reason = "";
      let p = NaN;
      if (d.decision !== "swear" || !c) reason = d.decision !== "swear" ? "abstained" : "swore an unknown candidate key";
      else {
        p = Math.min(0.99, Math.max(0.5, Number(d.confidence)));
        if (!Number.isFinite(p) || p <= c.pMin + 0.01) reason = "odds below break-even (agent declines)";
        else { sworn1 = true; reason = "sworn"; }
      }
      const shaped = c ? outcomeOf(x, c) : null;
      const a = { decision: d.decision, candidate: d.candidate, confidence: d.confidence, targetScale: d.targetScale, horizonHours: d.horizonHours, because: d.because, rationale: d.rationale,
        model: d.model, tokens: d.tokens, usd: d.usd, sworn: sworn1, reason, p: sworn1 ? p : null,
        shape: c ? { rewardBps: c.rewardBps, horizonH: c.horizonSec / 3600, pMin: c.pMin, variant: shaped!.key } : null, outcome: sworn1 ? shaped!.o : null };
      row.decide = a;
      if (sworn1) sworn.push({ id: x.id, openT: T, closeT: shaped!.o.closeT ?? Infinity, sym: x.asset, side: x.side, p, outcome: shaped!.o });
    } else row.decideError = String(dA.reason?.message ?? dA.reason).slice(0, 400);
    if (dB.status === "fulfilled") {
      const g = dB.value;
      const j = JSON.parse(g.text) as { probability: number; rationale: string };
      callUsd += g.usage.usd; callTok += g.usage.inTokens + g.usage.outTokens;
      row.forecast = { probability: j.probability, rationale: (j.rationale ?? "").slice(0, 600), model: g.usage.model, inTokens: g.usage.inTokens, outTokens: g.usage.outTokens, usd: g.usage.usd };
    } else row.forecastError = String(dB.reason?.message ?? dB.reason).slice(0, 400);
    row.usd = callUsd; row.tokens = callTok;
    usd += callUsd; tokens += callTok;
    appendFileSync(outFile, JSON.stringify(row) + "\n");
    const a = row.decide as { decision: string; confidence: number | null; reason: string } | undefined;
    const f = row.forecast as { probability: number } | undefined;
    console.log(`#${x.id} ${x.asset} ${x.kind} ${new Date(T * 1000).toISOString().slice(0, 16)}  decide=${a ? `${a.decision}${a.confidence != null ? " " + a.confidence : ""} (${a.reason})` : "ERR"}  forecast=${f ? f.probability : "ERR"}  total $${usd.toFixed(4)} ${tokens} tok`);
  }
  console.log(`done: $${usd.toFixed(4)}, ${tokens} tokens`);
}
main().catch((e) => { console.error(e); process.exit(1); });
