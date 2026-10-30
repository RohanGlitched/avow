import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { SecHead, Divider, NetPnl } from "@/components/Bits";
import { Term } from "@/components/Term";
import { StudyTable } from "@/components/Study";
import { BrierHistory, BrierScale, PnlCurve, Reliability, TierLadder } from "@/components/Record";
import { TIER_RULES } from "@/lib/tiers";
import { StatusMark } from "@/components/NoteStub";
import { NETWORK_WORDS, rehearsalShort } from "@/lib/chain";
import { ReplaySection } from "@/components/Replay";
import { ShadowLedger } from "@/components/Shadow";
import { noteHref, pct, realisedDrawdown, usd, when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record", description: "Avow's calibration on chain: Brier score, reliability, the denomination it has earned and its realised P&L." };

const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t).replace(/\.$/, "");

export default async function RecordPage() {
  const s = await getState();
  const r = s.record;
  const graded = s.notes.filter((n) => n.sqError != null).sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));
  const next = r.tiers[r.tier.index + 1];
  const nextRule = next ? TIER_RULES[next.index] : null;
  const ddr = realisedDrawdown(s);
  const settled = s.notes.filter((n) => n.settledAt != null).length;
  const rehearsal = rehearsalShort(s);
  const none = r.graded === 0;
  const missed = r.void + r.lapsed + r.retracted + (r.revoked ?? 0);
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
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8, paddingBottom: 0 }} aria-label={rehearsal ? "Rehearsal record" : "Counts"}>
        <div className="wrap">
          {rehearsal ? (
            <div className="rehearsal-label">
              <b>Rehearsal record</b>
              <span>
                {rehearsal} The mainnet record starts empty. <Link href="/how#rehearsal">What this means</Link>
              </span>
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
              <b>{missed}</b>
              <span>
                missed: {r.void} void, {r.lapsed} lapsed, {r.retracted} retracted{r.revoked ? `, ${r.revoked} revoked` : ""}
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
              This vault is new. Avow starts on Probation and may write notes of up to {usd(r.tiers[0]?.capUsd ?? 0)}. The first note is graded the moment anyone settles it. To reach
              Apprentice it needs {lowerFirst(r.tiers[1]?.requirement ?? `${TIER_RULES[1].graded} graded notes`)}. <Link href="/journal">Watch the journal</Link> for the first oath.
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
              <figcaption className="plate">
                {none ? "Rolling Brier after each graded note, against the coin-flip line at 0.25. Nothing is graded yet." : "Plate. Rolling Brier after each graded note. The shaded band is its distance from a coin flip: below the line is better."}
              </figcaption>
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
              {none
                ? "The diagonal is perfect calibration: a trader whose 60% notes come true 60% of the time. Once notes are graded, circles land on, above or below it."
                : "Plate. Reliability. Circles are notes grouped by stated confidence, sized by count; ticks along the top are honoured notes, along the bottom misses."}
            </figcaption>
          </figure>
          <div>
            <h2 id="reliability">Does it mean what it says?</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              A calibrated trader&apos;s 60% notes come true about 60% of the time, so its circles sit on the diagonal. Below the diagonal it was overconfident; above, too modest.{" "}
              {none
                ? "No note is graded yet, so the chart shows only the line the circles will be measured against."
                : r.graded < 20
                  ? `With ${r.graded} graded notes the circles are still wide of the line; the window keeps the last 32.`
                  : "The window keeps the last 32 graded notes."}
            </p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="ladder">
        <div className="wrap">
          <SecHead id="ladder" title="The denomination ladder.">
            {next && nextRule ? (
              <>
                Next is <strong>{next.name}</strong>: notes up to {usd(next.capUsd, { dp: 0 })}. It needs {lowerFirst(next.requirement)} ({Math.max(0, nextRule.graded - r.graded)} more graded
                notes to go). Three voids in a row drop one tier; the streak now is {r.voidStreak}.
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
            <figcaption className="plate">
              {settled
                ? "Plate. Cumulative realised P&L on chain after each settled note, after pool fees. Gas and model spend are not in this line."
                : "Cumulative realised P&L on chain, after pool fees, starting from zero. Nothing has settled yet."}
            </figcaption>
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
              <dt>High-water mark, realised equity</dt>
              <dd>{ddr.hwm != null ? usd(ddr.hwm) : <span className="muted">set when the first note is sworn</span>}</dd>
              <dt>Drawdown, realised losses only</dt>
              <dd>
                {pct(ddr.dd, 2)} of {pct(s.mandate.maxDrawdownBps / 1e4)} allowed{r.frozen ? <span className="neg">, frozen</span> : null}
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
            The arithmetic behind the score, one row per graded note. Retracted and revoked notes count as misses, so neither Avow nor the owner can close a loser to protect the record.
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
            {NETWORK_WORDS[s.network.mode].long} {s.network.mode === "fork-rehearsal" && graded.length ? "Every grade above was computed by the vault contract on that fork." : ""}
          </p>
        </div>
      </section>
      <section className="sec" id="shadow" aria-labelledby="shadow-h">
        <div className="wrap">
          <SecHead id="shadow-h" title="Every candidate, graded on real mainnet.">
            Declining is a decision too, so it is graded. Each candidate the rules produce, sworn or declined, is entered at the real HSK mainnet pool price and settled by the vault&apos;s own
            rules against real mainnet prices. If refusing costs Avow a gain, this ledger shows it.
          </SecHead>
          {s.shadow ? (
            <ShadowLedger shadow={s.shadow} />
          ) : (
            <div className="empty">
              <b>No candidates yet</b>
              The first candidates appear here as the agent sees them; each is graded against real mainnet prices.
            </div>
          )}
        </div>
      </section>
      {s.replay ? (
        <section className="sec sec--tint" id="replay" aria-labelledby="replay-h">
          <div className="wrap">
            <SecHead id="replay-h" title="What the restraint is worth, replayed on real HSKSwap history.">
              Avow&apos;s exact rules, and a family of alternatives, replayed over 30 days of real HSKSwap swaps on mainnet, not the rehearsal. This is why it trades so rarely, and why that is
              the product working.
            </SecHead>
            <ReplaySection replay={s.replay} />
          </div>
        </section>
      ) : null}
      {s.study && s.study.rows.length ? (
        <section className={`sec${s.replay ? "" : " sec--tint"}`} aria-labelledby="odds">
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
