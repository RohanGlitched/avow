"use client";
// A dotted-underlined term with a plain-words explanation. A real button: it opens on click, focus or hover,
// closes on Escape or blur, and the popover is tied to it with aria-describedby.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type TermKey } from "@/lib/glossary";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Term({ k, children }: { k: TermKey; children?: ReactNode }) {
  const g = GLOSSARY[k];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const tip = useRef<HTMLSpanElement>(null);
  const hoverT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // keep the popover inside the viewport (no sideways scroll at 390 px)
  useIso(() => {
    if (!open || !tip.current) return;
    const r = tip.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const pad = 12;
    if (r.right > vw - pad) setShift((s) => s - (r.right - (vw - pad)));
    else if (r.left < pad) setShift((s) => s + (pad - r.left));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span
      className="term"
      onMouseEnter={() => {
        clearTimeout(hoverT.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        hoverT.current = setTimeout(() => setOpen(false), 120);
      }}
    >
      <button type="button" className="term__btn" aria-describedby={id} aria-expanded={open} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        {children ?? g.word}
      </button>
      <span ref={tip} id={id} role="tooltip" className={`term__tip${open ? " is-open" : ""}`} style={{ ["--shift" as string]: `${shift}px` }}>
        <b>{g.word}.</b> {g.plain}
      </span>
    </span>
  );
}
