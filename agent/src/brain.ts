import { generate } from "./llm.js";
import type { Candidate, Pass } from "./signals.js";
import type { Snap } from "./market.js";
import type { VaultView } from "./vault.js";
import { ASSETS } from "./config.js";

export interface Decision {
  decision: "swear" | "abstain";
  candidate: string | null; // candidate key
  confidence: number | null; // 0.50–0.99
  targetScale: number | null; // 0.7–1.3 × the rule's target distance
  horizonHours: number | null; // 2, 4, 8 or 12
  because: string; // ≤ 160 chars, goes into the on-chain statement
  rationale: string; // the full reasoning, journaled (hash on chain)
  model: string;
  tokens: number;
  usd: number;
}

const SYSTEM = `You are Avow, an autonomous trader on HSKSwap (HSK Chain mainnet). You may only trade by swearing a note on chain:
"Avow swears that <asset> will trade above/below <target> on HSKSwap before <time>, or this note is void at <level>."
Every note is graded: it is honoured only if the pool's 5-minute TWAP and live price reach the target before the void level and expiry.
Your stated probability is scored with a Brier score; the size you are allowed to trade (your denomination) grows only if you are calibrated
and profitable, and shrinks if you are overconfident. Honesty about uncertainty is rewarded; bravado is punished.

Facts about this venue you must weigh: HSKSwap pools are thin and quiet (a swap every few hours on some pools). A pool only moves when someone
trades it, so a note that needs the pool to move needs other traders to arrive within the horizon. Your own swap is excluded: the contract
rejects a note its own trade would fulfil. The pool fee is 0.30% each way.

You receive candidates whose levels and size were computed by deterministic rules from live data. You choose at most one to swear, or abstain.
For the one you swear you may shape it: targetScale (0.7–1.3) stretches or shrinks the distance to the target (a closer target is likelier
but must still pay the round-trip cost; the rules re-check reward/risk and fees), and horizonHours (2, 4, 8 or 12) sets the expiry. Then give
the probability (0.50–0.99) that the shaped target is reached before the void level and expiry. pMin is the break-even probability after the
round-trip cost at targetScale 1; a smaller scale raises it. If your probability does not clear break-even, abstain. Abstaining is a normal,
good outcome when the edge is thin. Use any measured prior in the facts (how often real HSKSwap gaps closed) as your starting point.
"because" is one plain sentence (max 160 characters) that will be published on chain: it may only quote numbers that appear in the facts.
"rationale" is 2–4 short sentences (under 600 characters) for the journal. Never invent prices, times, or events.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    decision: { type: "STRING", enum: ["swear", "abstain"] },
    candidate: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER", nullable: true },
    targetScale: { type: "NUMBER", nullable: true },
    horizonHours: { type: "INTEGER", nullable: true },
    because: { type: "STRING" },
    rationale: { type: "STRING" },
  },
  required: ["decision", "because", "rationale"],
};

export async function decide(cands: Candidate[], passes: Pass[], snaps: Snap[], v: VaultView, recent: string[]): Promise<Decision> {
  const record = v.ledger.graded
    ? `${v.ledger.graded} graded notes: ${v.ledger.honoured} honoured, ${v.ledger.voided} void, ${v.ledger.lapsed} lapsed, ${v.ledger.retracted} retracted; Brier ${v.brier?.toFixed(3)}; realised P&L $${v.ledger.realisedPnl.toFixed(2)}`
    : "no graded notes yet (Probation)";
  const prompt = [
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
  const g = await generate({ system: SYSTEM, contents: [{ role: "user", parts: [{ text: prompt }] }], schema: SCHEMA, purpose: "decide", maxTokens: 4000 });
  const d = JSON.parse(g.text) as { decision: string; candidate?: string | null; confidence?: number | null; targetScale?: number | null; horizonHours?: number | null; because: string; rationale: string };
  return {
    decision: d.decision === "swear" ? "swear" : "abstain",
    candidate: d.candidate ?? null,
    confidence: d.confidence ?? null,
    targetScale: d.targetScale ?? null,
    horizonHours: d.horizonHours ?? null,
    because: (d.because ?? "").trim(),
    rationale: (d.rationale ?? "").trim(),
    model: g.usage.model,
    tokens: g.usage.inTokens + g.usage.outTokens,
    usd: g.usage.usd,
  };
}

/** Numbers the model wrote that do not appear in the facts it was given. */
export function unsupportedNumbers(text: string, c: Candidate): string[] {
  const allowed = new Set<string>();
  const add = (x: number) => {
    for (const p of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) allowed.add(Number(x.toFixed(p)).toString());
  };
  const src = c.facts.join(" ") + " " + c.why;
  for (const m of src.match(/-?\d[\d,]*\.?\d*/g) ?? []) add(Number(m.replace(/,/g, "")));
  for (const x of [c.entry, c.target, c.void, c.notionalUsd, c.rewardBps, c.riskBps, c.horizonSec / 3600, c.rewardBps / 100, c.riskBps / 100, 0.3, 30, 5]) add(x);
  const bad: string[] = [];
  for (const m of text.match(/-?\d[\d,]*\.?\d*/g) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const s = n.toString();
    if (!allowed.has(s) && !allowed.has(Math.abs(n).toString())) bad.push(m);
  }
  return bad;
}

const IST = (t: number) =>
  new Date(t * 1000).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", hour12: false });

export function fmtPx(sym: string, x: number) {
  const a = ASSETS.find((z) => z.sym === sym)!;
  return x.toLocaleString("en-US", { minimumFractionDigits: a.pricePlaces, maximumFractionDigits: a.pricePlaces });
}

/** The sworn sentence. Levels and times come from the candidate, never from the model. */
export function statement(c: Candidate, expiry: number, confidence: number, because: string) {
  const a = ASSETS.find((z) => z.sym === c.sym)!;
  const dir = c.side === "long" ? "above" : "below";
  const t = IST(expiry).replace(",", "");
  const core = `Avow swears that ${a.label} will trade ${dir} ${fmtPx(c.sym, c.target)} on HSKSwap before ${t} IST, or this note is void at ${fmtPx(c.sym, c.void)}. Odds ${Math.round(confidence * 100)}%.`;
  return because ? `${core} ${because}` : core;
}

const REVIEW = `You are Avow reviewing one of your own outstanding notes on HSKSwap. Choose one action:
"hold" — keep the note as sworn; "tighten" — move the stop to break-even so a winner cannot turn into a loser (only offered when possible);
"retract" — close it now, which is graded as a miss (use only when the reason for the note is gone and waiting costs more than it can earn).
Be brief and concrete: one or two sentences, quoting only numbers given. Return JSON.`;

const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: { action: { type: "STRING", enum: ["hold", "tighten", "retract"] }, reason: { type: "STRING" } },
  required: ["action", "reason"],
};

export async function reviewNote(
  n: { id: number; side: number; entryPx: number; targetPx: number; voidPx: number; confidenceBps: number; expiry: number },
  label: string,
  s: Snap,
  progress: number,
  elapsed: number,
  trigger: string,
  breakeven: number | null,
) {
  const prompt = [
    `Note: ${label} ${n.side === 0 ? "long" : "short"}, entry ${n.entryPx}, target ${n.targetPx}, void ${n.voidPx}, stated odds ${n.confidenceBps / 100}%.`,
    `Now: TWAP ${s.twapPx}, exchanges ${s.fairPx}, gap ${s.gapBps?.toFixed(0)} bps (positive = pool cheaper), ${s.swaps3h ?? "?"} swaps in the pool in ~3 h.`,
    `Progress to target ${(progress * 100).toFixed(0)}%, ${(elapsed * 100).toFixed(0)}% of the horizon used. Why you are asked: ${trigger}.`,
    breakeven !== null ? `Tighten would move the stop to ${breakeven} (entry plus both fees).` : "Tighten is not possible now (price is not past break-even).",
  ].join("\n");
  const g = await generate({ system: REVIEW, contents: [{ role: "user", parts: [{ text: prompt }] }], schema: REVIEW_SCHEMA, purpose: "review", maxTokens: 1200 });
  const d = JSON.parse(g.text) as { action: "hold" | "tighten" | "retract"; reason: string };
  const action = d.action === "tighten" && breakeven === null ? "hold" : d.action;
  return { action, reason: (d.reason ?? "").slice(0, 400), model: g.usage.model, tokens: g.usage.inTokens + g.usage.outTokens };
}
