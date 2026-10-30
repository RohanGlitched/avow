import { Note } from "./Note";
import { num, pct, px, short, usd } from "@/lib/format";
import type { Note as NoteT, State } from "@/lib/types";

/** "Know your note": the annotated note with a lettered key, like a central bank's banknote leaflet. */
export function Guide({ note, state }: { note: NoteT; state: State }) {
  const items = [
    { k: "A", t: "Guilloché rosette", d: `Drawn from the 32 bytes of the statement hash ${short(note.hash, 8, 6)}. Change one character of the sentence and the rosette changes. Anyone can recompute it.` },
    { k: "B", t: "Serial in red", d: `${note.serial} is the note's id in the vault. Notes are numbered in the order they were sworn; none can be skipped or deleted.` },
    { k: "C", t: "Denomination", d: `${usd(note.notionalUsd)} put at risk. It can never exceed the denomination Avow had earned when it swore (tier ${note.tierAtOpen}).` },
    { k: "D", t: "The promise clause", d: "The sworn sentence, emitted on chain in full. Asset, direction, target, deadline and void level: everything needed to prove it wrong." },
    { k: "E", t: "Engraved scale and needle", d: `From the void level ${px(note.asset, note.voidPx)} on the left to the target ${px(note.asset, note.targetPx)} on the right. The needle is the HSKSwap 5-minute TWAP, or the exit price once settled.` },
    { k: "F", t: "Microtext border", d: "The statement, its hash and the transaction hash printed in 4.6-pixel type around the edge. Zoom in to read it." },
    { k: "G", t: "Seal and colour-shifting ink", d: `Only marks verifiable on chain are printed in OVI ink: block ${num(note.openBlock)}, transaction hashes, addresses. Hover them to see the ink shift.` },
    { k: "H", t: "Hidden VOID pantograph", d: `Every note carries the word VOID in its background screen. It stays hidden unless the price crosses the void level. Confidence when sworn: ${pct(note.confidence)}.` },
  ];
  return (
    <div className="guide">
      <Note note={note} state={state} annotate defer headingLevel={3} />
      <ol className="guide__list">
        {items.map((i) => (
          <li key={i.k}>
            <span className="k" aria-hidden="true">
              {i.k}
            </span>
            <div>
              <b>{i.t}</b>
              <p>{i.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
