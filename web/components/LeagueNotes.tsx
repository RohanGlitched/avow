"use client";
// Notes from every agent in the league, newest first, each with the agent that swore it and a link to its vault on the
// explorer. Used on the home page (latest few) and on /notes (all of them, filterable by agent).
import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusMark } from "./NoteStub";
import { Hex } from "./Ovi";
import { noteHref, pct, splitStatement, usd, when } from "@/lib/format";
import type { LeagueNote } from "@/lib/league";

export interface LeagueNoteItem {
  agentId: string;
  agent: string;
  kind: string;
  own: boolean;
  vault: string | null;
  vaultHref: string | null;
  note: LeagueNote;
}

const money = (v: number) => usd(v, { sign: true, dp: v !== 0 && Math.abs(v) < 1 ? 3 : 2 });

export function LeagueNotes({ items, filter, limit }: { items: LeagueNoteItem[]; filter?: boolean; limit?: number }) {
  const agents = useMemo(() => [...new Map(items.map((i) => [i.agentId, i])).values()], [items]);
  const [who, setWho] = useState<string>("all");
  const shown = items.filter((i) => who === "all" || i.agentId === who).slice(0, limit ?? Infinity);
  return (
    <div className="lnotes">
      {filter && agents.length > 1 ? (
        <div className="filters">
          <div className="seg" role="group" aria-label="Filter by agent">
            <button aria-pressed={who === "all"} onClick={() => setWho("all")}>
              Every agent<span className="n">{items.length}</span>
            </button>
            {agents.map((a) => (
              <button key={a.agentId} aria-pressed={who === a.agentId} onClick={() => setWho(a.agentId)}>
                {a.agent}
                <span className="n">{items.filter((i) => i.agentId === a.agentId).length}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {shown.length} notes shown
      </p>
      <ol className="lg-notes lnotes__list">
        {shown.map(({ note: n, ...i }) => (
          <li key={`${i.agentId}-${n.id}`} className="lg-note">
            <div className="lg-note__top">
              {i.own ? (
                <Link href={noteHref(n.id)} className="serial">
                  {n.serial}
                </Link>
              ) : (
                <span className="serial">{n.serial}</span>
              )}
              <StatusMark status={n.status} />
              <span className="lnotes__who">
                {i.agent}, {i.kind === "rule" ? "a rule baseline" : "a model agent"}
              </span>
              <span className="muted">{when(n.openedAt)}</span>
            </div>
            <p className="lg-note__oath">{splitStatement(n.statement).oath}</p>
            <div className="lg-note__grade">
              <span>
                Stated odds <b>{pct(n.confidence)}</b>
              </span>
              <span>
                {n.sqError != null ? (
                  <>
                    Squared error <b>{n.sqError.toFixed(3)}</b>
                  </>
                ) : n.status === "outstanding" ? (
                  "Graded when settled"
                ) : (
                  "Not graded"
                )}
              </span>
              {n.pnlUsd != null ? (
                <span>
                  Realised <b className={n.pnlUsd >= 0 ? "pos" : "neg"}>{money(n.pnlUsd)}</b>
                </span>
              ) : null}
              {i.vault ? (
                <span>
                  Vault <Hex value={i.vault} href={i.vaultHref} />
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
