import type { Metadata } from "next";
import Link from "next/link";
import { getState } from "@/lib/data";
import { Guide } from "@/components/Guide";
import { SecHead, Divider } from "@/components/Bits";
import { ArchitectureDiagram, GuaranteeTable, AddressTable } from "@/components/HowParts";
import { FORK_TESTS_PASSING, GUARANTEES } from "@/lib/guarantees";
import { verifyCommands } from "@/lib/verify";
import { NETWORK_WORDS } from "@/lib/chain";
import { bps, duration, px } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How it works", description: "The Avow mechanism, the contract's guarantees and the tests behind them, every address, and commands to verify each claim." };

const RULES = [
  { name: "swear(note)", who: "Agent only", what: "Checks every mandate clause and standing clause, swaps through HSKSwap, records the note and emits the full statement. One transaction; if anything fails, nothing happens." },
  { name: "settle(id): Honoured", who: "Anyone", what: "Both the 5-minute TWAP and the live price are at or past the target. Closes the position with an exit slippage bound. Graded 1." },
  { name: "settle(id): Void", who: "Anyone", what: "Both the TWAP and the live price are at or past the void level. This is the permissionless stop-loss. Graded 0." },
  { name: "settle(id): Lapsed", who: "Anyone", what: "The expiry has passed. Always settles, whatever the price. Graded 0." },
  { name: "retract(id)", who: "Agent only", what: "Closes a note early. Graded 0, so retreating never improves the record." },
  { name: "tightenStop(id, void)", who: "Agent only", what: "Moves the void level toward the entry. Never away from it." },
  { name: "tighten(mandate)", who: "Agent only", what: "Every field equal or stricter, assets a subset. How the desk applies 'be more careful'." },
  { name: "amend(mandate)", who: "Owner only", what: "Any change, including looser ones. Signed by the owner's wallet." },
  { name: "revoke(id)", who: "Owner only", what: "Closes any note at once. Not graded: the owner's decision says nothing about Avow's judgement." },
  { name: "unfreeze()", who: "Owner only", what: "Re-opens a vault frozen by the drawdown clause." },
];

export default async function HowPage() {
  const s = await getState();
  const example = s.notes.find((n) => n.status === "void") ?? s.notes[0];
  const cmds = verifyCommands(s.notes[0] ?? null);
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="crumbs">
            <Link href="/">Avow</Link> / How it works
          </div>
          <h1>How a sworn note works, and how to check every claim.</h1>
          <p className="lede">
            Most AI trading bots ask to be trusted. Avow cannot trade except by publishing a falsifiable note, in the same transaction, through a vault that enforces its owner&apos;s rules. This page
            explains the mechanism, lists what the contract guarantees and how each guarantee is tested, and gives you the commands to verify it yourself.
          </p>
          <div className="actions">
            <a href="#verify" className="btn">
              Verify it yourself
            </a>
            <a href="#guarantees" className="btn btn--ghost">
              See the {GUARANTEES.length} guarantees
            </a>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="anatomy">
        <div className="wrap">
          <SecHead id="anatomy" title="Anatomy of a note.">
            This is {example.serial}, a note that went void. When the price crossed its void level the hidden VOID pantograph surfaced in red, the stop closed the position, and the miss was graded.
          </SecHead>
          <Guide note={example} state={s} />
        </div>
      </section>

      <section className="sec" aria-labelledby="rules">
        <div className="wrap">
          <SecHead id="rules" title="What each party may do.">
            Three roles. The owner holds the funds and writes the mandate. The agent can only swear, retract, tighten and settle. Anyone at all can settle a note that is due.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Who</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((r) => (
                  <tr key={r.name}>
                    <td data-h="Function" style={{ whiteSpace: "nowrap" }}>
                      <code>{r.name}</code>
                    </td>
                    <td data-h="Who" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      {r.who}
                    </td>
                    <td data-h="What it does" className="muted">
                      {r.what}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="grading">
        <div className="wrap grid-2">
          <div>
            <h2 id="grading">Grading, and why autonomy has to be earned.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              Each settled note adds (p − o)² to a rolling window of the last 32 graded notes, where p is the confidence Avow swore and o is 1 if honoured, 0 otherwise. The mean is the Brier
              score.
            </p>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th className="r">Denomination</th>
                  <th>Requirement</th>
                </tr>
              </thead>
              <tbody>
                {s.record.tiers.map((t) => (
                  <tr key={t.index}>
                    <td style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{t.name}</td>
                    <td className="r">
                      {Math.round(t.share * 100)}% <span className="sub">${t.capUsd} today</span>
                    </td>
                    <td className="muted">{t.requirement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="plate">Three consecutive voids drop one tier. Denomination is a share of the mandate&apos;s largest note.</p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="guarantees">
        <div className="wrap">
          <SecHead id="guarantees" title="Guarantees, where they are enforced, and the test that proves each.">
            {FORK_TESTS_PASSING} fork tests pass against real HSK Chain mainnet state: the real HSKSwap pools, tokens and prices, with the vault deployed on a local fork.
          </SecHead>
          <GuaranteeTable />
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="seatbelt">
        <div className="wrap">
          <SecHead id="seatbelt" title="Chainlink: checked by the agent, not the contract.">
            Chainlink feeds on HSK Chain are read-whitelisted; contracts get &ldquo;No access&rdquo;. So the vault judges only by the pool&apos;s own 5-minute TWAP and live price, and the agent
            refuses to swear when the pool is more than 3% from Chainlink or the feed is older than 26 hours.
          </SecHead>
          <div className="table-wrap">
            <table className="tbl tbl--stack">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="r">HSKSwap</th>
                  <th className="r">Chainlink</th>
                  <th className="r">Difference</th>
                  <th className="r">Feed age</th>
                  <th>Seatbelt</th>
                </tr>
              </thead>
              <tbody>
                {s.market.map((m) => {
                  const dev = m.dexPx && m.chainlinkPx ? ((m.dexPx - m.chainlinkPx) / m.chainlinkPx) * 1e4 : null;
                  const ok = dev != null && Math.abs(dev) <= 300 && (m.chainlinkAgeSec ?? Infinity) < 26 * 3600;
                  return (
                    <tr key={m.asset}>
                      <td data-h="Asset" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                        {m.label}
                      </td>
                      <td data-h="HSKSwap" className="r">
                        {px(m.asset, m.dexPx)}
                      </td>
                      <td data-h="Chainlink" className="r">
                        {px(m.asset, m.chainlinkPx)}
                      </td>
                      <td data-h="Difference" className="r">
                        {bps(dev, true)}
                      </td>
                      <td data-h="Feed age" className="r">
                        {m.chainlinkAgeSec != null ? duration(m.chainlinkAgeSec) : "—"}
                      </td>
                      <td data-h="Seatbelt" className={ok ? "pos" : "neg"} style={{ fontWeight: 650 }}>
                        {ok ? "passes" : "would refuse"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Divider seed="how-arch" />

      <section className="sec" aria-labelledby="architecture">
        <div className="wrap">
          <SecHead id="architecture" title="Architecture.">
            The agent runs on a server in Mumbai (asia-south1) every 30 seconds. The model chooses and words the note; deterministic guards check that its levels are the computed ones; the vault has
            the final word.
          </SecHead>
          <ArchitectureDiagram />
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="addresses">
        <div className="wrap">
          <SecHead id="addresses" title="Every address Avow touches.">
            {NETWORK_WORDS[s.network.mode].long} HSKSwap, token and Chainlink addresses are mainnet and link to the explorer.
          </SecHead>
          <AddressTable state={s} />
        </div>
      </section>

      <section className="sec" aria-labelledby="verify">
        <div className="wrap">
          <SecHead id="verify" title="Verify it yourself.">
            Every number on this site can be reproduced with Foundry&apos;s <code>cast</code> against the public RPC. Until the vault is on mainnet, <code>$VAULT</code> and{" "}
            <code>$DEPLOY_BLOCK</code> are placeholders.
          </SecHead>
          <div className="cmds">
            {cmds.map((c) => (
              <div className="cmd" key={c.q}>
                <div className="cmd__q">
                  {c.q} <span>{c.why}</span>
                </div>
                <pre>
                  <code>{c.cmd}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--tint" aria-labelledby="limits">
        <div className="wrap">
          <SecHead id="limits" title="Limits, stated plainly.">
            What Avow does not solve, and what we would watch on mainnet.
          </SecHead>
          <div className="grid-3">
            {[
              { t: "Thin pools", d: "HSKSwap pools trade every few hours. A 5-minute TWAP on a quiet pool can be moved by one large swap; requiring the live price to agree limits that, and notes stay small." },
              { t: "Oracle depth", d: "The WBTC pool keeps a single price observation until someone raises its cardinality. The vault refuses a TWAP it cannot read." },
              { t: "The model can be wrong", d: "That is the point. Every wrong note is graded, visible and costs Avow denomination. The contract does not trust the model; it bounds it." },
              { t: "Fees dominate small notes", d: "A round trip pays 0.60% in pool fees, so most premiums are declined and realised P&L is measured in cents at Probation size." },
              { t: "Off-chain reasons", d: "The rationale lives in the journal; only its hash is on chain. The statement itself, with every level, is on chain in full." },
              { t: "Rehearsal first", d: "The numbers on this site come from a fork of HSK mainnet. The same contracts and agent move to mainnet with the owner's funds." },
            ].map((x) => (
              <div key={x.t} style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <h3 style={{ fontSize: 20 }}>{x.t}</h3>
                <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 15.5 }}>{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
