// A minimal stateless MCP server (Streamable HTTP, JSON responses) so any assistant can read Avow's vault and propose mandate changes.
import { classify, FIELDS } from "./desk.js";

type State = ReturnType<typeof import("./state.js").buildState>;

const TOOLS = [
  { name: "avow_summary", description: "Avow's vault now: graded record, Brier score, denomination (largest note allowed), NAV, holdings, open notes, mandate, HSKSwap vs exchange prices, agent heartbeat.", inputSchema: { type: "object", properties: {} } },
  { name: "avow_notes", description: "Notes Avow swore on HSK Chain, newest first. Each is a falsifiable statement with target, void level (stop), expiry, odds and outcome.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["outstanding", "honoured", "void", "lapsed", "retracted", "revoked"] }, asset: { type: "string", enum: ["WETH", "WBTC", "WHSK"] }, limit: { type: "number" } } } },
  { name: "avow_note", description: "One note by id, with its statement, levels, transactions and the agent's rationale.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "avow_journal", description: "The agent's decision journal: notes sworn, candidates declined (with reasons), refusals by the vault, settlements.", inputSchema: { type: "object", properties: { kind: { type: "string" }, hours: { type: "number" }, limit: { type: "number" } } } },
  { name: "avow_propose_change", description: `Classify proposed mandate changes as stricter (the agent may apply them once the owner confirms) or looser (owner must sign an amendment). Fields: ${FIELDS.join(", ")}.`, inputSchema: { type: "object", properties: { changes: { type: "array", items: { type: "object", properties: { field: { type: "string" }, to: {} }, required: ["field", "to"] } } }, required: ["changes"] } },
];

function call(name: string, a: Record<string, unknown>, s: State): unknown {
  if (name === "avow_summary") {
    const { journal, notes, market, ...rest } = s;
    return { ...rest, record: { ...s.record, tiers: undefined }, open: notes.filter((n) => n.status === "outstanding"), market: market.map(({ history, ...m }) => m), recentJournal: journal.slice(0, 5) };
  }
  if (name === "avow_notes") {
    let n = s.notes;
    if (a.status) n = n.filter((x) => x.status === a.status);
    if (a.asset) n = n.filter((x) => x.asset === a.asset);
    return n.slice(0, Number(a.limit ?? 20));
  }
  if (name === "avow_note") return s.notes.find((x) => x.id === Number(a.id)) ?? { error: "no such note" };
  if (name === "avow_journal") {
    const cut = Math.floor(Date.now() / 1000) - Number(a.hours ?? 24) * 3600;
    return s.journal.filter((j) => j.t >= cut && (!a.kind || j.kind === a.kind)).slice(0, Number(a.limit ?? 20));
  }
  if (name === "avow_propose_change") return ((a.changes as { field: string; to: unknown }[]) ?? []).map((c) => classify(s.mandate, c.field, c.to) ?? { field: c.field, error: "unknown field or value" });
  throw new Error(`unknown tool ${name}`);
}

export function mcp(body: { jsonrpc: string; id?: number | string; method: string; params?: Record<string, unknown> }, s: State | null) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: body.id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: body.id ?? null, error: { code, message } });
  switch (body.method) {
    case "initialize":
      return ok({ protocolVersion: (body.params?.protocolVersion as string) ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "avow", version: "1.0.0" }, instructions: "Avow is an AI trader on HSKSwap (HSK Chain) that must swear every trade as a falsifiable on-chain note. Read its record, notes and journal; propose mandate changes." });
    case "notifications/initialized":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      if (!s) return err(-32000, "Avow is warming up; try again in a few seconds");
      try {
        const r = call(String(body.params?.name), (body.params?.arguments as Record<string, unknown>) ?? {}, s);
        return ok({ content: [{ type: "text", text: JSON.stringify(r) }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    default:
      return err(-32601, `method not found: ${body.method}`);
  }
}
