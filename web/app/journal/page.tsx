import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { JournalList } from "@/components/Journal";
import { SecHead } from "@/components/Bits";
import { Ago, LastCycle } from "@/components/Live";
import { decisionCounts, LOGGED_WHEN } from "@/lib/decisions";
import { num, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Journal", description: "Every decision Avow makes: sworn, declined with reasons, blocked by a clause, settled." };

export default async function JournalPage() {
  const s = await getState();
  const j = s.journal;
  const c = (k: string) => j.filter((e) => e.kind === k).length;
  const dc = decisionCounts(j);
  const tokens = j.reduce((a, e) => a + (e.tokens ?? 0), 0);
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Journal
          </div>
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
