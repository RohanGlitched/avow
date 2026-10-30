"use client";
// On a phone the annotated specimen is printed at its full 820 px layout and scaled down to the container's width,
// so every mark A to H stays where the key says it is. A tap opens it at full size; Escape or the button closes it.
import { useCallback, useEffect, useRef, useState } from "react";

const PRINT_W = 856; // the note (820 px) plus room for the lettered callouts on its left

export function SpecimenFit({ children, label }: { children: React.ReactNode; label: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; h: number } | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const measure = () => {
      if (!mq.matches) return setFit(null);
      const s = Math.min(1, o.clientWidth / PRINT_W);
      setFit({ s, h: Math.ceil(i.offsetHeight * s) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    mq.addEventListener("change", measure);
    measure();
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, []);

  const close = useCallback(() => setFull(false), []);
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full, close]);

  const on = fit != null && !full;
  return (
    <>
      <div
        ref={outer}
        className={`specfit${on ? " specfit--on" : ""}${full ? " specfit--full" : ""}`}
        style={on ? { height: fit.h, ["--inv" as string]: String(1 / fit.s) } : undefined}
        role={full ? "dialog" : "region"}
        aria-modal={full ? true : undefined}
        aria-label={full ? `${label}, full size` : label}
      >
        {full ? (
          <div className="specfit__bar">
            <span>Full size. Scroll to read the marks A to H.</span>
            <button type="button" className="btn btn--ghost" onClick={close} autoFocus>
              Close
            </button>
          </div>
        ) : null}
        <div
          ref={inner}
          className="specfit__inner"
          style={on ? { transform: `scale(${fit.s})` } : undefined}
          onClick={on ? () => setFull(true) : undefined}
        >
          {children}
        </div>
      </div>
      {on ? (
        <button type="button" className="specfit__open" onClick={() => setFull(true)}>
          Tap the note to view it at full size
        </button>
      ) : null}
    </>
  );
}
