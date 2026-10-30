import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { MandateRosette } from "@/components/Rosette";
import { MandateEditor } from "@/components/MandateEditor";
import { SecHead, Divider } from "@/components/Bits";
import { CLAUSES, STANDING_CLAUSES, blockedFor, clauseUsage } from "@/lib/mandate";
import { ASSET_LABEL, time, day } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mandate", description: "The owner's rules for Avow, enforced by the vault on HSK Chain, with live usage and every blocked attempt." };

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];

export default async function MandatePage() {
  const s = await getState();
  const m = s.mandate;
  const amendments = s.journal.filter((j) => j.kind === "amended" || j.kind === "tightened");
  const blockedAll = s.journal.filter((j) => j.kind === "blocked");
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Mandate
          </div>
          <h1>The mandate, as the vault enforces it.</h1>
          <p className="lede">
            The owner writes these rules once; the contract checks every one of them inside <code>swear()</code>, before any swap. Avow may make them stricter on its own. Only the owner&apos;s
            wallet can loosen them. {blockedAll.length} attempts have been refused by a clause so far.
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8 }} aria-labelledby="charter">
        <div className="wrap">
          <article className="charter">
            <div className="charter__head">
              <div>
                <h2 id="charter">Mandate of the Avow vault</h2>
                <p className="muted" style={{ marginTop: 10, maxWidth: "56ch" }}>
                  Trading {m.assets.map((a) => ASSET_LABEL[a]).join(", ")} against USDT on HSKSwap.{" "}
                  {m.paused ? "Paused by the owner: no new notes may be sworn." : "Open for new notes."} Each clause below shows how close Avow has come to it.
                </p>
              </div>
              <div className="rosette-wrap">
                <MandateRosette mandate={m} label="The mandate's rosette" />
              </div>
            </div>
            <ol className="clauses">
              {CLAUSES.map((c, i) => {
                const u = clauseUsage(c.field, s);
                const blocked = blockedFor(c.field, s);
                return (
                  <li key={c.field} className="clause">
                    <span className="clause__n">{ROMAN[i]}</span>
                    <div>
                      <span className="clause__title">{c.title}</span>
                      <p className="clause__text">{c.sentence(m[c.field], m)}</p>
                      <p className="clause__guard">Checked in {c.guard}</p>
                    </div>
                    <div className="clause__use">
                      {u.fill != null ? (
                        <div className="meter" role="img" aria-label={`${Math.round(Math.min(1, u.fill) * 100)}% of the limit used`}>
                          <div className="meter__fill" style={{ width: `${Math.min(100, u.fill * 100)}%` }} />
                          <div className="meter__mark" style={{ left: "100%" }} />
                        </div>
                      ) : null}
                      <p>{u.text}</p>
                      {blocked.length ? (
                        <details className="clause__blocked">
                          <summary>
                            Refused {blocked.length} {blocked.length === 1 ? "attempt" : "attempts"}
                          </summary>
                          {blocked.map((b) => (
                            <p key={b.t}>
                              {time(b.t)} IST, {day(b.t)}: {b.detail ?? b.title}
                            </p>
                          ))}
                        </details>
                      ) : (
                        <p className="clause__blocked muted">No attempt refused by this clause yet.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="standing">
        <div className="wrap">
          <SecHead id="standing" title="Standing clauses no one can amend.">
            These are written into the contract itself. Neither the owner nor Avow can change them; they hold for every vault.
          </SecHead>
          <ol className="clauses">
            {STANDING_CLAUSES.map((c, i) => (
              <li key={c.title} className="clause">
                <span className="clause__n">{ROMAN[CLAUSES.length + i]}</span>
                <div>
                  <span className="clause__title">{c.title}</span>
                  <p className="clause__text">{c.sentence}</p>
                </div>
                <div className="clause__use">
                  <p className="clause__guard" style={{ marginTop: 0 }}>
                    {c.guard}
                  </p>
                  <p className="clause__guard">
                    Proved by <code>{c.test}</code>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec" aria-labelledby="amend">
        <div className="wrap">
          <SecHead id="amend" title="Draft an amendment.">
            Change any clause and watch the rosette redraw. The form marks each change stricter or looser. Stricter changes: the owner signs a free message (no gas) and Avow applies them with <code>tighten()</code>; the vault rejects anything looser. Looser
            changes: the owner signs <code>amend()</code> with their wallet.
          </SecHead>
          <MandateEditor mandate={m} />
        </div>
      </section>

      <Divider seed="mandate-legend" />

      <section className="sec" aria-labelledby="legend">
        <div className="wrap grid-2">
          <div>
            <h2 id="legend">How to read the mandate&apos;s rosette</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              On a banknote the rosette proves the print is genuine. Here each clause drives one harmonic, so two vaults with different mandates can never share a rosette, and any amendment shows at a
              glance.
            </p>
          </div>
          <ul className="rosette-legend">
            {CLAUSES.map((c) => (
              <li key={c.field}>
                <b>{c.title}</b>
                <span>{c.rosette}</span>
              </li>
            ))}
            <li>
              <b>Assets</b>
              <span>symmetry of the main rosette</span>
            </li>
            <li>
              <b>Paused</b>
              <span>the whole rosette greys</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="history">
        <div className="wrap">
          <SecHead id="history" title="Amendment history.">
            Every change to the mandate, by the owner or tightened by Avow, from the journal.
          </SecHead>
          {amendments.length ? (
            <div className="table-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Change</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {amendments.map((a) => (
                    <tr key={a.t}>
                      <td data-h="When" className="tnum" style={{ whiteSpace: "nowrap" }}>
                        {time(a.t)} IST, {day(a.t)}
                      </td>
                      <td data-h="Change">
                        <b>{a.title}</b>
                        {a.detail ? <span className="sub">{a.detail}</span> : null}
                      </td>
                      <td data-h="By">{a.kind === "amended" ? "Owner, signed" : "Avow, stricter only"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <b>The mandate has never been amended</b>
              It still reads exactly as the owner first wrote it.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
