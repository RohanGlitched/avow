"use client";
// The persistent honesty strip: which network the vault is on, and whether the agent is alive.
import { useLiveState, useNow } from "@/lib/live";
import { NETWORK_WORDS } from "@/lib/chain";
import { ago, num } from "@/lib/format";

export function StatusStrip() {
  const { state, status } = useLiveState();
  const now = useNow();
  const mode = state.network.mode;
  const hb = state.lastHeartbeat;
  const since = hb != null ? now - hb : null;
  const alive = state.agentAlive && since != null && since < 180;
  const words = NETWORK_WORDS[mode];
  return (
    <div className="strip" role="status" aria-live="polite">
      <div className="wrap">
        <span className={`strip__item mode mode--${mode}`} title={words.long}>
          <span className="mode__dot" aria-hidden="true" />
          {words.short}
        </span>
        <span className="strip__item strip__item--hide-sm muted">
          Chain {state.network.chainId}
          {state.block ? `, block ${num(state.block)}` : ""}
        </span>
        {state.source === "fixture" ? (
          <span className="strip__item sample" title="Development snapshot. The live reader replaces it.">
            Sample data
          </span>
        ) : null}
        <span className="strip__item strip__item--grow">
          <span className={`pulse${alive ? "" : since != null && since < 900 ? " pulse--stale" : " pulse--down"}`} aria-hidden="true" />
          {hb == null ? "Agent has not reported yet" : alive ? `Agent alive, heartbeat ${ago(since!)}` : `Agent last seen ${ago(since!)}`}
          {status === "error" ? <span className="muted">, live reads failing</span> : null}
        </span>
      </div>
    </div>
  );
}
