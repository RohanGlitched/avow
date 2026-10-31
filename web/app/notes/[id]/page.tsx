import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getState } from "@/lib/data";
import { Note } from "@/components/Note";
import { IntaglioChart } from "@/components/IntaglioChart";
import { Rosette } from "@/components/Rosette";
import { JournalRow } from "@/components/Journal";
import { SecHead, Divider } from "@/components/Bits";
import { Hex } from "@/components/Ovi";
import { Term } from "@/components/Term";
import { rehearsalShort } from "@/lib/chain";
import { StatusMark } from "@/components/NoteStub";
import { ownLink } from "@/lib/chain";
import { noteRosette, hashBytes } from "@/lib/rosette";
import { ASSET_LABEL, STATUS_EXPLAIN, duration, idFromSerialParam, noteHref, num, pct, px, rewardRisk, signed, stopBps, usd, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getState();
  const want = idFromSerialParam(id);
  const n = want == null ? undefined : s.notes.find((x) => x.id === want);
  if (!n) return { title: "Note not found" };
  return { title: `${n.serial}`, description: n.statement };
}

const USED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getState();
  // the URL carries the printed serial: /notes/1 is AVW·000001, on-chain id 0
  const want = idFromSerialParam(id);
  const idx = want == null ? -1 : s.notes.findIndex((x) => x.id === want);
  if (idx < 0) notFound();
  const n = s.notes[idx];
  const newer = s.notes[idx - 1];
  const older = s.notes[idx + 1];
  const L = ASSET_LABEL[n.asset];
  const m = s.market.find((r) => r.asset === n.asset);
  const entries = s.journal.filter((j) => j.noteId === n.id);
  const reward = Math.abs(n.targetPx - n.entryPx);
  const risk = Math.abs(n.entryPx - (n.swornVoidPx ?? n.voidPx));
  const ev = n.confidence * reward - (1 - n.confidence) * risk;
  const spec = noteRosette(n.hash);
  const bytes = hashBytes(n.hash);
  const settled = n.status !== "outstanding";
  const gradedOrder = s.notes.filter((x) => x.sqError != null).sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  const gi = gradedOrder.findIndex((x) => x.id === n.id);
  const mean = (xs: typeof gradedOrder) => (xs.length ? xs.reduce((a, x) => a + (x.sqError ?? 0), 0) / xs.length : null);
  const brierBefore = gi >= 0 ? mean(gradedOrder.slice(Math.max(0, gi - 31), gi)) : null;
  const brierAfter = gi >= 0 ? mean(gradedOrder.slice(Math.max(0, gi - 31), gi + 1)) : null;
  const settlerWho = !n.settler ? null : n.settler === s.contracts.agent ? "the agent's keeper" : n.settler === s.contracts.owner ? "the owner" : "an outside address";

  return (
    <>
      <section className="page-head" style={{ paddingBottom: 28 }}>
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / <Link href="/notes">Notes</Link> / {n.serial}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px 18px", flexWrap: "wrap" }}>
            <h1>
              <span className="serial" style={{ fontSize: "0.72em", letterSpacing: "0.05em" }}>
                {n.serial}
              </span>
            </h1>
            <StatusMark status={n.status} />
          </div>
          <p className="lede">
            {n.side === "long" ? "Long" : "Short"} {L} for {usd(n.notionalUsd)}, sworn {when(n.openedAt)} at {pct(n.confidence)} confidence. {STATUS_EXPLAIN[n.status]}
          </p>
          <p className="terms-row">
            <span>The words on this note:</span> <Term k="twap" /> <Term k="void" /> <Term k="brier" /> <Term k="denomination" />
          </p>
          {rehearsalShort(s) ? (
            <p className="rehearsal-line">
              {rehearsalShort(s)} <Link href="/how#rehearsal">What this means</Link>
            </p>
          ) : null}
        </div>
      </section>

      <section aria-label="The note">
        <div className="wrap">
          <Note note={n} state={s} as="div" />
        </div>
      </section>

      <section className="sec" aria-labelledby="corridor">
        <div className="wrap">
          <SecHead id="corridor" title="The corridor it promised.">
            From the moment it was sworn until it settles or expires, the note lives between two lines: the target and the void level. The engraved line is the HSKSwap price it settles
            on.
          </SecHead>
          {m ? (
            <figure style={{ margin: 0 }}>
              <IntaglioChart series={m.history} asset={n.asset} corridor={n} label={`${n.serial}: ${L} price on HSKSwap with the target and void corridor`} />
              <div className="legend">
                <span>
                  <i />
                  HSKSwap {L}
                </span>
                <span>
                  <i className="cex" />
                  HashKey Global {L}
                </span>
                <span>
                  <i className="band" />
                  entry to target
                </span>
                <span>
                  <i className="risk" />
                  entry to void level
                </span>
              </div>
              <figcaption className="plate">
                Plate. {n.serial}, sworn {when(n.openedAt)}, expiring {when(n.expiry)}. {settled
                  ? "The corridor ends where the note settled; the chart runs a few hours on, up to the latest price read."
                  : "The chart ends at the latest price read (“now”); the expiry is marked off the chart when it is later."} Open circle: sworn at {px(n.asset, n.entryPx)}.
                {n.exitPx != null ? ` Filled circle: ${n.status}, the closing swap filled at ${px(n.asset, n.exitPx)}.` : ` Now ${px(n.asset, n.livePx)}.`}
              </figcaption>
            </figure>
          ) : (
            <div className="empty">
              <b>No price history for {L}</b>The market reader has not returned a series for this pool yet.
            </div>
          )}
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="terms">
        <div className="wrap detail">
          <div>
            <h2 id="terms" style={{ marginBottom: 20 }}>
              As sworn
            </h2>
            <dl className="kv">
              <dt>Statement</dt>
              <dd style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 17 }}>{n.statement}</dd>
              <dt>
                Entry, 5-minute <Term k="twap" />
              </dt>
              <dd className="tnum">{px(n.asset, n.entryPx)}</dd>
              <dt>Target</dt>
              <dd className="tnum">
                {px(n.asset, n.targetPx)} <span className="muted">({signed(((n.targetPx - n.entryPx) / n.entryPx) * 100, 2, "%")})</span>
              </dd>
              <dt>
                <Term k="void" />
              </dt>
              <dd className="tnum">
                {px(n.asset, n.voidPx)} <span className="muted">({signed(((n.voidPx - n.entryPx) / n.entryPx) * 100, 2, "%")})</span>
                {n.swornVoidPx != null ? <span className="muted"> tightened from {px(n.asset, n.swornVoidPx)}</span> : null}
              </dd>
              <dt>Reward to risk</dt>
              <dd className="tnum">{rewardRisk({ ...n, voidPx: n.swornVoidPx ?? n.voidPx }).toFixed(2)} : 1</dd>
              <dt>Stop distance</dt>
              <dd className="tnum">{(stopBps({ ...n, voidPx: n.swornVoidPx ?? n.voidPx }) / 100).toFixed(2)}% of entry</dd>
              <dt>Confidence</dt>
              <dd className="tnum">{pct(n.confidence)}</dd>
              <dt>Expectancy at its own odds</dt>
              <dd className="tnum">
                {signed((ev / n.entryPx) * 100, 3, "%")} of entry <span className="muted">(p·reward − (1 − p)·risk must be positive)</span>
              </dd>
              {n.spotDevBps != null || n.exitSlipBps != null ? (
                <>
                  <dt>Settlement terms, fixed when sworn</dt>
                  <dd>
                    {n.spotDevBps != null ? `a target or expiry settles only while the live price is within ${(n.spotDevBps / 100).toFixed(2)}% of the TWAP` : null}
                    {n.spotDevBps != null && n.exitSlipBps != null ? "; " : null}
                    {n.exitSlipBps != null ? `the closing swap may slip at most ${(n.exitSlipBps / 100).toFixed(2)}%` : null}. A later amendment cannot change them.
                  </dd>
                </>
              ) : null}
              <dt>Horizon</dt>
              <dd>
                {duration(n.expiry - n.openedAt)}, expires {when(n.expiry)}
              </dd>
              <dt>Swap</dt>
              <dd className="tnum">
                {n.side === "long"
                  ? `${num(n.amountIn, 2)} USDT for ${num(n.amountOut, n.asset === "WHSK" ? 2 : 6)} ${n.asset}`
                  : `${num(n.amountIn, n.asset === "WHSK" ? 2 : 6)} ${n.asset} for ${num(n.amountOut, 2)} USDT`}
              </dd>
              <dt>
                Trade limit (<Term k="denomination">denomination</Term>) when sworn
              </dt>
              <dd>{s.record.tiers[n.tierAtOpen]?.name ?? n.tierAtOpen}, cap {usd(s.record.tiers[n.tierAtOpen]?.capUsd)}</dd>
              <dt>Transaction</dt>
              <dd>
                <Hex value={n.openTx} href={ownLink(s, "tx", n.openTx)} head={10} tail={8} /> <span className="muted">block {num(n.openBlock)}</span>
              </dd>
              <dt>Statement hash</dt>
              <dd>
                <Hex value={n.hash} head={10} tail={8} />
              </dd>
            </dl>
          </div>
          <div>
            <h2 style={{ marginBottom: 20 }}>{settled ? "As settled" : "Settlement"}</h2>
            {settled ? (
              <dl className="kv">
                <dt>Outcome</dt>
                <dd>
                  <StatusMark status={n.status} />
                </dd>
                <dt>Exit price</dt>
                <dd className="tnum">{px(n.asset, n.exitPx)}</dd>
                <dt>Settled</dt>
                <dd>{n.settledAt ? when(n.settledAt) : "—"}</dd>
                <dt>Settled by</dt>
                <dd>
                  <Hex value={n.settler} href={ownLink(s, "address", n.settler)} /> <span className="muted">{settlerWho}</span>
                </dd>
                <dt>Transaction</dt>
                <dd>
                  <Hex value={n.settleTx} href={ownLink(s, "tx", n.settleTx)} head={10} tail={8} />
                </dd>
                <dt>Realised P&amp;L, on chain</dt>
                <dd className={(n.pnlUsd ?? 0) >= 0 ? "pos" : "neg"}>
                  {usd(n.pnlUsd, { sign: true })} <span className="muted">after pool fees; gas and model spend are not in this figure</span>
                </dd>
                <dt>Grade</dt>
                <dd>
                  {n.sqError != null ? (
                    <>
                      outcome {n.status === "honoured" ? 1 : 0} against {n.confidence.toFixed(2)}: squared error <b>{n.sqError.toFixed(3)}</b>
                    </>
                  ) : (
                    "not graded"
                  )}
                </dd>
                {brierAfter != null ? (
                  <>
                    <dt>Effect on the record</dt>
                    <dd>
                      Rolling <Term k="brier" /> {brierBefore != null ? `from ${brierBefore.toFixed(3)} to ` : "starts at "}
                      {brierAfter.toFixed(3)}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <div className="prose">
                <p>
                  This note is outstanding. The contract settles it when both the HSKSwap 5-minute TWAP and the live price are past the target ({px(n.asset, n.targetPx)}) or the void
                  level ({px(n.asset, n.voidPx)}), or after it expires at {when(n.expiry)}, once the live price is back near the TWAP. The agent&apos;s keeper checks every minute, but anyone may call <code>settle({n.id})</code> first.
                </p>
                <p>
                  If it is honoured it is graded 1; void, lapsed, retracted or revoked it is graded 0. The squared gap to {n.confidence.toFixed(2)} joins the rolling Brier score.
                </p>
                <dl className="kv" style={{ marginTop: 20 }}>
                  <dt>Now</dt>
                  <dd className="tnum">{px(n.asset, n.livePx)}</dd>
                  <dt>To target</dt>
                  <dd className="tnum">{n.livePx ? signed(((n.targetPx - n.livePx) / n.livePx) * 100, 2, "%") : "—"}</dd>
                  <dt>To void level</dt>
                  <dd className="tnum">{n.livePx ? signed(((n.voidPx - n.livePx) / n.livePx) * 100, 2, "%") : "—"}</dd>
                  {n.unrealisedPnlUsd != null ? (
                    <>
                      <dt>Unrealised, if closed now</dt>
                      <dd className={`tnum ${n.unrealisedPnlUsd >= 0 ? "pos" : "neg"}`}>
                        {usd(n.unrealisedPnlUsd, { sign: true })} <span className="muted">at the live pool price, minus the exit fee</span>
                      </dd>
                    </>
                  ) : null}
                  <dt>If honoured</dt>
                  <dd className="tnum">graded 1, squared error {((1 - n.confidence) ** 2).toFixed(3)}</dd>
                  <dt>If not</dt>
                  <dd className="tnum">graded 0, squared error {(n.confidence ** 2).toFixed(3)}</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="why">
        <div className="wrap detail">
          <div>
            <h2 id="why">Why Avow swore it</h2>
            <p style={{ fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.45, marginTop: 18, maxWidth: "40ch" }}>{n.rationale}</p>
            <p className="plate">The reasons are kept in the agent&apos;s journal; their hash is on chain with the note.</p>
          </div>
          <div>
            <h3 style={{ marginBottom: 14 }}>Signals at the time</h3>
            <dl className="kv">
              <dt>HSKSwap premium</dt>
              <dd className="tnum">{n.signals.spreadBps != null ? `${signed(n.signals.spreadBps, 0)} bps` : "—"}</dd>
              <dt>Fair value, HashKey Global</dt>
              <dd className="tnum">{px(n.asset, n.signals.fairPx)}</dd>
              <dt>Momentum, 1 hour</dt>
              <dd className="tnum">{signed(n.signals.momentum1h, 2, "%")}</dd>
              <dt>Momentum, 4 hours</dt>
              <dd className="tnum">{signed(n.signals.momentum4h, 2, "%")}</dd>
              <dt>Volatility, daily</dt>
              <dd className="tnum">{n.signals.volatility != null ? `${n.signals.volatility.toFixed(1)}%` : "—"}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="trail">
        <div className="wrap">
          <SecHead id="trail" title="Its trail in the journal.">
            Every journal entry that mentions {n.serial}, oldest last.
          </SecHead>
          {entries.length ? (
            <ol className="journal">
              {entries.map((e) => (
                <JournalRow key={`${e.t}${e.kind}`} e={e} state={s} />
              ))}
            </ol>
          ) : (
            <div className="empty">
              <b>No journal entries for this note</b>The journal keeps the last 200 entries; older ones are archived with the agent.
            </div>
          )}
        </div>
      </section>

      <Divider seed={n.hash} />

      <section className="sec" aria-labelledby="recompute">
        <div className="wrap detail" style={{ alignItems: "center" }}>
          <div>
            <h2 id="recompute">The rosette, recomputed from its hash.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              The first 18 bytes of the statement hash set every curve. Hash the sentence yourself with <code>cast keccak</code>, run the same arithmetic, and you get this rosette and no other.
            </p>
            <div className="bytes" aria-label="The 32 bytes of the statement hash">
              {bytes.map((b, i) => (
                <span key={i} className={USED.has(i) ? "used" : undefined} title={`byte ${i}`}>
                  {b.toString(16).padStart(2, "0")}
                </span>
              ))}
            </div>
            <ul className="guide__list" style={{ gap: 10 }}>
              {spec.curves.map((c) => (
                <li key={c.label} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                  <p style={{ color: "var(--ink)" }}>{c.label}</p>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ maxWidth: 480, width: "100%", justifySelf: "center" }}>
            <Rosette hash={n.hash} defer label={`Rosette for ${n.serial}`} />
            <p className="plate" style={{ textAlign: "center" }}>
              Plate. {n.serial}, drawn from {n.hash.slice(0, 10)}…{n.hash.slice(-6)}.
            </p>
          </div>
        </div>
        <div className="wrap">
          <nav className="pager" aria-label="Other notes">
            {older ? (
              <Link href={noteHref(older.id)}>
                <span>Older</span>
                <span className="serial">{older.serial}</span>
              </Link>
            ) : (
              <span />
            )}
            {newer ? (
              <Link href={noteHref(newer.id)}>
                <span>Newer</span>
                <span className="serial">{newer.serial}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
      </section>
    </>
  );
}
