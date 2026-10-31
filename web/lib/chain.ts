// Addresses measured on HSK Chain mainnet (chain 177), DESIGN.md §2.
import type { AssetSym, MarketRow, State } from "./types";

export const EXPLORER = "https://hsk.blockscout.com";

export const HSKSWAP = {
  factory: "0x972cA9D1662F5e029cD18327D29026532E84c742",
  router: "0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3",
  quoter: "0x603f70466fDdbE3F238220B9a74FFF419a2BbFDD",
  npm: "0xDF0A9b833Db0E4CeEa103A4408f3B68e7FC0cad5",
  universalRouter: "0x76D86a6E224B19270c2cdA31477a4c79B2d56918",
} as const;

export const TOKENS = {
  USDT: { address: "0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029", decimals: 6 },
  WETH: { address: "0xefd4bC9afD210517803f293ABABd701CaeeCdfd0", decimals: 18 },
  WBTC: { address: "0x6119CA49a79f5825C8B345F8d7aC36B272565b14", decimals: 8 },
  WHSK: { address: "0xB210D2120d57b758EE163cFfb43e73728c471Cf1", decimals: 18 },
  "USDC.e": { address: "0x054ed45810DbBAb8B27668922D110669c9D88D0a", decimals: 6 },
} as const;

export const POOLS: Record<AssetSym, { address: string; pair: string; fee: number; cardinality: number }> = {
  WETH: { address: "0xb92b79ed6b370D5cFee2E14B1D0983C258304C16", pair: "USDT / WETH", fee: 3000, cardinality: 16 },
  WBTC: { address: "0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A", pair: "USDT / WBTC", fee: 3000, cardinality: 1 },
  WHSK: { address: "0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC", pair: "USDT / WHSK", fee: 3000, cardinality: 16 },
};

export const FEEDS = {
  "ETH / USD": "0xbB091f3b515059b7A887eDcC73dC2a2Fa65E0242",
  "BTC / USD": "0x204ED500ab56A2E19B051561258E3A45c850360F",
  "HSK / USD": "0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b",
  "USDT / USD": "0x823d7f90f7A3498DB6595886b6B5dC95E6B0B7f3",
  "USDC / USD": "0x244Ce344df8837c9d938867E2Ffbf0E4B0169B56",
} as const;

export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const blockUrl = (b: number) => `${EXPLORER}/block/${b}`;

/** Our own contracts and transactions are only on the public explorer once the vault is on mainnet or testnet. */
export function ownLink(s: Pick<State, "network">, kind: "address" | "tx", v: string | null | undefined): string | null {
  if (!v || s.network.mode === "fork-rehearsal") return null;
  const base = s.network.explorer || EXPLORER;
  return `${base}/${kind}/${v}`;
}

export const NETWORK_WORDS: Record<State["network"]["mode"], { short: string; long: string }> = {
  mainnet: { short: "Live on HSK Chain mainnet", long: "The vault is live on HSK Chain mainnet (chain 177)." },
  testnet: { short: "HSK Chain testnet", long: "The vault runs on HSK Chain testnet. Prices still come from mainnet pools." },
  "fork-rehearsal": {
    short: "Rehearsal on a fork of HSK mainnet",
    long: "The vault runs on a local fork of HSK Chain mainnet: real HSKSwap pools and Chainlink feeds, but its own transactions are not on the public explorer.",
  },
};

/**
 * The short chip the status strip carries in a rehearsal. Null on mainnet (and testnet). Worded so it stays true after
 * the mainnet launch: a local server pointed at the rehearsal agent says so, and points to the live site.
 */
export function rehearsalChip(s: Pick<State, "network">): string | null {
  if (s.network.mode !== "fork-rehearsal") return null;
  return "Rehearsal on an HSK mainnet fork, not the live mainnet vault";
}

/** One short line where rehearsal outcomes are shown (the record, a note). */
export function rehearsalShort(s: Pick<State, "network">): string | null {
  if (s.network.mode !== "fork-rehearsal") return null;
  return "Rehearsal on an HSK mainnet fork: outcomes are not evidence.";
}

/**
 * The full sentence, said once, at /how#rehearsal. Null on mainnet (and testnet).
 */
export function rehearsalSentence(s: Pick<State, "network" | "simulatedOutsideTraders">): string | null {
  if (s.network.mode !== "fork-rehearsal") return null;
  const traders =
    s.simulatedOutsideTraders === false
      ? "no outside traders take part on the fork"
      : "outside traders on the fork are simulated at the measured mainnet swap rates and pool-side arbitrage share";
  return `This is a rehearsal on a private fork of HSK mainnet: ${traders}, so its outcomes are not evidence. The live vault is on HSK Chain mainnet, and its record is kept separately from the rehearsal's.`;
}

/** Two 0.30% pool fees, in basis points: the part of a round trip that does not depend on the note's size. */
export const POOL_FEES_BPS = 60;
/** Gas for one round trip in HSK: swear ≈ 0.54M + settle ≈ 0.38M gas at 500 gwei (agent/src/signals.ts). */
export const ROUND_TRIP_GAS_HSK = 920_000 * 500e-9;

/** Gas for one round trip in US dollars at the HSK price in the state (the agent's own fallback price otherwise). */
export function roundTripGasUsd(s: Pick<State, "market">): number {
  const h = s.market.find((m) => m.asset === "WHSK");
  return ROUND_TRIP_GAS_HSK * (h?.cexPx ?? h?.dexPx ?? 0.087);
}

/** The break-even a premium must clear on a note of `notionalUsd`: two pool fees plus gas, in basis points. */
export function roundTripBps(s: Pick<State, "market">, notionalUsd: number): number {
  return POOL_FEES_BPS + (notionalUsd > 0 ? (roundTripGasUsd(s) / notionalUsd) * 1e4 : 0);
}

/** The note size the live vault can swear now: its tier's trade limit, capped by the mandate. */
export const liveNoteUsd = (s: Pick<State, "record" | "mandate">) => Math.min(s.record.tier.capUsd, s.mandate.maxNotionalUsd);

/** True when gas costs more than the two pool fees on a note of this size (small notes, such as $1 at Probation). */
export const gasDominates = (s: Pick<State, "market">, notionalUsd: number) => roundTripBps(s, notionalUsd) - POOL_FEES_BPS > POOL_FEES_BPS;

/** "about 4.6% on a $1 note": a round-trip cost always tied to the note size it applies to. */
export function roundTripWords(s: Pick<State, "market">, notionalUsd: number): string {
  const size = Number.isInteger(notionalUsd) ? `$${notionalUsd.toFixed(0)}` : `$${notionalUsd.toFixed(2)}`;
  return `about ${(roundTripBps(s, notionalUsd) / 100).toFixed(1)}% on a ${size} note`;
}

/**
 * The gap the agent would trade on: the pool its vault swaps in (the fork during a rehearsal) against the exchanges'
 * mid, in basis points. Every page that quotes "the gap" uses this one figure.
 */
export function tradeGapBps(r: Pick<MarketRow, "spreadBps" | "dexPx" | "cexPx">): number | null {
  if (r.spreadBps != null) return r.spreadBps;
  return r.dexPx != null && r.cexPx != null ? ((r.dexPx - r.cexPx) / r.cexPx) * 1e4 : null;
}
