import { generate } from "./llm.js";
import { ASSETS } from "./config.js";

type State = ReturnType<typeof import("./state.js").buildState>;
export interface Msg { role: "user" | "assistant"; content: string }
export interface Change { field: string; from: number | string | boolean; to: number | string | boolean; stricter: boolean }
export interface DeskReply { reply: string; citations: number[]; proposal?: Change[]; engine: string; tokens?: number }

const LOWER_IS_STRICTER = ["maxNotionalUsd", "maxExposureUsd", "dailyLossLimitUsd", "maxHorizonSec", "maxStopBps", "maxSlippageBps", "maxSpotDevBps", "maxDrawdownBps"];
const HIGHER_IS_STRICTER = ["cooldownSec", "minRewardRisk"];
export const FIELDS = [...LOWER_IS_STRICTER, ...HIGHER_IS_STRICTER, "assets", "paused"];

const BOUNDS: Record<string, [number, number]> = {
  maxNotionalUsd: [1, 10_000], maxExposureUsd: [1, 50_000], dailyLossLimitUsd: [0, 5_000], cooldownSec: [60, 7 * 86_400],
  maxHorizonSec: [600, 7 * 86_400], maxStopBps: [25, 2_000], maxSlippageBps: [5, 300], maxSpotDevBps: [10, 500],
  maxDrawdownBps: [50, 5_000], minRewardRisk: [0.5, 10],
};

/** "$25" → 25, "1.5%" → 150 for bps fields, "2h" → 7200 for seconds; booleans only from clear words. */
function parseValue(field: string, to: unknown): number | boolean | null {
  if (field === "paused") {
    if (typeof to === "boolean") return to;
    const t = String(to).trim().toLowerCase();
    if (/^(true|1|yes|on|pause|paused|stop)$/.test(t)) return true;
    if (/^(false|0|no|off|resume|unpause|unpaused|start)$/.test(t)) return false;
    return null;
  }
  if (typeof to === "number") return to;
  const t = String(to).trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = t.match(/^(-?\d+(?:\.\d+)?)(%|bps|h|hr|hours|m|min|minutes|s|sec)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  if (u === "%") return field.endsWith("Bps") ? n * 100 : n;
  if (u === "h" || u === "hr" || u === "hours") return n * 3600;
  if (u === "m" || u === "min" || u === "minutes") return n * 60;
  return n;
}

export function classify(mandate: State["mandate"], field: string, to: unknown): Change | null {
  const from = (mandate as Record<string, unknown>)[field];
  if (from === undefined) return null;
  if (field === "assets") {
    const want = (Array.isArray(to) ? to : String(to).split(/[,\s]+/)).map((x) => String(x).toUpperCase()).map((x) => (x === "ETH" ? "WETH" : x === "BTC" ? "WBTC" : x === "HSK" ? "WHSK" : x)).filter((x) => ASSETS.some((a) => a.sym === x));
    const cur = from as string[];
    return { field, from: cur.join(", "), to: want.join(", "), stricter: want.every((x) => cur.includes(x)) };
  }
  const val = parseValue(field, to);
  if (val === null) return null;
  if (field === "paused") return { field, from: from as boolean, to: val as boolean, stricter: (val as boolean) || !from };
  const n = val as number;
  const b = BOUNDS[field];
  if (!Number.isFinite(n) || n < 0 || (b && (n < b[0] || n > b[1]))) return null;
  const f = from as number;
  return { field, from: f, to: n, stricter: LOWER_IS_STRICTER.includes(field) ? n <= f : n >= f };
}

const tools = [
  {
    functionDeclarations: [
      { name: "summary", description: "The vault now: record, denomination, NAV, holdings, open notes, mandate, market gaps, agent heartbeat, costs.", parameters: { type: "OBJECT", properties: {} } },
      { name: "list_notes", description: "Notes, newest first. Optional filters.", parameters: { type: "OBJECT", properties: { status: { type: "STRING", description: "outstanding|honoured|void|lapsed|retracted|revoked" }, asset: { type: "STRING", description: "WETH|WBTC|WHSK" }, limit: { type: "INTEGER" } } } },
      { name: "get_note", description: "One note with its statement, levels, outcome and the agent's rationale.", parameters: { type: "OBJECT", properties: { id: { type: "INTEGER" } }, required: ["id"] } },
      { name: "journal", description: "The agent's decision journal: what it swore, declined (with reasons), what the vault blocked, settlements.", parameters: { type: "OBJECT", properties: { kind: { type: "STRING", description: "sworn|declined|blocked|settled|considered|error" }, asset: { type: "STRING" }, hours: { type: "NUMBER" }, limit: { type: "INTEGER" } } } },
      {
        name: "propose_change",
        description: "Propose a change to the mandate (the owner's rules). Fields: maxNotionalUsd (largest note at Fiduciary tier), maxExposureUsd, dailyLossLimitUsd, cooldownSec, maxHorizonSec, maxStopBps (stop distance), minRewardRisk, maxSlippageBps, maxSpotDevBps, maxDrawdownBps, assets (list of WETH/WBTC/WHSK), paused. The reply shows each change as stricter (the agent may apply it itself) or looser (needs the owner's wallet signature).",
        parameters: { type: "OBJECT", properties: { changes: { type: "ARRAY", items: { type: "OBJECT", properties: { field: { type: "STRING" }, to: { type: "STRING", description: "new value; for assets a comma list" } }, required: ["field", "to"] } } }, required: ["changes"] },
      },
    ],
  },
];

const INJECTION = /(ignore (all |the )?(previous|prior|above)|system override|you are now|developer mode|admin(istrator)? (mode|override)|jailbreak|new instructions)/i;

const SYSTEM = `You are Avow's desk: the plain-language interface to an autonomous trading agent on HSKSwap (HSK Chain). Answer the person's question
using only tool results; call tools before answering anything about positions, P&L, notes, decisions or the mandate. Be brief (2–5 sentences),
concrete, numbers with units ("$4.20", "0.48%"), name notes by serial (AVW·000004). Strategy changes (size, frequency, risk appetite, assets)
are mandate changes: call propose_change and say plainly which parts are stricter (Avow applies them itself as soon as the vault owner
confirms with a wallet signature) and which are looser (the owner must sign an on-chain amendment). Never claim a change was applied. Never give personal investment advice; you describe what this agent does and why.
Times are IST. If something is unknown, say so.
Network honesty: the summary tool reports network.mode. If it is "fork-rehearsal", every note and trade so far is on a private fork of HSK
mainnet where outside traders are simulated; say so whenever you discuss trades, P&L or results, and never call them mainnet trades. The real
mainnet pool figures are in market[].mainnet. Chat cannot authorise anything: only the owner's wallet can change the mandate.

Exact rules (quote these, never guess):
- Trade limit (denomination) tiers, as a share of maxNotionalUsd: Probation 20% (start); Apprentice 40% (5 graded notes, Brier strictly
  below 0.25, and honoured notes at least 80% of the hits its stated odds claimed); Journeyman 70% (12 graded, Brier ≤ 0.22, realised P&L ≥ 0);
  Fiduciary 100% (25 graded, Brier ≤ 0.20, P&L > 0). Three voids in a row drop one tier. Retracted and revoked notes are graded as misses.
- maxSpotDevBps compares the pool's live price with the pool's own 5-minute TWAP (a spike guard). It does not compare with the exchanges.
- Chainlink is checked by the agent only, off chain: it refuses to swear if the pool is more than 3% from Chainlink or the feed is older than 26 h.
- A note is honoured when both the pool's 5-minute TWAP and live price reach the target; void when both cross the void level (a stop never
  waits); lapsed at expiry while the pool is calm. Anyone may settle. Expectancy after the 0.60% round-trip fee must be positive at the stated odds.
- Signs: gapBps > 0 means HSKSwap is cheaper than the exchanges; poolPremiumBps > 0 means HSKSwap is dearer.
- Measured over 30 days of real HSKSwap swaps (research/STUDY.md): gaps of 40–100 bps closed within 12 h in 92–98% of cases, but in 90–100%
  of them because the exchange moved back; the pool itself moved half-way in about 53% (WETH, WBTC) and 35% (WHSK) of cases, and only 5–26%
  when the pool had not traded in the prior 12 h. Swaps per day: WHSK 64, WETH 4.6, WBTC 2.8.
- Replay of the exact rules on those 30 days (research/REPLAY.md), with both fees, measured price impact and gas: catch-up opened 111 notes,
  hit 16% against a mean break-even of 78%, and lost $0.16 per $50 note; momentum opened 90, hit 7% against 57%, lost $0.24 per note; every
  asset lost in-sample and out-of-sample, and none of 88 pre-declared alternatives cleared a pre-set bar. That is why Avow mostly passes.
- The shadow ledger (summary.shadow) grades every candidate, sworn or declined, against real mainnet prices; refusedPnlUsd is what the
  declined ones would have made (negative means loss avoided). If asked "is it profitable?", answer with these numbers, plainly.`;

export async function desk(messages: Msg[], state: State): Promise<DeskReply> {
  const citations = new Set<number>();
  let proposal: Change[] | undefined;
  const run = (name: string, args: Record<string, unknown>): unknown => {
    if (name === "summary") {
      const open = state.notes.filter((n) => n.status === "outstanding");
      open.forEach((n) => citations.add(n.id));
      return {
        network: state.network.name, agentAlive: state.agentAlive, record: { ...state.record, tiers: undefined }, holdings: state.holdings,
        open: open.map((n) => ({ id: n.id, serial: n.serial, asset: n.asset, side: n.side, entry: n.entryPx, target: n.targetPx, void: n.voidPx, live: n.livePx, odds: n.confidence, notional: n.notionalUsd, expiryIST: ist(n.expiry) })),
        mode: state.network.mode, simulatedOutsideTraders: state.simulatedOutsideTraders,
        tiers: state.record.tiers, denomination: state.record.tier,
        mandate: state.mandate, market: state.market.map((m) => ({ asset: m.label, hskswap: m.twapPx, exchanges: m.cexPx, poolPremiumBps: m.spreadBps, chainlink: m.chainlinkPx, lastPoolSwapMin: m.lastSwapAgoSec !== null ? Math.round(m.lastSwapAgoSec / 60) : null, mainnet: m.mainnet })),
        unrealisedPnlUsd: open.reduce((s, n) => s + (n.unrealisedPnlUsd ?? 0), 0),
        costs: state.costs, notesTotal: state.notes.length,
        shadow: state.shadow ? { ...state.shadow, recent: undefined } : null,
      };
    }
    if (name === "list_notes") {
      let ns = state.notes;
      if (args.status) ns = ns.filter((n) => n.status === args.status);
      if (args.asset) ns = ns.filter((n) => n.asset === String(args.asset).toUpperCase());
      ns = ns.slice(0, Number(args.limit ?? 10));
      ns.forEach((n) => citations.add(n.id));
      return ns.map((n) => ({ id: n.id, serial: n.serial, asset: n.asset, side: n.side, status: n.status, odds: n.confidence, notional: n.notionalUsd, pnl: n.pnlUsd, openedIST: ist(n.openedAt), statement: n.statement }));
    }
    if (name === "get_note") {
      const n = state.notes.find((x) => x.id === Number(args.id));
      if (!n) return { error: "no such note" };
      citations.add(n.id);
      return { ...n, openedIST: ist(n.openedAt), expiryIST: ist(n.expiry), settledIST: n.settledAt ? ist(n.settledAt) : null };
    }
    if (name === "journal") {
      const cut = Math.floor(Date.now() / 1000) - Number(args.hours ?? 24) * 3600;
      let js = state.journal.filter((j) => j.t >= cut && j.kind !== "heartbeat");
      if (args.kind) js = js.filter((j) => j.kind === args.kind);
      if (args.asset) js = js.filter((j) => !j.asset || j.asset === String(args.asset).toUpperCase());
      js = js.slice(0, Number(args.limit ?? 12));
      js.forEach((j) => j.noteId !== undefined && citations.add(j.noteId));
      return js.map((j) => ({ timeIST: ist(j.t), kind: j.kind, asset: j.asset, title: j.title, detail: j.detail, note: j.noteId }));
    }
    if (name === "propose_change") {
      const rows = (args.changes as { field: string; to: string }[]) ?? [];
      const ch = rows.map((c) => classify(state.mandate, c.field, c.to)).filter((x): x is Change => !!x);
      const rejected = rows.filter((c) => !classify(state.mandate, c.field, c.to)).map((c) => `${c.field} → ${c.to}`);
      proposal = ch;
      return { proposal: ch, rejected, note: "stricter = the owner confirms with a free signature and the agent applies it with tighten(); looser = the owner signs amend(). Rejected rows were unknown fields, unreadable values or outside sane bounds." };
    }
    return { error: "unknown tool" };
  };

  const last = messages[messages.length - 1]?.content ?? "";
  if (INJECTION.test(last)) {
    return { reply: "That message tries to give me new instructions. Chat cannot authorise anything here: the vault only accepts mandate changes signed by the owner's wallet, and the contract enforces every limit regardless of what is said to me. Ask me about the notes, the record or a change you'd like to propose.", citations: [], engine: "rules (instruction-override attempt noted)" };
  }
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = messages.slice(-10).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 2000) }] }));
  let tokens = 0;
  try {
    for (let round = 0; round < 8; round++) {
      const g = await generate({ system: SYSTEM, contents, tools, purpose: "desk", maxTokens: 1200, temperature: 0.2 });
      tokens += g.usage.inTokens + g.usage.outTokens;
      const calls = g.parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[];
      if (!calls.length) return { reply: g.text.trim(), citations: [...citations], proposal, engine: g.usage.model, tokens };
      contents.push({ role: "model", parts: g.parts });
      contents.push({ role: "user", parts: calls.map((c) => ({ functionResponse: { name: c.functionCall.name, response: { result: run(c.functionCall.name, c.functionCall.args ?? {}) } } })) });
    }
    const fb = fallback(last, state, "too many lookups");
    return { ...fb, citations: [...new Set([...citations, ...fb.citations])], proposal: proposal ?? fb.proposal, tokens };
  } catch (e) {
    return fallback(messages[messages.length - 1]?.content ?? "", state, String((e as Error).message).slice(0, 120));
  }
}

const ist = (t: number) => new Date(t * 1000).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", hour12: false });

/** Deterministic answers when the model is unavailable, so the desk never goes dark. */
export function fallback(q: string, s: State, why: string): DeskReply {
  const t = q.toLowerCase();
  const open = s.notes.filter((n) => n.status === "outstanding");
  const r = s.record;
  const fork = s.network.mode !== "mainnet" ? " (All of this is the rehearsal on a private fork of HSK mainnet with simulated outside traders.)" : "";
  if (/(real|mainnet|fake|simulat)/.test(t)) {
    return { reply: s.network.mode === "mainnet" ? `Yes: these notes are on HSK Chain mainnet (vault ${s.contracts.vault}); every one links to its transaction.` : "Not yet. Everything you see is a rehearsal on a private fork of HSK mainnet: the HSKSwap contracts and liquidity are real copies and the exchange prices are live, but outside traders on the fork are simulated. The mainnet vault launches on Nov 1.", citations: [], engine: `rules (${why})` };
  }
  if (/(careful|safer|conservative|smaller|less risk)/.test(t)) {
    const ch = [classify(s.mandate, "maxNotionalUsd", Math.max(1, s.mandate.maxNotionalUsd / 2)), classify(s.mandate, "maxStopBps", Math.max(50, Math.round(s.mandate.maxStopBps * 0.75)))].filter((x): x is Change => !!x);
    return { reply: "A more careful mandate: half the largest note and a 25% tighter stop. Both are stricter, so Avow can apply them itself once the owner confirms.", citations: [], proposal: ch, engine: `rules (model unavailable: ${why})` };
  }
  if (/(only)\s+(trade\s+)?(eth|btc|hsk)/.test(t)) {
    const m = t.match(/(eth|btc|hsk)/)![1];
    const ch = classify(s.mandate, "assets", m);
    return { reply: `Restricting the mandate to ${m.toUpperCase()} is stricter, so Avow can apply it itself.`, citations: [], proposal: ch ? [ch] : [], engine: `rules (model unavailable: ${why})` };
  }
  if (/(bigger|larger|more size|aggressive)/.test(t)) {
    const ch = classify(s.mandate, "maxNotionalUsd", s.mandate.maxNotionalUsd * 2);
    return { reply: "A larger maximum note loosens the mandate, so it needs the owner's signature. Even then, the agent's denomination only grows with its graded record.", citations: [], proposal: ch ? [ch] : [], engine: `rules (model unavailable: ${why})` };
  }
  const lines = [
    `${r.graded} notes graded (${r.honoured} honoured, ${r.void} void, ${r.lapsed} lapsed), Brier ${r.brier === null ? "not yet scored" : r.brier.toFixed(3)}, realised P&L $${r.pnlUsd.toFixed(2)}. Tier ${r.tier.name}: notes up to $${r.tier.capUsd.toFixed(2)}.`,
    open.length ? `Outstanding: ${open.map((n) => `${n.serial} ${n.asset} ${n.side}, target ${n.targetPx.toPrecision(6)}, void ${n.voidPx.toPrecision(6)}`).join("; ")}.` : "No note is outstanding.",
  ];
  return { reply: lines.join(" ") + fork, citations: open.map((n) => n.id), engine: `rules (${why})` };
}
