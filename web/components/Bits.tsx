import Link from "next/link";
import { Rosette } from "./Rosette";
import { seedHash } from "@/lib/rosette";
import { ASSET_LABEL, noteHref, serialFor, time, day, usd } from "@/lib/format";
import type { JournalEntry, Note, State } from "@/lib/types";

/** A guilloché border with a small medallion, used between major sections. */
export function Divider({ seed }: { seed: string }) {
  return (
    <div className="wrap" aria-hidden="true">
      <div className="divider">
        <div className="band" />
        <Rosette hash={seedHash(seed)} defer only={[0, 2, 4]} />
        <div className="band" />
      </div>
    </div>
  );
}

export function SecHead({ title, children, id }: { title: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div className="sec__head">
      <h2 id={id}>{title}</h2>
      {children ? <div className="lede">{children}</div> : <div />}
    </div>
  );
}

const SLIP_WORD: Partial<Record<JournalEntry["kind"], string>> = {
  blocked: "Blocked",
  declined: "Declined",
  considered: "Passed",
  reviewed: "Reviewed",
};

/** Split "ETH: …. BTC: …. HSK: …." into one reason per asset. */
export function perAsset(detail: string): { asset: string | null; text: string }[] {
  const parts = detail.split(/\s(?=(?:ETH|BTC|HSK): )/);
  if (parts.length < 2) return [{ asset: null, text: detail }];
  return parts.map((p) => {
    const m = p.match(/^(ETH|BTC|HSK): ([\s\S]*)$/);
    return m ? { asset: m[1], text: m[2] } : { asset: null, text: p };
  });
}

/** A refusal slip: something Avow declined or passed on, a clause refused, or a review of an open note. */
export function Slip({ e, notes }: { e: JournalEntry; notes?: Pick<Note, "id" | "serial">[] }) {
  const reasons = e.detail ? perAsset(e.detail) : [];
  return (
    <article className="slip">
      <div className="slip__top">
        <span className={`jkind jkind--${e.kind}`}>
          <i aria-hidden="true" />
          {SLIP_WORD[e.kind] ?? e.kind}
          {e.asset ? ` ${ASSET_LABEL[e.asset]}` : ""}
        </span>
        <span className="tnum" suppressHydrationWarning>
          {time(e.t)}, {day(e.t)}
        </span>
      </div>
      <h3>{e.title}</h3>
      {reasons.length > 1 ? (
        <ul className="slip__reasons">
          {reasons.map((r, i) => (
            <li key={i}>
              {r.asset ? <b>{r.asset}</b> : null} {r.text}
            </li>
          ))}
        </ul>
      ) : e.detail ? (
        <p>{e.detail}</p>
      ) : null}
      <div className="slip__foot">
        {e.model
          ? `Decided by ${e.model}`
          : e.kind === "blocked"
            ? "Refused before any transaction was sent"
            : e.kind === "considered"
              ? "No candidate cleared the agent's checks"
              : e.kind === "reviewed"
                ? "Avow re-examined an outstanding note"
                : "Dropped by the candidate builder"}
        {e.noteId != null ? (
          <>
            {" "}
            <Link href={noteHref(e.noteId)}>see {serialFor(e.noteId, notes)}</Link>
          </>
        ) : null}
      </div>
    </article>
  );
}

/** "Net after gas and model", only when the agent reports it; the on-chain figure is never called "after gas". */
export function NetPnl({ r }: { r: State["record"] }) {
  if (r.netPnlUsd == null) return <>Gas and model spend are not in this on-chain figure.</>;
  const parts = [r.gasUsdAll != null ? `gas ${usd(r.gasUsdAll, { dp: 3 })}` : null, r.modelUsdAll != null ? `model ${usd(r.modelUsdAll, { dp: 3 })}` : null].filter(Boolean);
  return (
    <>
      Net after gas and model: <b className={r.netPnlUsd >= 0 ? "pos" : "neg"}>{usd(r.netPnlUsd, { sign: true, dp: r.netPnlUsd !== 0 && Math.abs(r.netPnlUsd) < 1 ? 3 : 2 })}</b>
      {parts.length ? ` (${parts.join(", ")})` : ""}.
    </>
  );
}

