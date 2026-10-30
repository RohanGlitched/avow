"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { curvePoints, lerpPoints, mandateRosette, noteRosette, pathD, type RosetteSpec } from "@/lib/rosette";
import { useMounted } from "@/lib/live";
import type { Mandate } from "@/lib/types";

interface BaseProps {
  /** Draw only after mount (below-the-fold rosettes keep the HTML small). */
  defer?: boolean;
  /** Play the printing animation (stroke-dashoffset), skipped under reduced motion. */
  print?: boolean;
  className?: string;
  label?: string;
  /** Number of curve families to draw (smaller marks use fewer). */
  layers?: number;
  /** Draw only these curve families (by index), for small marks. */
  only?: number[];
}

function Shell({ className, label, children, print }: { className?: string; label?: string; children?: React.ReactNode; print?: boolean }) {
  return (
    <svg
      viewBox="-500 -500 1000 1000"
      className={`rosette${print ? " rosette--print" : ""}${className ? " " + className : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Families({ spec, uid, paths, layers }: { spec: RosetteSpec; uid: string; paths: string[]; layers?: number }) {
  const curves = spec.curves.slice(0, layers ?? spec.curves.length);
  return (
    <>
      <defs>
        {curves.map((_, i) => (
          <path key={i} id={`${uid}c${i}`} d={paths[i]} pathLength={1} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>
      {curves.map((c, i) => (
        <g key={i} className={`ro-f ro-t${c.tone}`} style={{ ["--i" as string]: i }} transform={c.rot ? `rotate(${c.rot.toFixed(1)})` : undefined}>
          {Array.from({ length: c.copies }, (_, k) => (
            <use key={k} href={`#${uid}c${i}`} transform={k ? `rotate(${(k * c.step).toFixed(2)})` : undefined} />
          ))}
        </g>
      ))}
    </>
  );
}

/** A note's rosette, derived from its 32-byte statement hash. */
export function Rosette({ hash, defer, print, className, label, layers, only }: BaseProps & { hash: string }) {
  const mounted = useMounted();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const show = !defer || mounted;
  const onlyKey = only?.join(",") ?? "";
  const spec = useMemo(() => {
    const full = noteRosette(hash);
    return onlyKey ? { curves: full.curves.filter((_, i) => onlyKey.split(",").includes(String(i))) } : full;
  }, [hash, onlyKey]);
  const paths = useMemo(() => (show ? spec.curves.slice(0, layers ?? 9).map((c) => pathD(curvePoints(c))) : []), [spec, show, layers]);
  return (
    <Shell className={className} label={label} print={print}>
      {show ? <Families spec={spec} uid={uid} paths={paths} layers={layers} /> : <circle r={460} className="ro-ph" />}
    </Shell>
  );
}

/** The mandate's rosette. Changing a number morphs it. */
export function MandateRosette({ mandate, defer, className, label, layers }: BaseProps & { mandate: Mandate }) {
  const mounted = useMounted();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const show = !defer || mounted;
  const spec = useMemo(() => mandateRosette(mandate), [mandate]);
  const target = useMemo(() => spec.curves.map((c) => curvePoints(c)), [spec]);
  const current = useRef<Float64Array[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const initial = useMemo(() => (show ? target.map(pathD) : []), [show]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!show) return;
    const root = document.getElementById(`${uid}root`);
    if (!root) return;
    const from = current.current;
    current.current = target;
    const groups = root.querySelectorAll<SVGGElement>("g.ro-f");
    const setSteps = () =>
      spec.curves.forEach((c, i) => {
        const uses = groups[i]?.querySelectorAll("use");
        uses?.forEach((u, k) => (k ? u.setAttribute("transform", `rotate(${(k * c.step).toFixed(2)})`) : null));
      });
    if (!from) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = spec.curves.map((_, i) => document.getElementById(`${uid}c${i}`));
    if (reduce) {
      target.forEach((t, i) => paths[i]?.setAttribute("d", pathD(t)));
      setSteps();
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const D = 650;
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / D);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      target.forEach((tp, i) => paths[i]?.setAttribute("d", pathD(lerpPoints(from[i], tp, e))));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    setSteps();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, spec, show, uid]);

  return (
    <svg
      ref={svgRef}
      id={`${uid}root`}
      viewBox="-500 -500 1000 1000"
      className={`rosette rosette--mandate${mandate.paused ? " rosette--paused" : ""}${className ? " " + className : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {show ? <Families spec={spec} uid={uid} paths={initial.length ? initial : target.map(pathD)} layers={layers} /> : <circle r={460} className="ro-ph" />}
    </svg>
  );
}
