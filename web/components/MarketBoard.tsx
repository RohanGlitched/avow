"use client";
import { IntaglioChart } from "./IntaglioChart";
import { useLiveState } from "@/lib/live";
import { ASSET_LABEL, ASSET_NAME, bps, duration, num, px } from "@/lib/format";
import type { MarketRow } from "@/lib/types";

const CL_MAX_AGE = 26 * 3600;

function Spread({ v }: { v: number | null }) {
  if (v == null) return <span className="muted">—</span>;
  return (
    <span className={`spread ${Math.abs(v) >= 60 ? "pos" : ""}`}>
      {v > 0 ? "+" : v < 0 ? "−" : ""}
      {num(Math.abs(v), 1)} bps
    </span>
  );
}

function clDev(price: number | null | undefined, r: MarketRow) {
  if (price == null || r.chainlinkPx == null) return null;
  return ((price - r.chainlinkPx) / r.chainlinkPx) * 1e4;
}

const agoTxt = (s: number | null | undefined) => (s != null ? `${duration(s)} ago` : "—");

export function MarketBoard({ withCharts = true }: { withCharts?: boolean }) {
  const { state } = useLiveState();
  const rehearsal = state.network.mode === "fork-rehearsal";
  const span = (r: MarketRow) => (r.history.length > 1 ? duration(r.history.at(-1)!.t - r.history[0].t) : null);
  return (
    <div className="market">
      {state.market.map((r) => {
        const main = rehearsal ? r.mainnet : undefined;
        // in a rehearsal the real mainnet pool is the headline figure; the fork's own pool is secondary
        const headPx = main ? main.spotPx ?? main.twapPx : r.dexPx;
        const dev = clDev(headPx, r);
        const stale = r.chainlinkAgeSec == null || r.chainlinkAgeSec > CL_MAX_AGE;
        const spreadMain = main && headPx != null && r.cexPx != null ? ((headPx - r.cexPx) / r.cexPx) * 1e4 : null;
        const sp = span(r);
        return (
          <article className="mkt" key={r.asset}>
            <div className="mkt__head">
              <h3>{r.label}</h3>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {ASSET_NAME[r.asset]}, USDT pool
              </span>
            </div>
            <div className="mkt__src">{rehearsal ? (main ? "HSKSwap (mainnet)" : "Rehearsal fork") : "HSKSwap spot"}</div>
            <div className="mkt__px tnum">{px(r.asset, headPx)}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              HashKey Global {px(r.asset, r.cexPx)}; {main ? "mainnet HSKSwap" : "HSKSwap"} is <Spread v={main ? spreadMain : r.spreadBps} />
            </div>
            {main ? (
              <div className="mkt__fork">
                <span>Rehearsal fork</span> <b className="tnum">{px(r.asset, r.dexPx)}</b>, <Spread v={r.spreadBps} />
              </div>
            ) : null}
            {withCharts && (
              <div style={{ marginTop: 12 }}>
                <IntaglioChart mini series={r.history} asset={r.asset} label={`${ASSET_LABEL[r.asset]}: ${rehearsal ? "rehearsal fork pool" : "HSKSwap"} against HashKey Global${sp ? `, last ${sp}` : ""}`} />
              </div>
            )}
            <dl className="mkt__rows">
              {main ? (
                <>
                  <dt>5-minute TWAP, mainnet</dt>
                  <dd className="tnum">{px(r.asset, main.twapPx)}</dd>
                  <dt>Last swap, mainnet pool</dt>
                  <dd className="tnum">{agoTxt(main.lastSwapAgoSec)}</dd>
                  <dt>Swaps in 3 h, mainnet</dt>
                  <dd className="tnum">{main.swaps3h != null ? num(main.swaps3h) : "—"}</dd>
                  <dt>5-minute TWAP, rehearsal fork</dt>
                  <dd className="tnum muted">{px(r.asset, r.twapPx)}</dd>
                </>
              ) : (
                <>
                  <dt>5-minute TWAP{rehearsal ? ", rehearsal fork" : ""}</dt>
                  <dd className="tnum">{px(r.asset, r.twapPx)}</dd>
                </>
              )}
              <dt>Chainlink, checked by the agent</dt>
              <dd className={`tnum${stale ? " cl-stale" : ""}`}>
                {px(r.asset, r.chainlinkPx)}
                {dev != null && !stale ? <span className={Math.abs(dev) > 300 ? "neg" : "muted"}> {bps(dev, true)}</span> : null}
              </dd>
              <dt>Chainlink age</dt>
              <dd className={`tnum${stale ? " cl-stale" : ""}`}>{stale ? `stale — agent refuses to trade${r.chainlinkAgeSec != null ? ` (${duration(r.chainlinkAgeSec)})` : ""}` : duration(r.chainlinkAgeSec!)}</dd>
              <dt>Pool depth{main ? ", fork" : ""}</dt>
              <dd className="tnum">
                ${num(r.poolUsdt)} + {num(r.poolAsset, r.asset === "WHSK" ? 0 : 2)} {r.asset}
              </dd>
              {main ? null : (
                <>
                  <dt>Last swap in the {rehearsal ? "fork " : ""}pool</dt>
                  <dd className="tnum">{agoTxt(r.lastSwapAgoSec)}</dd>
                </>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
