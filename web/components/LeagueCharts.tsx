"use client";
// The arithmetic of the ranking, engraved: what a Brier score each kind of forecaster earns as its hit rate changes.
import { useWidth } from "@/lib/useWidth";
import { expectedBrier, hitRateFor } from "@/lib/brier";

export interface OddsLine {
  p: number; // the odds it always states
  label: string; // "Bold, always 80%"
}
export interface AgentPoint {
  h: number; // share of graded notes honoured
  b: number; // its Brier
  label: string;
}

/**
 * x: how often the notes come true; y: the Brier score that earns. A flat line at 0.25 for always saying 50%,
 * a straight line for each fixed-odds rule, and the curve an honest forecaster traces (stating p when right p of the time).
 */
export function BrierPlate({ lines, points }: { lines: OddsLine[]; points: AgentPoint[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(620);
  const narrow = w < 520;
  const h = narrow ? 300 : 340;
  const m = { l: 44, r: narrow ? 12 : 20, t: 22, b: 48 };
  const yMax = 0.7;
  const X = (v: number) => m.l + v * (w - m.l - m.r);
  const Y = (v: number) => m.t + (1 - v / yMax) * (h - m.t - m.b);
  const honest = Array.from({ length: 41 }, (_, i) => i / 40).map((x) => `${X(x).toFixed(1)},${Y(x * (1 - x)).toFixed(1)}`);
  const cross = lines.map((l) => ({ ...l, at: hitRateFor(l.p, 0.25) }));
  return (
    <div
      ref={ref}
      className="chart lg-plate"
      role="img"
      aria-label={`Brier score against how often notes come true. Always saying 50% scores 0.25 whatever happens. ${cross
        .map((c) => (c.at != null ? `${c.label} must be right ${Math.round(c.at * 100)}% of the time just to match it` : c.label))
        .join(". ")}. An agent that states the odds it really has scores at most 0.25.`}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <defs>
          <pattern id="lg-h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" />
          </pattern>
        </defs>
        <rect x={X(0)} y={Y(0.25)} width={X(1) - X(0)} height={Y(0) - Y(0.25)} fill="url(#lg-h)" opacity="0.32" />
        <g className="grid">
          {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((v) => (
            <line key={v} x1={X(0)} x2={X(1)} y1={Y(v)} y2={Y(v)} />
          ))}
        </g>
        <g className="ax">
          <line x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} />
          <line x1={X(0)} x2={X(0)} y1={Y(0)} y2={Y(yMax)} />
          {[0, 0.2, 0.4, 0.6].map((v) => (
            <text key={v} x={X(0) - 8} y={Y(v) + 4} textAnchor="end">
              {v.toFixed(1)}
            </text>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <text key={v} x={X(v)} y={Y(0) + 18} textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"}>
              {Math.round(v * 100)}%
            </text>
          ))}
          <text x={X(0.5)} y={h - 6} textAnchor="middle">
            How often the notes come true
          </text>
        </g>
        {/* tier thresholds: Journeyman 0.22, Fiduciary 0.20 (named in the caption) */}
        {[0.22, 0.2].map((v) => (
          <line key={v} x1={X(0)} x2={X(1)} y1={Y(v)} y2={Y(v)} stroke="var(--ink-2)" strokeDasharray="2 3" strokeWidth="1" />
        ))}
        {/* the honest forecaster */}
        <polyline points={honest.join(" ")} fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="5 3" />
        <text className="lab" x={X(0.2)} y={Y(0.085)} style={{ fill: "var(--ink)" }}>
          {narrow ? "states its real odds" : "states the odds it really has"}
        </text>
        {/* fixed-odds rules */}
        {cross.map((c, i) => (
          <g key={c.label}>
            <line x1={X(0)} x2={X(1)} y1={Y(expectedBrier(c.p, 0))} y2={Y(expectedBrier(c.p, 1))} stroke="var(--ink-2)" strokeWidth="1.6" />
            <text
              className="lab"
              x={X(0) + 6}
              y={Y(expectedBrier(c.p, 0)) - 8}
              transform={`rotate(${((Math.atan2(Y(expectedBrier(c.p, 1)) - Y(expectedBrier(c.p, 0)), X(1) - X(0)) * 180) / Math.PI).toFixed(2)} ${X(0)} ${Y(expectedBrier(c.p, 0))})`}
              style={{ fill: "var(--ink-2)", fontWeight: 600 }}
            >
              {c.label}
            </text>
            {c.at != null ? (
              <g>
                <circle cx={X(c.at)} cy={Y(0.25)} r="3.5" fill="var(--bg)" stroke="var(--ink-2)" strokeWidth="1.5" />
                <line x1={X(c.at)} x2={X(c.at)} y1={Y(0.25)} y2={Y(0)} stroke="var(--ink-2)" strokeWidth="0.8" strokeDasharray="1 2" />
                <text className="lab" x={X(c.at)} y={Y(0) - 6 - (cross.slice(0, i).some((o) => o.at != null && Math.abs(X(o.at) - X(c.at!)) < 40) ? 16 : 0)} textAnchor="middle">
                  {Math.round(c.at * 100)}%
                </text>
              </g>
            ) : null}
          </g>
        ))}
        {/* always 50% */}
        <line x1={X(0)} x2={X(1)} y1={Y(0.25)} y2={Y(0.25)} stroke="var(--void)" strokeWidth="1.6" />
        <text className="lab" x={X(1) - 2} y={Y(0.25) - 6} textAnchor="end" style={{ fill: "var(--void)", fontWeight: 600 }}>
          always 50%: 0.25
        </text>
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={X(p.h)} cy={Y(p.b)} r="5" fill="var(--ink)" />
            <text className="lab" x={X(p.h) + 8} y={Y(p.b) - 6} style={{ fill: "var(--ink)", fontWeight: 700 }}>
              {p.label} {p.b.toFixed(3)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
