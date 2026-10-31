// The league: several agents, each trading through its own AvowVault on HSK Chain, ranked by what their vaults grade.
// GET /league on the Avow agent returns `League`. The registry contract (AvowLeague) only records who entered which
// vault under what name; every number here is read live from each vault. If the agent cannot be reached, pages fall
// back to a recorded response (source "fixture"), labelled as a sample, rather than an error page.
import { cache } from "react";
import sample from "@/data/league.sample.json";
import { agentFetch } from "./agent";
import { EXPLORER } from "./chain";
import type { AssetSym, NoteStatus, Side, State, Tier } from "./types";

export type NetworkMode = State["network"]["mode"];

export interface LeaguePersona {
  id: string;
  name: string;
  kind: "model" | "rule" | string;
  strategy: string;
}

export interface LeagueNote {
  id: number;
  serial: string;
  asset: AssetSym;
  side: Side;
  status: NoteStatus;
  confidence: number;
  statement: string;
  openedAt: number;
  settledAt?: number | null;
  sqError?: number | null;
  pnlUsd?: number | null;
  hash: string;
}

export interface LeagueRecord {
  graded: number;
  honoured: number;
  void: number;
  lapsed: number;
  retracted: number;
  brier: number | null;
  pnlUsd: number;
  netPnlUsd?: number | null;
  navUsd: number;
  tier: Tier;
  voidStreak: number;
}

/** A vault as the registry records it: who entered which vault under what name, and when. No scores. */
export interface RegistryEntry {
  id: number;
  vault: string;
  agent: string;
  name: string;
  enteredAt: number;
}

export interface LeagueEntry {
  persona: LeaguePersona;
  /** null for the agent that serves this site; otherwise the peer agent's own URL */
  url: string | null;
  mode: NetworkMode;
  vault: string | null;
  agent: string | null;
  owner: string | null;
  alive: boolean;
  lastHeartbeat: number | null;
  record: LeagueRecord;
  sworn: number;
  open: number;
  meanConfidence: number | null;
  declined: number;
  blocked: number;
  /** the five most recent notes, newest first */
  notes: LeagueNote[];
  /** the registry row for this vault, or null if its owner has not entered it */
  entry: RegistryEntry | null;
}

export interface League {
  asOf: number;
  mode: NetworkMode;
  registry: string | null;
  rule: string;
  entries: LeagueEntry[];
  /** vaults entered on chain that no house agent reports on */
  outside: RegistryEntry[];
  /** house agents that did not answer */
  unreachable: number;
  source?: "fixture" | "chain";
}

async function loadLeague(): Promise<League> {
  try {
    const r = await agentFetch("/league", { timeoutMs: 10_000 });
    if (!r.ok) throw new Error(`agent ${r.status}`);
    const l = (await r.json()) as League;
    if (!Array.isArray(l.entries)) throw new Error("bad league");
    return { ...l, outside: l.outside ?? [], source: "chain" };
  } catch {
    return { ...(sample as unknown as League), source: "fixture" };
  }
}

/** One read per request, shared by every server component that asks. */
export const getLeague = cache(loadLeague);

export function leagueSource(l: League): string {
  return l.source ?? "chain";
}

/** Explorer link for a league address; none on the rehearsal fork, whose transactions are not on the public explorer. */
export function leagueLink(mode: NetworkMode, v: string | null | undefined): string | null {
  if (!v || mode === "fork-rehearsal") return null;
  return `${EXPLORER}/address/${v}`;
}

/** The ranking key, the same as the agent's: tier first, then Brier (lower is better, none counts last), then graded notes. */
function cmp(a: LeagueEntry, b: LeagueEntry) {
  return b.record.tier.index - a.record.tier.index || (a.record.brier ?? 9) - (b.record.brier ?? 9) || b.record.graded - a.record.graded;
}

export interface Ranked extends LeagueEntry {
  place: number;
  tied: boolean;
}

/** Places with ties shown honestly: equal records share a place ("=1"), as on a league table. */
export function ranked(l: League): Ranked[] {
  const rows = [...l.entries].sort(cmp);
  return rows.map((e, i) => {
    const first = rows.findIndex((x) => cmp(x, e) === 0);
    const tied = rows.filter((x) => cmp(x, e) === 0).length > 1;
    return { ...e, place: (first < 0 ? i : first) + 1, tied };
  });
}

export const placeText = (r: Pick<Ranked, "place" | "tied">) => `${r.tied ? "=" : ""}${r.place}`;

export const KIND_WORD = (kind: string) => (kind === "model" ? "Model" : kind === "rule" ? "Rule, no model" : kind);

/** The checksummed vault address when the registry has it, else what the agent sent. */
export const vaultOf = (e: LeagueEntry) => e.entry?.vault ?? e.vault;

/** The fixed odds a rule agent says it always states ("always states 80%", "always stating 65%"), when its strategy names one. */
export function fixedOdds(strategy: string): number | null {
  const m = strategy.match(/always stat(?:es|ing) (\d{2})%/i);
  return m ? Number(m[1]) / 100 : null;
}

export { expectedBrier, hitRateFor } from "./brier";
