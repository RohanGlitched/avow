// The league table: this agent's record and its peers', each read from its own vault, ranked by what the vaults
// themselves grant: tier first (it sets the trade limit), then calibration (Brier, lower is better), then graded notes.
import { LEAGUE_PEERS, LEAGUE_REGISTRY } from "./config.js";
import { leagueAbi } from "./leagueContract.js";
import { chain } from "./market.js";

type State = ReturnType<typeof import("./state.js").buildState>;

export function entry(st: State, url: string | null) {
  const kinds = st.journal.reduce<Record<string, number>>((m, j) => ((m[j.kind] = (m[j.kind] ?? 0) + 1), m), {});
  return {
    persona: st.persona,
    erc8004: st.erc8004 ?? null,
    url,
    mode: st.network.mode,
    vault: st.contracts.vault,
    agent: st.contracts.agent,
    owner: st.contracts.owner,
    alive: st.agentAlive,
    lastHeartbeat: st.lastHeartbeat,
    record: {
      graded: st.record.graded,
      honoured: st.record.honoured,
      void: st.record.void,
      lapsed: st.record.lapsed,
      retracted: st.record.retracted,
      brier: st.record.brier,
      pnlUsd: st.record.pnlUsd,
      netPnlUsd: st.record.netPnlUsd,
      navUsd: st.record.navUsd,
      tier: st.record.tier,
      voidStreak: st.record.voidStreak,
    },
    sworn: st.notes.length,
    open: st.notes.filter((n) => n.status === "outstanding").length,
    meanConfidence: st.notes.length ? st.notes.reduce((s, n) => s + n.confidence, 0) / st.notes.length : null,
    declined: (kinds.declined ?? 0) + (kinds.considered ?? 0),
    blocked: kinds.blocked ?? 0,
    notes: st.notes.slice(0, 5).map((n) => ({ id: n.id, serial: n.serial, asset: n.asset, side: n.side, status: n.status, confidence: n.confidence, statement: n.statement, openedAt: n.openedAt, settledAt: n.settledAt, sqError: n.sqError, pnlUsd: n.pnlUsd, hash: n.hash })),
  };
}

export type LeagueEntry = ReturnType<typeof entry>;

export function rank(a: LeagueEntry, b: LeagueEntry) {
  return b.record.tier.index - a.record.tier.index || (a.record.brier ?? 9) - (b.record.brier ?? 9) || b.record.graded - a.record.graded;
}

let cache: { t: number; peers: (LeagueEntry | { url: string; error: string })[] } = { t: 0, peers: [] };

async function peers() {
  if (Date.now() - cache.t < 15_000) return cache.peers;
  const out = await Promise.all(
    LEAGUE_PEERS.map(async (url) => {
      try {
        const r = await fetch(`${url.replace(/\/$/, "")}/state`, { signal: AbortSignal.timeout(5_000) });
        if (!r.ok) return { url, error: `HTTP ${r.status}` };
        return entry((await r.json()) as State, url);
      } catch (e) {
        return { url, error: (e as Error).message };
      }
    }),
  );
  cache = { t: Date.now(), peers: out };
  return out;
}

/** The on-chain table: who entered which vault under what name. */
async function registered() {
  if (!LEAGUE_REGISTRY) return [];
  const rows = await chain.readContract({ address: LEAGUE_REGISTRY, abi: leagueAbi, functionName: "all" }).catch(() => []);
  return rows.map((r, id) => ({ id, vault: r.vault, agent: r.agent, name: r.name, enteredAt: Number(r.enteredAt) })).filter((r) => r.vault !== "0x0000000000000000000000000000000000000000");
}

export async function league(own: State) {
  const [list, reg] = await Promise.all([peers(), registered()]);
  const all = [entry(own, null), ...list];
  const ok = all
    .filter((x): x is LeagueEntry => !("error" in x))
    .map((e) => ({ ...e, entry: reg.find((r) => r.vault.toLowerCase() === String(e.vault).toLowerCase()) ?? null }))
    .sort(rank);
  return {
    asOf: own.asOf,
    mode: own.network.mode,
    registry: LEAGUE_REGISTRY || null,
    rule: "Ranked by the tier each vault grants (it sets the trade limit), then by calibration (rolling Brier over the last 32 graded notes, lower is better), then by graded notes.",
    entries: ok,
    // vaults entered on chain that no agent here reports on (another team's agent): listed by address until indexed
    outside: reg.filter((r) => !ok.some((e) => String(e.vault).toLowerCase() === r.vault.toLowerCase())),
    unreachable: all.filter((x) => "error" in x).length,
  };
}
