// "Measured odds": how often real HSKSwap gaps against the exchanges closed, from mainnet swap logs.
import { num, when } from "@/lib/format";
import type { Study } from "@/lib/types";

const ASSET: Record<string, string> = { WETH: "ETH", WBTC: "BTC", WHSK: "HSK" };
const rate = (c: number, n: number) => (n > 0 ? c / n : 0);
const pctTxt = (v: number) => `${Math.round(v * 100)}%`;

export function StudyTable({ study }: { study: Study }) {
  const rows = study.rows.filter((r) => r.episodes > 0);
  const empty = study.rows.length - rows.length;
  const total = rows.reduce((a, r) => a + r.episodes, 0);
  const closed = rows.reduce((a, r) => a + r.convergedWithin12h, 0);
  const hasPool = rows.some((r) => r.poolMovedHalfWithin12h != null);
  const pool = rows.reduce((a, r) => a + (r.poolMovedHalfWithin12h ?? 0), 0);
  const has2h = rows.some((r) => r.convergedWithin2h != null);
  const hasSide = rows.some((r) => r.poolSideShare != null);
  return (
    <div>
      <p className="study__takeaway">
        Across <b>{num(total)}</b> gap episodes in {study.windowDays} days, <b>{pctTxt(rate(closed, total))}</b> closed within 12 hours
        {hasPool ? (
          <>
            , but the pool itself moved half the gap in only <b>{pctTxt(rate(pool, total))}</b>: most gaps closed because the exchange price moved, not the pool. A catch-up note needs the
            pool to move, so that second figure, not the first, is what its odds should be judged against.
          </>
        ) : (
          "."
        )}
      </p>
      <div className="table-wrap">
        <table className="tbl tbl--stack">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Gap at first crossing</th>
              <th className="r">Episodes</th>
              {has2h ? <th className="r">Closed within 2 h</th> : null}
              <th className="r">Closed within 12 h</th>
              {hasPool ? <th className="r">Pool moved half the gap, 12 h</th> : null}
              {hasSide ? <th className="r">Closing move from the pool</th> : null}
              <th className="r">Median time to close</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.asset}-${r.gapBucket}`}>
                <td data-h="Asset" style={{ fontFamily: "var(--serif)", fontSize: 19 }}>
                  {ASSET[r.asset] ?? r.asset}
                </td>
                <td data-h="Gap at first crossing">{r.gapBucket}</td>
                <td data-h="Episodes" className="r">
                  {num(r.episodes)}
                  {r.episodes < 13 ? <span className="sub">anecdote, not evidence</span> : null}
                </td>
                {has2h ? (
                  <td data-h="Closed within 2 h" className="r">
                    {r.convergedWithin2h != null ? pctTxt(rate(r.convergedWithin2h, r.episodes)) : "—"}
                  </td>
                ) : null}
                <td data-h="Closed within 12 h" className="r">
                  {pctTxt(rate(r.convergedWithin12h, r.episodes))}
                </td>
                {hasPool ? (
                  <td data-h="Pool moved half the gap, 12 h" className="r" style={{ fontWeight: 650 }}>
                    {r.poolMovedHalfWithin12h != null ? pctTxt(rate(r.poolMovedHalfWithin12h, r.episodes)) : "—"}
                  </td>
                ) : null}
                {hasSide ? (
                  <td data-h="Closing move from the pool" className="r">
                    {r.poolSideShare != null ? pctTxt(r.poolSideShare) : "—"}
                  </td>
                ) : null}
                <td data-h="Median time to close" className="r">
                  {r.medianHoursToConverge != null ? `${r.medianHoursToConverge.toFixed(1)} h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="study__notes">
        <h3>Method and limits</h3>
        <p>{study.notes}</p>
        <p className="plate">
          Plate. Computed {when(study.generatedAt)} from HSKSwap swap logs on HSK Chain mainnet.{empty ? ` ${empty} buckets with no episodes are left out.` : ""} A gap that closed before is not
          a promise that the next one will.
        </p>
      </div>
    </div>
  );
}
