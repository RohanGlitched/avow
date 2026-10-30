import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { SecHead, Divider } from "@/components/Bits";
import { MandateRosette, Rosette } from "@/components/Rosette";
import { Crossing } from "@/components/Stamps";
import { seedHash } from "@/lib/rosette";
import { day, usd } from "@/lib/format";

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
  { t: "Every note graded on chain", d: "Settled by anyone, scored against the confidence the agent stated. Retreat counts as a miss; nothing is deleted." },
  { t: "Size earned, never granted", d: "The largest note an agent may write grows only with its graded record, and shrinks when it is wrong or overconfident." },
];

const CUSTOMERS = [
  {
    n: "I",
    who: "People who want an AI trader with hard, visible limits",
    get: "A vault they own, a mandate they wrote, every decision in the open, and a stop anyone can trigger.",
    pay: "A performance fee only on realised profit above the high-water mark. Planned at 10%.",
  },
  {
    n: "II",
    who: "Agent builders and quant teams raising capital",
    get: "A track record nobody can fake: notes sworn before the outcome, graded by the contract. They open their own Avow vault with the open SDK.",
    pay: "A listing and verification fee for each agent vault.",
  },
  {
    n: "III",
    who: "Funds, family offices and institutions in the HashKey ecosystem",
    get: "Mandate compliance and an audit trail for AI-run strategies: which clause was checked, which attempt was refused, when, and by which rule.",
    pay: "A compliance and reporting subscription.",
  },
];

const HSK = [
  { t: "Compliance first", d: "HSK Chain comes from a licensed financial group. The customers who most need an audited AI trader are already in its ecosystem." },
  { t: "HSKSwap liquidity", d: "Real pools for ETH, BTC and HSK against USDT, with a TWAP oracle the vault can judge notes by." },
  { t: "Better prices for everyone", d: "Avow's catch-up trades pull HSKSwap prices toward HashKey Global's. Every convergence note makes the DEX a little more accurate." },
  { t: "HSP for the next step", d: "HashKey's agent payment rail lets agents pay each other for sealed notes: agent-to-agent settlement of verified calls." },
];

const ROADMAP = [
  { when: "Nov 2026", what: "Mainnet vault live on HSK Chain", detail: "The agent you see on this site trades real funds under its mandate. HSK Chain Horizon Hackathon." },
  { when: "Dec 2026", what: "Open SDK and performance-fee module", detail: "Any agent can open an Avow vault; owners pay only on profit above the high-water mark." },
  { when: "Q1 2027", what: "The Avow Index and an allocator dashboard", detail: "Agents ranked by calibration and realised P&L, read straight from their vaults." },
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

      <section className="sec sec--tint" aria-labelledby="index">
        <div className="wrap">
          <SecHead id="index" title="The Avow Index, planned.">
            A public ranking of agents by calibration and realised P&amp;L, read straight from their vaults. It is the data product allocators use to choose an agent. One vault exists today; its row
            below is live.
          </SecHead>
          <div className="index-sheet">
            <div className="table-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="r">Graded notes</th>
                    <th className="r">Brier, rolling</th>
                    <th className="r">Realised P&amp;L</th>
                    <th>Denomination</th>
                    <th>On chain since</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-h="Agent" style={{ fontFamily: "var(--serif)", fontSize: 20 }}>
                      Avow, this vault
                    </td>
                    <td data-h="Graded notes" className="r">
                      {r.graded}
                    </td>
                    <td data-h="Brier, rolling" className="r" style={{ fontWeight: 650 }}>
                      {r.brier?.toFixed(3) ?? "—"}
                    </td>
                    <td data-h="Realised P&L" className={`r ${r.pnlUsd >= 0 ? "pos" : "neg"}`}>
                      {usd(r.pnlUsd, { sign: true })}
                    </td>
                    <td data-h="Denomination">
                      {r.tier.name}, {usd(r.tier.capUsd, { dp: 0 })}
                    </td>
                    <td data-h="On chain since">{day(t0)}</td>
                  </tr>
                  {[1, 2, 3].map((i) => (
                    <tr key={i} className="index-open">
                      <td data-h="Agent" className="muted">
                        Open seat for an agent built on the SDK
                      </td>
                      <td data-h="Graded notes" className="r muted">
                        —
                      </td>
                      <td data-h="Brier, rolling" className="r muted">
                        —
                      </td>
                      <td data-h="Realised P&L" className="r muted">
                        —
                      </td>
                      <td data-h="Denomination" className="muted">
                        Probation
                      </td>
                      <td data-h="On chain since" className="muted">
                        —
                      </td>
                    </tr>
                  ))}
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

      <section className="sec sec--tint" aria-labelledby="moat">
        <div className="wrap grid-2" style={{ alignItems: "center" }}>
          <div>
            <h2 id="moat">The moat is time on chain.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              A graded record cannot be transferred, bought or backfilled. A competitor can copy the contracts in a day; it cannot copy a year of notes sworn before their outcomes. Every graded
              agent makes the index more valuable to the allocators who read it.
            </p>
          </div>
          <figure style={{ margin: 0 }}>
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
            <figcaption className="plate">Plate. This vault&apos;s {graded.length} graded notes, each pinned to the block it was settled in. Gilt: honoured. Red: missed.</figcaption>
          </figure>
        </div>
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

      <section className="sec" aria-labelledby="ask">
        <div className="wrap">
          <div className="charter" style={{ padding: "56px clamp(20px, 5vw, 64px) 52px" }}>
            <div className="grid-2" style={{ alignItems: "center" }}>
              <div>
                <h2 id="ask">The ask.</h2>
                <ol className="clauses" style={{ marginTop: 18 }}>
                  {[
                    "Incubation with HashKey: HSK Chain engineering and HashKey Capital.",
                    "A seed round to ship the open SDK and the Avow Index.",
                    "First agent partners: teams who want a record nobody can fake.",
                  ].map((t, i) => (
                    <li key={t} className="clause" style={{ gridTemplateColumns: "40px minmax(0,1fr)", padding: "14px 0" }}>
                      <span className="clause__n" style={{ fontSize: 22 }}>
                        {["I", "II", "III"][i]}
                      </span>
                      <span className="clause__text" style={{ fontSize: 19.5 }}>
                        {t}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ maxWidth: 220, margin: "0 auto 18px" }}>
                  <Rosette hash={seedHash("avow.world")} defer />
                </div>
                <p style={{ fontFamily: "var(--serif)", fontSize: 30 }}>avow.world</p>
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
          </div>
        </div>
      </section>
    </>
  );
}
