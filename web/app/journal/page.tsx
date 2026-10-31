import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { JournalList } from "@/components/Journal";
import { SecHead, ScopeLine } from "@/components/Bits";
import { Ago, LastCycle } from "@/components/Live";
import { ReplaySummary } from "@/components/Replay";
import { ShadowLedger } from "@/components/Shadow";
import { IntaglioChart } from "@/components/IntaglioChart";
import { MarketBoard } from "@/components/MarketBoard";
import { decisionCounts, LOGGED_WHEN } from "@/lib/decisions";
import { gasDominates, liveNoteUsd, roundTripWords, tradeGapBps } from "@/lib/chain";
import { duration, num, px, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal", description: "Every decision Avow makes: sworn, declined with reasons, blocked by a clause, settled." };

export default async function JournalPage() {
  const s = await getState();
  const j = s.journal;
  const c = (k: string) => j.filter((e) => e.kind === k).length;
  const dc = decisionCounts(j);
  const tokens = j.reduce((a, e) => a + (e.tokens ?? 0), 0);
  // the time window comes from the journal itself, never a fixed number of hours
  const oldest = j.at(-1);
  const launched = oldest && oldest.kind === "heartbeat" && /began watching/i.test(oldest.title);
  const windowWords = oldest ? (launched ? `Since launch ${duration(s.asOf - oldest.t)} ago` : `In the last ${duration(s.asOf - oldest.t)} of the journal`) : "So far";
  // the market the agent reads: the pool the vault swaps in, against the exchanges
  const fork = s.network.mode === "fork-rehearsal";
  const eth = s.market.find((m) => m.asset === "WETH") ?? s.market[0];
  const ethSpan = (eth?.history.length ?? 0) > 1 ? duration(eth.history.at(-1)!.t - eth.history[0].t) : null;
  const widest = [...s.market].sort((a, b) => Math.abs(tradeGapBps(b) ?? 0) - Math.abs(tradeGapBps(a) ?? 0))[0];
  const widestGap = widest ? tradeGapBps(widest) : null;
  const noteUsd = liveNoteUsd(s);
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Journal
          </div>
          <ScopeLine />
          <h1>The journal: every decision, including the ones not taken.</h1>
          <p className="lede">
            The agent checks the pools every 30 seconds and writes here when something changes: it swears, passes, declines, re-examines an open note, is refused by a clause, settles or changes
            the mandate. Declines carry the model&apos;s own reasons. The latest entry is {j[0] ? <Ago t={j[0].t} /> : "not written yet"}; <LastCycle />.
          </p>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 8 }} aria-label="Summary">
        <div className="wrap">
          <div className="counts">
            <div className="count">
              <b>{dc.total}</b>
              <span>decisions, {LOGGED_WHEN}</span>
            </div>
            <div className="count">
              <b>{c("sworn")}</b>
              <span>sworn</span>
            </div>
            <div className="count">
              <b>{c("declined")}</b>
              <span>declined</span>
            </div>
            <div className="count">
              <b>{c("considered")}</b>
              <span>passes: nothing worth swearing</span>
            </div>
            {c("reviewed") ? (
              <div className="count">
                <b>{c("reviewed")}</b>
                <span>reviews of open notes</span>
              </div>
            ) : null}
            <div className="count">
              <b>{c("blocked")}</b>
              <span>blocked by a clause</span>
            </div>
            <div className="count">
              <b>{c("settled")}</b>
              <span>settled</span>
            </div>
            <div className="count">
              <b>{num(s.costs.modelCalls24h)}</b>
              <span>model calls, 24 h ({usd(s.costs.modelUsd24h)})</span>
            </div>
            <div className="count">
              <b>{num(tokens)}</b>
              <span>tokens in decisions shown</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 16 }} aria-label="Entries">
        <div className="wrap">
          <JournalList entries={j} state={{ network: s.network, notes: s.notes.map((n) => ({ id: n.id, serial: n.serial })) }} />
        </div>
      </section>

      <section className="sec sec--tint" id="declined" aria-labelledby="declined-h">
        <div className="wrap">
          <SecHead id="declined-h" title="What Avow declined to swear, and what refusing is worth.">
            {windowWords}, Avow made <strong>{dc.total}</strong> {dc.total === 1 ? "decision" : "decisions"}: <strong>{dc.sworn}</strong> sworn, <strong>{dc.declined}</strong> declined,{" "}
            <strong>{dc.passes}</strong> {dc.passes === 1 ? "pass" : "passes"} with nothing worth swearing
            {dc.reviewed ? (
              <>
                , <strong>{dc.reviewed}</strong> {dc.reviewed === 1 ? "review" : "reviews"} of open notes
              </>
            ) : null}{" "}
            and <strong>{dc.blocked}</strong> blocked by a clause; each one is in the journal above. Abstaining is free; a note it barely believes costs it calibration. Every candidate
            it declines is still graded against real mainnet prices, so refusing has a measured price either way.
          </SecHead>
          {s.replay ? <ReplaySummary replay={s.replay} /> : null}
          <h3 className="shadow__title">Every candidate, graded on real mainnet</h3>
          {s.shadow ? (
            <ShadowLedger shadow={s.shadow} compact />
          ) : (
            <div className="empty">
              <b>No candidates yet</b>
              The first candidates appear here as the agent sees them; each is graded against real mainnet prices.
            </div>
          )}
          <div className="actions">
            <Link href="/record#shadow" className="btn btn--ghost">
              Every candidate on the record
            </Link>
            <Link href="/record#replay" className="btn btn--ghost">
              The full replay
            </Link>
          </div>
        </div>
      </section>

      <section className="sec" id="market" aria-labelledby="market-h">
        <div className="wrap">
          <SecHead id="market-h" title="What the agent sees: the market it watches.">
            HSKSwap pools are thin and trade every few hours, so their prices drift from the exchanges. Right now the widest gap is {widest?.label} on HSKSwap{fork ? " (rehearsal fork)" : ""}, at{" "}
            <strong>{(Math.abs(widestGap ?? 0) / 100).toFixed(2)}%</strong> {(widestGap ?? 0) >= 0 ? "above" : "below"} the exchanges. A round trip costs two 0.30% pool fees plus gas,{" "}
            {roundTripWords(s, noteUsd)}, the size Avow may swear at {s.record.tier.name}
            {gasDominates(s, noteUsd) ? ", where gas is most of the cost" : ""}. So most gaps are not worth a note.
          </SecHead>
          {eth ? (
            <figure style={{ margin: "0 0 32px" }}>
              <IntaglioChart series={eth.history} asset={eth.asset} label={`ETH on HSKSwap against HashKey Global${ethSpan ? `, last ${ethSpan}` : ""}`} />
              <div className="legend">
                <span>
                  <i />
                  HSKSwap ETH{fork ? " on the rehearsal fork" : ""}, stepped: it only moves when someone swaps
                </span>
                <span>
                  <i className="cex" />
                  HashKey Global ETH
                </span>
              </div>
              <figcaption className="plate">
                Plate. ETH{ethSpan ? ` over the last ${ethSpan}` : ""}, engraved: the HSKSwap price{fork ? " on the rehearsal fork" : ""} at {px("WETH", eth.dexPx)} against HashKey Global at{" "}
                {px("WETH", eth.cexPx)}. Drag or use the arrow keys to read a price.
              </figcaption>
            </figure>
          ) : null}
          <MarketBoard />
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="loop">
        <div className="wrap">
          <SecHead id="loop" title="One cycle, every 30 seconds.">
            The model never sees a blank page. It chooses among candidates whose levels and sizes were already computed, and its answer is checked before anything reaches the chain.
          </SecHead>
          <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <li className="step">
              <div className="step__n">1</div>
              <h3>Read</h3>
              <p>HSKSwap slot0 and 5-minute TWAP, HashKey Global and Gate.io mids, Chainlink, recent swaps.</p>
            </li>
            <li className="step">
              <div className="step__n">2</div>
              <h3>Build candidates</h3>
              <p>Premium beyond fee, gas and edge; 1 h and 4 h momentum; volatility. Each with computed target, void level and size limit.</p>
            </li>
            <li className="step">
              <div className="step__n">3</div>
              <h3>Decide</h3>
              <p>Gemini 3.5 Flash answers in strict JSON: swear or abstain, the candidate, a confidence and the statement, with reasons.</p>
            </li>
            <li className="step">
              <div className="step__n">4</div>
              <h3>Guard and swear</h3>
              <p>Levels must match the computed ones within 0.1%; the statement must name asset, side, target, void level and expiry. Then the vault checks the mandate.</p>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}
