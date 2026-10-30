// A counterfoil: the stub a cheque book keeps after the note itself has gone out.
import Link from "next/link";
import { Rosette } from "./Rosette";
import { ASSET_LABEL, STATUS_WORD, noteHref, pct, px, scalePos, splitStatement, usd, when } from "@/lib/format";
import type { Note } from "@/lib/types";

export function StatusMark({ status }: { status: Note["status"] }) {
  return <span className={`status status--${status}`}>{STATUS_WORD[status]}</span>;
}

function MiniTrack({ note }: { note: Note }) {
  const p = note.status === "outstanding" ? note.livePx : note.exitPx;
  const e = scalePos(note, note.entryPx);
  const x = p != null ? Math.max(0, Math.min(1, scalePos(note, p))) : null;
  return (
    <svg className="stub__mini" viewBox="0 0 150 32" width="150" height="32" aria-hidden="true">
      <line x1="2" x2="148" y1="24" y2="24" stroke="var(--ink)" strokeWidth="1" />
      <line x1="2" x2="2" y1="16" y2="28" stroke="var(--void)" strokeWidth="1.5" />
      <line x1="148" x2="148" y1="16" y2="28" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1={2 + e * 146} x2={2 + e * 146} y1="18" y2="28" stroke="var(--ink-2)" strokeDasharray="2 2" />
      {x != null && <path d={`M${2 + x * 146} 22l-4.5 -7h9z`} fill={note.status === "void" ? "var(--void)" : "var(--ink)"} />}
      <text x="2" y="10" fontSize="11" fill="var(--muted)" fontFamily="var(--sans)">
        void
      </text>
      <text x="148" y="10" fontSize="11" fill="var(--muted)" textAnchor="end" fontFamily="var(--sans)">
        target
      </text>
    </svg>
  );
}

export function NoteStub({ note }: { note: Note }) {
  const L = ASSET_LABEL[note.asset];
  const pnl = note.pnlUsd;
  return (
    <Link href={noteHref(note.id)} className={`stub stub--${note.status}`} aria-label={`${note.serial}, ${STATUS_WORD[note.status]}: ${note.statement}`}>
      <Rosette hash={note.hash} defer only={[1, 2, 4]} />
      <div className="stub__main">
        <div className="stub__top">
          <span className="serial">{note.serial}</span>
          <StatusMark status={note.status} />
          <span className="chip">
            {note.side === "long" ? "Long" : "Short"} {L}
          </span>
        </div>
        <p className="stub__statement">{splitStatement(note.statement).oath}</p>
        <p className="stub__meta">
          Sworn {when(note.openedAt)} at <b>{pct(note.confidence)}</b> confidence for <b>{usd(note.notionalUsd)}</b>
          {note.status === "outstanding" && note.livePx != null ? (
            <>
              . Now <b className="tnum">{px(note.asset, note.livePx)}</b>
            </>
          ) : note.exitPx != null ? (
            <>
              . Closed at <b className="tnum">{px(note.asset, note.exitPx)}</b>
            </>
          ) : null}
          .
        </p>
      </div>
      <MiniTrack note={note} />
      <div className="stub__pnl">
        {pnl != null ? <b className={pnl >= 0 ? "pos" : "neg"}>{usd(pnl, { sign: true })}</b> : <b className="muted">open</b>}
        <span>{note.sqError != null ? `squared error ${note.sqError.toFixed(3)}` : note.status === "revoked" ? "not graded" : "not yet graded"}</span>
      </div>
    </Link>
  );
}
