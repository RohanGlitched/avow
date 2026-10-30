// Procedural guilloché. Every curve is a closed sum of epicycles, so the same
// parameters always draw the same rosette: anyone can recompute a note's rosette
// from its statement hash, and the mandate's rosette from its numbers.
import type { Mandate } from "./types";

export type CurveKind = "ring" | "epi" | "rose";

export interface CurveDef {
  kind: CurveKind;
  n: number; // samples (≤ 1,500)
  p: number; // symmetry / wave count
  phase: number; // radians
  // ring: r = R + w sin(p t + phase) + w2 sin(2 p t)
  R?: number;
  w?: number;
  w2?: number;
  // epi: z = A e^{it} + B e^{i(1-p)t} + C e^{i(1+m p)t}, scaled so max |z| = scale
  A?: number;
  B?: number;
  C?: number;
  m?: number;
  scale?: number;
  // rose: r = r0 (1 + k cos(p t + phase)) / (1 + k) + inner
  r0?: number;
  k?: number;
  inner?: number;
  copies: number; // rotated copies (drawn with <use>)
  step: number; // degrees between copies
  rot: number; // degrees, rotation of the whole family
  tone: 0 | 1 | 2; // 0 ink, 1 steel, 2 secondary tint
  label: string; // plain words for the derivation table
}

export interface RosetteSpec {
  curves: CurveDef[];
}

export function hashBytes(hash: string): number[] {
  const h = hash.replace(/^0x/, "").padEnd(64, "0");
  const out: number[] = [];
  for (let i = 0; i < 32; i++) out.push(parseInt(h.slice(i * 2, i * 2 + 2), 16) || 0);
  return out;
}

const TAU = Math.PI * 2;
const u = (b: number) => b / 255;

export function noteRosette(hash: string): RosetteSpec {
  const b = hashBytes(hash);
  const pOuter = 44 + (b[0] % 26);
  const cOuter = 5 + (b[1] % 4);
  const pFrame = 28 + (b[3] % 18);
  const pLoop = 6 + (b[6] % 10);
  const mLoop = 1 + (b[9] % 2);
  const cLoop = 7 + (b[10] % 6);
  const pRose = pLoop * (1 + (b[12] % 2));
  const pCore = 5 + (b[15] % 6);
  return {
    curves: [
      {
        kind: "ring", n: Math.min(1500, pOuter * 20), p: pOuter, phase: u(b[2]) * TAU,
        R: 462, w: 13 + u(b[2]) * 10, w2: 3 + u(b[4]) * 5,
        copies: cOuter, step: 360 / pOuter / cOuter, rot: 0, tone: 1,
        label: `Outer band: ${pOuter} waves in ${cOuter} strands (bytes 0–2)`,
      },
      {
        kind: "ring", n: Math.min(1500, pFrame * 24), p: pFrame, phase: u(b[5]) * TAU,
        R: 404, w: 8 + u(b[5]) * 8, w2: 2 + u(b[7]) * 3,
        copies: 4, step: 360 / pFrame / 4, rot: 0, tone: 0,
        label: `Inner band: ${pFrame} waves in 4 strands (bytes 3–5)`,
      },
      {
        kind: "epi", n: Math.min(1500, 44 * (1 + mLoop * pLoop)), p: pLoop, phase: u(b[8]) * TAU,
        A: 1, B: 0.32 + u(b[7]) * 0.42, C: 0.04 + u(b[8]) * 0.14, m: mLoop, scale: 352,
        copies: cLoop, step: (360 / pLoop / cLoop) * (0.4 + u(b[11]) * 0.45), rot: u(b[11]) * 360, tone: 0,
        label: `Main rosette: ${pLoop}-fold, ${cLoop} strands, loop depth ${(0.32 + u(b[7]) * 0.42).toFixed(2)} (bytes 6–11)`,
      },
      {
        kind: "rose", n: Math.min(1500, pRose * 36), p: pRose, phase: u(b[13]) * TAU,
        r0: 210, k: 0.22 + u(b[13]) * 0.3, inner: 0,
        copies: 9, step: 360 / pRose / 9, rot: u(b[14]) * 360, tone: 2,
        label: `Petal ring: ${pRose} petals in 9 strands (bytes 12–14)`,
      },
      {
        kind: "epi", n: Math.min(1500, 40 * (1 + 2 * pCore)), p: pCore, phase: u(b[16]) * TAU,
        A: 1, B: 0.5 + u(b[16]) * 0.35, C: 0.06, m: 2, scale: 92,
        copies: 6, step: 360 / pCore / 6, rot: u(b[17]) * 360, tone: 1,
        label: `Centre: ${pCore}-fold knot (bytes 15–17)`,
      },
    ],
  };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const logn = (v: number, a: number, b: number) => clamp01(Math.log(Math.max(v, a) / a) / Math.log(b / a));

/** The mandate's rosette: each clause drives one visible harmonic. */
export function mandateRosette(m: Mandate): RosetteSpec {
  const assets = Math.max(1, m.assets.length);
  const slip = lin(m.maxSlippageBps, 10, 200);
  const odev = lin(m.maxSpotDevBps, 20, 500);
  const notional = logn(m.maxNotionalUsd, 5, 1000);
  const exposure = logn(m.maxExposureUsd, 10, 3000);
  const stop = lin(m.maxStopBps, 100, 2000);
  const horizon = lin(m.maxHorizonSec, 3600, 7 * 86400);
  const loss = logn(m.dailyLossLimitUsd, 1, 500);
  const dd = lin(m.maxDrawdownBps, 200, 5000);
  const cool = lin(m.cooldownSec, 0, 3600);
  const rr = lin(m.minRewardRisk, 1, 4);
  const pLoop = 6 + assets * 2; // 8, 10, 12
  return {
    curves: [
      {
        kind: "ring", n: 1440, p: 54, phase: 0, R: 462, w: 6 + slip * 22, w2: 2 + odev * 9,
        copies: 6, step: 360 / 54 / 6, rot: 0, tone: 1, label: "Outer band depth: slippage; ripple: spot deviation",
      },
      {
        kind: "ring", n: 1200, p: 30 + Math.round(dd * 20), phase: 1.1, R: 404, w: 6 + dd * 12, w2: 2,
        copies: 4, step: 360 / 40 / 4, rot: 0, tone: 0, label: "Inner band waves: drawdown limit",
      },
      {
        kind: "epi", n: 1500, p: pLoop, phase: 0.6, A: 1, B: 0.26 + notional * 0.5, C: 0.03 + exposure * 0.16, m: 2, scale: 352,
        copies: 9, step: (360 / pLoop / 9) * (0.35 + cool * 0.5), rot: 0, tone: 0,
        label: "Main rosette: symmetry from the assets, loop depth from the note size, outer loops from exposure, spread from the cooldown",
      },
      {
        kind: "rose", n: 1200, p: pLoop * 2, phase: 0, r0: 150 + horizon * 110, k: 0.15 + stop * 0.5, inner: 0,
        copies: 9, step: 360 / (pLoop * 2) / 9, rot: 0, tone: 2, label: "Petal ring: radius from the horizon, petal depth from the stop distance",
      },
      {
        kind: "epi", n: 1200, p: 5 + Math.round(rr * 4), phase: 0.3, A: 1, B: 0.45 + rr * 0.4, C: 0.06, m: 2, scale: 50 + loss * 80,
        copies: 6, step: 360 / 7 / 6, rot: 0, tone: 1, label: "Centre: size from the daily loss limit, folds from reward/risk",
      },
    ],
  };
}

export function curvePoints(c: CurveDef): Float64Array {
  const n = c.n;
  const out = new Float64Array(n * 2);
  if (c.kind === "ring") {
    const R = c.R ?? 450, w = c.w ?? 10, w2 = c.w2 ?? 0;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const r = R + w * Math.sin(c.p * t + c.phase) + w2 * Math.sin(2 * c.p * t);
      out[i * 2] = r * Math.cos(t);
      out[i * 2 + 1] = r * Math.sin(t);
    }
  } else if (c.kind === "epi") {
    const A = c.A ?? 1, B = c.B ?? 0.4, C = c.C ?? 0.1, m = c.m ?? 1;
    const f2 = 1 - c.p, f3 = 1 + m * c.p;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const x = A * Math.cos(t) + B * Math.cos(f2 * t + c.phase) + C * Math.cos(f3 * t);
      const y = A * Math.sin(t) + B * Math.sin(f2 * t + c.phase) + C * Math.sin(f3 * t);
      out[i * 2] = x;
      out[i * 2 + 1] = y;
      max = Math.max(max, Math.hypot(x, y));
    }
    const s = (c.scale ?? 300) / (max || 1);
    for (let i = 0; i < n * 2; i++) out[i] *= s;
  } else {
    const r0 = c.r0 ?? 200, k = c.k ?? 0.3, inner = c.inner ?? 0;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const r = inner + (r0 * (1 + k * Math.cos(c.p * t + c.phase))) / (1 + k);
      out[i * 2] = r * Math.cos(t);
      out[i * 2 + 1] = r * Math.sin(t);
    }
  }
  return out;
}

/** Compact path: integer coordinates in a 1,000-unit box, relative moves. */
export function pathD(pts: Float64Array): string {
  const n = pts.length / 2;
  let px = Math.round(pts[0]);
  let py = Math.round(pts[1]);
  let s = `M${px} ${py}l`;
  let first = true;
  for (let i = 1; i < n; i++) {
    const x = Math.round(pts[i * 2]);
    const y = Math.round(pts[i * 2 + 1]);
    const dx = x - px;
    const dy = y - py;
    if (dx === 0 && dy === 0) continue;
    s += (first || dx < 0 ? "" : " ") + dx + (dy < 0 ? "" : " ") + dy;
    first = false;
    px = x;
    py = y;
  }
  return s + "z";
}

export function lerpPoints(a: Float64Array, b: Float64Array, t: number): Float64Array {
  const out = new Float64Array(b.length);
  if (a.length !== b.length) return b;
  for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** A deterministic 32-byte hex seed from any string (for decorative marks, not notes). */
export function seedHash(s: string): `0x${string}` {
  let out = "";
  let h = 2166136261;
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i) + k * 31;
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return `0x${out}`;
}
