"use client";
import { useEffect, useRef, useState } from "react";

/** Measures an element's width so SVG charts draw at real pixel size (legible text on phones). */
export function useWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const cw = Math.round(e[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
