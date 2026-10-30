import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifyMessage, type Hex } from "viem";
import { DESK_SECRET, MODE, PORT, VAULT } from "./config.js";
import { desk, classify, type Msg } from "./desk.js";
import { mcp } from "./mcp.js";
import { journal } from "./journal.js";
import { chain } from "./market.js";
import { account, tightenMandate, words } from "./agent.js";
import type { VaultView } from "./vault.js";

type State = ReturnType<typeof import("./state.js").buildState>;
export const live: { state: State | null; vault: VaultView | null } = { state: null, vault: null };

const hits = new Map<string, number[]>();
const usedSignatures = new Set<string>();
function allow(ip: string, perHour: number) {
  const now = Date.now();
  const h = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (h.length >= perHour) return false;
  h.push(now);
  hits.set(ip, h);
  return true;
}
let dayCount = { day: "", n: 0 };

function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  let s = "";
  for await (const c of req) { s += c; if (s.length > 64_000) throw new Error("too large"); }
  return JSON.parse(s || "{}");
}

export function serve() {
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "GET" && url.pathname === "/state") {
        if (!live.state) return send(res, 503, { error: "warming up" });
        return send(res, 200, live.state);
      }
      if (req.method === "GET" && url.pathname === "/health") {
        const bal = await chain.getBalance({ address: account.address }).catch(() => null);
        return send(res, 200, { ok: !!live.state, mode: MODE, vault: VAULT, agent: account.address, agentHsk: bal === null ? null : Number(bal) / 1e18, lastBeat: journal.lastBeat() });
      }
      if (req.method === "POST" && url.pathname === "/desk") {
        if (DESK_SECRET && req.headers["x-desk-secret"] !== DESK_SECRET) return send(res, 401, { error: "unauthorised" });
        const ip = String(req.headers["x-visitor-ip"] ?? req.socket.remoteAddress ?? "?");
        const day = new Date().toISOString().slice(0, 10);
        if (dayCount.day !== day) dayCount = { day, n: 0 };
        if (!allow(ip, 30) || dayCount.n >= 600) return send(res, 429, { reply: "The desk is resting: too many questions from this address in the last hour. Try again shortly.", citations: [], engine: "limit" });
        dayCount.n++;
        const b = (await body(req)) as { messages?: Msg[] };
        const msgs = (b.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10);
        if (!msgs.length || !live.state) return send(res, 400, { error: "no question" });
        return send(res, 200, await desk(msgs, live.state));
      }
      if (url.pathname === "/mcp") {
        if (req.method === "GET") { res.writeHead(405, { allow: "POST" }); return res.end(); }
        if (req.method !== "POST") return send(res, 405, { error: "POST only" });
        const ip = String(req.headers["x-visitor-ip"] ?? req.socket.remoteAddress ?? "?");
        if (!allow("mcp:" + ip, 300)) return send(res, 429, { error: "rate limited" });
        const b = await body(req);
        const out = Array.isArray(b) ? b.map((x) => mcp(x, live.state)).filter(Boolean) : mcp(b, live.state);
        if (out === null || (Array.isArray(out) && !out.length)) { res.writeHead(202); return res.end(); }
        return send(res, 200, out);
      }
      if (req.method === "POST" && url.pathname === "/tighten") {
        // the owner signs "Avow: tighten\n<json changes>\nuntil <unix>" with their wallet; the agent then applies only stricter changes
        const b = (await body(req)) as { message: string; signature: Hex };
        if (!live.state || !live.vault) return send(res, 503, { error: "warming up" });
        const owner = live.vault.owner;
        const ok = await verifyMessage({ address: owner, message: b.message, signature: b.signature }).catch(() => false);
        if (!ok) return send(res, 403, { error: "Only the vault owner's signature can ask the agent to change the mandate." });
        const [head, json, until] = b.message.split("\n");
        const u = Number(until?.replace("until ", ""));
        const now = Date.now() / 1000;
        if (head !== "Avow: tighten" || !Number.isFinite(u) || u < now || u > now + 15 * 60) return send(res, 400, { error: "Expired or malformed request: sign a fresh one (valid for 15 minutes)." });
        if (usedSignatures.has(b.signature)) return send(res, 400, { error: "This signed request was already used." });
        usedSignatures.add(b.signature);
        const changes = JSON.parse(json) as { field: string; to: unknown }[];
        const cls = changes.map((c) => classify(live.state!.mandate, c.field, c.to));
        if (cls.some((c) => !c || !c.stricter)) return send(res, 400, { error: "Only stricter changes can be applied by the agent; sign looser ones as an owner amendment." });
        const m = { ...live.vault.mandate };
        for (const c of changes) {
          const v = c.to as never;
          if (c.field === "maxNotionalUsd") m.maxNotional = BigInt(Math.round(Number(v) * 1e6));
          if (c.field === "maxExposureUsd") m.maxExposure = BigInt(Math.round(Number(v) * 1e6));
          if (c.field === "dailyLossLimitUsd") m.dailyLossLimit = BigInt(Math.round(Number(v) * 1e6));
          if (c.field === "cooldownSec") m.cooldown = Math.round(Number(v));
          if (c.field === "maxHorizonSec") m.maxHorizon = Math.round(Number(v));
          if (c.field === "maxStopBps") m.maxStopBps = Math.round(Number(v));
          if (c.field === "minRewardRisk") m.minRewardRiskX100 = Math.round(Number(v) * 100);
          if (c.field === "maxSlippageBps") m.maxSlippageBps = Math.round(Number(v));
          if (c.field === "maxSpotDevBps") m.maxSpotDevBps = Math.round(Number(v));
          if (c.field === "maxDrawdownBps") m.maxDrawdownBps = Math.round(Number(v));
          if (c.field === "paused") m.paused = Boolean(v);
          if (c.field === "assets") {
            const want = String(c.to).toUpperCase();
            m.assetMask = (want.includes("ETH") ? 1 : 0) | (want.includes("BTC") ? 2 : 0) | (want.includes("HSK") ? 4 : 0);
          }
        }
        try {
          const tx = await tightenMandate(m);
          journal.add({ kind: "tightened", title: "Tightened the mandate at the owner's request", detail: cls.map((c) => `${c!.field}: ${c!.from} → ${c!.to}`).join("; "), tx });
          return send(res, 200, { tx });
        } catch (e) {
          return send(res, 400, { error: words(e).text });
        }
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: (e as Error).message });
    }
  }).listen(PORT, () => console.log(`dictum agent on :${PORT} (${MODE})`));
}
