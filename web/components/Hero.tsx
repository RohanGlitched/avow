"use client";
// The home hero's two moving parts. HeroField: a banknote lathe pattern (two crossing families of wave lines that open
// around the headline) printed in on load, with an optically variable lens that follows the pointer and re-inks the
// lines it passes over; the same field, without the opening, sits behind every page (variant "site") and follows the
// pointer across the whole window. HeroStage: the live note as the product shot, tilted back in perspective, flattening as it
// scrolls into view and leaning toward the pointer. Both are decoration: aria-hidden, and still under reduced motion.
import { useEffect, useId, useMemo, useRef } from "react";
import { useMounted } from "@/lib/live";

const W = 1600;
const H = 900;
const LINES = 30;

function lathe(i: number, fam: 0 | 1, eye: boolean): string {
  const y0 = -60 + (i / (LINES - 1)) * (H + 120);
  const off = y0 - H / 2;
  let d = "";
  for (let x = -40; x <= W + 40; x += 10) {
    const u = (x - W / 2) / (W * 0.36);
    const e = Math.exp(-u * u); // 1 at the centre column, 0 at the edges
    // the lines part around the headline like an eye, and two families cross to make the lens-shaped mesh
    const y =
      H / 2 +
      (eye ? off * (1 + 0.32 * e) + Math.sign(off || 1) * 70 * e * Math.exp(-(off * off) / (2 * 260 * 260)) : off) +
      (7 + 9 * e) * Math.sin((2 * Math.PI * x) / 300 + i * 0.35 + fam * Math.PI) +
      2.5 * Math.sin((2 * Math.PI * x) / 75 + fam * Math.PI);
    d += `${d ? "L" : "M"}${x} ${y.toFixed(1)}`;
  }
  return d;
}

export function HeroField({ variant = "hero" }: { variant?: "hero" | "site" }) {
  const site = variant === "site";
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paths = useMemo(() => (mounted ? ([0, 1] as const).flatMap((f) => Array.from({ length: LINES }, (_, i) => ({ f, i, d: lathe(i, f, !site) }))) : []), [mounted, site]);

  useEffect(() => {
    const el = ref.current;
    // the hero lens answers the pointer over the hero; the site field answers it anywhere in the window
    const host: HTMLElement | Document | null | undefined = site ? document : el?.parentElement;
    if (!el || !host || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      raf = 0;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      el.classList.add("is-pointed");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => el.classList.remove("is-pointed");
    const out = site ? document.documentElement : (host as HTMLElement);
    host.addEventListener("pointermove", move as EventListener);
    out.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move as EventListener);
      out.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [site]);

  return (
    <div className={`hfield${site ? " hfield--site" : ""}`} ref={ref} aria-hidden="true">
      <svg className="hfield__base" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          {paths.map((p) => (
            <path key={`${p.f}${p.i}`} id={`${uid}l${p.f}-${p.i}`} d={p.d} pathLength={1} />
          ))}
        </defs>
        {paths.map((p) => (
          <use key={`${p.f}${p.i}`} href={`#${uid}l${p.f}-${p.i}`} className={`hfield__l hfield__l--${p.f}`} style={{ ["--k" as string]: p.i + p.f * 6 }} />
        ))}
      </svg>
      <svg className="hfield__ink" style={{ stroke: `url(#${uid}ovi)` }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          {/* a short repeating ramp, so one lens shows the ink shifting through several colours */}
          <linearGradient id={`${uid}ovi`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="220" y2="140" spreadMethod="reflect">
            <stop offset="0" style={{ stopColor: "var(--ovi-a)" }} />
            <stop offset="0.5" style={{ stopColor: "var(--ovi-b)" }} />
            <stop offset="1" style={{ stopColor: "var(--gilt)" }} />
          </linearGradient>
        </defs>
        {paths.map((p) => (
          <use key={`${p.f}${p.i}`} href={`#${uid}l${p.f}-${p.i}`} />
        ))}
      </svg>
    </div>
  );
}

export function HeroStage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let px = 0.5;
    let py = 0.5;
    const paint = () => {
      raf = 0;
      el.style.setProperty("--ry", `${((px - 0.5) * 5).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - py) * 4).toFixed(2)}deg`);
      el.style.setProperty("--sheen", `${(px * 100).toFixed(1)}%`);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      el.classList.add("is-tilted");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => {
      el.classList.remove("is-tilted");
      px = py = 0.5;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="hstage">
      <div className="hstage__glow" aria-hidden="true" />
      <div className="hstage__rise">
        <div className="hstage__tilt" ref={ref}>
          {children}
          <div className="hstage__sheen" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
