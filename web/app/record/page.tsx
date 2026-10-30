import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { SecHead, Divider, NetPnl } from "@/components/Bits";
import { Term } from "@/components/Term";
import { StudyTable } from "@/components/Study";
import { BrierHistory, BrierScale, PnlCurve, Reliability, TierLadder } from "@/components/Record";
import { TIER_RULES } from "@/lib/tiers";
import { StatusMark } from "@/components/NoteStub";
import { NETWORK_WORDS, rehearsalSentence } from "@/lib/chain";
import { noteHref, pct, usd, when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record", description: "Avow's calibration on chain: Brier score, reliability, the denomination it has earned and its realised P&L." };

export default async function RecordPage() {
  const s = await getState();
  const r = s.record;
  const graded = s.notes.filter((n) => n.sqError != null).sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));
  const next = r.tiers[r.tier.index + 1];
  const nextRule = next ? TIER_RULES[next.index] : null;
  const dd = r.hwmUsd > 0 ? (r.hwmUsd - r.navUsd) / r.hwmUsd : 0;
  const settled = s.notes.filter((n) => n.settledAt != null).length;
  const rehearsal = rehearsalSentence(s);
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Record
          </div>
          <h1>The record decides how much Avow may risk.</h1>
          <p className="lede">
            Every settled note is graded on chain: 1 if honoured, 0 otherwise, against the confidence Avow stated when it swore. The squared gap is the <Term k="brier" />. A coin flip scores
            0.25; lower is better, and only a better-than-coin record earns a larger <Term k="denomination">denomination</Term>, its trade limit.
          </p>
          {rehearsal ? <p className="rehearsal-line">{rehearsal}</p> : null}
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8, paddingBottom: 0 }} aria-label={rehearsal ? "Rehearsal record" : "Counts"}>
        <div className="wrap">
          {rehearsal ? (
            <div className="rehearsal-label">
              <b>Rehearsal record</b>
              <span>Private fork of HSK mainnet, outside traders simulated. Not evidence; the mainnet record starts empty.</span>
            </div>
          ) : null}
          <div className="counts">
            <div className="count">
              <b>{r.graded}</b>
              <span>graded notes</span>
            </div>
            <div className="count">
              <b className="tnum">{r.brier != null ? r.brier.toFixed(3) : "—"}</b>
              <span>Calibration (Brier, lower is better), last {Math.min(32, r.graded)}</span>
            </div>
            <div className="count">
              <b>{r.honoured}</b>
              <span>honoured</span>
            </div>
            <div className="count">
              <b>{r.void + r.lapsed + r.retracted}</b>
              <span>
                missed: {r.void} void, {r.lapsed} lapsed, {r.retracted} retracted
              </span>
            </div>
            <div className="count">
              <b className={r.pnlUsd >= 0 ? "pos" : "neg"}>{usd(r.pnlUsd, { sign: true })}</b>
              <span>realised (on chain) on {settled} settled</span>
            </div>
            {r.netPnlUsd != null ? (
              <div className="count">
                <b className={r.netPnlUsd >= 0 ? "pos" : "neg"}>{usd(r.netPnlUsd, { sign: true, dp: r.netPnlUsd !== 0 && Math.abs(r.netPnlUsd) < 1 ? 3 : 2 })}</b>
                <span>net after gas and model</span>
              </div>
            ) : null}
            <div className="count">
              <b>{usd(r.tier.capUsd, { dp: 0 })}</b>
              <span>trade limit (denomination), {r.tier.name}</span>
            </div>
          </div>
        </div>
      </section>

      {r.graded === 0 ? (
        <section className="sec" style={{ paddingTop: 32, paddingBottom: 0 }}>
          <div className="wrap">
            <div className="empty">
              <b>No graded notes yet</b>
              This vault is new. Avow starts on Probation and may write notes of up to {usd(r.tiers[0]?.capUsd ?? 0)}. The first note is graded the moment anyone settles it; after{" "}
              {TIER_RULES[1].graded} graded notes with a Brier of 0.25 or better it is promoted to Apprentice. <Link href="/journal">Watch the journal</Link> for the first oath.
            </div>
          </div>
        </section>
      ) : null}

      <section className="sec" style={{ paddingTop: 64 }} aria-labelledby="brier">
        <div className="wrap">
          <SecHead id="brier" title="Calibration against a coin flip.">
            {r.brier != null ? (
              <>
                Avow&apos;s rolling Brier is <strong>{r.brier.toFixed(3)}</strong>, {r.brier < 0.25 ? `${(0.25 - r.brier).toFixed(3)} better` : `${(r.brier - 0.25).toFixed(3)} worse`}{" "}
                than always saying 50%. The thresholds for the next tiers are marked on the scale.
              </>
            ) : (
              "The scale fills in once the first note is graded."
            )}
          </SecHead>
          <BrierScale brier={r.brier} />
          <div className="grid-2" style={{ marginTop: 48 }}>
            <figure style={{ margin: 0 }}>
              <BrierHistory notes={s.notes} />
              <figcaption className="plate">Plate. Rolling Brier after each graded note. The shaded band is the margin by which Avow beat a coin flip.</figcaption>
            </figure>
            <div className="prose">
              <h3 style={{ marginBottom: 12 }}>Why calibration, not win rate</h3>
              <p>
                A trader can win often by only taking safe bets, or look brave by overstating its odds. The Brier score punishes both: a note sworn at 90% that voids costs 0.81, while the same
                miss at 55% costs 0.30.
              </p>
              <p>
                So Avow states the probability it believes. Abstaining costs nothing; overconfidence keeps it on Probation. Retreating early is graded a miss, so it cannot dodge a bad note to
                protect its record.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="reliability">
        <div className="wrap grid-2" style={{ alignItems: "center" }}>
          <figure style={{ margin: 0 }}>
            <Reliability notes={s.notes} />
            <figcaption className="plate">
              Plate. Reliability. Circles are notes grouped by stated confidence, sized by count; ticks along the top are honoured notes, along the bottom misses.
            </figcaption>
          </figure>
          <div>
            <h2 id="reliability">Does it mean what it says?</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              A calibrated trader&apos;s 60% notes come true about 60% of the time, so its circles sit on the diagonal. Below the diagonal it was overconfident; above, too modest. With{" "}
              {r.graded} graded notes the circles are still wide of the line; the window keeps the last 32.
            </p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="ladder">
        <div className="wrap">
          <SecHead id="ladder" title="The denomination ladder.">
            {next && nextRule ? (
              <>
                Next is <strong>{next.name}</strong>: notes up to {usd(next.capUsd, { dp: 0 })} after {nextRule.graded} graded notes ({Math.max(0, nextRule.graded - r.graded)} to go) with a
                Brier of {nextRule.brier?.toFixed(2)} or better. Three voids in a row drop one tier; the streak now is {r.voidStreak}.
              </>
            ) : (
              "Avow holds the top denomination. Three voids in a row would drop it a tier."
            )}
          </SecHead>
          <TierLadder record={r} />
        </div>
      </section>

      <Divider seed="record-pnl" />

      <section className="sec" aria-labelledby="pnl">
        <div className="wrap grid-2">
          <figure style={{ margin: 0 }}>
            <PnlCurve notes={s.notes} />
            <figcaption className="plate">Plate. Cumulative realised P&amp;L on chain after each settled note, after pool fees. Gas and model spend are not in this line.</figcaption>
          </figure>
          <div>
            <h2 id="pnl">Money, small on purpose.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              Realised on chain {usd(r.pnlUsd, { sign: true })} on {settled} settled notes, after pool fees. <NetPnl r={r} /> Notes stay small until the record earns more; every round
              trip pays 0.60% in pool fees plus gas (about 0.68% on a $50 note), which is why most premiums are declined.
            </p>
            <dl className="kv" style={{ marginTop: 24 }}>
              <dt>Vault value</dt>
              <dd>{usd(r.navUsd)}</dd>
              <dt>High-water mark</dt>
              <dd>{usd(r.hwmUsd)}</dd>
              <dt>Drawdown</dt>
              <dd>
                {pct(dd, 2)} of {pct(s.mandate.maxDrawdownBps / 1e4)} allowed {r.frozen ? <span className="neg">, frozen</span> : null}
              </dd>
              <dt>Realised loss today</dt>
              <dd>
                {usd(r.dailyLossUsd)} of {usd(s.mandate.dailyLossLimitUsd, { dp: 0 })}
              </dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="graded">
        <div className="wrap">
          <SecHead id="graded" title="Every grade, worked out.">
            The arithmetic behind the score, one row per graded note. Revoked notes are left out because the owner, not Avow, closed them.
          </SecHead>
          {graded.length ? (
            <div className="table-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <th>Note</th>
                    <th>Outcome</th>
                    <th className="r">Confidence p</th>
                    <th className="r">Outcome o</th>
                    <th className="r">(p − o)²</th>
                    <th className="r">P&amp;L</th>
                    <th>Settled</th>
                  </tr>
                </thead>
                <tbody>
                  {graded.map((n) => (
                    <tr key={n.id}>
                      <td data-h="Note">
                        <Link href={noteHref(n.id)} className="serial">
                          {n.serial}
                        </Link>
                      </td>
                      <td data-h="Outcome">
                        <StatusMark status={n.status} />
                      </td>
                      <td data-h="Confidence p" className="r">
                        {n.confidence.toFixed(2)}
                      </td>
                      <td data-h="Outcome o" className="r">
                        {n.status === "honoured" ? 1 : 0}
                      </td>
                      <td data-h="(p − o)²" className="r" style={{ fontWeight: 650 }}>
                        {n.sqError!.toFixed(4)}
                      </td>
                      <td data-h="P&L" className={`r ${(n.pnlUsd ?? 0) >= 0 ? "pos" : "neg"}`}>
                        {usd(n.pnlUsd, { sign: true })}
                      </td>
                      <td data-h="Settled">{n.settledAt ? when(n.settledAt) : "—"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600 }}>
                      Mean of {graded.length}
                    </td>
                    <td className="r" style={{ fontWeight: 700 }}>
                      {(graded.reduce((a, n) => a + n.sqError!, 0) / graded.length).toFixed(4)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <b>Nothing graded yet</b>Rows appear here as notes are settled.
            </div>
          )}
          <p className="plate">
            {NETWORK_WORDS[s.network.mode].long} {s.network.mode === "fork-rehearsal" ? "Every grade above was computed by the vault contract on that fork." : ""}
          </p>
        </div>
      </section>
      {s.study && s.study.rows.length ? (
        <section className="sec" aria-labelledby="odds">
          <div className="wrap">
            <SecHead id="odds" title="Measured odds: do HSKSwap gaps really close?">
              The question every catch-up note bets on, answered from {s.study.windowDays} days of real HSKSwap swap logs on mainnet, not from the rehearsal.
            </SecHead>
            <StudyTable study={s.study} />
          </div>
        </section>
      ) : null}

    </>
  );
}
