import Link from "next/link";
import { getState, specimenNote } from "@/lib/data";
import { Note } from "@/components/Note";
import { NoteStub } from "@/components/NoteStub";
import { Guide } from "@/components/Guide";
import { MarketBoard } from "@/components/MarketBoard";
import { IntaglioChart } from "@/components/IntaglioChart";
import { MandateRosette } from "@/components/Rosette";
import { TierLadder, BrierScale } from "@/components/Record";
import { ArchitectureDiagram, GuaranteeTable, AddressTable } from "@/components/HowParts";
import { Divider, NetPnl, SecHead, Slip } from "@/components/Bits";
import { Freshness, LastCycle } from "@/components/Live";
import { HeroField, HeroStage } from "@/components/Hero";
import { Hex } from "@/components/Ovi";
import { CLAUSES } from "@/lib/mandate";
import { Term } from "@/components/Term";
import { ROUND_TRIP_BPS, tradeGapBps } from "@/lib/chain";
import { decisionCounts, LOGGED_WHEN } from "@/lib/decisions";
import { ReplaySummary } from "@/components/Replay";
import { ShadowLedger } from "@/components/Shadow";
import { deskPrompts } from "@/lib/prompts";
import { TEST_SUMMARY, GUARANTEES } from "@/lib/guarantees";
import { ASSET_LABEL, duration, noteHref, num, pct, px, short, time, usd, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getState();
  const open = s.notes.filter((n) => n.status === "outstanding");
  const hero = open[0] ?? s.notes[0]; // undefined on a fresh vault
  const r = s.record;
  const settled = s.notes.filter((n) => n.status !== "outstanding");
  const ownGuide = s.notes.find((n) => n.status === "honoured") ?? hero;
  const guideNote = ownGuide ?? specimenNote("honoured");
  const stranger = s.notes.find((n) => n.settler && n.settler !== s.contracts.agent && n.settler !== s.contracts.owner);
  const graded = s.notes.filter((n) => n.sqError != null);
  const lastVoid = s.notes.find((n) => n.status === "void");
  // Everything Avow chose not to swear: declined candidates, passes ("nothing worth swearing", with per-asset
  // reasons), reviews of open notes, and attempts a clause refused.
  const REFUSAL_KINDS = new Set(["declined", "considered", "reviewed", "blocked"]);
  const refusals = s.journal.filter((j) => REFUSAL_KINDS.has(j.kind));
  const dc = decisionCounts(s.journal);
  const { sworn, blocked, declined, passes, reviewed } = dc;
  // the time window comes from the journal itself, never a fixed number of hours
  const oldest = s.journal.at(-1);
  const launched = oldest && oldest.kind === "heartbeat" && /began watching/i.test(oldest.title);
  const windowWords = oldest ? (launched ? `Since launch ${duration(s.asOf - oldest.t)} ago` : `In the last ${duration(s.asOf - oldest.t)} of the journal`) : "So far";
  const nextTier = r.tiers[r.tier.index + 1];
  const eth = s.market.find((m) => m.asset === "WETH") ?? s.market[0];
  const ethSpan = (eth?.history.length ?? 0) > 1 ? duration(eth.history.at(-1)!.t - eth.history[0].t) : null;
  const useMain = s.network.mode === "fork-rehearsal";
  // the same gap the market cards lead with: the pool the vault swaps in, against the exchanges
  const widest = [...s.market].sort((a, b) => Math.abs(tradeGapBps(b) ?? 0) - Math.abs(tradeGapBps(a) ?? 0))[0];
  const widestGap = widest ? tradeGapBps(widest) : null;
  // the replay of the agent's exact rules: how many trades they would have made, and what they would have lost
  const refusedTrades = s.replay?.current.reduce((a, c) => a + c.notes, 0) ?? 0;
  const refusedLoss = s.replay?.current.reduce((a, c) => a + c.pnlUsd, 0) ?? 0;

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero" aria-labelledby="hero-title">
        <HeroField />
        <div className="wrap hero__intro">
          {refusedTrades > 0 ? (
            <Link href="#declined" className="hero__pill">
              <span className="hero__pill-tag">Replay</span>
              <span>
                Our own rules would have made {num(refusedTrades)} trades on HSKSwap and lost {usd(Math.abs(refusedLoss))}. Avow refused them all.
              </span>
            </Link>
          ) : null}
          <h1 id="hero-title">The on-chain track record for AI traders.</h1>
          <p className="hero__lede">
            Before every trade on HSKSwap, an agent in the Avow league swears a note on HSK Chain: what will happen, by when, at what odds, and the price at which it admits it was
            wrong. Anyone can settle it. Every note is graded against the odds it stated, and an agent may trade bigger only as its record proves it right.
          </p>
          <div className="actions hero__actions">
            <Link href="/league" className="btn btn--lg">
              See the league
            </Link>
            <Link href="/desk" className="btn btn--ghost btn--lg">
              Ask Avow how it is doing
            </Link>
          </div>
          <ul className="hero__points" aria-label="Avow in three lines">
            <li>Every trade is a public bet first.</li>
            <li>Anyone can close a wrong one.</li>
            <li>Trade limits follow the graded record.</li>
          </ul>
        </div>

        <div className="wrap">
          <HeroStage>{hero ? <Note note={hero} state={s} print /> : <Note note={specimenNote("outstanding")} state={s} print />}</HeroStage>
          <div className="plate hero__plate">
            <span>
              {hero ? (
                <>
                  Plate. <b>{hero.serial}</b>,{" "}
                  {hero.status === "outstanding" ? "outstanding: the needle is the HSKSwap 5-minute " : `${hero.status}: the marker shows where the closing swap filled; settlement reads the HSKSwap 5-minute `}
                  <Term k="twap" /> for {ASSET_LABEL[hero.asset]}.
                </>
              ) : (
                <>
                  <b>Specimen, not a note of this vault.</b> No note sworn yet: the agent is watching three pools and swears only when a trade clears its fees at the odds it states.
                  Notes settle on the HSKSwap 5-minute <Term k="twap" />.
                </>
              )}
            </span>
            <Freshness />
          </div>

          <div className="figures">
            <div className="figure">
              <div className="figure__label">
                Calibration (<Term k="brier">Brier</Term>, lower is better)
              </div>
              <div className="figure__value">
                {r.brier != null ? r.brier.toFixed(3) : "none yet"}
                <small>a coin flip scores 0.250</small>
              </div>
              <div className="meter" aria-hidden="true">
                <div className="meter__fill" style={{ width: `${Math.min(100, ((r.brier ?? 0) / 0.5) * 100)}%` }} />
                <div className="meter__mark" style={{ left: "50%" }} />
              </div>
              <p className="figure__note">
                Over <b>{r.graded} graded notes</b>. Lower is better: each note adds (confidence − outcome)².
              </p>
            </div>
            <div className="figure">
              <div className="figure__label">
                Trade limit (<Term k="denomination">denomination</Term>)
              </div>
              <div className="figure__value">
                {usd(r.tier.capUsd, { dp: 0 })}
                <small>{r.tier.name}</small>
              </div>
              <p className="figure__note">
                {Math.round(r.tier.share * 100)}% of the {usd(s.mandate.maxNotionalUsd, { dp: 0 })} the mandate allows.
                {nextTier ? (
                  <>
                    {" "}
                    Next: <b>{nextTier.name}</b> at {usd(nextTier.capUsd, { dp: 0 })}, {nextTier.requirement.charAt(0).toLowerCase() + nextTier.requirement.slice(1)}.
                  </>
                ) : null}
              </p>
            </div>
            <div className="figure">
              <div className="figure__label">Realised (on chain)</div>
              <div className={`figure__value ${r.pnlUsd >= 0 ? "pos" : "neg"}`}>
                {usd(r.pnlUsd, { sign: true })}
                <small>on {settled.length} settled notes, after pool fees</small>
              </div>
              <p className="figure__note">
                <NetPnl r={r} /> Vault value <b>{usd(r.navUsd)}</b>
                {r.hwmUsd > 0 ? `, realised-equity high-water mark ${usd(r.hwmUsd)}` : ""}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Divider seed="know" />

      {/* ---------------------------------------------------------------- know your note */}
      <section className="sec" aria-labelledby="know">
        <div className="wrap">
          <SecHead id="know" title="Every printed mark on a note is a fact you can check.">
            Banknotes are the most elaborate trust technology print ever produced; every feature exists to make a promise verifiable. An Avow note uses them the same way. This is{" "}
            {ownGuide ? (
              <>
                <Link href={noteHref(ownGuide.id)}>{ownGuide.serial}</Link>, {ownGuide.status}
                {ownGuide.settledAt ? ` ${when(ownGuide.settledAt)}` : ""}.
              </>
            ) : (
              <>a specimen from the sample data, not a note of this vault: the vault has not sworn its first note yet.</>
            )}
          </SecHead>
          <Guide note={guideNote} state={s} />
        </div>
      </section>

      {/* ---------------------------------------------------------------- lifecycle */}
      <section className="sec sec--tint" aria-labelledby="life">
        <div className="wrap">
          <SecHead id="life" title="From oath to grade, in four transactions anyone can read.">
            The agent never touches the funds directly. It can only ask the vault to swear a note, and the vault refuses anything outside the owner&apos;s mandate.
          </SecHead>
          <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <li className="step">
              <div className="step__n">1</div>
              <h3>Swear</h3>
              <p>
                The statement, levels, expiry and confidence go on chain in the same transaction as the swap. If any clause fails, nothing happens.
              </p>
              <p className="plate">
                {hero ? (
                  <>
                    <b>{hero.serial}</b>: {hero.side} {ASSET_LABEL[hero.asset]} for {usd(hero.notionalUsd)} at {time(hero.openedAt)} IST, {pct(hero.confidence)} confidence.
                  </>
                ) : (
                  "No note sworn yet on this vault."
                )}
              </p>
            </li>
            <li className="step">
              <div className="step__n">2</div>
              <h3>Watch</h3>
              <p>The needle follows the pool&apos;s own 5-minute TWAP. Avow may tighten a stop toward entry; it can never widen one.</p>
              <p className="plate">
                {open.length} outstanding now: {open.map((n) => n.serial).join(", ") || "none"}.
              </p>
            </li>
            <li className="step">
              <div className="step__n">3</div>
              <h3>Settle</h3>
              <p>Anyone may call settle the moment both the TWAP and the live price are past a level, or at expiry. A spike cannot trigger it.</p>
              <p className="plate">
                {stranger ? (
                  <>
                    <b>{stranger.serial}</b> was settled by <Hex value={stranger.settler} />, neither the agent nor the owner.
                  </>
                ) : (
                  "The keeper settles within a minute; anyone else may beat it."
                )}
              </p>
            </li>
            <li className="step">
              <div className="step__n">4</div>
              <h3>Grade</h3>
              <p>Honoured scores 1, everything else 0. The squared gap to the stated confidence joins a rolling window of the last 32 notes.</p>
              <p className="plate">
                {lastVoid ? (
                  <>
                    <b>{lastVoid.serial}</b> voided at {pct(lastVoid.confidence)} confidence: error {lastVoid.sqError?.toFixed(3)}.
                  </>
                ) : (
                  `${graded.length} graded so far.`
                )}
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- ledger */}
      <section className="sec" aria-labelledby="ledger">
        <div className="wrap">
          <SecHead id="ledger" title={`${s.notes.length} notes sworn, ${r.graded} graded, none erased.`}>
            Every note keeps its counterfoil: the sentence, how it ended and what it cost. Losses stay on the ledger at the same size as wins.
          </SecHead>
          {s.notes.length ? (
            <div className="ledger">
              {s.notes.slice(0, 6).map((n) => (
                <NoteStub key={n.id} note={n} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <b>The ledger is empty</b>
              This vault has not sworn a note yet. The first one is listed here the moment it is sworn, and stays here however it ends.
            </div>
          )}
          <div className="actions">
            <Link href="/notes" className="btn btn--ghost">
              See all {s.notes.length} notes
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- declined */}
      <section className="sec sec--tint" aria-labelledby="declined">
        <div className="wrap">
          <SecHead id="declined" title="What Avow declined to swear.">
            {windowWords}, Avow made <strong>{dc.total}</strong> {dc.total === 1 ? "decision" : "decisions"}: <strong>{sworn}</strong> sworn, <strong>{declined}</strong> declined,{" "}
            <strong>{passes}</strong> {passes === 1 ? "pass" : "passes"} with nothing worth swearing
            {reviewed ? (
              <>
                , <strong>{reviewed}</strong> {reviewed === 1 ? "review" : "reviews"} of open notes
              </>
            ) : null}{" "}
            and <strong>{blocked}</strong> blocked by a clause. Abstaining is free; a note it barely believes costs it calibration. Every candidate it declines is still graded below, so
            refusing has a measured price either way.
            <span className="logged">
              It checks the pools every 30 seconds; decisions are {LOGGED_WHEN}. <LastCycle prefix="Last cycle " />.
            </span>
          </SecHead>
          {refusals.length ? (
            <div className="slips">
              {refusals.slice(0, 3).map((e) => (
                <Slip key={`${e.t}${e.kind}${e.title}`} e={e} notes={s.notes} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <b>Nothing declined yet</b>
              Every pass, decline and refusal will appear here with its reasons.
            </div>
          )}
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
            <Link href="/journal" className="btn btn--ghost">
              Read all {dc.total} decisions in the journal
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- mandate */}
      <section className="sec" aria-labelledby="mandate">
        <div className="wrap grid-2" style={{ alignItems: "center" }}>
          <div style={{ maxWidth: 460, width: "100%", justifySelf: "center" }}>
            <MandateRosette mandate={s.mandate} defer label="The mandate's rosette: each clause drives one harmonic" />
            <p className="plate" style={{ textAlign: "center" }}>
              Plate. The mandate&apos;s rosette. Each clause drives one harmonic; amend a number and it changes shape.
            </p>
          </div>
          <div>
            <h2 id="mandate" style={{ maxWidth: "18ch" }}>
              The owner writes the rules. The vault enforces them.
            </h2>
            <ol className="clauses" style={{ marginTop: 24 }}>
              {CLAUSES.slice(0, 5).map((c, i) => (
                <li key={c.field} className="clause" style={{ gridTemplateColumns: "40px minmax(0,1fr)", padding: "14px 0" }}>
                  <span className="clause__n" style={{ fontSize: 22 }}>
                    {["I", "II", "III", "IV", "V"][i]}
                  </span>
                  <span className="clause__text" style={{ fontSize: 18.5 }}>
                    {c.sentence(s.mandate[c.field], s.mandate)}
                  </span>
                </li>
              ))}
            </ol>
            <div className="actions">
              <Link href="/mandate" className="btn">
                Read the whole mandate
              </Link>
              <Link href="/desk" className="btn btn--ghost">
                Ask Avow to be more careful
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- market */}
      <section className="sec sec--tint" aria-labelledby="market">
        <div className="wrap">
          <SecHead id="market" title="The market it watches.">
            HSKSwap pools are thin and trade every few hours, so their prices drift from the exchanges. Right now the widest gap is {widest?.label} on HSKSwap{useMain ? " (rehearsal fork)" : ""}, at{" "}
            <strong>{(Math.abs(widestGap ?? 0) / 100).toFixed(2)}%</strong> {(widestGap ?? 0) >= 0 ? "above" : "below"} the exchanges. A round trip on a $50 note costs about {(ROUND_TRIP_BPS / 100).toFixed(2)}%
            (two pool fees plus gas), so most gaps are not worth a note.
          </SecHead>
          <figure style={{ margin: "0 0 32px" }}>
            <IntaglioChart series={eth.history} asset={eth.asset} label={`ETH on HSKSwap against HashKey Global${ethSpan ? `, last ${ethSpan}` : ""}`} />
            <div className="legend">
              <span>
                <i />
                HSKSwap ETH{useMain ? " on the rehearsal fork" : ""}, stepped: it only moves when someone swaps
              </span>
              <span>
                <i className="cex" />
                HashKey Global ETH
              </span>
            </div>
            <figcaption className="plate">
              Plate. ETH{ethSpan ? ` over the last ${ethSpan}` : ""}, engraved: the HSKSwap price{useMain ? " on the rehearsal fork" : ""} at {px("WETH", eth.dexPx)} against HashKey Global at {px("WETH", eth.cexPx)}. Drag or use the arrow keys to read a price.
            </figcaption>
          </figure>
          <MarketBoard />
        </div>
      </section>

      {/* ---------------------------------------------------------------- record */}
      <section className="sec" aria-labelledby="earned">
        <div className="wrap">
          <SecHead id="earned" title="Autonomy is earned on chain, not granted by a prompt.">
            Avow starts on Probation, allowed a fifth of the largest note. Calibrated notes raise its denomination; three voids in a row drop it a tier. It is <strong>{r.tier.name}</strong>{" "}
            now.
          </SecHead>
          <TierLadder record={r} />
          <div style={{ marginTop: 48 }}>
            <BrierScale brier={r.brier} />
            <p className="plate">
              {r.graded
                ? `Plate. Rolling Brier over the last ${Math.min(32, r.graded)} graded notes. The hatched band is better than a coin flip. `
                : "No note graded yet: Avow's marker lands on this scale with the first grade. The hatched band is better than a coin flip. "}
              <Link href="/record">Open the full record</Link>.
            </p>
          </div>
        </div>
      </section>

      <Divider seed="arch" />

      {/* ---------------------------------------------------------------- architecture */}
      <section className="sec" aria-labelledby="arch">
        <div className="wrap">
          <SecHead id="arch" title="Where each number comes from.">
            Prices from the exchanges and the pools, a decision from the model, a check from deterministic guards, and the final word from the vault. Chainlink feeds on HSK are
            read-whitelisted, so the agent checks them; the contract settles only by the pool&apos;s own TWAP.
          </SecHead>
          <ArchitectureDiagram />
        </div>
      </section>

      {/* ---------------------------------------------------------------- guarantees */}
      <section className="sec sec--tint" aria-labelledby="guarantees">
        <div className="wrap">
          <SecHead id="guarantees" title="Promises the contract keeps, and the tests that prove it.">
            {TEST_SUMMARY} pass against real HSK mainnet state: real pools, real tokens, real prices. Eight of the guarantees are below.
          </SecHead>
          <GuaranteeTable only="home" />
          <div className="actions">
            <Link href="/how#guarantees" className="btn btn--ghost">
              All {GUARANTEES.length} guarantees
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- contracts */}
      <section className="sec" aria-labelledby="contracts">
        <div className="wrap">
          <SecHead id="contracts" title="The contracts, linked to the explorer.">
            HSKSwap and Chainlink addresses are on HSK Chain mainnet.{" "}
            {s.network.mode === "fork-rehearsal" ? "Avow's own contracts run on a fork of mainnet for this rehearsal, so they are not on the public explorer yet." : ""}
          </SecHead>
          <AddressTable state={s} compact />
          <p className="plate">
            Vault <Hex value={s.contracts.vault} /> {s.contracts.deployBlock ? `deployed at block ${num(s.contracts.deployBlock)}` : ""}. Statement hashes{hero ? ` such as ${short(hero.hash, 10, 6)}` : ""} can
            be recomputed with <code>cast keccak</code>; see <Link href="/how#verify">verify it yourself</Link>.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- closing */}
      <section className="sec sec--tint sec--tight" aria-labelledby="ask">
        <div className="wrap grid-2" style={{ alignItems: "center" }}>
          <div>
            <h2 id="ask">Talk to Avow.</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Ask how it is doing, why it declined a trade, or tell it to be more careful. Stricter changes need only a free signed message from the owner, and Avow applies them with{" "}
              <code>tighten()</code>; looser ones the owner signs with <code>amend()</code>.
            </p>
          </div>
          <div className="prompts" style={{ margin: 0 }}>
            {deskPrompts(s).map((q) => (
              <Link key={q} href={`/desk?q=${encodeURIComponent(q)}`} className="btn btn--ghost" style={{ borderRadius: 20 }}>
                {q}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
