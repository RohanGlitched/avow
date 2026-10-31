"use client";
// The persistent honesty strip: which network the vault is on, and whether the agent is alive.
// In a fork rehearsal it carries a short chip; the full sentence lives once, at /how#rehearsal.
import Link from "next/link";
import { useLiveState, useNow } from "@/lib/live";
import { NETWORK_WORDS, rehearsalChip } from "@/lib/chain";
import { ago, num } from "@/lib/format";
import { LastCycle } from "./Live";

export function StatusStrip() {
  const { state, status } = useLiveState();
  const now = useNow();
  const mode = state.network.mode;
  const hb = state.lastHeartbeat;
  const since = hb != null ? now - hb : null;
  const alive = state.agentAlive && since != null && since < 180;
  const words = NETWORK_WORDS[mode];
  const chip = rehearsalChip(state);
  return (
    <div className={`strip${chip ? " strip--rehearsal" : ""}`} role="status" aria-live="polite">
      <div className="wrap">
        <span className={`strip__item mode mode--${mode}`} title={words.long}>
          <span className="mode__dot" aria-hidden="true" />
          {chip ? <span className="strip__chip">{chip}</span> : words.short}
          {chip ? (
            <Link href="/how#rehearsal" className="strip__what">
              What this means
            </Link>
          ) : null}
        </span>
        {chip ? null : (
          <span className="strip__item strip__item--hide-sm muted">
            Chain {state.network.chainId}
            {state.block ? `, block ${num(state.block)}` : ""}
          </span>
        )}
        {state.source === "fixture" ? (
          <span className="strip__item sample" title="The agent did not answer, so this is a saved mainnet snapshot. Live reads resume when it answers.">
            Saved snapshot
          </span>
        ) : null}
        <span className="strip__item strip__item--grow">
          <span className={`pulse${alive ? "" : since != null && since < 900 ? " pulse--stale" : " pulse--down"}`} aria-hidden="true" />
          <span suppressHydrationWarning>
            {hb == null ? "Agent has not reported yet" : alive ? <>Agent alive, <LastCycle /></> : `Agent last seen ${ago(since!)}`}
          </span>
          {status === "error" ? <span className="muted">, live reads failing</span> : null}
        </span>
      </div>
    </div>
  );
}
