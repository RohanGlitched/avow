"use client";
import { IntaglioChart } from "./IntaglioChart";
import { useLiveState } from "@/lib/live";
import { ASSET_LABEL, ASSET_NAME, bps, duration, num, px } from "@/lib/format";
import type { MarketRow } from "@/lib/types";

function Spread({ v }: { v: number | null }) {
  if (v == null) return <span className="muted">—</span>;
  return (
    <span className={`spread ${Math.abs(v) >= 60 ? "pos" : ""}`}>
      {v > 0 ? "+" : v < 0 ? "−" : ""}
      {num(Math.abs(v), 1)} bps
    </span>
  );
}

function clDev(r: MarketRow) {
  if (r.dexPx == null || r.chainlinkPx == null) return null;
  return ((r.dexPx - r.chainlinkPx) / r.chainlinkPx) * 1e4;
}

export function MarketBoard({ withCharts = true }: { withCharts?: boolean }) {
  const { state } = useLiveState();
  return (
    <div className="market">
      {state.market.map((r) => {
        const dev = clDev(r);
        const stale = r.chainlinkAgeSec != null && r.chainlinkAgeSec > 26 * 3600;
        return (
          <article className="mkt" key={r.asset}>
            <div className="mkt__head">
              <h3>{r.label}</h3>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {ASSET_NAME[r.asset]}, USDT pool
              </span>
            </div>
            <div className="mkt__px tnum">{px(r.asset, r.dexPx)}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              HSKSwap spot. HashKey Global {px(r.asset, r.cexPx)}; HSKSwap is <Spread v={r.spreadBps} />
            </div>
            {withCharts && (
              <div style={{ marginTop: 12 }}>
                <IntaglioChart mini series={r.history} asset={r.asset} label={`${ASSET_LABEL[r.asset]}: HSKSwap against HashKey Global, last 72 hours`} />
              </div>
            )}
            <dl className="mkt__rows">
              <dt>5-minute TWAP</dt>
              <dd className="tnum">{px(r.asset, r.twapPx)}</dd>
              <dt>Chainlink, checked by the agent</dt>
              <dd className="tnum">
                {px(r.asset, r.chainlinkPx)}
                {dev != null ? <span className={Math.abs(dev) > 300 || stale ? "neg" : "muted"}> {bps(dev, true)}</span> : null}
              </dd>
              <dt>Chainlink age</dt>
              <dd className={`tnum ${stale ? "neg" : ""}`}>{r.chainlinkAgeSec != null ? duration(r.chainlinkAgeSec) : "—"}</dd>
              <dt>Pool depth</dt>
              <dd className="tnum">
                ${num(r.poolUsdt)} + {num(r.poolAsset, r.asset === "WHSK" ? 0 : 2)} {r.asset}
              </dd>
              <dt>Last swap in the pool</dt>
              <dd className="tnum">{r.lastSwapAgoSec != null ? `${duration(r.lastSwapAgoSec)} ago` : "—"}</dd>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
