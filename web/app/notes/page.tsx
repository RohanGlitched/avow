import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { NotesLedger } from "@/components/NotesLedger";
import { SecHead, Divider } from "@/components/Bits";
import { StatusMark } from "@/components/NoteStub";
import { ASSET_LABEL, STATUS_EXPLAIN, noteHref, num, usd } from "@/lib/format";
import type { AssetSym, NoteStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes", description: "Every note Avow has sworn on HSK Chain, how it ended and what it cost." };

export default async function NotesPage() {
  const s = await getState();
  const notes = s.notes;
  const assets: AssetSym[] = ["WETH", "WBTC", "WHSK"];
  const statuses: NoteStatus[] = ["outstanding", "honoured", "void", "lapsed", "retracted", "revoked"];
  const notional = notes.reduce((a, n) => a + n.notionalUsd, 0);
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Notes
          </div>
          <h1>The ledger of sworn notes.</h1>
          <p className="lede">
            {notes.length} notes, {usd(notional)} sworn in total. Every one stays here however it ended: honoured, void, lapsed, retracted or revoked. Open any counterfoil for its full note, the
            price corridor it promised and the settlement.
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8 }} aria-label="All notes">
        <div className="wrap">
          <NotesLedger notes={notes} />
        </div>
      </section>

      <Divider seed="notes-outcomes" />

      <section className="sec" aria-labelledby="by-asset">
        <div className="wrap">
          <SecHead id="by-asset" title="Outcomes by asset.">
            Realised P&amp;L is measured on chain and counts the 0.30% pool fee on both swaps; gas and model spend are reported separately on the record. Revoked notes are closed by the owner and never graded.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="r">Notes</th>
                  <th className="r">Honoured</th>
                  <th className="r">Void</th>
                  <th className="r">Lapsed</th>
                  <th className="r">Retracted</th>
                  <th className="r">Average confidence</th>
                  <th className="r">Realised</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const ns = notes.filter((n) => n.asset === a);
                  const c = (st: NoteStatus) => ns.filter((n) => n.status === st).length;
                  const pnl = ns.reduce((x, n) => x + (n.pnlUsd ?? 0), 0);
                  const conf = ns.length ? ns.reduce((x, n) => x + n.confidence, 0) / ns.length : null;
                  return (
                    <tr key={a}>
                      <td data-h="Asset" style={{ fontFamily: "var(--serif)", fontSize: 20 }}>
                        {ASSET_LABEL[a]}
                      </td>
                      <td data-h="Notes" className="r">
                        {ns.length}
                      </td>
                      <td data-h="Honoured" className="r">
                        {c("honoured")}
                      </td>
                      <td data-h="Void" className="r">
                        {c("void")}
                      </td>
                      <td data-h="Lapsed" className="r">
                        {c("lapsed")}
                      </td>
                      <td data-h="Retracted" className="r">
                        {c("retracted")}
                      </td>
                      <td data-h="Average confidence" className="r">
                        {conf != null ? `${num(conf * 100)}%` : "—"}
                      </td>
                      <td data-h="Realised" className={`r ${pnl >= 0 ? "pos" : "neg"}`} style={{ fontWeight: 650 }}>
                        {usd(pnl, { sign: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="endings">
        <div className="wrap">
          <SecHead id="endings" title="Six ways a note can end.">
            The status is decided by the contract, not by the agent. Each one is drawn on the note itself: a perforation, a void pantograph, an ink stamp or a crossing.
          </SecHead>
          <div className="grid-3">
            {statuses.map((st) => (
              <div key={st} style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <StatusMark status={st} />
                <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 15.5 }}>{STATUS_EXPLAIN[st]}</p>
                <p className="plate">
                  {notes.filter((n) => n.status === st).length} so far.{" "}
                  {notes.find((n) => n.status === st) ? <Link href={noteHref(notes.find((n) => n.status === st)!.id)}>See {notes.find((n) => n.status === st)!.serial}</Link> : null}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
