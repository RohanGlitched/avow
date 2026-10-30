import Link from "next/link";
import { Rosette } from "./Rosette";
import { seedHash } from "@/lib/rosette";
import { ASSET_LABEL, time, day } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";

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

/** A refusal slip: something Avow declined to swear, or a clause refused. */
export function Slip({ e }: { e: JournalEntry }) {
  return (
    <article className="slip">
      <div className="slip__top">
        <span className={`jkind jkind--${e.kind}`}>
          <i aria-hidden="true" />
          {e.kind === "blocked" ? "Blocked" : "Declined"}
          {e.asset ? ` ${ASSET_LABEL[e.asset]}` : ""}
        </span>
        <span className="tnum">
          {time(e.t)}, {day(e.t)}
        </span>
      </div>
      <h3>{e.title}</h3>
      {e.detail ? <p>{e.detail}</p> : null}
      <div className="slip__foot">
        {e.model ? `Decided by ${e.model}` : e.kind === "blocked" ? "Refused before any transaction was sent" : "Dropped by the candidate builder"}
        {e.noteId ? (
          <>
            {" "}
            <Link href={`/notes/${e.noteId}`}>see the note</Link>
          </>
        ) : null}
      </div>
    </article>
  );
}
