import Link from "next/link";
import { Rosette } from "./Rosette";
import { MAINNET_CONTRACTS, MARK_HASH, SITE } from "@/lib/site";
import { addrUrl } from "@/lib/chain";
import { num, short, when } from "@/lib/format";
import type { State } from "@/lib/types";

const GROUPS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/league", label: "League" },
      { href: "/notes", label: "Notes" },
      { href: "/record", label: "Record" },
      { href: "/journal", label: "Journal" },
      { href: "/desk", label: "Talk to Avow" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/how", label: "How it works" },
      { href: "/mandate", label: "The mandate" },
      { href: "/how#verify", label: "Verify it yourself" },
      { href: "/business", label: "Business" },
      { href: `${SITE.github}/blob/main/SECURITY.md`, label: "Security and limits", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: SITE.github, label: "Source code", external: true },
      { href: SITE.video, label: "Demo video", external: true },
      { href: SITE.build, label: "Hackathon entry", external: true },
      { href: "https://hsk.blockscout.com", label: "HSK Chain explorer", external: true },
      { href: "https://app.hskswap.com", label: "HSKSwap", external: true },
    ],
  },
];

function FootLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return external ? (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <Link href={href}>{label}</Link>
  );
}

export function SiteFooter({ state }: { state: State }) {
  const micro = state.notes.map((n) => `${n.serial} ${n.statement} ${n.hash}`).join("  ");
  const mainnet = state.network.mode === "mainnet";
  return (
    <footer className="foot sfoot">
      <div className="band" aria-hidden="true" />
      <div className="wrap">
        <div className="sfoot__top">
          <div className="sfoot__brand">
            <Link href="/" className="sfoot__mark" aria-label="Avow, home">
              <Rosette hash={MARK_HASH} defer />
              <span>Avow</span>
            </Link>
            <p className="sfoot__tag">The on-chain track record for AI traders.</p>
            <p className="sfoot__status">
              <span className={`sfoot__dot${state.agentAlive ? "" : " sfoot__dot--off"}`} aria-hidden="true" />
              {mainnet ? "Live on HSK Chain mainnet" : "Rehearsal on a fork of HSK Chain mainnet"}
              {state.block ? <span className="sfoot__muted">, block {num(state.block)}</span> : null}
            </p>
            <div className="sfoot__actions">
              <Link href="/league" className="btn">
                See the league
              </Link>
              <Link href="/desk" className="btn btn--ghost">
                Talk to Avow
              </Link>
            </div>
          </div>

          {GROUPS.map((g) => (
            <nav key={g.title} className="sfoot__col" aria-label={g.title}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.label}>
                    <FootLink {...l} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="sfoot__col">
            <h2>On chain</h2>
            <ul className="sfoot__chain">
              {MAINNET_CONTRACTS.map((c) => (
                <li key={c.address}>
                  <a href={addrUrl(c.address)} target="_blank" rel="noreferrer">
                    <span>{c.label}</span>
                    <code>{short(c.address, 6, 4)}</code>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sfoot__bottom">
          <p>
            © 2026 Avow. Built for the <b>HSK Chain Horizon Hackathon, India</b>, Track 1: AI agent trading.
          </p>
          <p className="sfoot__muted" suppressHydrationWarning>
            {state.source === "fixture" ? "Saved snapshot from " : "Data read "}
            {when(state.asOf)}
          </p>
        </div>
        <p className="foot__disclaimer">
          Notes record the vault owners&apos; own trades as they happen. Nothing here is investment advice or a recommendation to anyone.
        </p>
        <p className="foot__micro" aria-hidden="true">
          {micro}
        </p>
      </div>
    </footer>
  );
}
