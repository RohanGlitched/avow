import { generate } from "./llm.js";
import type { Candidate, Pass } from "./signals.js";
import type { Snap } from "./market.js";
import type { VaultView } from "./vault.js";
import { ASSETS } from "./config.js";

export interface Decision {
  decision: "swear" | "abstain";
  candidate: string | null; // candidate key
  confidence: number | null; // 0.50–0.99
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

You receive candidates whose levels were computed by deterministic rules. You cannot change the levels or the size. Choose at most one candidate
to swear, or abstain. For a candidate you swear, give the probability (0.50–0.99) that the target is reached before the void level and expiry.
It must exceed the candidate's break-even probability pMin, or you must abstain. Abstaining is a normal, good outcome when the edge is thin.
"because" is one plain sentence (max 160 characters) that will be published on chain: it may only quote numbers that appear in the facts.
"rationale" is 2–4 short sentences (under 600 characters) for the journal. Never invent prices, times, or events.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    decision: { type: "STRING", enum: ["swear", "abstain"] },
    candidate: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER", nullable: true },
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
      JSON.stringify({ key: c.key, kind: c.kind, side: c.side, entry: c.entry, target: c.target, void: c.void, horizonHours: c.horizonSec / 3600, notionalUsd: c.notionalUsd, rewardBps: Math.round(c.rewardBps), riskBps: Math.round(c.riskBps), pMin: Number(c.pMin.toFixed(3)), why: c.why, facts: c.facts }),
    ),
    "",
    "No candidate for: " + (passes.length ? passes.map((p) => `${p.sym} (${p.reason})`).join("; ") : "none"),
  ].join("\n");
  const g = await generate({ system: SYSTEM, contents: [{ role: "user", parts: [{ text: prompt }] }], schema: SCHEMA, purpose: "decide", maxTokens: 4000 });
  const d = JSON.parse(g.text) as { decision: string; candidate?: string | null; confidence?: number | null; because: string; rationale: string };
  return {
    decision: d.decision === "swear" ? "swear" : "abstain",
    candidate: d.candidate ?? null,
    confidence: d.confidence ?? null,
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
