import { generate } from "./llm.js";
import { ASSETS } from "./config.js";

type State = ReturnType<typeof import("./state.js").buildState>;
export interface Msg { role: "user" | "assistant"; content: string }
export interface Change { field: string; from: number | string | boolean; to: number | string | boolean; stricter: boolean }
export interface DeskReply { reply: string; citations: number[]; proposal?: Change[]; engine: string; tokens?: number }

const LOWER_IS_STRICTER = ["maxNotionalUsd", "maxExposureUsd", "dailyLossLimitUsd", "maxHorizonSec", "maxStopBps", "maxSlippageBps", "maxSpotDevBps", "maxDrawdownBps"];
const HIGHER_IS_STRICTER = ["cooldownSec", "minRewardRisk"];
export const FIELDS = [...LOWER_IS_STRICTER, ...HIGHER_IS_STRICTER, "assets", "paused"];

export function classify(mandate: State["mandate"], field: string, to: unknown): Change | null {
  const from = (mandate as Record<string, unknown>)[field];
  if (from === undefined) return null;
  if (field === "assets") {
    const want = (Array.isArray(to) ? to : String(to).split(/[,\s]+/)).map((x) => String(x).toUpperCase()).map((x) => (x === "ETH" ? "WETH" : x === "BTC" ? "WBTC" : x === "HSK" ? "WHSK" : x)).filter((x) => ASSETS.some((a) => a.sym === x));
    const cur = from as string[];
    return { field, from: cur.join(", "), to: want.join(", "), stricter: want.every((x) => cur.includes(x)) };
  }
  if (field === "paused") return { field, from: from as boolean, to: Boolean(to), stricter: Boolean(to) || !from };
  const n = Number(to);
  if (!Number.isFinite(n) || n < 0) return null;
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

const SYSTEM = `You are Avow's desk: the plain-language interface to an autonomous trading agent on HSKSwap (HSK Chain). Answer the person's question
using only tool results; call tools before answering anything about positions, P&L, notes, decisions or the mandate. Be brief (2–5 sentences),
concrete, numbers with units ("$4.20", "0.48%"), name notes by serial (AVW·000004). Strategy changes (size, frequency, risk appetite, assets)
are mandate changes: call propose_change and say plainly which parts are stricter (Avow applies them itself as soon as the vault owner
confirms with a wallet signature) and which are looser (the owner must sign an on-chain amendment). Never claim a change was applied. Never give personal investment advice; you describe what this agent does and why.
Times are IST. If something is unknown, say so.`;

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
        mandate: state.mandate, market: state.market.map((m) => ({ asset: m.label, hskswap: m.twapPx, exchanges: m.cexPx, gapBps: m.spreadBps, chainlink: m.chainlinkPx, lastPoolSwapMin: m.lastSwapAgoSec !== null ? Math.round(m.lastSwapAgoSec / 60) : null })),
        costs: state.costs, notesTotal: state.notes.length,
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
      const ch = ((args.changes as { field: string; to: string }[]) ?? []).map((c) => classify(state.mandate, c.field, c.to)).filter((x): x is Change => !!x);
      proposal = ch;
      return { proposal: ch, note: "stricter = the agent may apply it itself; looser = owner signature needed" };
    }
    return { error: "unknown tool" };
  };

  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = messages.slice(-10).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 2000) }] }));
  let tokens = 0;
  try {
    for (let round = 0; round < 5; round++) {
      const g = await generate({ system: SYSTEM, contents, tools, purpose: "desk", maxTokens: 1200, temperature: 0.2 });
      tokens += g.usage.inTokens + g.usage.outTokens;
      const calls = g.parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[];
      if (!calls.length) return { reply: g.text.trim(), citations: [...citations], proposal, engine: g.usage.model, tokens };
      contents.push({ role: "model", parts: g.parts });
      contents.push({ role: "user", parts: calls.map((c) => ({ functionResponse: { name: c.functionCall.name, response: { result: run(c.functionCall.name, c.functionCall.args ?? {}) } } })) });
    }
    return { reply: "I looked this up but ran out of steps; ask me again more narrowly.", citations: [...citations], proposal, engine: "model", tokens };
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
  return { reply: lines.join(" "), citations: open.map((n) => n.id), engine: `rules (model unavailable: ${why})` };
}
