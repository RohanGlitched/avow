// The league: several agents, each trading through its own AvowVault on HSK Chain, ranked by what their vaults grade.
// GET /league on the Avow agent returns `League`. The registry contract (AvowLeague) only records who entered which
// vault under what name. Each house agent reports its own vault's on-chain record, and the Avow agent gathers those
// reports; addresses link to the explorer so anyone can check them. If the agent cannot be reached after one retry,
// pages fall back to a saved mainnet snapshot (data/league.sample.json, source "fixture"), labelled with its time.
// Peer agents' internal URLs never leave the server: loadLeague() replaces them with `own`.
import type { Note } from "./types";
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

/**
 * The agent's ERC-8004 reputation: its id in the Identity Registry and the grades AvowGrader has posted for it to the
 * Reputation Registry. Each grade is computed by the grader from the vault: 100 − 100·(stated odds − outcome)².
 */
export interface Erc8004 {
  grader: string;
  identity: string;
  reputation: string;
  /** null until the vault's owner links the vault to an ERC-8004 agent */
  agentId: number | null;
  /** grades posted for this agent */
  posted: number;
  /** mean grade, 0–100 (= 100·(1 − Brier) over the posted notes); null until the first */
  mean: number | null;
  /**
   * mean skill grade (tag avow-skill), −100 to 100: 100·((p0 − outcome)² − (odds − outcome)²), p0 = risk/(reward + risk)
   * from the note's own levels; null until the first (absent from older agents)
   */
  skill?: number | null;
}

export interface LeagueEntry {
  persona: LeaguePersona;
  /** True for the agent that serves this site (Avow). Derived on the server; peers' internal URLs are dropped. */
  own: boolean;
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
  /** the newest note in full (absent from older agents) */
  latest?: Note | null;
  /** the registry row for this vault, or null if its owner has not entered it */
  entry: RegistryEntry | null;
  /** ERC-8004 identity and reputation; null (or absent, from older agents) when not configured */
  erc8004?: Erc8004 | null;
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

/** The agent reports `url` (null for itself, a private address for each peer). Keep only whether the entry is ours. */
type RawEntry = Omit<LeagueEntry, "own"> & { url?: string | null; own?: boolean };

function clean(l: Omit<League, "entries"> & { entries: RawEntry[] }): League {
  return {
    ...l,
    outside: l.outside ?? [],
    entries: l.entries.map(({ url, own, ...e }) => ({ ...e, own: own ?? url === null })),
  };
}

async function loadLeague(): Promise<League> {
  for (const timeoutMs of [8_000, 6_000]) {
    try {
      const r = await agentFetch("/league", { timeoutMs });
      if (!r.ok) throw new Error(`agent ${r.status}`);
      const l = (await r.json()) as Omit<League, "entries"> & { entries: RawEntry[] };
      if (!Array.isArray(l.entries)) throw new Error("bad league");
      return { ...clean(l), source: "chain" };
    } catch {
      // one retry, then the saved snapshot
    }
  }
  return { ...clean(sample as unknown as Omit<League, "entries"> & { entries: RawEntry[] }), source: "fixture" };
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

/** An agent with no graded note has no calibration yet: it is unrated, which says nothing about whether it is worse. */
export const isRated = (e: Pick<LeagueEntry, "record">) => e.record.graded > 0 && e.record.brier != null;

export interface Ranked extends LeagueEntry {
  /** null for an unrated agent */
  place: number | null;
  tied: boolean;
  rated: boolean;
}

/**
 * Places with ties shown honestly: equal records share a place ("=1"), as on a league table. Rated agents keep the
 * agent's own order; unrated agents (nothing graded yet) carry no place and are listed after them.
 */
export function ranked(l: League): Ranked[] {
  const rated = [...l.entries].filter(isRated).sort(cmp);
  const unrated = [...l.entries].filter((e) => !isRated(e)).sort(cmp);
  return [
    ...rated.map((e, i) => {
      const first = rated.findIndex((x) => cmp(x, e) === 0);
      const tied = rated.filter((x) => cmp(x, e) === 0).length > 1;
      return { ...e, place: (first < 0 ? i : first) + 1, tied, rated: true };
    }),
    ...unrated.map((e) => ({ ...e, place: null, tied: false, rated: false })),
  ];
}

export const placeText = (r: Pick<Ranked, "place" | "tied">) => (r.place == null ? "Unrated" : `${r.tied ? "=" : ""}${r.place}`);

/** One line under any table that lists unrated agents. */
export const UNRATED_NOTE = "Unrated means no note has been graded yet, so there is no calibration to rank; it does not mean worse.";

export const KIND_WORD = (kind: string) => (kind === "model" ? "Model" : kind === "rule" ? "Rule, no model" : kind);

/** The checksummed vault address when the registry has it, else what the agent sent. */
export const vaultOf = (e: LeagueEntry) => e.entry?.vault ?? e.vault;

/** The fixed odds a rule agent says it always states ("always states 80%", "always stating 65%"), when its strategy names one. */
export function fixedOdds(strategy: string): number | null {
  const m = strategy.match(/always stat(?:es|ing) (\d{2})%/i);
  return m ? Number(m[1]) / 100 : null;
}

/** The grade AvowGrader posts for one settled note: 100 − 100·(stated odds − outcome)², two decimals. */
export const gradeOf = (odds: number, outcome: 0 | 1) => Math.round((100 - 100 * (odds - outcome) ** 2) * 100) / 100;

export { expectedBrier, hitRateFor } from "./brier";

/** Every agent's recent notes as one list, newest first, each with its agent and vault (see components/LeagueNotes). */
export function leagueNoteItems(l: League, opts: { includeOwn?: boolean } = {}) {
  return l.entries
    .filter((e) => opts.includeOwn !== false || !e.own)
    .flatMap((e) =>
      e.notes.map((note) => ({
        agentId: e.persona.id,
        agent: e.persona.name,
        kind: e.persona.kind,
        own: e.own,
        vault: vaultOf(e),
        vaultHref: leagueLink(e.mode, vaultOf(e)),
        note,
      })),
    )
    .sort((a, b) => b.note.openedAt - a.note.openedAt);
}
