"use client";
import { useMemo, useState } from "react";
import { NoteStub } from "./NoteStub";
import { ASSET_LABEL, STATUS_WORD } from "@/lib/format";
import type { AssetSym, Note, NoteStatus } from "@/lib/types";

const STATUSES: (NoteStatus | "all")[] = ["all", "outstanding", "honoured", "void", "lapsed", "retracted", "revoked"];
const ASSETS: (AssetSym | "all")[] = ["all", "WETH", "WBTC", "WHSK"];

export function NotesLedger({ notes }: { notes: Note[] }) {
  const [st, setSt] = useState<NoteStatus | "all">("all");
  const [as, setAs] = useState<AssetSym | "all">("all");
  const shown = useMemo(() => notes.filter((n) => (st === "all" || n.status === st) && (as === "all" || n.asset === as)), [notes, st, as]);
  return (
    <div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => {
            const c = notes.filter((n) => s === "all" || n.status === s).length;
            return (
              <button key={s} aria-pressed={st === s} onClick={() => setSt(s)} disabled={c === 0 && s !== "all"}>
                {s === "all" ? "All" : STATUS_WORD[s]}
                <span className="n">{c}</span>
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label="Filter by asset">
          {ASSETS.map((a) => (
            <button key={a} aria-pressed={as === a} onClick={() => setAs(a)}>
              {a === "all" ? "Every asset" : ASSET_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {shown.length} notes shown
      </p>
      {shown.length ? (
        <div className="ledger">
          {shown.map((n) => (
            <NoteStub key={n.id} note={n} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="empty">
          <b>No notes sworn yet</b>
          The agent reads the pools every 30 seconds and swears only when a candidate clears the fee, the edge and every clause of the mandate. The first note will appear here with its
          transaction.
        </div>
      ) : (
        <div className="empty">
          <b>No {st !== "all" ? STATUS_WORD[st as NoteStatus].toLowerCase() : ""} notes{as !== "all" ? ` on ${ASSET_LABEL[as as AssetSym]}` : ""}</b>
          Try another status or asset.{" "}
          <button
            className="btn btn--ghost"
            style={{ marginLeft: 8 }}
            onClick={() => {
              setSt("all");
              setAs("all");
            }}
          >
            Show every note
          </button>
        </div>
      )}
    </div>
  );
}
