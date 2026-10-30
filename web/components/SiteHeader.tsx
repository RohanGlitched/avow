"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MARK_HASH, NAV } from "@/lib/site";
import { Rosette } from "./Rosette";

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const cur = (href: string) => (path === href || path.startsWith(href + "/") ? "page" : undefined);
  return (
    <header className="site-head">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Avow, home">
          <span className="mark">
            <Rosette hash={MARK_HASH} only={[1, 2, 4]} />
          </span>
          <span className="brand__word">Avow</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={cur(n.href)}>
              {n.label}
            </Link>
          ))}
          <Link href="/desk" className="btn" aria-current={cur("/desk")}>
            Talk to Avow
          </Link>
        </nav>
        <button className="menu-btn" aria-expanded={open} aria-controls="sheet" onClick={() => setOpen((o) => !o)}>
          <i aria-hidden="true" />
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open ? (
        <nav id="sheet" className="sheet" aria-label="Main menu">
          <Link href="/" onClick={() => setOpen(false)}>
            Home <span>The live note</span>
          </Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label} <span>{n.hint}</span>
            </Link>
          ))}
          <Link href="/desk" onClick={() => setOpen(false)}>
            Desk <span>Talk to Avow</span>
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
