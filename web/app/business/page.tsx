import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { LeagueTable } from "@/components/League";
import { getLeague } from "@/lib/league";
import { SecHead, Divider } from "@/components/Bits";
import { Rosette } from "@/components/Rosette";
import { Crossing } from "@/components/Stamps";
import { seedHash } from "@/lib/rosette";
import { day, usd } from "@/lib/format";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business",
  description:
    "Avow is the credit score for AI traders: every trade's stated confidence is graded on HSK Chain and published as ERC-8004 reputation, so any allocator, exchange or vault can size an agent by whether its confidence has ever meant anything.",
};

// Measured on HSK Chain mainnet, Oct 2026: 500 gwei gas, HSK ≈ $0.087.
const GAS_GWEI = 500;
const HSK_USD = 0.087;
const gasUsd = (gas: number) => gas * GAS_GWEI * 1e-9 * HSK_USD;
const NOTE_GAS = 540_000; // the swap, the stored note and the full statement
const GRADE_GAS = 150_000; // AvowGrader posting one grade to the ERC-8004 reputation registry
const noteUsd = gasUsd(NOTE_GAS);
const gradeUsd = gasUsd(GRADE_GAS);
const SETTLE_USD = 0.015;

// ---- the problem

const PROBLEMS = [
  {
    t: "Confidence is a word nobody checks",
    d: "An AI trader says it is 80% sure. Nothing records that number before the trade, and nothing compares it with what happened, so 80% from one agent and 80% from another mean nothing.",
  },
  {
    t: "P&L rewards luck",
    d: "A few lucky trades in a rising market look the same as skill. A small sample of returns cannot tell an allocator whether the agent knew anything.",
  },
  {
    t: "Leaderboards show the survivors",
    d: "Agents that lose are switched off or relaunched under a new name. The ones left on the board are the lucky ones, and the screenshots come from them.",
  },
];

// ---- what Avow sells (planned)

const READERS = [
  {
    who: "Allocators and funds",
    reads: "Graded records and attestations through an API: every note, its stated odds, its grade and its size.",
    why: "To size an agent by evidence before handing it capital, and to keep checking it after.",
    price: "A data subscription, priced in the first pilots",
    lead: true,
  },
  {
    who: "Copy-trade platforms",
    reads: "The grade beside every agent their users can follow.",
    why: "Followers choose by a number the agent cannot edit, not by a P&L screenshot.",
    price: "A fee per listed agent",
  },
  {
    who: "Launchpads for AI agents",
    reads: "An agent's graded record before and after it launches.",
    why: "A launch with a record nobody can rewrite is easier to back.",
    price: "A fee per graded launch",
  },
  {
    who: "Exchange agent listings",
    reads: "Grades for the agents an exchange lists or lets trade through sub-accounts, for example HashKey Global agent listings (planned).",
    why: "A listing standard they can point to, read from a public registry.",
    price: "A data licence",
  },
  {
    who: "Licensed managers",
    reads: "Audit reports for AI-run mandates: what the agent claimed, what the vault allowed, and what happened.",
    why: "Reports they can put in front of clients and the regulator.",
    price: "From $500 a month",
  },
];

// ---- how the grade resists gaming

const ENFORCED = [
  {
    t: "Sworn before the trade",
    d: "The note is written in the same transaction as the swap; the vault has no other route to the router. Its terms are fixed when it is sworn, and no note can be fulfilled by its own trade.",
  },
  {
    t: "Settled by anyone, on TWAP and spot",
    d: "Settlement is public and needs no keeper. A stop or target counts only when both the 5-minute TWAP and the live price are past it, so a single spike settles nothing.",
  },
  {
    t: "Retreat is graded as a miss",
    d: "A note the agent retracts, or the owner revokes, is graded 0, and so is one that runs out of time. Nothing is deleted; there is no way to leave a bad call off a vault's record.",
  },
  {
    t: "No negative-expectancy notes",
    d: "The vault refuses any note that would lose at its own stated odds after the 0.60% round-trip pool fee. Odds must be between 50% and 99%.",
  },
];

const OPEN_ISSUES = [
  {
    issue: "An owner can open new vaults and enter only the good ones",
    why: "Cherry-picking: ten vaults, enter the one that got lucky.",
    fix: "A per-owner history across every vault an owner deploys, and league entries that stay for good once made.",
  },
  {
    issue: "A thin pool can be pushed past a level",
    why: "On small HSKSwap pools, a large enough trade could settle a note in the agent's favour.",
    fix: "An independent price reference beside the pool's TWAP, and a dispute window before a grade is final.",
  },
  {
    issue: "Easy targets earn a good grade without skill",
    why: "A target very close to the price is likely to be hit; stating high odds on it is calibrated but tells you little.",
    fix: "A skill score against the probability the stop and target levels already imply, published beside the plain grade.",
  },
  {
    issue: "A $1 note counts as much as a large one",
    why: "An agent could build a record on tiny notes and then trade big.",
    fix: "Notional-weighted grades, so the record reflects the size the agent actually traded.",
  },
];

// ---- competition

const ALTERNATIVES = [
  {
    name: "Guardrail agents in this hackathon",
    sub: "Vyuh, KAVACH, Sentinel, Guarded Trade Agent, PolicyRebalancer, VeriQuant",
    what: "On-chain limits on what an AI trader may do: spend caps, allow-lists and policy checks before a trade.",
    gap: "Limits say what an agent may not do, not whether its confidence means anything. Avow has limits too, and sizes them by the grade.",
  },
  {
    name: "Recall Network",
    sub: "Reportedly about $42M raised",
    what: "On-chain trading competitions and leaderboards for AI agents, ranked by results, with staking on agents.",
    gap: "Ranks results in time-boxed contests, where a lucky run and a skilled run look alike. Avow grades the stated odds of every trade, in a live vault.",
  },
  {
    name: "Taoshi and Vanta",
    sub: "Bittensor subnet 8",
    what: "Scores trading signals on risk-adjusted returns and rewards the best of them.",
    gap: "Scores returns, not stated confidence, and the score lives inside the subnet's own incentives rather than in a standard other clients read.",
  },
  {
    name: "P&L leaderboards",
    sub: "Hyperliquid vaults and similar",
    what: "Public vaults with a visible track record and P&L.",
    gap: "Nothing is claimed before a trade, so nothing can be graded, and closed vaults drop off the board.",
  },
  {
    name: "Enzyme, dHEDGE",
    sub: "Policy vaults",
    what: "A manager trades within on-chain limits and asset allow-lists.",
    gap: "Limits, but no falsifiable claim before a trade and no grade after it.",
  },
  {
    name: "Numerai",
    sub: "Staked predictions",
    what: "Data scientists stake on their predictions and are paid on performance.",
    gap: "Models and predictions live off chain; the stake is on a signal, not on a trade the stake executes.",
  },
  {
    name: "ERC-8004",
    sub: "A standard, not a competitor",
    what: "The draft Ethereum standard for agent identity and reputation.",
    gap: "It defines where reputation lives, not how to earn it. Avow is a reputation writer for it, posting calibration under the tag avow-calibration.",
  },
];

// ---- moat

const MOAT = [
  {
    t: "A neutral grader",
    d: "Anyone can settle a note and post its grade; nobody chooses the number. The grader reads the vault and applies one formula, so there is no one at Avow to lobby for a better score.",
  },
  {
    t: "Depth of record",
    d: "A record is sworn before each outcome and pinned to the block it settled in. A rival can copy the contracts in a day; it cannot copy months of graded notes.",
  },
  {
    t: "The default calibration tag on HSK Chain",
    d: "Avow deployed the first ERC-8004 registries on HSK Chain. If avow-calibration becomes the tag clients filter by, every new agent there is graded on the same terms.",
  },
];

// ---- why HSK Chain

const HSK = [
  {
    t: "A licensed ecosystem",
    d: "HSK Chain comes from a licensed Hong Kong financial group. The managers, platforms and exchanges that most need a graded record for AI traders are already in its ecosystem.",
  },
  {
    t: "Audit trails for AI-run mandates",
    d: "A licensed manager running an AI strategy will need to show what the agent claimed, what it was allowed and what happened. The graded record is that trail, written before the outcome.",
  },
  {
    t: "HSKSwap liquidity and a TWAP to settle by",
    d: "Real pools for ETH, BTC and HSK against USDT, with a TWAP oracle the vault settles notes by. About $530k of USDT sits in the three pools today: small, but enough to prove the mechanism with real money.",
  },
  {
    t: "The first ERC-8004 registries there",
    d: "There was no ERC-8004 deployment on HSK Chain, so Avow deployed the identity and reputation registries. Every agent on the chain can now carry a reputation any client can read.",
  },
];

const REG_MAP = [
  {
    act: "Published notes",
    treat: "Records of the vault owner's own trades, published as they happen. Not recommendations to anyone else.",
    how: "Nothing is tailored to a reader, and every page carries the disclaimer that notes are records, not advice.",
  },
  {
    act: "Graded records and attestations",
    treat: "Data about agents' graded records. Using it to advise clients is advising on securities (Type 4) or asset management (Type 9).",
    how: "Licensed as data to SFC Type 4 and Type 9 holders for their own advisory use. Avow grades agents; it advises no one and recommends no agent.",
  },
  {
    act: "Exchange agent listings, planned",
    treat: "Data supplied to a licensed platform about the agents it chooses to list.",
    how: "The platform holds the licence and decides what to list. Avow supplies the grade and the method, the same to every reader.",
  },
  {
    act: "Vaults for third-party capital",
    treat: "Managing other people's money: asset management (Type 9).",
    how: "Offered only through licensed partners. Avow supplies the vault, the mandate and the record; the partner holds the licence and the client.",
  },
  {
    act: "Avow software",
    treat: "Non-custodial infrastructure: the owner holds the keys and writes the mandate.",
    how: "Avow never holds customer funds. The owner can withdraw anything not locked in an open note, at any time.",
  },
];

// ---- milestones, team, ask

const MILESTONES = [
  {
    when: "By Demo Day, Nov 4",
    tag: "Targets",
    items: ["Graded notes from all three agents, each posted as ERC-8004 reputation", "At least one outside agent entered in the league (planned)"],
  },
  {
    when: "Next 90 days",
    tag: "Targets",
    items: [
      "10 outside agents graded in the league",
      "3 allocators or platforms reading graded records in a pilot",
      "Notional-weighted grades and an independent price reference, live on mainnet",
    ],
  },
  {
    when: "Hiring",
    tag: "Planned",
    items: ["A business development and compliance lead, to work with licensed managers, platforms and exchanges", "An external audit before any third-party capital"],
  },
];

const BUILT = [
  "Three vaults live on HSK Chain mainnet: Avow, a Gemini model agent, and Bold and Fade, two rule baselines; $5 mandate caps and $1 Probation notes",
  "The AvowLeague registry, open to any vault owner; it stores no scores",
  "ERC-8004 identity and reputation registries on HSK Chain, the first there, with agents #1 to #3 registered",
  "AvowGrader, posting each settled note's grade as ERC-8004 feedback",
  "61 contract tests; an independent review, not an external audit, found 1 high, 3 medium and 4 low issues, all fixed",
  "A 30-day HSKSwap study, and a replay where one-sided strategies lost after fees",
  "About $26 in all to put it on mainnet",
];

const REPO = "https://github.com/RohanGlitched/avow";

const USE_OF_FUNDS = [
  { t: "Audit", d: "An external audit of the vault, league and grader contracts before any third-party capital" },
  { t: "Business development and compliance", d: "One hire to bring in outside agents, allocators and licensed partners" },
  { t: "Grading", d: "Notional-weighted grades, a skill score, an independent price reference and a dispute window" },
  { t: "Read API and SDK", d: "The API allocators and platforms pay for, and the open SDK any agent uses to be graded" },
];

export default async function BusinessPage() {
  const [s, league] = await Promise.all([getState(), getLeague()]);
  const graded = s.notes.filter((n) => n.sqError != null).sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  const t0 = s.contracts.deployBlock ? s.asOf - (s.block! - s.contracts.deployBlock) * 2 : graded[0]?.openedAt ?? s.asOf - 86400;
  const span = s.asOf - t0 || 1;
  const perTrade = noteUsd + gradeUsd + SETTLE_USD;

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / Business
          </div>
        </div>
        <div className="wrap hero__top" style={{ marginBottom: 0, alignItems: "start" }}>
          <div>
            <h1>The credit score for AI traders.</h1>
          </div>
          <div>
            <p className="lede">
              Every trade&apos;s stated confidence is graded on HSK Chain and published as ERC-8004 reputation, so any allocator, exchange or vault can size an agent by whether its
              confidence has ever meant anything.
            </p>
            <p className="biz-live">
              <i aria-hidden="true" />
              Live on HSK Chain mainnet: three graded vaults, an open league registry, and the first ERC-8004 registries on the chain.
            </p>
            <div className="actions">
              <Link href="/league" className="btn">
                See the league
              </Link>
              <a href="#ask" className="btn btn--ghost">
                Read the ask
              </a>
            </div>
          </div>
        </div>
        <div className="wrap">
          <div className="figures">
            <div className="figure">
              <div className="figure__label">Vaults on mainnet</div>
              <div className="figure__value">
                3<small>$5 caps, $1 Probation notes</small>
              </div>
              <p className="figure__note">Avow, a Gemini model agent, and Bold and Fade, two rule baselines it is ranked against.</p>
            </div>
            <div className="figure">
              <div className="figure__label">ERC-8004 agents</div>
              <div className="figure__value">
                #1–3<small>registered</small>
              </div>
              <p className="figure__note">Each settled note&apos;s grade is posted to the reputation registry under the tag avow-calibration.</p>
            </div>
            <div className="figure">
              <div className="figure__label">Revenue, customers, outside agents</div>
              <div className="figure__value">
                None yet<small>said plainly</small>
              </div>
              <p className="figure__note">Everything below marked planned is a plan. What is live is the mechanism, on real funds.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="problem">
        <div className="wrap">
          <SecHead id="problem" title="Allocators cannot tell whether an AI trader's confidence means anything.">
            More money is being handed to agents that say how sure they are. None of the evidence on offer can show whether that sureness has ever been right.
          </SecHead>
          <div className="slips">
            {PROBLEMS.map((p) => (
              <article className="slip" key={p.t} style={{ overflow: "hidden", paddingBottom: 54 }}>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, height: 30 }}>
                  <Crossing text="Not graded" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="sells">
        <div className="wrap">
          <SecHead id="sells" title="Being graded is free. Reading the grades is paid.">
            If agents paid to be graded, the grader would have a customer to please. So agents pay only gas, and the people who rely on the grade pay to read it. None of the pricing
            below is live; it is the plan.
          </SecHead>
          <div className="biz-free">
            <div className="biz-free__head">
              <h3>Free to be graded</h3>
              <p className="muted">
                Any agent can open a vault, swear its trades and be graded. No subscription, no fee per note. These are measured costs on HSK Chain mainnet, at {GAS_GWEI} gwei and HSK at $
                {HSK_USD}.
              </p>
            </div>
            <div className="figures" style={{ marginTop: 0, borderBottom: 0 }}>
              <div className="figure">
                <div className="figure__label">Swearing a note</div>
                <div className="figure__value">
                  ≈ {usd(noteUsd, { dp: 3 })}
                  <small>0.54M gas</small>
                </div>
                <p className="figure__note">The swap, the stored note and the full statement in one transaction.</p>
              </div>
              <div className="figure">
                <div className="figure__label">Posting its grade</div>
                <div className="figure__value">
                  ≈ {usd(gradeUsd, { dp: 3 })}
                  <small>0.15M gas</small>
                </div>
                <p className="figure__note">AvowGrader writes the grade to the ERC-8004 reputation registry.</p>
              </div>
              <div className="figure">
                <div className="figure__label">Settling it</div>
                <div className="figure__value">
                  ≈ {usd(SETTLE_USD, { dp: 3 })}
                  <small>paid by whoever settles</small>
                </div>
                <p className="figure__note">
                  About <b>{usd(perTrade, { dp: 2 })}</b> in all to make one trade graded and public, end to end.
                </p>
              </div>
            </div>
          </div>

          <h3 style={{ marginTop: 44, marginBottom: 14 }}>Paid to read, planned</h3>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Reader</th>
                  <th>What they read</th>
                  <th>Why they pay</th>
                  <th>Planned price</th>
                </tr>
              </thead>
              <tbody>
                {READERS.map((x) => (
                  <tr key={x.who} className={x.lead ? "price-lead" : undefined}>
                    <td data-h="Reader" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                      {x.who}
                      {x.lead ? <span className="sub price-lead__cap">First to build, planned</span> : null}
                    </td>
                    <td data-h="What they read">{x.reads}</td>
                    <td data-h="Why they pay" className="muted">
                      {x.why}
                    </td>
                    <td data-h="Planned price" style={{ fontWeight: 650 }}>
                      {x.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="plate">
            Planned, not live: no reader pays today, and no price has been tested with a customer. The grade is the same for every reader; paying buys access and reports, never a
            different number.
          </p>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="league">
        <div className="wrap">
          <SecHead id="league" title="The league is the product.">
            Three agents on mainnet today, ranked by tier, then Brier score, then graded notes. The AvowLeague registry is open: any vault owner can enter. It stores no scores; every
            figure is read from the agent&apos;s own vault.
          </SecHead>
          <div className="biz-grade">
            <div className="lg-formula" role="img" aria-label="grade equals 100 minus 100 times the square of stated odds minus outcome">
              <span className="lg-formula__lhs">grade</span> = 100 − 100 × <span className="lg-formula__nb">(stated odds − outcome)²</span>
            </div>
            <p className="muted">
              Posted by AvowGrader as ERC-8004 feedback for each settled note, tag avow-calibration. An agent&apos;s mean grade is 100 × (1 − Brier). An agent that says 90% and is
              right scores 99; one that says 90% and is wrong scores 19. <Link href="/league#erc8004">How any ERC-8004 client reads it</Link>.
            </p>
          </div>
          <LeagueTable league={league} compact />
        </div>
      </section>

      <section className="sec" aria-labelledby="gaming">
        <div className="wrap">
          <SecHead id="gaming" title="How the grade resists gaming, and where it does not yet.">
            A credit score is only worth what it costs to fake. Four things are enforced by the contracts today. Four known gaps are open, each with a planned fix.
          </SecHead>
          <h3 style={{ marginBottom: 14 }}>Enforced on chain today</h3>
          <div className="biz-enforced">
            {ENFORCED.map((x, i) => (
              <article key={x.t}>
                <span className="clause__n">{["I", "II", "III", "IV"][i]}</span>
                <div>
                  <h4>{x.t}</h4>
                  <p>{x.d}</p>
                </div>
              </article>
            ))}
          </div>
          <h3 style={{ marginTop: 44, marginBottom: 14 }}>Known open issues, and the planned fix</h3>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Open issue</th>
                  <th>Why it matters</th>
                  <th>Planned fix</th>
                </tr>
              </thead>
              <tbody>
                {OPEN_ISSUES.map((x) => (
                  <tr key={x.issue}>
                    <td data-h="Open issue" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                      {x.issue}
                    </td>
                    <td data-h="Why it matters" className="muted">
                      {x.why}
                    </td>
                    <td data-h="Planned fix">{x.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="plate">
            Our own research points the same way: in a <Link href="/record#replay">replay over 30 days of real HSKSwap swaps</Link>, one-sided strategies lost after fees. That is why the
            vault refuses notes that lose at their own odds, and why Avow trades rarely.
          </p>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="alternatives">
        <div className="wrap">
          <SecHead id="alternatives" title="Competition.">
            Others limit what an agent may do, or rank what it earned. None of them grade what it said it would do, at the odds it said it, before it did it.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>What it does</th>
                  <th>Where Avow differs</th>
                </tr>
              </thead>
              <tbody>
                {ALTERNATIVES.map((x) => (
                  <tr key={x.name}>
                    <td data-h="Who" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                      {x.name}
                      <span className="sub">{x.sub}</span>
                    </td>
                    <td data-h="What it does">{x.what}</td>
                    <td data-h="Where Avow differs" className="muted">
                      {x.gap}
                    </td>
                  </tr>
                ))}
                <tr className="earn__total">
                  <td data-h="Who" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                    Avow
                    <span className="sub">Live on HSK Chain mainnet</span>
                  </td>
                  <td data-h="What it does">Grades the stated confidence of every trade, sworn before the trade and settled by anyone.</td>
                  <td data-h="Where Avow differs" className="muted">
                    Binds each agent&apos;s trade limit to that grade inside its vault, and publishes the grade as ERC-8004 reputation any client can read.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="plate">Descriptions of others are from their public material and may be out of date; funding figures are as reported, not verified by us.</p>
        </div>
      </section>

      <section className="sec" aria-labelledby="moat">
        <div className="wrap grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2 id="moat">The moat is trust in the grader, not lock-in.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              The records are public and readable by any ERC-8004 client; an agent can take its history anywhere. Avow wins by being the grade everyone already reads, because nobody can
              bend it.
            </p>
          </div>
          <ol className="clauses" style={{ marginTop: 0 }}>
            {MOAT.map((x, i) => (
              <li key={x.t} className="clause" style={{ gridTemplateColumns: "44px minmax(0,1fr)", padding: "16px 0" }}>
                <span className="clause__n" style={{ fontSize: 22 }}>
                  {["I", "II", "III"][i]}
                </span>
                <div>
                  <span className="clause__text" style={{ fontSize: 20, display: "block" }}>
                    {x.t}
                  </span>
                  <p className="muted" style={{ fontSize: 15.5, marginTop: 4 }}>
                    {x.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {graded.length ? (
          <div className="wrap">
            <figure className="moat-fig" style={{ margin: "40px 0 0" }}>
              <svg viewBox="0 0 600 150" className="moat" role="img" aria-label={`${graded.length} graded notes on a timeline since ${day(t0)}; each is fixed at the time it was settled`}>
                <line x1="10" x2="590" y1="96" y2="96" stroke="var(--ink)" />
                {Array.from({ length: 31 }, (_, i) => (
                  <line key={i} x1={10 + i * (580 / 30)} x2={10 + i * (580 / 30)} y1={i % 5 === 0 ? 86 : 91} y2="96" stroke="var(--ink)" strokeWidth="0.8" />
                ))}
                {graded.map((n) => {
                  const x = 10 + (((n.settledAt ?? s.asOf) - t0) / span) * 580;
                  const hit = n.status === "honoured";
                  return (
                    <g key={n.id}>
                      <line x1={x} x2={x} y1={hit ? 46 : 60} y2="96" stroke={hit ? "var(--gilt)" : "var(--void)"} strokeWidth="2" />
                      <circle cx={x} cy={hit ? 46 : 60} r="4.5" fill={hit ? "var(--gilt)" : "var(--note)"} stroke={hit ? "var(--gilt)" : "var(--void)"} strokeWidth="1.5" />
                    </g>
                  );
                })}
                <text x="10" y="122" className="moat__lab">
                  {day(t0)}
                </text>
                <text x="590" y="122" textAnchor="end" className="moat__lab">
                  {day(s.asOf)}
                </text>
                <text x="590" y="24" textAnchor="end" className="moat__lab">
                  now: no gaps to fill, nothing to rewrite
                </text>
              </svg>
              <figcaption className="plate">
                Plate. The Avow vault&apos;s {graded.length} graded {graded.length === 1 ? "note" : "notes"}, each pinned to the block it was settled in. Gilt: honoured. Red: missed. The depth
                of a record is the one thing a newcomer cannot copy.
              </figcaption>
            </figure>
          </div>
        ) : null}
      </section>

      <section className="sec sec--tint" aria-labelledby="hsk">
        <div className="wrap">
          <SecHead id="hsk" title="Why HSK Chain.">
            The firms that will need a graded record for AI-run money are licensed, and many of them are here.
          </SecHead>
          <div className="grid-2" style={{ gap: "32px 56px" }}>
            {HSK.map((x) => (
              <div key={x.t} style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <h3>{x.t}</h3>
                <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 16 }}>{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="regulation">
        <div className="wrap">
          <SecHead id="regulation" title="Regulatory map.">
            Avow grades agents and publishes the grade. It does not take custody, advise anyone or manage anyone&apos;s money, which is what lets it plug into licensed firms rather than
            compete with them. How each activity is likely to be treated under Hong Kong SFC rules, and what Avow does about it:
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Likely treatment under Hong Kong SFC rules</th>
                  <th>How Avow handles it</th>
                </tr>
              </thead>
              <tbody>
                {REG_MAP.map((x) => (
                  <tr key={x.act}>
                    <td data-h="Activity" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                      {x.act}
                    </td>
                    <td data-h="Likely treatment">{x.treat}</td>
                    <td data-h="How Avow handles it" className="muted">
                      {x.how}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="plate">Not legal advice: a working map to take to counsel and to licensed partners, not a legal opinion.</p>
        </div>
      </section>

      <Divider seed="business-milestones" />

      <section className="sec" aria-labelledby="milestones">
        <div className="wrap">
          <SecHead id="milestones" title="Milestones.">
            Targets, not traction. Today there are three house agents and no outside ones; these are the numbers to hold Avow to.
          </SecHead>
          <div className="biz-miles">
            {MILESTONES.map((m, i) => (
              <article key={m.when} className={i === 0 ? "biz-miles--now" : undefined}>
                <span className="biz-miles__tag">{m.tag}</span>
                <h3>{m.when}</h3>
                <ul>
                  {m.items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="team">
        <div className="wrap grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2 id="team">Who builds Avow.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              <strong>Rohan Borade</strong>, builder, based in Mumbai, India. He ships hackathon products end to end: contracts, agents, sites and the video, alone.
            </p>
            <div className="actions">
              <a href={REPO} className="btn btn--ghost" target="_blank" rel="noreferrer">
                github.com/RohanGlitched/avow
              </a>
            </div>
          </div>
          <div>
            <h3 style={{ marginBottom: 12 }}>On the record, as of Oct 31, 2026</h3>
            <ul className="built">
              {BUILT.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="ask">
        <div className="wrap">
          <div className="charter" style={{ padding: "56px clamp(20px, 5vw, 64px) 52px" }}>
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <h2 id="ask">The ask.</h2>
                <p className="lede" style={{ marginTop: 14 }}>
                  <strong>Pre-seed, $150–250k for 18 months</strong> (to be agreed with HashKey Capital), and incubation with HSK Chain engineering: introductions to agent teams,
                  licensed managers and exchange listings that would read the grade.
                </p>
                <h3 style={{ marginTop: 26, fontSize: 20 }}>Use of funds, planned</h3>
                <ul className="uses">
                  {USE_OF_FUNDS.map((u) => (
                    <li key={u.t}>
                      <b>{u.t}</b>: {u.d}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ maxWidth: 200, margin: "0 auto 16px" }}>
                  <Rosette hash={seedHash("avow.world")} defer />
                </div>
                <p style={{ fontFamily: "var(--serif)", fontSize: 30 }}>avow.world</p>
                <p style={{ fontSize: 14.5 }}>
                  <a href={SITE.url}>{SITE.url.replace("https://", "")}</a>
                </p>
                <div className="actions" style={{ justifyContent: "center", marginTop: 18 }}>
                  <Link href="/league" className="btn">
                    See the league
                  </Link>
                  <Link href="/how#verify" className="btn btn--ghost">
                    Verify it yourself
                  </Link>
                </div>
              </div>
            </div>
            <div className="partners">
              <h3>Outside agents: open</h3>
              <p>
                Any agent on HSK Chain can be graded for the cost of gas. If you build one, <Link href="/league#enter">enter it in the league</Link>; it starts on Probation, like every
                agent, and its grade is posted as ERC-8004 reputation from its first settled note.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
