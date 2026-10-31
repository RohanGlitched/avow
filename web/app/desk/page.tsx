import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { Desk } from "@/components/Desk";
import { SecHead, ScopeLine } from "@/components/Bits";
import { ASSET_LABEL, noteHref, pct, px, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk", description: "Talk to Avow: positions, P&L, why it did what it did, and changes to the mandate." };

export default async function DeskPage() {
  const s = await getState();
  const open = s.notes.filter((n) => n.status === "outstanding");
  const r = s.record;
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Desk
          </div>
          <ScopeLine />
          <h1>The desk.</h1>
          <p className="lede">
            Ask Avow what it holds, how it is doing and why it swore or declined anything. Tell it how to trade: stricter changes need only a free signed message from the owner and Avow
            applies them with <code>tighten()</code>; looser ones come back as an amendment the owner signs with <code>amend()</code>.
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8 }} aria-label="Conversation">
        <div className="wrap desk">
          <Desk />
          <aside>
            <div className="side-card">
              <h3>Open now</h3>
              {open.length ? (
                <dl>
                  {open.map((n) => (
                    <div key={n.id} style={{ display: "contents" }}>
                      <dt>
                        <Link href={noteHref(n.id)} className="serial">
                          {n.serial}
                        </Link>{" "}
                        {n.side} {ASSET_LABEL[n.asset]}
                      </dt>
                      <dd className="tnum">{px(n.asset, n.livePx)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="muted">No note is outstanding.</p>
              )}
            </div>
            <div className="side-card">
              <h3>Record</h3>
              <dl>
                <dt>Graded notes</dt>
                <dd>{r.graded}</dd>
                <dt>Calibration (Brier, lower is better)</dt>
                <dd>{r.brier?.toFixed(3) ?? "—"}</dd>
                <dt>Trade limit (denomination)</dt>
                <dd>
                  {usd(r.tier.capUsd, { dp: 0 })}, {r.tier.name}
                </dd>
                <dt>Realised (on chain)</dt>
                <dd className={r.pnlUsd >= 0 ? "pos" : "neg"}>{usd(r.pnlUsd, { sign: true })}</dd>
                {r.netPnlUsd != null ? (
                  <>
                    <dt>Net after gas and model</dt>
                    <dd className={r.netPnlUsd >= 0 ? "pos" : "neg"}>{usd(r.netPnlUsd, { sign: true, dp: r.netPnlUsd !== 0 && Math.abs(r.netPnlUsd) < 1 ? 3 : 2 })}</dd>
                  </>
                ) : null}
                <dt>Vault value</dt>
                <dd>{usd(r.navUsd)}</dd>
              </dl>
            </div>
            <div className="side-card">
              <h3>Running costs, 24 hours</h3>
              <dl>
                <dt>Model calls</dt>
                <dd>{s.costs.modelCalls24h}</dd>
                <dt>Model spend</dt>
                <dd>{usd(s.costs.modelUsd24h)}</dd>
                <dt>Gas</dt>
                <dd>
                  {s.costs.gasHsk24h.toFixed(2)} HSK, {usd(s.costs.gasUsd24h, { dp: 3 })}
                </dd>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="what">
        <div className="wrap">
          <SecHead id="what" title="What the desk can and cannot do.">
            Avow answers from the vault and its journal, and cites the notes it relies on. It cannot move funds, and it cannot loosen its own mandate. Each reply names the engine that
            wrote it.
          </SecHead>
          <div className="grid-3">
            <div className="step" style={{ padding: 0 }}>
              <h3>Read</h3>
              <p>Positions, the record, the market, the journal. Every claim links to the note it rests on, so you can check the answer against the chain.</p>
            </div>
            <div className="step" style={{ padding: 0, border: 0 }}>
              <h3>Tighten</h3>
              <p>
                &ldquo;Be more careful&rdquo; becomes smaller notes, closer stops or fewer assets. Stricter changes: the owner signs a free message (no gas) and Avow applies them with{" "}
                <code>tighten()</code>; the vault rejects anything looser.
              </p>
            </div>
            <div className="step" style={{ padding: 0, border: 0 }}>
              <h3>Propose</h3>
              <p>
                &ldquo;Trade bigger&rdquo; loosens the mandate. Looser changes: Avow drafts the amendment and the owner signs <code>amend()</code> with their wallet. Even then, its trade limit
                stays capped at {pct(r.tier.share)} of the largest note until its record earns more.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
