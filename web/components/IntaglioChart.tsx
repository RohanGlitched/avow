"use client";
// Price charts drawn as engraving: line shading whose weight deepens toward the base,
// hatched corridors, fine strokes, no gradients.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ASSET_LABEL, day, pxShort, time } from "@/lib/format";
import type { AssetSym, Note } from "@/lib/types";

type Pt = { t: number; dex: number | null; cex: number | null };

export interface IntaglioProps {
  series: Pt[];
  asset: AssetSym;
  corridor?: Pick<Note, "openedAt" | "expiry" | "entryPx" | "targetPx" | "voidPx" | "side" | "status" | "exitPx" | "settledAt" | "serial">;
  /** unix s; the right edge of the price data */
  now?: number;
  mini?: boolean;
  label: string;
  /** hours of padding around a corridor */
  padH?: number;
  showCex?: boolean;
}

const M = { l: 8, r: 78, t: 18, b: 30 };
const MM = { l: 2, r: 2, t: 6, b: 6 };

export function IntaglioChart({ series, asset, corridor, now, mini, label, padH = 3, showCex = true }: IntaglioProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(mini ? 320 : 960);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const cw = Math.round(e[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const m = mini ? MM : w < 520 ? { ...M, r: 62 } : M;
  const h = mini ? 84 : Math.round(Math.max(230, Math.min(360, w * 0.36)));

  const model = useMemo(() => {
    const lastT = series.at(-1)?.t ?? now ?? 0;
    let t0 = series[0]?.t ?? 0;
    let t1 = lastT;
    if (corridor) {
      t0 = Math.max(t0, corridor.openedAt - padH * 3600);
      // The right edge is "now" (the last price read) unless the note has run its course: the corridor is then cut
      // at the edge and its expiry labelled off-chart, instead of drawing hours of empty corridor with no prices.
      const end = corridor.settledAt ?? corridor.expiry;
      t1 = corridor.status === "outstanding" ? Math.min(lastT, corridor.expiry + 1800) : Math.min(lastT, end + padH * 3600, corridor.expiry + 1800);
      t1 = Math.max(t1, (corridor.settledAt ?? corridor.openedAt) + 300);
      if (t1 <= t0) t0 = t1 - 3600;
    }
    const pts = series.filter((p) => p.t >= t0 && p.t <= t1);
    const vals: number[] = [];
    pts.forEach((p) => {
      if (p.dex != null) vals.push(p.dex);
      if (showCex && p.cex != null) vals.push(p.cex);
    });
    if (corridor) vals.push(corridor.targetPx, corridor.voidPx, corridor.entryPx);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo) * (mini ? 0.08 : 0.12) || hi * 0.01;
    lo -= pad;
    hi += pad;
    const iw = w - m.l - m.r;
    const ih = h - m.t - m.b;
    const X = (t: number) => m.l + ((t - t0) / (t1 - t0 || 1)) * iw;
    const Y = (v: number) => m.t + (1 - (v - lo) / (hi - lo || 1)) * ih;
    return { t0, t1, lo, hi, pts, X, Y, iw, ih };
  }, [series, corridor, w, h, m.l, m.r, m.t, m.b, mini, padH, showCex, now]);

  const { pts, X, Y, lo, hi, t0, t1, ih } = model;
  const line = (k: "dex" | "cex", step: boolean) => {
    let d = "";
    let prev: { x: number; y: number } | null = null;
    for (const p of pts) {
      const v = p[k];
      if (v == null) continue;
      const x = X(p.t);
      const y = Y(v);
      if (!prev) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      else if (step) d += `H${x.toFixed(1)}V${y.toFixed(1)}`;
      else d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = { x, y };
    }
    return d;
  };
  const dexD = line("dex", true);
  const cexD = showCex ? line("cex", false) : "";
  const base = m.t + ih;
  const firstX = pts.length ? X(pts[0].t) : m.l;
  const lastX = pts.length ? X(pts[pts.length - 1].t) : m.l;
  const areaD = dexD ? `${dexD}V${base.toFixed(1)}H${firstX.toFixed(1)}Z` : "";

  // engraved shading: horizontal lines, heavier toward the base
  const hatch = [];
  const gap = mini ? 2.6 : 3.4;
  for (let y = m.t; y <= base; y += gap) {
    const k = (y - m.t) / (ih || 1);
    hatch.push(<line key={y} x1={firstX} x2={lastX} y1={y} y2={y} strokeWidth={(0.18 + k * 0.62).toFixed(2)} />);
  }

  // axes
  const yTicks = mini ? [] : niceTicks(lo, hi, 4);
  const span = t1 - t0;
  const stepH = span > 48 * 3600 ? 12 : span > 18 * 3600 ? 6 : span > 8 * 3600 ? 3 : span > 3 * 3600 ? 1 : span > 5400 ? 0.5 : span > 2400 ? 0.25 : 1 / 12;
  const xTicks: number[] = [];
  if (!mini) {
    const st = stepH * 3600;
    // align to IST (UTC+5:30)
    const off = 5.5 * 3600;
    for (let t = Math.ceil((t0 + off) / st) * st - off; t <= t1; t += st) xTicks.push(t);
  }
  const wideTicks = w < 520 ? xTicks.filter((_, i) => i % 2 === 0) : xTicks;

  const c = corridor;
  const cx0 = c ? X(c.openedAt) : 0;
  // a settled note's corridor ends where it settled; an open one runs to its expiry (cut at the edge if later)
  const cEnd = c ? (c.status !== "outstanding" && c.settledAt != null ? Math.min(c.settledAt, c.expiry) : c.expiry) : 0;
  const cx1 = c ? Math.min(X(cEnd), w - m.r) : 0;
  const cutAtEdge = c ? X(cEnd) > w - m.r + 0.5 : false;
  const endedEarly = c ? cEnd < c.expiry : false;
  const lastT = series.at(-1)?.t ?? 0;
  const edgeIsNow = !mini && t1 >= lastT - 90;
  const yT = c ? Y(c.targetPx) : 0;
  const yV = c ? Y(c.voidPx) : 0;
  const yE = c ? Y(c.entryPx) : 0;

  const onMove = (clientX: number) => {
    const el = box.current;
    if (!el || !pts.length) return;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * w;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(X(p.t) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <div
      ref={box}
      className="chart"
      tabIndex={mini ? -1 : 0}
      role="figure"
      aria-label={label}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      onKeyDown={(e) => {
        if (!pts.length) return;
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const d = e.key === "ArrowRight" ? 1 : -1;
          setHover((h0) => Math.max(0, Math.min(pts.length - 1, (h0 ?? pts.length - 1) + d * (e.shiftKey ? 6 : 1))));
        } else if (e.key === "Escape") setHover(null);
      }}
      onBlur={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <defs>
          <clipPath id={`${uid}a`}>
            <path d={areaD} />
          </clipPath>
          <pattern id={`${uid}r`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" />
          </pattern>
          <pattern id={`${uid}v`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="5" className="hatch-risk" />
          </pattern>
        </defs>

        {!mini && (
          <g className="grid">
            {yTicks.map((v) => (
              <line key={v} x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} />
            ))}
          </g>
        )}

        {c && (
          <g className="corridor">
            <rect x={cx0} width={Math.max(0, cx1 - cx0)} y={Math.min(yT, yE)} height={Math.abs(yE - yT)} fill={`url(#${uid}r)`} opacity="0.75" />
            <rect x={cx0} width={Math.max(0, cx1 - cx0)} y={Math.min(yV, yE)} height={Math.abs(yE - yV)} fill={`url(#${uid}v)`} opacity="0.7" />
            <line className="lvl lvl--target" x1={cx0} x2={cx1} y1={yT} y2={yT} />
            <line className="lvl lvl--void" x1={cx0} x2={cx1} y1={yV} y2={yV} />
            <line className="lvl lvl--entry" x1={cx0} x2={cx1} y1={yE} y2={yE} />
            <line className="lvl lvl--target" x1={cx0} x2={cx0} y1={Math.min(yT, yV)} y2={Math.max(yT, yV)} />
            {!cutAtEdge && <line className="lvl lvl--target" x1={cx1} x2={cx1} y1={Math.min(yT, yV)} y2={Math.max(yT, yV)} strokeDasharray="3 3" />}
            <text className="lvl-lab lvl-lab--target" x={w - m.r + 6} y={yT + 4}>
              {pxShort(asset, c.targetPx)}
            </text>
            <text className="lvl-lab lvl-lab--void" x={w - m.r + 6} y={yV + 4}>
              {pxShort(asset, c.voidPx)}
            </text>
            <text className="lab" x={cx1 < 260 ? cx0 + 4 : cx1 - 4} y={Math.min(yT, yV) - 6} textAnchor={cx1 < 260 ? "start" : "end"}>
              {endedEarly && !cutAtEdge
                ? `${c.status} ${time(cEnd)}, before expiry`
                : cutAtEdge
                  ? `expires ${time(c.expiry)} IST, ${day(c.expiry)}, off the chart →`
                  : `expiry ${time(c.expiry)}`}
            </text>
          </g>
        )}

        <g clipPath={`url(#${uid}a)`} className="engrave-lines" stroke="var(--ink)" opacity={mini ? 0.5 : 0.42}>
          {hatch}
        </g>
        {cexD && <path className="cex" d={cexD} />}
        <path className="dex" d={dexD} />

        {c && (
          <g>
            <circle className="mark-dot" cx={cx0} cy={yE} r={4} />
            {c.exitPx != null && c.settledAt != null ? <circle className="mark-dot mark-dot--exit" cx={X(c.settledAt)} cy={Y(c.exitPx)} r={4.5} /> : null}
          </g>
        )}

        {!mini && (
          <g className="ax">
            <line x1={m.l} x2={w - m.r} y1={base} y2={base} />
            {edgeIsNow ? (
              <g>
                <line x1={w - m.r} x2={w - m.r} y1={base} y2={base + 5} />
                <text x={w - m.r} y={base + 19} textAnchor="end" className="ax-now">
                  now
                </text>
              </g>
            ) : null}
            {wideTicks
              .filter((t) => !edgeIsNow || X(t) < w - m.r - 56)
              .map((t) => (
              <g key={t}>
                <line x1={X(t)} x2={X(t)} y1={base} y2={base + 5} />
                <text x={X(t)} y={base + 19} textAnchor="middle">
                  {time(t) === "00:00" || time(t) === "00:30" ? day(t) : time(t)}
                </text>
              </g>
            ))}
            {yTicks.map((v) =>
              c && (Math.abs(Y(v) - yT) < 12 || Math.abs(Y(v) - yV) < 12) ? null : (
                <text key={v} x={w - m.r + 6} y={Y(v) + 4}>
                  {pxShort(asset, v)}
                </text>
              ),
            )}
          </g>
        )}

        {hp && (
          <g className="cross">
            <line x1={X(hp.t)} x2={X(hp.t)} y1={m.t} y2={base} />
            {hp.dex != null && <circle cx={X(hp.t)} cy={Y(hp.dex)} r={3.5} />}
          </g>
        )}
      </svg>
      {hp && !mini ? (
        <div className="chart__read" style={{ left: `${Math.min(Math.max(0, (X(hp.t) / w) * 100 - 8), 70)}%` }}>
          <div>
            {time(hp.t)} IST, {day(hp.t)}
          </div>
          <div>
            HSKSwap <b>{pxShort(asset, hp.dex)}</b>
          </div>
          {showCex && (
            <div>
              HashKey Global <b>{pxShort(asset, hp.cex)}</b>
            </div>
          )}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {hp ? `${time(hp.t)} IST ${day(hp.t)}: HSKSwap ${ASSET_LABEL[asset]} ${pxShort(asset, hp.dex)}, HashKey Global ${pxShort(asset, hp.cex)}` : ""}
      </span>
    </div>
  );
}

function niceTicks(lo: number, hi: number, n: number) {
  const span = hi - lo;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}
