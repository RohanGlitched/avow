import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { SecHead, Divider } from "@/components/Bits";
import { MandateRosette, Rosette } from "@/components/Rosette";
import { Crossing } from "@/components/Stamps";
import { seedHash } from "@/lib/rosette";
import { day, usd } from "@/lib/format";
import { GUARANTEES, TEST_SUMMARY } from "@/lib/guarantees";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Business",
  description: "Avow sells autonomy you can audit: vaults that hold AI agents to a written mandate on chain, grade every trade and let size grow only with a graded record.",
};

// Measured on HSK Chain mainnet, Oct 2026: 500 gwei gas, HSK ≈ $0.087.
const GAS_GWEI = 500;
const HSK_USD = 0.087;
const NOTE_GAS = 540_000;
const noteUsd = NOTE_GAS * GAS_GWEI * 1e-9 * HSK_USD;
const SETTLE_USD = 0.015;
const MODEL_USD = 0.001;

const PROBLEMS = [
  { t: "Track records are screenshots", d: "An agent's past returns arrive as an image or a spreadsheet. Nothing ties them to trades that really happened, at the size claimed, before the outcome was known." },
  { t: "Risk limits live in code you cannot see", d: "Position caps and stops sit inside the bot's own software. The person whose money it is has no way to check they exist, or that they held on a bad day." },
  { t: "A prompt can talk a bot into anything", d: "A language model told to be careful can be told the opposite. Rules written in a prompt are suggestions; an injected instruction or a bad day undoes them." },
];

const SELLS = [
  { t: "Held to a written mandate", d: "Assets, size, stop distance, slippage, horizon, daily loss and drawdown, checked by the vault contract before every swap." },
  { t: "Every trade sworn before it happens", d: "A falsifiable note in the same transaction as the swap: what will happen, by when, and at what price the agent admits it was wrong." },
  {
    t: "Every note graded on chain",
    d: "Settled by anyone, scored against the confidence the agent stated. The agent cannot swear a note that loses at the odds it publicly states; overstated odds are punished by the Brier grade and keep it on Probation. Retreat counts as a miss; nothing is deleted.",
  },
  { t: "Size earned, never granted", d: "The largest note an agent may write grows only with its graded record, and shrinks when it is wrong or overconfident." },
];

const CUSTOMERS = [
  {
    n: "I",
    who: "Agent builders and quant teams raising capital",
    get: "A track record nobody can fake: notes sworn before the outcome, graded by the contract. They open their own Avow vault with the open SDK.",
    pay: "A monthly subscription per agent vault, for mandate enforcement, grading and the record, plus a small fee per sworn note. Neither depends on whether the agent makes money.",
  },
  {
    n: "II",
    who: "Funds, family offices and institutions in the HashKey ecosystem",
    get: "Mandate compliance and an audit trail for AI-run strategies: which clause was checked, which attempt was refused, when, and by which rule.",
    pay: "A compliance and reporting subscription.",
  },
  {
    n: "III",
    who: "People who want an AI trader with hard, visible limits",
    get: "A vault they own, a mandate they wrote, every decision in the open, and a stop anyone can trigger.",
    pay: "Through a licensed partner: 25 bps a year on mandated capital, or a 10% performance fee on realised profit above the high-water mark.",
  },
];

const HSK = [
  { t: "Compliance first", d: "HSK Chain comes from a licensed financial group. The customers who most need an audited AI trader are already in its ecosystem." },
  { t: "HSKSwap liquidity", d: "Real pools for ETH, BTC and HSK against USDT, with a TWAP oracle the vault settles notes by." },
  { t: "Better prices for everyone", d: "When Avow does trade, its catch-up trades pull HSKSwap prices toward HashKey Global's. Every convergence note makes the DEX a little more accurate." },
  { t: "HSP for the next step", d: "HashKey's agent payment rail lets agents pay each other for sealed notes: agent-to-agent settlement of verified calls." },
];


// ---- Regulation, pricing, team and market (HashKey Capital is the reader; nothing here is an invented statistic)

const REG_MAP = [
  {
    act: "Published notes",
    treat: "Records of the vault owner's own trades, published as they happen. Not recommendations to anyone else.",
    how: "Nothing is tailored to a reader, and every page carries the disclaimer that notes are records, not advice.",
  },
  {
    act: "The Avow Index",
    treat: "Data about agents' graded records. Using it to advise clients is advising on securities (Type 4) or asset management (Type 9).",
    how: "Licensed as data to SFC Type 4 and Type 9 holders for their own advisory use. Avow itself advises no one.",
  },
  {
    act: "Performance-fee vaults for third parties",
    treat: "Managing other people's money: asset management (Type 9).",
    how: "Offered only through licensed partners. Avow supplies the vault, the mandate and the record; the partner holds the licence and the client.",
  },
  {
    act: "Avow software",
    treat: "Non-custodial infrastructure: the owner holds the keys and writes the mandate.",
    how: "Avow never holds customer funds. The owner can withdraw anything not locked in an open note, at any time.",
  },
];

// planned prices
const VAULT_SUB_LO = 49;
const VAULT_SUB_HI = 199;
const NOTE_FEE = 0.05;
const PERF_FEE = 0.1;
const AUM_FEE = 0.0025;
const ANNUAL_RETURN = 0.1;
const SUB_MONTH = 500;
const NOTES_PER_DAY = 10;

const PRICING = [
  {
    stream: "Vault subscription",
    lead: true,
    who: "Anyone running an AI agent in an Avow vault",
    price: `${"$"}${VAULT_SUB_LO}–${"$"}${VAULT_SUB_HI} per agent vault a month`,
    how: "The lead stream. Mandate enforcement, on-chain grading and the public record for one agent; the tier depends on the venues and the reporting it needs. Paid whether the agent wins or loses.",
  },
  { stream: "Note fee", who: "The same vaults, per sworn note", price: `${"$"}${NOTE_FEE.toFixed(2)} per sworn note`, how: "A minor line: taken by the vault when a note is sworn and routed to a treasury." },
  { stream: "Compliance and reporting", who: "Funds, family offices and institutions", price: `from ${"$"}${SUB_MONTH}/month`, how: "Mandate-compliance reports and an audit trail read from the vaults they use." },
  {
    stream: "Mandated capital",
    who: "Third-party capital, only through licensed partners",
    price: `${AUM_FEE * 1e4} bps a year, or ${PERF_FEE * 100}% above the high-water mark`,
    how: "Charged by the partner's vault: a small fee on capital under mandate, or a performance fee on realised profit only, never on losses or on recovering them.",
  },
];

const SCALES = [
  { name: "Pilot", agents: 20, aum: 1_000_000, inst: 2 },
  { name: "Growing", agents: 100, aum: 10_000_000, inst: 10 },
  { name: "Established", agents: 500, aum: 50_000_000, inst: 30 },
];
const earn = (sc: (typeof SCALES)[number]) => {
  const vaultLo = sc.agents * VAULT_SUB_LO * 12;
  const vaultHi = sc.agents * VAULT_SUB_HI * 12;
  const notes = sc.agents * NOTES_PER_DAY * 365 * NOTE_FEE;
  const subs = sc.inst * SUB_MONTH * 12;
  const aum = sc.aum * AUM_FEE;
  const perf = sc.aum * ANNUAL_RETURN * PERF_FEE;
  const steadyLo = vaultLo + notes + subs;
  const steadyHi = vaultHi + notes + subs;
  return { vaultLo, vaultHi, notes, subs, aum, perf, steadyLo, steadyHi, totalLo: steadyLo + aum, totalHi: steadyHi + aum };
};
const money = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 2 : 0)}M` : `$${Math.round(v).toLocaleString("en-US")}`);
const span2 = (a: number, b: number) => `${money(a)}–${money(b)}`;

const ALTERNATIVES = [
  { name: "Enzyme, dHEDGE", what: "Policy vaults: a manager trades within on-chain limits and asset allow-lists.", gap: "Limits, but no falsifiable claim before a trade and no grading after it." },
  { name: "Hyperliquid vaults", what: "Public vaults with a visible track record and P&L.", gap: "Discretionary trading; nothing is claimed before a trade, so nothing can be graded." },
  { name: "Recall agent competitions", what: "Rank AI agents by P&L in time-boxed trading contests.", gap: "A leaderboard in a contest, not graded promises inside a live vault with a mandate." },
  { name: "Numerai", what: "Data scientists stake on their predictions and are paid on performance.", gap: "Models and predictions live off chain; the stake is on a signal, not on a trade the stake executes." },
  { name: "Giza, Almanak", what: "Frameworks for building and running autonomous on-chain agents.", gap: "They execute; they do not grade the agent's claims on chain. Avow can sit under such an agent as its vault." },
];

const BUILT = [
  `A vault contract with ${GUARANTEES.length} guarantees, each with the test that proves it`,
  `${TEST_SUMMARY}, run on a fork of HSK mainnet`,
  "An autonomous agent running on Google Cloud, with a public journal, a desk and an MCP server",
  "Built Oct 31 to Nov 1, 2026",
];

const REPO = "https://github.com/RohanGlitched/avow";
const APPLY = `${REPO}/issues/new?title=${encodeURIComponent("Apply for an Avow vault")}`;

const USE_OF_FUNDS = [
  { t: "Audit", d: "An external audit of the vault contract before any third-party capital" },
  { t: "A quant and DeFi engineer", d: "Strategy research, venue adapters and the grading pipeline" },
  { t: "Partnerships", d: "HashKey-licensed managers and agent teams, the route to mandated capital" },
  { t: "SDK and Index", d: "The open SDK any agent can use, and the Avow Index allocators read" },
];

const TARGETS = [
  { when: "Q1 2027", n: "SDK + 5", what: "the open SDK, and 5 external agent vaults", note: "agents built by other teams, each with its own mandate" },
  { when: "Q2 2027", n: "$250k", what: "mandated, and the Avow Index live", note: "capital under mandate in Avow vaults, through licensed partners" },
  { when: "Q4 2027", n: "20 · $1M · 5,000", what: "vaults, mandated capital, graded notes", note: "settled and graded on HSK Chain mainnet, across all vaults" },
];

const REACH = [
  {
    t: "HSKSwap, today",
    tag: "Reference implementation",
    d: "The vault on this site: the mandate enforced by the contract, every trade sworn in the same transaction, graded by the pool's own TWAP. Everything else is built from it.",
  },
  {
    t: "Any EVM DEX",
    tag: "Planned",
    d: "The same vault contract, pointed at another router and its oracle. Mandate, notes and grading carry over unchanged.",
  },
  {
    t: "HashKey Global and HashKey Exchange",
    tag: "Planned",
    d: "AI agents trading through API sub-accounts: the mandate attested on HSK Chain and held by the sub-account's permissions, each order preceded by a sworn note and graded against the venue's own prices.",
  },
  {
    t: "Licensed asset managers",
    tag: "Planned",
    d: "Managers running AI strategies for clients get mandate attestation and a graded record they can put in front of clients and regulators, without handing custody to anyone.",
  },
];

const ROADMAP = [
  { when: "Nov 2026", what: "Mainnet vault live on HSK Chain", detail: "The agent you see on this site trades real funds under its mandate. HSK Chain Horizon Hackathon." },
  { when: "Q1 2027", what: "Open SDK and the first external vaults", detail: "Any agent can open an Avow vault on a monthly subscription. Target: 5 external vaults." },
  { when: "Q2 2027", what: "The Avow Index and an allocator dashboard", detail: "Agents ranked by calibration and realised P&L, read straight from their vaults. Target: $250k mandated through licensed partners." },
  { when: "Q4 2027", what: "Beyond HSKSwap", detail: "Mandate attestation for agents on HashKey exchange sub-accounts and other EVM DEXs. Target: 20 vaults, $1M mandated, 5,000 graded notes." },
  { when: "Then", what: "Sealed notes over HSP", detail: "Agents sell their sworn notes to each other before they settle; payment and settlement on HashKey's rail." },
];

export default async function BusinessPage() {
  const s = await getState();
  const r = s.record;
  const graded = s.notes.filter((n) => n.sqError != null).sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  const t0 = s.contracts.deployBlock ? s.asOf - (s.block! - s.contracts.deployBlock) * 2 : graded[0]?.openedAt ?? s.asOf - 86400;
  const span = s.asOf - t0 || 1;
  const perTrade = noteUsd + SETTLE_USD + MODEL_USD;

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
            <h1>Autonomy you can audit.</h1>
          </div>
          <div>
            <p className="lede">
              AI agents are starting to manage money, and nobody can verify them. Avow sells vaults that hold an agent to a written mandate on chain, publish every trade as a falsifiable note
              before it happens, grade it, and let the agent&apos;s allowed size grow only with its graded record.
            </p>
            <div className="actions">
              <a href="#ask" className="btn">
                Read the ask
              </a>
              <Link href="/" className="btn btn--ghost">
                See the live vault
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="problem">
        <div className="wrap">
          <SecHead id="problem" title="Three things nobody can verify today.">
            Every one of them is a promise made in a medium that cannot hold a promise: an image, private code, a prompt.
          </SecHead>
          <div className="slips">
            {PROBLEMS.map((p) => (
              <article className="slip" key={p.t} style={{ overflow: "hidden", paddingBottom: 54 }}>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, height: 30 }}>
                  <Crossing text="Not verifiable" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="sells">
        <div className="wrap grid-2" style={{ alignItems: "center" }}>
          <div>
            <h2 id="sells">What Avow sells.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              A vault, not a bot. Any agent can sit behind it; the vault decides what the agent may do and keeps the record no one can rewrite.
            </p>
            <ol className="clauses" style={{ marginTop: 18 }}>
              {SELLS.map((x, i) => (
                <li key={x.t} className="clause" style={{ gridTemplateColumns: "44px minmax(0,1fr)", padding: "16px 0" }}>
                  <span className="clause__n" style={{ fontSize: 22 }}>
                    {["I", "II", "III", "IV"][i]}
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
          <div style={{ maxWidth: 440, width: "100%", justifySelf: "center" }}>
            <MandateRosette mandate={s.mandate} defer label="The live vault's mandate rosette" />
            <p className="plate" style={{ textAlign: "center" }}>
              Plate. The live vault&apos;s mandate, drawn from its clauses. Every customer&apos;s vault prints its own.
            </p>
          </div>
        </div>
      </section>

      <Divider seed="business-customers" />

      <section className="sec" aria-labelledby="customers">
        <div className="wrap">
          <SecHead id="customers" title="Who pays, and for what.">
            Three customers, one product. Each pays for the same thing in a different form: a promise that can be checked.
          </SecHead>
          <div className="bonds">
            {CUSTOMERS.map((c) => (
              <article className="bond" key={c.n}>
                <div className="tiernote__band" aria-hidden="true" />
                <div className="bond__top">
                  <span className="bond__n">{c.n}</span>
                  <Rosette hash={seedHash("customer" + c.n)} defer only={[1, 2, 4]} />
                </div>
                <h3>{c.who}</h3>
                <dl>
                  <dt>What they get</dt>
                  <dd>{c.get}</dd>
                  <dt>How they pay</dt>
                  <dd>{c.pay}</dd>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="regulation">
        <div className="wrap">
          <SecHead id="regulation" title="Regulatory map.">
            Avow enforces a mandate; the vault itself keeps the record. Avow does not take custody and it does not manage anyone&apos;s money, which is what lets it plug into licensed firms rather than
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

      <section className="sec" aria-labelledby="pricing">
        <div className="wrap">
          <SecHead id="pricing" title="Pricing, planned.">
            Led by a monthly subscription per agent vault; none of it is live yet. The vault subscription, the note fee and compliance reporting do not depend on any agent&apos;s trading
            returns. The second table is arithmetic on those prices at three sizes, not a forecast.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Stream</th>
                  <th>Who pays</th>
                  <th>Planned price</th>
                  <th>How it is collected</th>
                </tr>
              </thead>
              <tbody>
                {PRICING.map((x) => (
                  <tr key={x.stream} className={"lead" in x && x.lead ? "price-lead" : undefined}>
                    <td data-h="Stream" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                      {x.stream}
                      {"lead" in x && x.lead ? <span className="sub price-lead__cap">Lead stream, planned</span> : null}
                    </td>
                    <td data-h="Who pays">{x.who}</td>
                    <td data-h="Planned price" style={{ fontWeight: 650, whiteSpace: "nowrap" }}>
                      {x.price}
                    </td>
                    <td data-h="How it is collected" className="muted">
                      {x.how}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="illus">
            <span>Illustrative arithmetic:</span> at 20 agent vaults × ${VAULT_SUB_LO}–${VAULT_SUB_HI} a month, the subscription is {span2(20 * VAULT_SUB_LO * 12, 20 * VAULT_SUB_HI * 12)} a year;
            at 500 vaults it is {span2(500 * VAULT_SUB_LO * 12, 500 * VAULT_SUB_HI * 12)}. The note fee adds {money(20 * NOTES_PER_DAY * 365 * NOTE_FEE)} a year at 20 vaults.
          </p>
          <h3 style={{ marginTop: 40, marginBottom: 14 }}>What each would earn in a year, at three sizes</h3>
          <div className="table-wrap">
            <table className="tbl tbl--stack earn">
              <thead>
                <tr>
                  <th>Illustrative</th>
                  {SCALES.map((sc) => (
                    <th key={sc.name} className="r">
                      {sc.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-h="Stream">Vault subscriptions</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{span2(earn(sc).vaultLo, earn(sc).vaultHi)}</b>
                      <span className="sub">
                        {sc.agents.toLocaleString("en-US")} vaults × ${VAULT_SUB_LO}–${VAULT_SUB_HI} × 12
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td data-h="Stream">Note fee</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{money(earn(sc).notes)}</b>
                      <span className="sub">
                        {sc.agents.toLocaleString("en-US")} vaults × {NOTES_PER_DAY} notes a day × 365 × ${NOTE_FEE.toFixed(2)}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td data-h="Stream">Compliance subscriptions</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{money(earn(sc).subs)}</b>
                      <span className="sub">
                        {sc.inst} institutions × ${SUB_MONTH} × 12
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="earn__total">
                  <td data-h="Stream">Independent of trading returns</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{span2(earn(sc).steadyLo, earn(sc).steadyHi)}</b>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td data-h="Stream">Mandated capital, via partners</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{money(earn(sc).aum)}</b>
                      <span className="sub">
                        {money(sc.aum)} × {AUM_FEE * 1e4} bps; or {money(earn(sc).perf)} as a {PERF_FEE * 100}% performance fee on a {ANNUAL_RETURN * 100}% year
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="earn__total">
                  <td data-h="Stream">In all, per year, at 25 bps</td>
                  {SCALES.map((sc) => (
                    <td key={sc.name} data-h={sc.name} className="r">
                      <b>{span2(earn(sc).totalLo, earn(sc).totalHi)}</b>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="plate">
            Illustrative arithmetic only: the prices are planned, the sizes are chosen to show scale, and fees on mandated capital are gross, before any licensed partner&apos;s share. None of it is
            revenue today.
          </p>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="index">
        <div className="wrap">
          <SecHead id="index" title="The Avow Index, planned.">
            A public ranking of agents by calibration and realised P&amp;L, read straight from their vaults. It is the data product allocators use to choose an agent. One vault exists today; its row
            below is live. There are no placeholder agents: the next row is yours to apply for.
          </SecHead>
          <div className="index-sheet">
            <div className="table-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="r">Graded notes</th>
                    <th className="r">Brier, rolling</th>
                    <th className="r">Realised (on chain)</th>
                    <th>Trade limit</th>
                    <th>On chain since</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-h="Agent" style={{ fontFamily: "var(--serif)", fontSize: 20 }}>
                      Avow, this vault{s.network.mode === "fork-rehearsal" ? <span className="sub">rehearsal fork</span> : null}
                    </td>
                    <td data-h="Graded notes" className="r">
                      {r.graded}
                    </td>
                    <td data-h="Brier, rolling" className="r" style={{ fontWeight: 650 }}>
                      {r.brier?.toFixed(3) ?? "—"}
                    </td>
                    <td data-h="Realised (on chain)" className={`r ${r.pnlUsd >= 0 ? "pos" : "neg"}`}>
                      {usd(r.pnlUsd, { sign: true })}
                    </td>
                    <td data-h="Trade limit">
                      {r.tier.name}, {usd(r.tier.capUsd, { dp: 0 })}
                    </td>
                    <td data-h="On chain since">{day(t0)}</td>
                  </tr>
                  <tr className="index-open">
                    <td data-h="Agent" colSpan={6}>
                      <a href={APPLY} target="_blank" rel="noreferrer">
                        Apply for a vault
                      </a>{" "}
                      <span className="muted">for your agent: it starts on Probation, like every agent, and earns its row here.</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="specimen-over" aria-hidden="true">
              <span>SPECIMEN</span>
            </div>
          </div>
          <p className="plate">Plate. A specimen of the index. Ranks are computed by anyone from the vaults themselves; Avow cannot edit a row.</p>
        </div>
      </section>

      <section className="sec" aria-labelledby="hsk">
        <div className="wrap">
          <SecHead id="hsk" title="Why HSK Chain.">
            The customers, the liquidity and the payment rail are already here.
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

      <section className="sec sec--tint" aria-labelledby="alternatives">
        <div className="wrap">
          <SecHead id="alternatives" title="Market and alternatives.">
            The honest beachhead is small. HSKSwap&apos;s three USDT pools hold about <strong>$530k</strong> of USDT today: about $436k in the WHSK pool, $48k in WETH and $50k in WBTC. That
            is enough to prove the mechanism with real money; the product is the vault and the record, which travel to larger venues.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Alternative</th>
                  <th>What it does well</th>
                  <th>What it does not do</th>
                </tr>
              </thead>
              <tbody>
                {ALTERNATIVES.map((x) => (
                  <tr key={x.name}>
                    <td data-h="Alternative" style={{ fontFamily: "var(--serif)", fontSize: 19, whiteSpace: "nowrap" }}>
                      {x.name}
                    </td>
                    <td data-h="What it does well">{x.what}</td>
                    <td data-h="What it does not do" className="muted">
                      {x.gap}
                    </td>
                  </tr>
                ))}
                <tr className="earn__total">
                  <td data-h="Alternative" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                    Avow
                  </td>
                  <td data-h="What it does well">A falsifiable note sworn in the same transaction as every trade, inside a vault that enforces the owner&apos;s mandate.</td>
                  <td data-h="What it does not do" className="muted">
                    Each note is graded on chain against its stated odds, and the trade limit grows only with that graded record.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="reach">
        <div className="wrap">
          <SecHead id="reach" title="Where this goes.">
            HSKSwap is where the mechanism is proven, not where it stops. The opportunity is mandate attestation and graded records for AI agents trading wherever HashKey operates: HashKey
            Global and HashKey Exchange API sub-accounts, licensed asset managers running AI strategies, and any EVM DEX. The HSKSwap vault is the reference implementation every other venue is built
            from. The same customer pays the same subscription whichever venue its agent trades on.
          </SecHead>
          <div className="reach">
            {REACH.map((x, i) => (
              <article key={x.t} className={`reach__item${i === 0 ? " reach__item--now" : ""}`}>
                <span className="reach__tag">{x.tag}</span>
                <h3>{x.t}</h3>
                <p>{x.d}</p>
              </article>
            ))}
          </div>
          <p className="plate">Plans, not traction: only the HSKSwap vault exists today. No market size is claimed here; the venues are named so the reader can size them.</p>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="moat">
        <div className="wrap grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2 id="moat">The moat is the format, and where the record lives.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              A competitor can copy the contracts in a day. What is hard to copy is being the format everyone already reads, inside the reports they already send, with records that cannot
              be moved.
            </p>
          </div>
          <ol className="clauses" style={{ marginTop: 0 }}>
            {[
              {
                t: "The standard mandate and grading format on HSK Chain",
                d: "One way to write a mandate and one way to grade an agent, so allocators compare every agent on the same terms.",
              },
              {
                t: "Inside licensed managers' reporting",
                d: "Mandate compliance and graded records flow into the reports HashKey-licensed managers already produce for their clients and regulators.",
              },
              {
                t: "Switching costs",
                d: "A graded record lives only in its vault, sworn before each outcome. An agent that leaves Avow starts again at Probation.",
              },
            ].map((x, i) => (
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
                Plate. This vault&apos;s {graded.length} graded {graded.length === 1 ? "note" : "notes"}, each pinned to the block it was settled in. Gilt: honoured. Red: missed. None can be moved
                to another vault.
              </figcaption>
            </figure>
          </div>
        ) : null}
      </section>

      <section className="sec" aria-labelledby="roadmap">
        <div className="wrap">
          <SecHead id="roadmap" title="Roadmap.">
            In order, with nothing promised that is not already being built.
          </SecHead>
          <ol className="timeline">
            {ROADMAP.map((x, i) => (
              <li key={x.when} className={i === 0 ? "is-now" : undefined}>
                <span className="timeline__when">{x.when}</span>
                <h3>{x.what}</h3>
                <p>{x.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="economics">
        <div className="wrap">
          <SecHead id="economics" title="Verification is cheap enough to run on every trade.">
            Current measurements on HSK Chain mainnet, not projections: gas at {GAS_GWEI} gwei and HSK at ${HSK_USD}.
          </SecHead>
          <div className="figures" style={{ marginTop: 0 }}>
            <div className="figure">
              <div className="figure__label">Swearing a note</div>
              <div className="figure__value">
                ≈ {usd(noteUsd, { dp: 3 })}
                <small>0.54M gas</small>
              </div>
              <p className="figure__note">The swap, the stored note and the full statement in one transaction.</p>
            </div>
            <div className="figure">
              <div className="figure__label">Settling and grading it</div>
              <div className="figure__value">
                ≈ {usd(SETTLE_USD, { dp: 3 })}
                <small>paid by whoever settles</small>
              </div>
              <p className="figure__note">The closing swap, the outcome and the Brier update.</p>
            </div>
            <div className="figure">
              <div className="figure__label">One model decision</div>
              <div className="figure__value">
                ≈ {usd(MODEL_USD, { dp: 3 })}
                <small>Gemini 3.5 Flash</small>
              </div>
              <p className="figure__note">
                About <b>{usd(perTrade, { dp: 2 })}</b> in all to make one trade verifiable end to end.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="team">
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
            <h3 style={{ marginBottom: 12 }}>This week, on the record</h3>
            <ul className="built">
              {BUILT.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="ask">
        <div className="wrap">
          <div className="charter" style={{ padding: "56px clamp(20px, 5vw, 64px) 52px" }}>
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <h2 id="ask">The ask.</h2>
                <p className="lede" style={{ marginTop: 14 }}>
                  <strong>Pre-seed, $150–250k for 18 months</strong> (to be agreed with HashKey Capital), and incubation with HSK Chain engineering.
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
                  <Link href="/" className="btn">
                    See the live vault
                  </Link>
                  <Link href="/how#verify" className="btn btn--ghost">
                    Verify it yourself
                  </Link>
                </div>
              </div>
            </div>
            <h3 style={{ marginTop: 36, fontSize: 20 }}>Milestones, as targets</h3>
            <div className="targets">
              {TARGETS.map((t) => (
                <div className="target" key={t.what}>
                  <span className="target__cap">Target · {t.when}</span>
                  <b>{t.n}</b>
                  <span style={{ color: "var(--ink)", fontWeight: 600 }}>{t.what}</span>
                  <span>{t.note}</span>
                </div>
              ))}
            </div>
            <p className="plate">Targets, not traction: today there is one vault, this one, and its mainnet record starts on Nov 1.</p>
            <div className="partners">
              <h3>Design partners: open</h3>
              <p>
                We are speaking with HSK Chain agent teams at the Horizon hackathon. If you build an agent and want a record nobody can fake, <a href={APPLY} target="_blank" rel="noreferrer">apply for a vault</a>; it starts on Probation, like every agent.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
