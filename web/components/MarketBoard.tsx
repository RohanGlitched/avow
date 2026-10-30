"use client";
// One card per pool. Each leads with one number, the gap the agent would trade on, drawn against the round-trip
// break-even; every source figure sits in a collapsed "Sources" row.
import { IntaglioChart } from "./IntaglioChart";
import { useLiveState } from "@/lib/live";
import { ROUND_TRIP_BPS, tradeGapBps } from "@/lib/chain";
import { ASSET_LABEL, ASSET_NAME, bps, duration, num, px } from "@/lib/format";
import type { MarketRow } from "@/lib/types";

const CL_MAX_AGE = 26 * 3600;

function clDev(price: number | null | undefined, r: MarketRow) {
  if (price == null || r.chainlinkPx == null) return null;
  return ((price - r.chainlinkPx) / r.chainlinkPx) * 1e4;
}

const agoTxt = (s: number | null | undefined) => (s != null ? `${duration(s)} ago` : "—");
const pctTxt = (b: number) => `${(b / 100).toFixed(2)}%`;

/** The gap as a bar against the break-even line. */
function GapBar({ gapBps, label }: { gapBps: number | null; label: string }) {
  const g = gapBps == null ? null : Math.abs(gapBps);
  const max = Math.max(ROUND_TRIP_BPS * 2, (g ?? 0) * 1.15);
  const be = (ROUND_TRIP_BPS / max) * 100;
  const fill = g == null ? 0 : Math.min(100, (g / max) * 100);
  const above = g != null && g > ROUND_TRIP_BPS;
  return (
    <div className={`gapbar${above ? " gapbar--above" : ""}`}>
      {g != null ? (
        <div className="gapbar__top" aria-hidden="true">
          <span style={{ left: `${Math.max(9, Math.min(91, fill))}%` }}>gap {pctTxt(g)}</span>
        </div>
      ) : null}
      <div className="gapbar__track" role="img" aria-label={g == null ? `${label}: no price` : `${label}: gap ${pctTxt(g)} against a ${pctTxt(ROUND_TRIP_BPS)} round-trip break-even`}>
        <div className="gapbar__fill" style={{ width: `${fill}%` }} />
        <div className="gapbar__be" style={{ left: `${be}%` }} />
      </div>
      <div className="gapbar__labels" aria-hidden="true">
        {be > 34 ? <span>0</span> : null}
        <span className="gapbar__belab" style={{ left: `${be}%`, transform: be > 34 ? "translateX(-50%)" : "translateX(-6px)" }}>
          {pctTxt(ROUND_TRIP_BPS)} round-trip break-even
        </span>
      </div>
    </div>
  );
}

export function MarketBoard({ withCharts = true }: { withCharts?: boolean }) {
  const { state } = useLiveState();
  const rehearsal = state.network.mode === "fork-rehearsal";
  const span = (r: MarketRow) => (r.history.length > 1 ? duration(r.history.at(-1)!.t - r.history[0].t) : null);
  return (
    <div className="market">
      {state.market.map((r) => {
        const main = rehearsal ? r.mainnet : undefined;
        const gap = tradeGapBps(r);
        const g = gap == null ? null : Math.abs(gap);
        const stale = r.chainlinkAgeSec == null || r.chainlinkAgeSec > CL_MAX_AGE;
        const dev = clDev(r.dexPx, r);
        const above = g != null && g > ROUND_TRIP_BPS;
        const verdict =
          g == null
            ? { cls: "", words: "No price read yet" }
            : stale
              ? { cls: "", words: "Chainlink feed stale — no trade" }
              : above
                ? { cls: "is-above", words: "Above break-even — a candidate, if its odds clear the costs" }
                : { cls: "", words: "Below break-even — no trade" };
        const sp = span(r);
        const mainPx = main ? (main.spotPx ?? main.twapPx) : null;
        const mainGap = mainPx != null && r.cexPx != null ? ((mainPx - r.cexPx) / r.cexPx) * 1e4 : null;
        return (
          <article className="mkt" key={r.asset}>
            <div className="mkt__head">
              <h3>{r.label}</h3>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {ASSET_NAME[r.asset]}, USDT pool
              </span>
            </div>
            <div className="mkt__cap">Gap the agent would trade on</div>
            <div className={`mkt__gap tnum ${verdict.cls}`}>{g == null ? "—" : pctTxt(g)}</div>
            <div className="mkt__dir">
              {gap == null ? (
                "HSKSwap or exchange price missing"
              ) : (
                <>
                  HSKSwap{rehearsal ? " (rehearsal fork)" : ""} {gap >= 0 ? "above" : "below"} the exchanges: <b className="tnum">{px(r.asset, r.dexPx)}</b> against{" "}
                  <b className="tnum">{px(r.asset, r.cexPx)}</b>
                </>
              )}
            </div>
            <GapBar gapBps={gap} label={`${r.label} gap`} />
            <p className={`mkt__verdict ${verdict.cls}`}>{verdict.words}</p>
            {withCharts && (
              <div style={{ marginTop: 10 }}>
                <IntaglioChart mini series={r.history} asset={r.asset} label={`${ASSET_LABEL[r.asset]}: ${rehearsal ? "rehearsal fork pool" : "HSKSwap"} against the exchanges${sp ? `, last ${sp}` : ""}`} />
              </div>
            )}
            <details className="mkt__sources">
              <summary>Sources</summary>
              <dl className="mkt__rows">
                <dt>HSKSwap{rehearsal ? ", rehearsal fork" : ""}: spot</dt>
                <dd className="tnum">{px(r.asset, r.dexPx)}</dd>
                <dt>5-minute TWAP{rehearsal ? ", fork" : ""}</dt>
                <dd className="tnum">{px(r.asset, r.twapPx)}</dd>
                <dt>Pool depth{rehearsal ? ", fork" : ""}</dt>
                <dd className="tnum">
                  ${num(r.poolUsdt)} + {num(r.poolAsset, r.asset === "WHSK" ? 0 : 2)} {r.asset}
                </dd>
                <dt>Last swap{rehearsal ? ", fork" : ""}</dt>
                <dd className="tnum">{agoTxt(r.lastSwapAgoSec)}</dd>
                {main ? (
                  <>
                    <dt>HSKSwap mainnet: spot</dt>
                    <dd className="tnum">
                      {px(r.asset, mainPx)} {mainGap != null ? <span className="muted">{bps(mainGap, true)}</span> : null}
                    </dd>
                    <dt>5-minute TWAP, mainnet</dt>
                    <dd className="tnum">{px(r.asset, main.twapPx)}</dd>
                    <dt>Last swap, mainnet</dt>
                    <dd className="tnum">{agoTxt(main.lastSwapAgoSec)}</dd>
                    <dt>Swaps in 3 h, mainnet</dt>
                    <dd className="tnum">{main.swaps3h != null ? num(main.swaps3h) : "—"}</dd>
                  </>
                ) : null}
                {r.hashkeyPx != null ? (
                  <>
                    <dt>HashKey Global mid</dt>
                    <dd className="tnum">{px(r.asset, r.hashkeyPx)}</dd>
                  </>
                ) : null}
                {r.gatePx != null ? (
                  <>
                    <dt>Gate mid</dt>
                    <dd className="tnum">{px(r.asset, r.gatePx)}</dd>
                  </>
                ) : null}
                <dt>{r.hashkeyPx != null || r.gatePx != null ? "Exchanges, the price used" : "HashKey Global mid"}</dt>
                <dd className="tnum">{px(r.asset, r.cexPx)}</dd>
                <dt>Chainlink, checked by the agent</dt>
                <dd className={`tnum${stale ? " cl-stale" : ""}`}>
                  {px(r.asset, r.chainlinkPx)}
                  {dev != null && !stale ? <span className={Math.abs(dev) > 300 ? "neg" : "muted"}> {bps(dev, true)}</span> : null}
                </dd>
                <dt>Chainlink age</dt>
                <dd className={`tnum${stale ? " cl-stale" : ""}`}>{stale ? `stale${r.chainlinkAgeSec != null ? ` (${duration(r.chainlinkAgeSec)})` : ""}` : duration(r.chainlinkAgeSec!)}</dd>
              </dl>
            </details>
          </article>
        );
      })}
    </div>
  );
}
