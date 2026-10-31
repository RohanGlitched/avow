"use client";
// "On this page": an engraved rail on the right edge with a diamond for each section of a long page. The rail fills with the
// colour-shifting ink as the reader scrolls, the current section's diamond lights up, and each diamond names its section on
// hover or focus. On narrow screens it becomes a "Sections" button that opens a list. Pages are scanned for
// <section aria-labelledby> blocks, so any page with four or more sections gets the rail without extra markup.
// The back-to-top seal appears once the reader is well down a page; its ring fills with progress through the page.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface Item {
  id: string; // the heading's id (what the section is labelled by)
  label: string;
}

const MIN_SECTIONS = 4;

function shortLabel(text: string) {
  const t = text.replace(/\s+/g, " ").trim().replace(/[.:]$/, "");
  return t.length > 42 ? t.slice(0, 40).replace(/\s+\S*$/, "") + "…" : t;
}

function scan(): Item[] {
  const main = document.getElementById("main");
  if (!main) return [];
  const items: Item[] = [];
  for (const sec of Array.from(main.querySelectorAll<HTMLElement>("section[aria-labelledby]"))) {
    const id = sec.getAttribute("aria-labelledby")!;
    const h = document.getElementById(id);
    if (!h || sec.offsetHeight < 80) continue;
    const label = sec.dataset.nav ?? h.dataset.nav ?? h.textContent ?? "";
    if (label.trim()) items.push({ id, label: shortLabel(label) });
  }
  return items;
}

export function PageRail() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  // find the sections after each navigation, and again whenever streamed content changes the page
  useEffect(() => {
    setOpen(false);
    let t = 0;
    const run = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setItems((prev) => {
        const next = scan();
        return prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.label === next[i].label) ? prev : next;
      }), 150);
    };
    run();
    const main = document.getElementById("main");
    const mo = main ? new MutationObserver(run) : null;
    if (main && mo) mo.observe(main, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(t);
      mo?.disconnect();
    };
  }, [pathname]);

  // scroll progress, back-to-top visibility, and the section in view
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
      setShowTop(window.scrollY > window.innerHeight * 1.2);
      let current: string | null = null;
      for (const it of items) {
        const h = document.getElementById(it.id);
        const sec = h?.closest("section");
        if (sec && sec.getBoundingClientRect().top <= window.innerHeight * 0.38) current = it.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items]);

  // close the sheet on Escape or an outside tap
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: MouseEvent) => sheet.current && !sheet.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", click);
    };
  }, [open]);

  const go = (id: string) => (e: React.MouseEvent) => {
    const h = document.getElementById(id);
    if (!h) return;
    e.preventDefault();
    setOpen(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (h.closest("section") ?? h).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  };

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  const rail = items.length >= MIN_SECTIONS;
  const C = 2 * Math.PI * 21;

  return (
    <>
      {rail ? (
        <nav className="prail" aria-label="On this page" style={{ ["--p" as string]: progress }}>
          <span className="prail__line" aria-hidden="true">
            <span className="prail__ink" />
          </span>
          <ol>
            {items.map((it) => (
              <li key={it.id} className={active === it.id ? "is-active" : undefined}>
                <a href={`#${it.id}`} onClick={go(it.id)} aria-current={active === it.id ? "location" : undefined}>
                  <span className="prail__label">{it.label}</span>
                  <span className="prail__mark" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {rail ? (
        <div className={`psheet${open ? " is-open" : ""}`} ref={sheet}>
          <button type="button" className="psheet__btn" aria-expanded={open} aria-controls="psheet-list" onClick={() => setOpen((o) => !o)}>
            <span className="psheet__glyph" aria-hidden="true" />
            Sections
            <span className="psheet__where" aria-hidden="true">
              {active ? items.findIndex((x) => x.id === active) + 1 : 0}/{items.length}
            </span>
          </button>
          <ol id="psheet-list" className="psheet__list" hidden={!open}>
            {items.map((it) => (
              <li key={it.id} className={active === it.id ? "is-active" : undefined}>
                <a href={`#${it.id}`} onClick={go(it.id)}>
                  {it.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <button type="button" className={`ptop${showTop ? " is-shown" : ""}`} onClick={toTop} aria-label="Back to the top of the page" tabIndex={showTop ? 0 : -1}>
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle className="ptop__track" cx="24" cy="24" r="21" />
          <circle className="ptop__ring" cx="24" cy="24" r="21" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - progress) }} />
          <path className="ptop__arrow" d="M24 31V17M17.5 23.5 24 17l6.5 6.5" />
        </svg>
      </button>
    </>
  );
}
