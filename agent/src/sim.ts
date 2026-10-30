// Rehearsal only. On the fork nobody else trades, so simulated outside traders stand in for real ones, calibrated to what
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

export async function simulateOutsideTraders(snaps: Snap[]) {
  await fund();
  const now = Date.now();
  for (const s of snaps) {
    const a = ASSETS.find((x) => x.sym === s.sym)!;
    const due = nextAt.get(s.sym) ?? now + nextGap(s.sym);
    if (!nextAt.has(s.sym)) nextAt.set(s.sym, due);
    if (now < due || s.spotPx === null || s.fairPx === null || s.poolUsdt === null) continue;
    nextAt.set(s.sym, now + nextGap(s.sym));
    const gap = (s.fairPx - s.spotPx) / s.spotPx; // + = pool cheap
    if (Math.abs(gap) > 0.0035 && Math.random() < (ARB_SHARE[s.sym] ?? 0.1)) {
      // an arbitrageur closes part of the gap in a few clips
      const goal = s.fairPx - gap * s.spotPx * rnd(0.3, 0.7);
      for (let i = 0; i < 4; i++) {
        const spot = Number(await chain.readContract({ address: process.env.DICTUM_VAULT as Address, abi: parseAbi(["function spotPx(uint8) view returns (uint256)"]), functionName: "spotPx", args: [a.id] })) / 1e8;
        if (gap > 0 ? spot >= goal : spot <= goal) break;
        const usd = s.poolUsdt * 0.0015;
        if (gap > 0) await swap(USDT, a.token, BigInt(Math.floor(usd * 1e6)));
        else await swap(a.token, USDT, BigInt(Math.floor((usd / spot) * 10 ** a.decimals)));
      }
    } else {
      // a noise trader
      const usd = rnd(20, 250);
      if (Math.random() < 0.5) await swap(USDT, a.token, BigInt(Math.floor(usd * 1e6)));
      else await swap(a.token, USDT, BigInt(Math.floor((usd / s.spotPx) * 10 ** a.decimals)));
    }
  }
}
