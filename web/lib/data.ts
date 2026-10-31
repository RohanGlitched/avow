// All page data goes through here. Server components call getState(); the client polls /api/state through
// useLiveState() (lib/live.tsx) for the live numbers. The state comes from the Avow agent, which reads the vault on HSK
// Chain, the HSKSwap pools, HashKey Global, Gate and Chainlink. If the agent cannot be reached after one retry, the pages
// fall back to a saved mainnet snapshot (data/fixture.json, source "fixture"), labelled with the time it was taken,
// rather than an error page. Refresh the snapshot from the live site's /api/state.
import { cache } from "react";
import fixture from "@/data/fixture.json";
import specimen from "@/data/specimen.json";
import { agentFetch } from "./agent";
import type { Note, State } from "./types";

/** Seconds between server re-reads. Pages also export `revalidate = 15`. */
export const STATE_REVALIDATE = 15;

async function readAgent(timeoutMs: number): Promise<State> {
  const r = await agentFetch("/state", { timeoutMs });
  if (!r.ok) throw new Error(`agent ${r.status}`);
  return (await r.json()) as State;
}

async function loadState(): Promise<State> {
  for (const timeoutMs of [8_000, 6_000]) {
    try {
      const s = await readAgent(timeoutMs);
      return { ...s, source: "chain" };
    } catch {
      // one retry, then the saved snapshot
    }
  }
  return { ...(fixture as unknown as State), source: "fixture" };
}

/** One read per request, shared by every server component that asks. */
export const getState = cache(loadState);

/** Where the state came from, for the `x-avow-source` header. */
export function stateSource(s: State): string {
  return s.source ?? "chain";
}

/**
 * A labelled specimen for explainers when the vault has sworn no note yet. Taken from data/specimen.json (notes from
 * the fork rehearsal, kept only for this), with its serial replaced by "SPECIMEN" so it can never be mistaken for a
 * note of a live vault. Components skip explorer links for a specimen.
 */
export function specimenNote(prefer: Note["status"]): Note {
  const notes = (specimen as unknown as { notes: Note[] }).notes;
  const n = notes.find((x) => x.status === prefer) ?? notes[0];
  return { ...n, serial: "SPECIMEN" };
}

/** True for a note made by specimenNote(). */
export const isSpecimen = (n: Pick<Note, "serial">) => n.serial === "SPECIMEN";
