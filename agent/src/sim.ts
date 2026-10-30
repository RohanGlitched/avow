// Rehearsal only. On the fork nobody else trades, so the fork's pools are kept at the real mainnet pool prices (a mirror): the
// rehearsal sees mainnet's own market. Earlier versions simulated outside traders, calibrated to what
// 30 days of real HSKSwap swaps show (research/STUDY.md): swaps arrive at each pool's measured rate (WETH 4.6, WBTC 2.8,
// WHSK 64.1 a day, exponential gaps). Only the measured pool-side share of them are arbitrageurs (≈15% on WETH and WBTC, ≈5% on
// WHSK, where gaps almost always closed because the exchange moved) and each closes 30–70% of the gap in one swap; the rest are
// noise traders of $20–250.
// Never runs against mainnet (index.ts gates it on DICTUM_MODE=fork-rehearsal).
import { createWalletClient, encodeAbiParameters, http, keccak256, parseAbi, toHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ASSETS, ROUTER, RPC, USDT, hsk } from "./config.js";
import { chain, type Snap } from "./market.js";

const SIM_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // anvil's public test key #1
const sim = privateKeyToAccount(SIM_KEY);
const w = createWalletClient({ account: sim, chain: hsk, transport: http(RPC) });
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const router = parseAbi(["struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }", "function exactInputSingle(P) payable returns (uint256)"]);

let funded = false;
async function fund() {
  if (funded) return;
  await chain.request({ method: "anvil_setBalance" as never, params: [sim.address, toHex(10n ** 21n)] as never });
  for (const t of [USDT, ...ASSETS.map((a) => a.token)] as Address[]) {
    const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [sim.address, 0n]));
    await chain.request({ method: "anvil_setStorageAt" as never, params: [t, slot, toHex(10n ** 30n, { size: 32 })] as never });
    const h = await w.writeContract({ address: t, abi: erc20, functionName: "approve", args: [ROUTER, 2n ** 255n] });
    await chain.waitForTransactionReceipt({ hash: h });
  }
  funded = true;
}

const nextAt = new Map<string, number>();
const SWAPS_PER_DAY: Record<string, number> = { WETH: 4.6, WBTC: 2.8, WHSK: 64.1 };
const ARB_SHARE: Record<string, number> = { WETH: 0.15, WBTC: 0.15, WHSK: 0.05 };
const nextGap = (sym: string) => -Math.log(1 - Math.random()) * (86_400_000 / (SWAPS_PER_DAY[sym] ?? 5));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

async function swap(tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  const h = await w.writeContract({ address: ROUTER, abi: router, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee: 3000, recipient: sim.address, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }] });
  await chain.waitForTransactionReceipt({ hash: h });
}

/** Keep each fork pool at the real mainnet pool price: the rehearsal sees mainnet's own market, and nothing invented. */
export async function simulateOutsideTraders(snaps: Snap[], main: Record<string, { spotPx: number | null }>) {
  await fund();
  for (const s of snaps) {
    const a = ASSETS.find((x) => x.sym === s.sym)!;
    const target = main[s.sym]?.spotPx;
    if (!target || s.spotPx === null || s.poolUsdt === null) continue;
    if (Date.now() < (scenarioHold.get(s.sym) ?? 0)) continue; // a labelled scenario is playing out
    for (let i = 0; i < 6; i++) {
      const spot = Number(await chain.readContract({ address: process.env.DICTUM_VAULT as Address, abi: parseAbi(["function spotPx(uint8) view returns (uint256)"]), functionName: "spotPx", args: [a.id] })) / 1e8;
      const dev = (spot - target) / target;
      if (Math.abs(dev) < 0.0015) break;
      const usd = Math.min(s.poolUsdt * 0.002 * Math.min(1, Math.abs(dev) / 0.01), 2_000);
      if (dev < 0) await swap(USDT, a.token, BigInt(Math.floor(Math.max(20, usd) * 1e6)));
      else await swap(a.token, USDT, BigInt(Math.floor((Math.max(20, usd) / spot) * 10 ** a.decimals)));
    }
  }
}

const scenarioHold = new Map<string, number>();

/** Rehearsal scenario: push one fork pool `gapBps` away from the exchanges, as on Oct 15–16 2026 when the real WHSK pool had not
 *  traded for five days and sat 200+ bps from the exchanges (research/REPLAY.md). Labelled in the journal; fork only. */
export async function scenario(sym: string, fairPx: number, gapBps: number) {
  await fund();
  const a = ASSETS.find((x) => x.sym === sym);
  if (!a) throw new Error("unknown asset");
  const goal = fairPx * (1 + gapBps / 1e4); // negative gap = pool below the exchanges
  scenarioHold.set(sym, Date.now() + 6 * 3600_000); // the mirror leaves this pool alone for six hours
  const spotOf = async () => Number(await chain.readContract({ address: process.env.DICTUM_VAULT as Address, abi: parseAbi(["function spotPx(uint8) view returns (uint256)"]), functionName: "spotPx", args: [a.id] })) / 1e8;
  for (let i = 0; i < 60; i++) {
    const spot = await spotOf();
    if (gapBps < 0 ? spot <= goal : spot >= goal) return spot;
    const usd = 400;
    if (gapBps < 0) await swap(a.token, USDT, BigInt(Math.floor((usd / spot) * 10 ** a.decimals)));
    else await swap(USDT, a.token, BigInt(Math.floor(usd * 1e6)));
  }
  return spotOf();
}
