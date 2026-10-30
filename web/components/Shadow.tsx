// The shadow ledger: every candidate the rules produced, sworn or declined, entered at the real HSK mainnet pool price
// and graded live against real mainnet prices by the vault's own settlement rules. It is what makes "declining" a
// measurable decision rather than a claim: each refusal gets the grade it would have earned.
import Link from "next/link";
import { pct, time, day, usd } from "@/lib/format";
import type { Shadow, ShadowRow } from "@/lib/types";

const ASSET: Record<string, string> = { WETH: "ETH", WBTC: "BTC", WHSK: "HSK" };
const DP: Record<string, number> = { WETH: 2, WBTC: 0, WHSK: 5 };
const nf = (dp: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const price = (sym: string, v: number | undefined) => (v == null || !Number.isFinite(v) ? "—" : nf(DP[sym] ?? 2).format(v));

const STATUS: Record<ShadowRow["status"], { word: string; cls: string }> = {
  open: { word: "open", cls: "outstanding" },
  honoured: { word: "honoured", cls: "honoured" },
  void: { word: "void", cls: "void" },
  lapsed: { word: "lapsed", cls: "lapsed" },
};
const DECISION: Record<ShadowRow["decision"], string> = { sworn: "sworn", declined: "declined", passed: "passed" };

/** Money in this ledger is hypothetical except for sworn rows: gains in gilt, losses in plain ink with a sign. */
function Money({ v, dp = 2 }: { v: number | undefined; dp?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="muted">—</span>;
  return <span className={v > 0 ? "pos" : undefined}>{usd(v, { sign: true, dp: v !== 0 && Math.abs(v) < 1 ? 3 : dp })}</span>;
}

/** The refusal figure, framed honestly whichever way it falls. */
export function refusedWords(v: number): { cap: string; value: string; tone: "gilt" | "ink"; line: string } {
  if (v < 0) return { cap: "Loss avoided by refusing", value: usd(-v, { dp: Math.abs(v) < 1 ? 3 : 2 }), tone: "gilt", line: "what the candidates Avow declined have lost so far, graded against real mainnet prices" };
  if (v > 0)
    return {
      cap: "Missed gain by refusing",
      value: usd(v, { dp: Math.abs(v) < 1 ? 3 : 2 }),
      tone: "ink",
      line: "what the candidates Avow declined would have made so far. Declining cost it this; the record shows it",
    };
  return { cap: "Declined candidates, graded", value: usd(0), tone: "ink", line: "nothing declined has settled yet, so no loss avoided or gain missed so far" };
}

function Table({ rows, compact }: { rows: ShadowRow[]; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className={`tbl tbl--stack shadow-tbl${compact ? " tbl--compact" : ""}`}>
        <thead>
          <tr>
            <th>Seen (IST)</th>
            <th>Asset</th>
            <th>Side and kind</th>
            <th className="r">Entry → target / void</th>
            <th>Decision</th>
            <th>Status</th>
            <th className="r">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-h="Seen (IST)" className="tnum">
                {time(r.t)}
                <span className="sub">{day(r.t)}</span>
              </td>
              <td data-h="Asset" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                {ASSET[r.sym] ?? r.sym}
              </td>
              <td data-h="Side and kind">
                {r.side}
                <span className="sub">{r.kind}</span>
              </td>
              <td data-h="Entry → target / void" className="r tnum">
                {price(r.sym, r.entry)} → {price(r.sym, r.target)}
                <span className="sub">
                  void {price(r.sym, r.void)}; break-even {pct(r.pMin)}
                </span>
              </td>
              <td data-h="Decision">
                <span className={`shadow-dec shadow-dec--${r.decision}`}>{DECISION[r.decision]}</span>
              </td>
              <td data-h="Status">
                <span className={`status status--${STATUS[r.status].cls}`}>{STATUS[r.status].word}</span>
                {r.status !== "open" && r.exitPx != null ? <span className="sub">exit {price(r.sym, r.exitPx)}</span> : null}
              </td>
              <td data-h="P&L" className="r tnum" style={{ fontWeight: 650 }}>
                {r.status === "open" ? <span className="muted">open</span> : <Money v={r.pnlUsd} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY = "The first candidates appear here as the agent sees them; each is graded against real mainnet prices.";

/** Counts, the refusal figure and the recent rows. `compact` is the home-page block. */
export function ShadowLedger({ shadow, compact = false }: { shadow: Shadow; compact?: boolean }) {
  const c = shadow.counts;
  const graded = c.honoured + c.void + c.lapsed;
  const ref = refusedWords(shadow.refusedPnlUsd);
  const rows = compact ? shadow.recent.slice(0, 5) : shadow.recent;
  const sworn = shadow.recent.filter((r) => r.decision === "sworn").length;
  return (
    <div className={`shadow${compact ? " shadow--compact" : ""}`}>
      <div className="shadow__head">
        <div className={`shadow__fig shadow__fig--${ref.tone}`}>
          <span className="shadow__cap">{ref.cap}</span>
          <b>{ref.value}</b>
          <span className="shadow__sub">{ref.line}.</span>
        </div>
        <dl className="shadow__counts">
          <div>
            <dt>candidates</dt>
            <dd>{c.total}</dd>
          </div>
          <div>
            <dt>open</dt>
            <dd>{c.open}</dd>
          </div>
          <div>
            <dt>honoured</dt>
            <dd>{c.honoured}</dd>
          </div>
          <div>
            <dt>void</dt>
            <dd>{c.void}</dd>
          </div>
          <div>
            <dt>lapsed</dt>
            <dd>{c.lapsed}</dd>
          </div>
          <div>
            <dt>sworn, P&amp;L</dt>
            <dd>
              <Money v={shadow.swornPnlUsd} />
            </dd>
          </div>
        </dl>
      </div>
      <p className="shadow__method">
        <b>Method.</b> {shadow.method}
        {shadow.since ? ` Running since ${time(shadow.since)} IST, ${day(shadow.since)}.` : ""} {graded ? `${graded} of ${c.total} graded so far, ${c.open} still open.` : c.total ? `None of the ${c.total} has settled yet.` : ""}
        {!compact && shadow.recent.length && !sworn ? " Avow swore none of the candidates listed here." : ""}
      </p>
      {rows.length ? (
        <Table rows={rows} compact={compact} />
      ) : (
        <div className="empty">
          <b>No candidates yet</b>
          {EMPTY}
        </div>
      )}
      {compact ? (
        <p className="plate">
          {shadow.recent.length > rows.length ? `The latest ${rows.length} of ${shadow.recent.length}. ` : ""}
          <Link href="/record#shadow">The whole shadow ledger</Link>
        </p>
      ) : null}
    </div>
  );
}
