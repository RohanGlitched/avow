// An Avow note printed as a security note. Every printed feature carries data:
// rosette = statement hash, serial = note id, denomination = notional,
// promise clause = the sworn statement, microtext = statement + tx hash,
// needle = live HSKSwap TWAP, seal and OVI ink = on-chain marks.
import { Rosette } from "./Rosette";
import { Needle, Unrealised, Until } from "./Live";
import { Hex } from "./Ovi";
import { Crossing, InkStamp, Perforation, Pantograph } from "./Stamps";
import { ASSET_LABEL, STATUS_WORD, denom, num, pct, px, splitStatement, usd, when } from "@/lib/format";
import { ownLink } from "@/lib/chain";
import type { Note as NoteT, State } from "@/lib/types";

export interface NoteProps {
  note: NoteT;
  state: Pick<State, "network" | "contracts">;
  /** Play the one-time printing sequence (hero only). */
  print?: boolean;
  /** Show lettered callouts for the "know your note" guide. */
  annotate?: boolean;
  /** Draw the rosette after mount (below the fold). */
  defer?: boolean;
  as?: "article" | "div";
  headingLevel?: 2 | 3;
}

function Callout({ k, on }: { k: string; on?: boolean }) {
  if (!on) return null;
  return (
    <span className="callout" aria-hidden="true">
      {k}
    </span>
  );
}

function Seal({ block, fork, uid }: { block: number; fork: boolean; uid: string }) {
  const ring = fork ? `SWORN ON A FORK OF HSK CHAIN · BLOCK ${num(block)} · ` : `SWORN ON HSK CHAIN · CHAIN 177 · BLOCK ${num(block)} · `;
  return (
    <svg className="seal" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <path id={`seal${uid}`} d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" />
      </defs>
      <circle cx="60" cy="60" r="57" className="seal__rim" />
      <circle cx="60" cy="60" r="36" className="seal__rim seal__rim--in" />
      <text className="seal__ring">
        <textPath href={`#seal${uid}`} textLength="286" lengthAdjust="spacingAndGlyphs">
          {ring}
        </textPath>
      </text>
      <text x="60" y="58" textAnchor="middle" className="seal__num">
        177
      </text>
      <text x="60" y="76" textAnchor="middle" className="seal__cap">
        {fork ? "fork" : "on chain"}
      </text>
    </svg>
  );
}

export function Note({ note, state, print, annotate, defer, as = "article", headingLevel = 2 }: NoteProps) {
  const uid = `n${note.id}${print ? "p" : ""}${annotate ? "a" : ""}`;
  const L = ASSET_LABEL[note.asset];
  const d = denom(note.notionalUsd);
  const fork = state.network.mode === "fork-rehearsal";
  const txHref = ownLink(state, "tx", note.openTx);
  const settleHref = ownLink(state, "tx", note.settleTx);
  const micro = `${note.statement} Statement hash ${note.hash}. Sworn in transaction ${note.openTx} at block ${note.openBlock}. ${note.serial}. `;
  const { oath: statement, rest: because } = splitStatement(note.statement);
  const words = statement.split(" ");
  const Tag = as;
  const H = headingLevel === 2 ? "h2" : "h3";
  const settled = note.status !== "outstanding";

  return (
    <Tag className={`note note--${note.status}${print ? " note--print" : ""}${annotate ? " note--annotated" : ""}`} aria-label={`Note ${note.serial}, ${STATUS_WORD[note.status].toLowerCase()}`}>
      <div className="note__paper">
        <Pantograph uid={uid} revealed={note.status === "void"} />
        <div className="note__band note__band--t" aria-hidden="true" />
        <div className="note__band note__band--b" aria-hidden="true" />
        <div className="note__band note__band--l" aria-hidden="true" />
        <div className="note__band note__band--r" aria-hidden="true" />
        <div className="micro micro--t" aria-hidden="true">{micro.repeat(3)}</div>
        <div className="micro micro--b" aria-hidden="true">{micro.repeat(3)}</div>
        <div className="micro micro--l" aria-hidden="true">{micro.repeat(2)}</div>
        <div className="micro micro--r" aria-hidden="true">{micro.repeat(2)}</div>
        <Callout k="F" on={annotate} />

        <div className="note__grid">
          <div className="note__serial note__serial--a">
            <span className="serial">{note.serial}</span>
            <Callout k="B" on={annotate} />
          </div>

          <div className="note__issuer">
            <H className="note__brand">Avow</H>
            <span className="note__cap">Sworn note of the Avow vault on HSK Chain</span>
          </div>

          <div className="note__denom" aria-label={`Notional ${usd(note.notionalUsd)}`}>
            <span className="note__denom-cur">$</span>
            <span className="note__denom-whole">{d.whole}</span>
            <span className="note__denom-cents">{d.cents}</span>
            <span className="note__denom-cap">notional, USDT</span>
            <Callout k="C" on={annotate} />
          </div>

          <div className="note__medallion">
            <Rosette hash={note.hash} print={print} defer={defer} label={`Guilloché rosette computed from the statement hash ${note.hash.slice(0, 10)}…`} />
            {/* the cancellation stamp sits over the rosette, never over the printed values */}
            {note.status === "honoured" && note.settledAt ? <Perforation t={note.settledAt} className="note__perf" /> : null}
            {note.status === "lapsed" && note.settledAt ? <InkStamp word="LAPSED" t={note.settledAt} uid={uid} className="note__ink" /> : null}
            {note.status === "void" && note.settledAt ? <InkStamp word="VOID" t={note.settledAt} uid={uid} className="note__ink note__ink--void" /> : null}
            <Callout k="A" on={annotate} />
          </div>

          <blockquote className="note__clause">
            <p>
              {print
                ? words.map((w, i) => (
                    <span key={i} className="w" style={{ ["--k" as string]: i }}>
                      {w}{" "}
                    </span>
                  ))
                : statement}
            </p>
            {because && <p className="note__because">{because}</p>}
            <p className="note__terms">
              Payable to the record. Anyone may settle this note once the HSKSwap 5-minute TWAP and the live price are both past a level, or at expiry. Graded against the stated{" "}
              {pct(note.confidence)}.
            </p>
            <Callout k="D" on={annotate} />
          </blockquote>

          <dl className="note__facts">
            <div>
              <dt>Position</dt>
              <dd>
                {note.side === "long" ? "Long" : "Short"} {L}
              </dd>
            </div>
            <div>
              <dt>Entry, TWAP</dt>
              <dd className="tnum">{px(note.asset, note.entryPx)}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd className="tnum">{pct(note.confidence)}</dd>
            </div>
            <div>
              <dt>Sworn</dt>
              <dd className="tnum">{when(note.openedAt)}</dd>
            </div>
            {settled ? (
              <div>
                <dt>{STATUS_WORD[note.status]}</dt>
                <dd className="tnum">{note.settledAt ? when(note.settledAt) : "—"}</dd>
              </div>
            ) : (
              <div>
                <dt>Expires</dt>
                <dd className="tnum">
                  <Until t={note.expiry} />
                </dd>
              </div>
            )}
            {!settled ? <Unrealised note={note} /> : null}
            {settled && note.pnlUsd != null ? (
              <div>
                <dt>Realised, on chain</dt>
                <dd className={`tnum ${note.pnlUsd >= 0 ? "pos" : "neg"}`}>{usd(note.pnlUsd, { sign: true })}</dd>
              </div>
            ) : null}
          </dl>

          <div className="note__scale">
            <Needle note={note} print={print} />
            <Callout k="E" on={annotate} />
          </div>

          <div className="note__foot">
            <div className="note__seal">
              <Seal block={note.openBlock} fork={fork} uid={uid} />
              <Callout k="G" on={annotate} />
            </div>
            <div className="note__tx">
              <span className="cap">Sworn in</span> <Hex value={note.openTx} href={txHref} />
              {note.settleTx ? (
                <>
                  <br />
                  <span className="cap">Settled in</span> <Hex value={note.settleTx} href={settleHref} />
                </>
              ) : (
                <>
                  <br />
                  <span className="cap">Statement</span> <Hex value={note.hash} />
                </>
              )}
            </div>
            <div className="note__sign">
              <span className="note__sig" aria-hidden="true">
                Avow
              </span>
              <span className="note__sigline">
                Agent <Hex value={state.contracts.agent} href={ownLink(state, "address", state.contracts.agent)} head={6} tail={4} />
              </span>
            </div>
            <div className="note__serial note__serial--b serial">{note.serial}</div>
          </div>
        </div>

        {note.status === "retracted" ? <Crossing text="Retracted by Avow, graded as a miss" /> : null}
        {note.status === "revoked" ? <Crossing text="Revoked by the owner, not graded" /> : null}
        <Callout k="H" on={annotate} />
      </div>
    </Tag>
  );
}
