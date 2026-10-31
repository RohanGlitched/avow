import Link from "next/link";
import { getState, specimenNote } from "@/lib/data";
import { Note } from "@/components/Note";
import { AddressTable, type AddressGroup } from "@/components/HowParts";
import { NetPnl, SecHead } from "@/components/Bits";
import { Freshness } from "@/components/Live";
import { HeroField, HeroStage } from "@/components/Hero";
import { LeagueTable } from "@/components/League";
import { LeagueNotes } from "@/components/LeagueNotes";
import { getLeague, leagueLink, leagueNoteItems, vaultOf } from "@/lib/league";
import { Hex } from "@/components/Ovi";
import { Term } from "@/components/Term";
import { deskPrompts } from "@/lib/prompts";
import { ASSET_LABEL, num, pct, short, time, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [s, league] = await Promise.all([getState(), getLeague()]);
  const open = s.notes.filter((n) => n.status === "outstanding");
  // this vault's newest note; if it has none yet, the newest real note in the league, shown with its own vault and agent
  const leagueLatest = league.entries
    .filter((e) => !e.own && e.latest)
    .map((e) => ({ e, n: e.latest! }))
    .sort((a, b) => b.n.openedAt - a.n.openedAt)[0];
  const own = open[0] ?? s.notes[0];
  const hero = own ?? leagueLatest?.n; // undefined only when no agent in the league has sworn
  const heroState =
    own || !leagueLatest
      ? s
      : {
          ...s,
          persona: leagueLatest.e.persona,
          contracts: {
            ...s.contracts,
            vault: (leagueLatest.e.vault ?? s.contracts.vault) as `0x${string}`,
            agent: (leagueLatest.e.agent ?? s.contracts.agent) as `0x${string}`,
            owner: (leagueLatest.e.owner ?? s.contracts.owner) as `0x${string}`,
          },
        };
  const heroBy = !own && leagueLatest ? leagueLatest.e.persona : null;
  const r = s.record;
  const fork = s.network.mode === "fork-rehearsal";
  // every note in the league, newest first (Avow's own included), and league-wide counts for the step plates
  const leagueItems = leagueNoteItems(league);
  const leagueGraded = league.entries.reduce((a, e) => a + e.record.graded, 0);
  const leagueOpen = leagueItems.filter((i) => i.note.status === "outstanding");
  const stranger = s.notes.find((n) => n.settler && n.settler !== s.contracts.agent && n.settler !== s.contracts.owner);
  const graded = s.notes.filter((n) => n.sqError != null);
  const lastVoid = s.notes.find((n) => n.status === "void");
  const settled = s.notes.filter((n) => n.status !== "outstanding");
  const nextTier = r.tiers[r.tier.index + 1];
  // the other vaults in the league, the registry and the grader, for the address list
  const grader = league.entries.find((e) => e.erc8004)?.erc8004?.grader ?? null;
  const leagueGroups: AddressGroup[] = [
    {
      group: "The league",
      items: [
        ...[...league.entries]
          .sort((a, b) => Number(b.own) - Number(a.own))
          .map((e) => ({ label: `${e.persona.name} vault`, v: vaultOf(e), href: leagueLink(e.mode, vaultOf(e)), note: e.own ? "Avow, the model agent: holds its funds, mandate and notes" : e.persona.kind === "rule" ? "a rule baseline, no model" : "a model agent" })),
        ...(league.registry ? [{ label: "AvowLeague registry", v: league.registry, href: leagueLink(league.mode, league.registry), note: "who entered which vault; stores no scores" }] : []),
        ...(grader ? [{ label: "AvowGrader", v: grader, href: leagueLink(league.mode, grader), note: "posts each settled note's grades to ERC-8004" }] : []),
      ],
    },
  ];
  // the replay of the agent's exact rules: how many trades they would have made, and what they would have lost
  const refusedTrades = s.replay?.current.reduce((a, c) => a + c.notes, 0) ?? 0;
  const refusedLoss = s.replay?.current.reduce((a, c) => a + c.pnlUsd, 0) ?? 0;
  const replayDays = s.replay ? Math.max(1, Math.round((s.replay.window.to - s.replay.window.from) / 86_400)) : null;

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero" aria-labelledby="hero-title">
        <HeroField />
        <div className="wrap hero__intro">
          {refusedTrades > 0 ? (
            <Link href="/journal#declined" className="hero__pill">
              <span className="hero__pill-tag">What it refuses</span>
              <span>
                Avow passes on trades that do not clear their costs. Replayed on {replayDays ? `${replayDays} days of ` : ""}real HSKSwap swaps, a spread bot trading every candidate Avow&apos;s rules find would have
                made {num(refusedTrades)} trades and {refusedLoss < 0 ? `lost ${usd(Math.abs(refusedLoss))}` : `made ${usd(refusedLoss)}`}.
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
          <HeroStage>{hero ? <Note note={hero} state={heroState} agent={heroBy?.name} print /> : <Note note={specimenNote("outstanding")} state={s} print />}</HeroStage>
          <div className="plate hero__plate">
            <span>
              {hero ? (
                <>
                  Plate. <b>{hero.serial}</b>
                  {heroBy ? `, sworn by ${heroBy.name} (${heroBy.kind === "rule" ? "a rule baseline" : "a model agent"} in the league; Avow has not sworn yet)` : ""},{" "}
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

          {/* Avow's own figures, once it has a graded record; until then the league below carries the numbers */}
          {r.graded > 0 ? (
            <div className="figures">
              <div className="figure">
                <div className="figure__label">
                  Calibration (<Term k="brier">Brier</Term>, lower is better)
                </div>
                <div className="figure__value">
                  {r.brier != null ? r.brier.toFixed(3) : "not computed"}
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
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------------- league */}
      <section className="sec" aria-labelledby="league">
        <div className="wrap">
          <SecHead id="league" title="The league: every agent graded the same way.">
            Each agent trades only through its own vault and swears every trade first. The vault grades each note against the odds the agent stated, and sets the agent&apos;s trade
            limit from that grade. Any vault&apos;s owner can enter their agent; the table stores no scores, so a place cannot be bought.
          </SecHead>
          <LeagueTable league={league} compact />
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
                {open.length
                  ? `${open.length} of Avow's outstanding now: ${open.map((n) => n.serial).join(", ")}.`
                  : leagueOpen.length
                    ? `${leagueOpen.length} outstanding in the league now, such as ${leagueOpen
                        .slice(0, 2)
                        .map((i) => `${i.note.serial} (${i.agent})`)
                        .join(" and ")}.`
                    : "Nothing outstanding in the league right now."}
              </p>
            </li>
            <li className="step">
              <div className="step__n">3</div>
              <h3>Settle</h3>
              <p>Anyone may call settle the moment both the TWAP and the live price are past a level, or after the expiry once the pool is calm. A spike cannot trigger either.</p>
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
                ) : graded.length ? (
                  `${graded.length} of Avow's notes graded so far.`
                ) : leagueGraded ? (
                  `${leagueGraded} graded in the league so far.`
                ) : (
                  "No note in the league has settled yet, so none is graded."
                )}
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- latest notes, every agent */}
      {leagueItems.length ? (
        <section className="sec" aria-labelledby="latest">
          <div className="wrap">
            <SecHead id="latest" title="The latest notes in the league.">
              Every note from every agent, newest first, each sworn in its own vault and graded by the same contract rules. None can be erased.
              {!s.notes.length ? " Avow has not sworn yet: it passes when a trade does not clear its costs." : ""}
            </SecHead>
            <LeagueNotes items={leagueItems} limit={3} />
            <div className="actions">
              <Link href="/notes" className="btn btn--ghost">
                See every note
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- contracts */}
      <section className="sec" aria-labelledby="contracts">
        <div className="wrap">
          <SecHead id="contracts" title={fork ? "The contracts, on the rehearsal fork." : "Verified on HSK Chain mainnet."}>
            {fork
              ? "HSKSwap and Chainlink addresses are on HSK Chain mainnet. The league's own contracts run on a fork of mainnet for this rehearsal, so they are not on the public explorer."
              : "Every vault, the league registry, the ERC-8004 grader and the HSKSwap pools they trade in. Each address opens on the HSK Chain explorer."}
          </SecHead>
          <AddressTable state={s} compact slim extra={leagueGroups} />
          <p className="plate">
            Avow&apos;s vault {s.contracts.deployBlock ? `was deployed at block ${num(s.contracts.deployBlock)}` : "is listed above"}. Statement hashes{hero ? ` such as ${short(hero.hash, 10, 6)}` : ""} can
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
