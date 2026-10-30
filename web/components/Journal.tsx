"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Hex } from "./Ovi";
import { ownLink } from "@/lib/chain";
import { ASSET_LABEL, num, time, weekday, dayKey } from "@/lib/format";
import type { JournalEntry, JournalKind, State } from "@/lib/types";

export const KIND_WORD: Record<JournalKind, string> = {
  sworn: "Sworn",
  declined: "Declined",
  blocked: "Blocked",
  settled: "Settled",
  considered: "Considered",
  heartbeat: "Heartbeat",
  amended: "Amended",
  tightened: "Tightened",
  error: "Error",
};

export function JournalRow({ e, state }: { e: JournalEntry; state: Pick<State, "network"> }) {
  const quiet = e.kind === "heartbeat" || e.kind === "considered";
  return (
    <li className={`jrow${quiet ? " jrow--quiet" : ""}`} id={`j${e.t}`}>
      <span className="jrow__t">{time(e.t)}</span>
      <span className={`jkind jkind--${e.kind}`}>
        <i aria-hidden="true" />
        {KIND_WORD[e.kind]}
        {e.asset ? <span className="muted"> {ASSET_LABEL[e.asset]}</span> : null}
      </span>
      <div>
        <div className="jrow__title">{e.title}</div>
        {e.detail ? <p className="jrow__detail">{e.detail}</p> : null}
        {e.noteId || e.tx || e.model ? (
          <div className="jrow__links">
            {e.noteId ? (
              <Link href={`/notes/${e.noteId}`} className="chip serial">
                AVW·{String(e.noteId).padStart(6, "0")}
              </Link>
            ) : null}
            {e.tx ? (
              <span>
                <span className="muted">tx </span>
                <Hex value={e.tx} href={ownLink(state, "tx", e.tx)} />
              </span>
            ) : null}
            {e.model ? (
              <span className="muted">
                {e.model}
                {e.tokens ? `, ${num(e.tokens)} tokens` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

const FILTERS: { key: string; label: string; kinds: JournalKind[] | null }[] = [
  { key: "all", label: "Everything", kinds: null },
  { key: "decisions", label: "Decisions", kinds: ["sworn", "declined", "blocked"] },
  { key: "sworn", label: "Sworn", kinds: ["sworn"] },
  { key: "declined", label: "Declined", kinds: ["declined"] },
  { key: "blocked", label: "Blocked by a clause", kinds: ["blocked"] },
  { key: "settled", label: "Settled", kinds: ["settled"] },
  { key: "owner", label: "Mandate changes", kinds: ["amended", "tightened"] },
  { key: "ops", label: "Heartbeats and errors", kinds: ["heartbeat", "considered", "error"] },
];

export function JournalList({ entries, state, initial = "all" }: { entries: JournalEntry[]; state: Pick<State, "network">; initial?: string }) {
  const [f, setF] = useState(initial);
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  const shown = useMemo(() => entries.filter((e) => !filter.kinds || filter.kinds.includes(e.kind)), [entries, filter]);
  const days: { key: string; label: string; items: JournalEntry[] }[] = [];
  for (const e of shown) {
    const k = dayKey(e.t);
    let d = days.find((x) => x.key === k);
    if (!d) {
      d = { key: k, label: weekday(e.t), items: [] };
      days.push(d);
    }
    d.items.push(e);
  }
  return (
    <div>
      <div className="filters" role="group" aria-label="Filter the journal">
        <div className="seg">
          {FILTERS.map((x) => {
            const n = entries.filter((e) => !x.kinds || x.kinds.includes(e.kind)).length;
            return (
              <button key={x.key} aria-pressed={f === x.key} onClick={() => setF(x.key)}>
                {x.label}
                <span className="n">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      {days.length === 0 ? (
        <div className="empty">
          <b>Nothing of this kind yet</b>
          The agent writes every decision here as it makes it. Choose another filter or check back after the next cycle.
        </div>
      ) : (
        days.map((d) => (
          <section key={d.key} aria-label={d.label}>
            <h2 className="jday">{d.label}</h2>
            <ol className="journal">
              {d.items.map((e) => (
                <JournalRow key={`${e.t}-${e.kind}-${e.title}`} e={e} state={state} />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
