import Link from "next/link";
import { getState } from "@/lib/data";
import { Note } from "@/components/Note";
import { NoteStub } from "@/components/NoteStub";
import { Guide } from "@/components/Guide";
import { MarketBoard } from "@/components/MarketBoard";
import { IntaglioChart } from "@/components/IntaglioChart";
import { MandateRosette } from "@/components/Rosette";
import { TierLadder, BrierScale } from "@/components/Record";
import { ArchitectureDiagram, GuaranteeTable, AddressTable } from "@/components/HowParts";
import { Divider, SecHead, Slip } from "@/components/Bits";
import { Freshness } from "@/components/Live";
import { Hex } from "@/components/Ovi";
import { CLAUSES } from "@/lib/mandate";
import { FORK_TESTS_PASSING, GUARANTEES } from "@/lib/guarantees";
import { ASSET_LABEL, num, pct, px, short, time, usd, when } from "@/lib/format";

export const revalidate = 15;

export default async function Home() {
  const s = await getState();
  const open = s.notes.filter((n) => n.status === "outstanding");
  const hero = open[0] ?? s.notes[0];
  const r = s.record;
  const settled = s.notes.filter((n) => n.status !== "outstanding");
  const guideNote = s.notes.find((n) => n.status === "honoured") ?? hero;
  const stranger = s.notes.find((n) => n.settler && n.settler !== s.contracts.agent && n.settler !== s.contracts.owner);
  const graded = s.notes.filter((n) => n.sqError != null);
  const lastVoid = s.notes.find((n) => n.status === "void");
  const refusals = s.journal.filter((j) => j.kind === "declined" || j.kind === "blocked");
  const sworn = s.journal.filter((j) => j.kind === "sworn").length;
  const blocked = s.journal.filter((j) => j.kind === "blocked").length;
  const declined = s.journal.filter((j) => j.kind === "declined").length;
  const nextTier = r.tiers[r.tier.index + 1];
  const eth = s.market.find((m) => m.asset === "WETH") ?? s.market[0];
  const widest = [...s.market].sort((a, b) => Math.abs(b.spreadBps ?? 0) - Math.abs(a.spreadBps ?? 0))[0];

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap">
          <div className="hero__top">
            <h1 id="hero-title">An AI trader that has to swear before it trades.</h1>
            <div>
              <p className="hero__lede">
                Avow trades on HSKSwap only through a vault on HSK Chain. Before every swap it publishes a note: what will happen, by when, and at what price it admits it was wrong.
                Anyone can settle the note. Its record decides how much it may risk next.
              </p>
              <div className="actions">
                <Link href={`/notes/${hero.id}`} className="btn">
                  Open {hero.serial}
                </Link>
                <Link href="/desk" className="btn btn--ghost">
                  Ask Avow how it is doing
                </Link>
              </div>
            </div>
          </div>

          {hero ? (
            <Note note={hero} state={s} print />
          ) : (
            <div className="empty">
              <b>No note sworn yet</b>
              The vault is live and the agent is watching three pools. The first note will appear here the moment a candidate clears the mandate.
            </div>
          )}
          <div className="plate hero__plate">
            <span>
              Plate. <b>{hero.serial}</b>, {hero.status === "outstanding" ? "outstanding" : hero.status}: the needle is the HSKSwap 5-minute TWAP for {ASSET_LABEL[hero.asset]}.
            </span>
            <Freshness />
          </div>

          <div className="figures">
            <div className="figure">
              <div className="figure__label">Calibration, rolling Brier score</div>
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
              <div className="figure__label">Denomination, the largest note it may write</div>
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
              <div className="figure__label">Realised P&amp;L, after fees and gas</div>
              <div className={`figure__value ${r.pnlUsd >= 0 ? "pos" : "neg"}`}>
                {usd(r.pnlUsd, { sign: true })}
                <small>on {settled.length} settled notes</small>
              </div>
              <p className="figure__note">
                Every round trip pays 0.60% in pool fees. Vault value <b>{usd(r.navUsd)}</b>, high-water mark {usd(r.hwmUsd)}.
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
            <Link href={`/notes/${guideNote.id}`}>{guideNote.serial}</Link>, honoured {guideNote.settledAt ? when(guideNote.settledAt) : ""}.
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
                <b>{hero.serial}</b>: {hero.side} {ASSET_LABEL[hero.asset]} for {usd(hero.notionalUsd)} at {time(hero.openedAt)} IST, {pct(hero.confidence)} confidence.
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
          <div className="ledger">
            {s.notes.slice(0, 6).map((n) => (
              <NoteStub key={n.id} note={n} />
            ))}
          </div>
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
            In the last 72 hours it swore <strong>{sworn}</strong> notes, declined <strong>{declined}</strong> candidates and was refused <strong>{blocked}</strong> times by a clause.
            Abstaining is free; a note it barely believes costs it calibration.
          </SecHead>
          <div className="slips">
            {refusals.slice(0, 6).map((e) => (
              <Slip key={`${e.t}${e.title}`} e={e} />
            ))}
          </div>
          <div className="actions">
            <Link href="/journal" className="btn btn--ghost">
              Read the full journal
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
            HSKSwap pools are thin and trade every few hours, so their prices drift from the exchange. Right now {widest?.label} on HSKSwap is{" "}
            <strong>{num(Math.abs(widest?.spreadBps ?? 0), 1)} bps</strong> {(widest?.spreadBps ?? 0) >= 0 ? "above" : "below"} HashKey Global. A round trip costs 60 bps in fees, so most
            premiums are not worth a note.
          </SecHead>
          <figure style={{ margin: "0 0 32px" }}>
            <IntaglioChart series={eth.history} asset={eth.asset} label="ETH on HSKSwap against HashKey Global, last 72 hours" />
            <div className="legend">
              <span>
                <i />
                HSKSwap ETH, stepped: it only moves when someone swaps
              </span>
              <span>
                <i className="cex" />
                HashKey Global ETH
              </span>
            </div>
            <figcaption className="plate">
              Plate. ETH over 72 hours, engraved: the HSKSwap price at {px("WETH", eth.dexPx)} against HashKey Global at {px("WETH", eth.cexPx)}. Drag or use the arrow keys to read a price.
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
              Plate. Rolling Brier over the last {Math.min(32, r.graded)} graded notes. The hatched band is better than a coin flip.{" "}
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
            read-whitelisted, so the agent checks them; the contract judges only by the pool&apos;s own TWAP.
          </SecHead>
          <ArchitectureDiagram />
        </div>
      </section>

      {/* ---------------------------------------------------------------- guarantees */}
      <section className="sec sec--tint" aria-labelledby="guarantees">
        <div className="wrap">
          <SecHead id="guarantees" title="Promises the contract keeps, and the tests that prove it.">
            {FORK_TESTS_PASSING} fork tests pass against real HSK mainnet state: real pools, real tokens, real prices. Eight of the guarantees are below.
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
            Vault <Hex value={s.contracts.vault} /> {s.contracts.deployBlock ? `deployed at block ${num(s.contracts.deployBlock)}` : ""}. Statement hashes such as {short(hero.hash, 10, 6)} can
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
              Ask how it is doing, why it declined a trade, or tell it to be more careful. Anything stricter it applies itself; anything looser becomes an amendment only the owner can sign.
            </p>
          </div>
          <div className="prompts" style={{ margin: 0 }}>
            {["How are we doing?", "What is open right now?", "Why did you decline ETH an hour ago?", "Be more careful today", "Only trade ETH", "Trade bigger"].map((q) => (
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
