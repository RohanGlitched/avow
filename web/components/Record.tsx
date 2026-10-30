"use client";
// The record, engraved: tier ladder as banknote denominations, Brier scale,
// reliability diagram, rolling Brier and realised P&L.
import { Rosette } from "./Rosette";
import { seedHash } from "@/lib/rosette";
import { useWidth } from "@/lib/useWidth";
import { day, outcomeOf, usd } from "@/lib/format";
import type { Note, Record as Rec } from "@/lib/types";

import { TIER_RULES } from "@/lib/tiers";

export function TierLadder({ record }: { record: Rec }) {
  const cur = record.tier.index;
  return (
    <div className="tiers">
      {record.tiers.map((t) => {
        const rule = TIER_RULES[t.index];
        const state = t.index < cur ? "earned" : t.index === cur ? "current" : "specimen";
        const scale = 0.86 + t.index * 0.05;
        const need = Math.max(0, rule.graded - record.graded);
        return (
          <article key={t.index} className={`tiernote tiernote--${state}`} style={{ minHeight: `${Math.round(250 * scale)}px` }} aria-label={`${t.name}: notes up to ${usd(t.capUsd, { dp: 0 })}. ${state}`}>
            <div className="tiernote__band" aria-hidden="true" />
            {state === "current" ? <span className="tiernote__now">Now</span> : null}
            <div className="tiernote__top">
              <span className="tiernote__name">{t.name}</span>
              <span className="tiernote__d">
                <small>$</small>
                {t.capUsd}
              </span>
            </div>
            <Rosette hash={seedHash(t.name)} defer only={[1, 2, 4]} />
            <p>{t.requirement.replace(/\.$/, "")}.</p>
            <div className="tiernote__share">{Math.round(t.share * 100)}% of the largest note the mandate allows</div>
            {state === "specimen" ? (
              <div className="progress">
                {need > 0 ? `${need} more graded notes` : "Enough notes graded"}
                {rule.brier != null ? `, Brier ${t.index === 1 ? "below" : "of"} ${rule.brier.toFixed(2)}${t.index === 1 ? "" : " or better"} (now ${record.brier?.toFixed(3) ?? "none"})` : ""}
                <div className="meter" aria-hidden="true">
                  <div className="meter__fill" style={{ width: `${Math.min(100, (record.graded / rule.graded) * 100)}%` }} />
                </div>
              </div>
            ) : null}
            {state === "specimen" ? (
              <div className="specimen" aria-hidden="true">
                <span>SPECIMEN</span>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

/** Brier on a 0 → 0.5 scale with the coin-flip line and the tier thresholds. */
export function BrierScale({ brier }: { brier: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  const h = 100;
  const l = 10;
  const r = 10;
  const X = (v: number) => l + (v / 0.5) * (w - l - r);
  const marks = [
    { v: 0.2, t: "Fiduciary 0.20" },
    { v: 0.22, t: "Journeyman 0.22" },
    { v: 0.25, t: "coin flip 0.25" },
  ];
  return (
    <div ref={ref} className="chart" role="img" aria-label={brier == null ? "No graded notes yet" : `Brier score ${brier.toFixed(3)}; a coin flip scores 0.25; lower is better`}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <defs>
          <pattern id="bs-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" className="hatch-line" />
          </pattern>
        </defs>
        <rect x={X(0)} y={40} width={X(0.25) - X(0)} height={14} fill="url(#bs-h)" opacity="0.6" />
        <line x1={X(0)} x2={X(0.5)} y1={54} y2={54} stroke="var(--ink)" />
        {Array.from({ length: 51 }, (_, i) => (
          <line key={i} x1={X(i / 100)} x2={X(i / 100)} y1={i % 10 === 0 ? 44 : i % 5 === 0 ? 48 : 51} y2={54} stroke="var(--ink)" strokeWidth="0.7" />
        ))}
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => (
          <text key={v} className="lab" x={X(v)} y={72} textAnchor={v === 0 ? "start" : v === 0.5 ? "end" : "middle"}>
            {v.toFixed(1)}
          </text>
        ))}
        {marks.map((m, i) =>
          w < 480 && i < 2 ? null : (
            <g key={m.v}>
              <line x1={X(m.v)} x2={X(m.v)} y1={[30, 16, 12][i]} y2={58} stroke={i === 2 ? "var(--void)" : "var(--ink-2)"} strokeWidth={i === 2 ? 1.5 : 1} strokeDasharray={i === 2 ? undefined : "2 2"} />
              <text className="lab" x={i === 2 ? X(m.v) + 5 : X(m.v) - 5} y={[30, 16, 16][i]} style={i === 2 ? { fill: "var(--void)" } : undefined} textAnchor={i === 2 ? "start" : "end"}>
                {m.t}
              </text>
            </g>
          ),
        )}
        {brier != null && (
          <g>
            <line x1={X(brier)} x2={X(brier)} y1={34} y2={62} stroke="var(--ink)" strokeWidth="2.5" />
            <path d={`M${X(brier)} 62l-6 10h12z`} fill="var(--ink)" />
            <text x={X(brier)} y={90} textAnchor="middle" className="lab" style={{ fill: "var(--ink)", fontWeight: 700 }}>
              Avow {brier.toFixed(3)}
            </text>
          </g>
        )}
        <text className="lab" x={X(0)} y={34}>
          better
        </text>
        <text className="lab" x={X(0.5)} y={34} textAnchor="end">
          worse
        </text>
      </svg>
    </div>
  );
}

/** Reliability: stated confidence against how often it came true. */
export function Reliability({ notes }: { notes: Note[] }) {
  const [ref, w0] = useWidth<HTMLDivElement>(520);
  const w = Math.min(w0, 620);
  const h = Math.round(Math.max(300, Math.min(460, w * 0.82)));
  const m = { l: 46, r: 16, t: 26, b: 52 };
  const lo = 0.3;
  const X = (c: number) => m.l + ((c - lo) / (1 - lo)) * (w - m.l - m.r);
  const Y = (f: number) => m.t + (1 - f) * (h - m.t - m.b);
  const graded = notes.filter((n) => outcomeOf(n) != null);
  const bins = [0.3, 0.5, 0.6, 0.7, 0.8, 1.0001];
  const pts = bins.slice(0, -1).map((b, i) => {
    const inBin = graded.filter((n) => n.confidence >= b && n.confidence < bins[i + 1]);
    if (!inBin.length) return null;
    const c = inBin.reduce((a, n) => a + n.confidence, 0) / inBin.length;
    const f = inBin.reduce((a, n) => a + (outcomeOf(n) ?? 0), 0) / inBin.length;
    return { c, f, n: inBin.length, lo: b, hi: Math.min(1, bins[i + 1]) };
  });
  return (
    <div ref={ref} className="chart" role="img" aria-label={`Reliability diagram: ${graded.length} graded notes. ${pts.filter(Boolean).map((p) => `${p!.n} notes at about ${Math.round(p!.c * 100)}% confidence came true ${Math.round(p!.f * 100)}% of the time`).join("; ")}`}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
        <defs>
          <pattern id="rl-o" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="5" className="hatch-risk" />
          </pattern>
          <pattern id="rl-u" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" />
          </pattern>
        </defs>
        <path d={`M${X(lo)} ${Y(0)}L${X(1)} ${Y(0)}L${X(1)} ${Y(1)}Z`} fill="url(#rl-o)" opacity="0.35" />
        <path d={`M${X(lo)} ${Y(lo)}L${X(lo)} ${Y(1)}L${X(1)} ${Y(1)}Z`} fill="url(#rl-u)" opacity="0.22" />
        <g className="grid">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={m.l} x2={w - m.r} y1={Y(f)} y2={Y(f)} />
          ))}
        </g>
        <line x1={X(lo)} y1={Y(lo)} x2={X(1)} y2={Y(1)} stroke="var(--ink)" strokeWidth="1" />
        <text className="lab" x={X(0.93)} y={Y(0.93) - 8} textAnchor="end" transform={`rotate(${(-Math.atan2(Y(lo) - Y(1), X(1) - X(lo)) * 180) / Math.PI} ${X(0.93)} ${Y(0.93) - 8})`}>
          perfectly calibrated
        </text>
        <text className="lab" x={X(0.97)} y={Y(0.06)} textAnchor="end" style={{ fill: "var(--void)" }}>
          overconfident
        </text>
        <text className="lab" x={X(lo) + 8} y={Y(0.94)}>
          underconfident
        </text>
        {graded.length === 0 ? (
          <text className="ghost__words" x={(X(lo) + X(1)) / 2} y={Y(0.24)} textAnchor="middle">
            Circles appear here as notes are graded
          </text>
        ) : null}
        {/* rug: every graded note, honoured on top, misses below */}
        {graded.map((n) => (
          <line
            key={n.id}
            x1={X(n.confidence)}
            x2={X(n.confidence)}
            y1={outcomeOf(n) ? Y(1) - 2 : Y(0) + 2}
            y2={outcomeOf(n) ? Y(1) - 14 : Y(0) + 14}
            stroke={outcomeOf(n) ? "var(--gilt)" : "var(--void)"}
            strokeWidth="2"
          />
        ))}
        {pts.map((p) =>
          p ? (
            <g key={p.lo}>
              <line x1={X(p.lo)} x2={X(p.hi)} y1={Y(p.f)} y2={Y(p.f)} stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="2 2" />
              <circle cx={X(p.c)} cy={Y(p.f)} r={6 + p.n * 2.2} fill="var(--note)" stroke="var(--ink)" strokeWidth="1.5" />
              <text x={X(p.c)} y={Y(p.f) + 4} textAnchor="middle" className="lab" style={{ fill: "var(--ink)", fontWeight: 700 }}>
                {p.n}
              </text>
            </g>
          ) : null,
        )}
        <g className="ax">
          <line x1={m.l} x2={w - m.r} y1={Y(0)} y2={Y(0)} />
          {[0.3, 0.5, 0.7, 0.9, 1].map((c) => (
            <text key={c} x={X(c)} y={Y(0) + 30} textAnchor="middle">
              {Math.round(c * 100)}%
            </text>
          ))}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={m.l - 8} y={Y(f) + 4} textAnchor="end">
              {Math.round(f * 100)}%
            </text>
          ))}
          <text x={(m.l + w - m.r) / 2} y={h - 4} textAnchor="middle">
            stated confidence when sworn
          </text>
        </g>
      </svg>
    </div>
  );
}

/** An empty chart that still reads as a chart: the reference line, dashed, and what will appear on it. */
function GhostChart({ w, h, line, words }: { w: number; h: number; line: string; words: string }) {
  const y = Math.round(h * 0.55);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="ghost">
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="4" fill="none" stroke="var(--line)" strokeDasharray="3 5" />
      <line x1={16} x2={w - 16} y1={y} y2={y} stroke="var(--ink)" strokeOpacity="0.55" strokeDasharray="5 5" />
      <text className="lab" x={16} y={y - 8}>
        {line}
      </text>
      <circle cx={16} cy={y} r="4" fill="var(--note)" stroke="var(--ink)" strokeOpacity="0.6" strokeDasharray="2 2" />
      <text className="ghost__words" x={w / 2} y={y + 34} textAnchor="middle">
        {words}
      </text>
    </svg>
  );
}

function StepChart({ pts, label, refLine, fmt, w, h, invert, zero = true }: { pts: { t: number; v: number }[]; label: string; refLine?: { v: number; t: string }; fmt: (v: number) => string; w: number; h: number; invert?: boolean; zero?: boolean }) {
  const m = { l: 8, r: 64, t: 18, b: 28 };
  if (!pts.length) return null;
  const vals = pts.map((p) => p.v).concat(refLine ? [refLine.v] : []).concat(zero ? [0] : []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || 0.05;
  lo -= pad;
  hi += pad;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const X = (t: number) => m.l + ((t - t0) / (t1 - t0 || 1)) * (w - m.l - m.r);
  const Y = (v: number) => m.t + (invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (h - m.t - m.b);
  let d = `M${X(pts[0].t)} ${Y(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) d += `H${X(pts[i].t)}V${Y(pts[i].v)}`;
  const base = Y(refLine ? refLine.v : 0);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <defs>
        <clipPath id={`sc-${label}`}>
          <path d={`${d}V${base}H${X(pts[0].t)}Z`} />
        </clipPath>
      </defs>
      <g clipPath={`url(#sc-${label})`} stroke="var(--ink)" opacity="0.45">
        {Array.from({ length: Math.ceil(h / 3.2) }, (_, i) => (
          <line key={i} x1={m.l} x2={w - m.r} y1={i * 3.2} y2={i * 3.2} strokeWidth="0.5" />
        ))}
      </g>
      {refLine && (
        <g>
          <line x1={m.l} x2={w - m.r} y1={Y(refLine.v)} y2={Y(refLine.v)} stroke="var(--void)" strokeWidth="1.2" />
          <text className="lab" x={m.l + 4} y={Y(refLine.v) + (invert ? 16 : -6)} style={{ fill: "var(--void)" }}>
            {refLine.t}
          </text>
        </g>
      )}
      {!refLine && <line x1={m.l} x2={w - m.r} y1={Y(0)} y2={Y(0)} stroke="var(--line)" />}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.6" />
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.t)} cy={Y(p.v)} r="3" fill="var(--note)" stroke="var(--ink)" strokeWidth="1.2" />
      ))}
      <text className="lab" x={w - m.r + 6} y={Y(pts[pts.length - 1].v) + 4} style={{ fill: "var(--ink)", fontWeight: 700 }}>
        {fmt(pts[pts.length - 1].v)}
      </text>
      <text className="lab" x={m.l} y={h - 6}>
        {day(t0)}
      </text>
      <text className="lab" x={w - m.r} y={h - 6} textAnchor="end">
        {day(t1)}
      </text>
    </svg>
  );
}

function settledOrder(notes: Note[]) {
  return notes.filter((n) => n.settledAt != null).sort((a, b) => a.settledAt! - b.settledAt!);
}

export function BrierHistory({ notes }: { notes: Note[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  const graded = settledOrder(notes).filter((n) => n.sqError != null);
  let sum = 0;
  const pts = graded.map((n, i) => {
    sum += n.sqError!;
    return { t: n.settledAt!, v: sum / (i + 1) };
  });
  return (
    <div ref={ref} className="chart" role="img" aria-label={pts.length ? `Rolling Brier score after each graded note, ending at ${pts.at(-1)!.v.toFixed(3)}; coin flip 0.25` : "No note graded yet; the line starts at the first grade. Coin flip 0.25."}>
      {pts.length ? (
        <StepChart pts={pts} label="brier" refLine={{ v: 0.25, t: "coin flip 0.25" }} fmt={(v) => v.toFixed(3)} w={w} h={220} invert zero={false} />
      ) : (
        <GhostChart w={w} h={220} line="coin flip 0.25" words="The line starts when the first note is graded" />
      )}
    </div>
  );
}

export function PnlCurve({ notes }: { notes: Note[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  let sum = 0;
  const pts = settledOrder(notes)
    .filter((n) => n.pnlUsd != null)
    .map((n) => {
      sum += n.pnlUsd!;
      return { t: n.settledAt!, v: sum };
    });
  return (
    <div ref={ref} className="chart" role="img" aria-label={pts.length ? `Cumulative realised P&L after each settled note, ending at ${usd(pts.at(-1)!.v, { sign: true })}` : "No note settled yet; the first point appears when the first note settles."}>
      {pts.length ? (
        <StepChart pts={pts} label="pnl" fmt={(v) => usd(v, { sign: true })} w={w} h={220} />
      ) : (
        <GhostChart w={w} h={220} line="$0.00" words="The first point appears when the first note settles" />
      )}
    </div>
  );
}
