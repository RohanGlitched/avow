// All page data goes through here. Server components call getState(); the client polls /api/state through
// useLiveState() (lib/live.tsx) for the live numbers. The state comes from the Avow agent, which reads the vault on HSK
// Chain, the HSKSwap pools, HashKey Global, Gate and Chainlink. If the agent cannot be reached, the pages fall back to a
// clearly labelled sample (source "fixture") rather than an error page.
import { cache } from "react";
import fixture from "@/data/fixture.json";
import { agentFetch } from "./agent";
import type { State } from "./types";

/** Seconds between server re-reads. Pages also export `revalidate = 15`. */
export const STATE_REVALIDATE = 15;

async function loadState(): Promise<State> {
  try {
    const r = await agentFetch("/state", { timeoutMs: 10_000 });
    if (!r.ok) throw new Error(`agent ${r.status}`);
    const s = (await r.json()) as State;
    return { ...s, source: "chain" };
  } catch {
    return { ...(fixture as unknown as State), source: "fixture" };
  }
}

/** One read per request, shared by every server component that asks. */
export const getState = cache(loadState);

/** Where the state came from, for the `x-avow-source` header. */
export function stateSource(s: State): string {
  return s.source ?? "chain";
}
