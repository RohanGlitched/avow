import Link from "next/link";
import { Rosette } from "./Rosette";
import { Hex } from "./Ovi";
import { CHANGELOG, MARK_HASH, NAV } from "@/lib/site";
import { FEEDS, HSKSWAP, NETWORK_WORDS, POOLS, addrUrl, ownLink } from "@/lib/chain";
import { num, when } from "@/lib/format";
import type { State } from "@/lib/types";

export function SiteFooter({ state }: { state: State }) {
  const c = state.contracts;
  const micro = state.notes.map((n) => `${n.serial} ${n.statement} ${n.hash}`).join("  ");
  const fork = state.network.mode === "fork-rehearsal";
  return (
    <footer className="foot">
      <div className="band" aria-hidden="true" />
      <div className="wrap">
        <div className="foot__top">
          <div>
            <div className="foot__brand">
              <Rosette hash={MARK_HASH} defer />
              <div>
                <div className="foot__word">Avow</div>
                <p className="foot__motto">Dictum meum pactum, my word is my bond: the old London Stock Exchange&apos;s motto. Avow holds an AI trader to it.</p>
              </div>
            </div>
            <p className="foot__blurb">
              An AI trader on HSK Chain that can only trade through a vault. Before every swap it swears a falsifiable note on chain; anyone can settle it; its record decides how large a note it may
              write next.
            </p>
            <div className="actions">
              <Link href="/desk" className="btn">
                Talk to Avow
              </Link>
              <Link href="/how#verify" className="btn btn--ghost">
                Verify it yourself
              </Link>
            </div>
          </div>
          <nav aria-label="Footer">
            <h2>Pages</h2>
            <ul>
              <li>
                <Link href="/">The live note</Link>
              </li>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/desk">Desk</Link>
              </li>
            </ul>
          </nav>
          <div>
            <h2>Contracts{fork ? ", rehearsal fork" : ""}</h2>
            <ul className="foot__contracts">
              <li>
                <span>Avow vault</span> <Hex value={c.vault} href={ownLink(state, "address", c.vault)} />
              </li>
              <li>
                <span>Agent</span> <Hex value={c.agent} href={ownLink(state, "address", c.agent)} />
              </li>
              <li>
                <span>Owner</span> <Hex value={c.owner} href={ownLink(state, "address", c.owner)} />
              </li>
              <li>
                <span>HSKSwap router</span> <Hex value={HSKSWAP.router} href={addrUrl(HSKSWAP.router)} />
              </li>
              <li>
                <span>HSKSwap factory</span> <Hex value={HSKSWAP.factory} href={addrUrl(HSKSWAP.factory)} />
              </li>
              <li>
                <span>USDT / WETH pool</span> <Hex value={POOLS.WETH.address} href={addrUrl(POOLS.WETH.address)} />
              </li>
              <li>
                <span>Chainlink ETH / USD</span> <Hex value={FEEDS["ETH / USD"]} href={addrUrl(FEEDS["ETH / USD"])} />
              </li>
            </ul>
          </div>
          <div>
            <h2>Sources</h2>
            <ul>
              <li>
                <a href="https://hsk.blockscout.com" target="_blank" rel="noreferrer">
                  HSK Chain explorer
                </a>
              </li>
              <li>
                <a href="https://api-glb.hashkey.com/quote/v1/ticker/price?symbol=ETHUSDT" target="_blank" rel="noreferrer">
                  HashKey Global ticker
                </a>
              </li>
              <li>
                <Link href="/how#addresses">Every address Avow reads</Link>
              </li>
              <li>
                <Link href="/how#verify">A cast command for each claim</Link>
              </li>
              <li>
                <Link href="/journal">The agent&apos;s journal</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="foot__mid">
          <div>
            <h2>Data on this site</h2>
            <p className="muted" style={{ fontSize: 14.5 }}>
              {NETWORK_WORDS[state.network.mode].long} {state.source === "fixture" ? "The numbers are a development snapshot taken " : "Last read "}
              {when(state.asOf)}
              {state.block ? `, block ${num(state.block)}.` : "."}
            </p>
          </div>
          <div>
            <h2>Changelog</h2>
            <ol className="changelog">
              {CHANGELOG.map((e) => (
                <li key={e.date + e.text}>
                  <time dateTime={e.date}>{new Date(e.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</time>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="foot__bottom">
          <span>
            Built for <b>HSK Chain Horizon Hackathon · India</b>, Track 1: AI agent trading on HSKSwap.
          </span>
          <span>Every note is falsifiable. Every rule is in the contract.</span>
        </div>
        <p className="foot__micro" aria-hidden="true">
          {micro}
        </p>
      </div>
    </footer>
  );
}
