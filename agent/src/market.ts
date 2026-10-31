import { createPublicClient, fallback, http, parseAbi, parseAbiItem, type Address } from "viem";
import { ASSETS, MAINNET_RPC, MAINNET_RPCS, RPC, RPCS, USDT, VAULT, FEED_USDT, hsk, hskMainnet, type AssetCfg, type Sym } from "./config.js";
import { vaultAbi } from "./abi.js";

// The public RPC rate-limits per IP, and several agents share one: concurrent reads go out as JSON-RPC batches and failed
// requests back off before retrying. No automatic Multicall3 folding: Chainlink on HSK Chain refuses contract callers, and a
// multicalled read is a contract call.
const transport = (url: string) => http(url, { timeout: 20_000, retryCount: 3, retryDelay: 1_500, batch: { batchSize: 20, wait: 16 } });
const transports = (urls: string[]) => (urls.length > 1 ? fallback(urls.map(transport)) : transport(urls[0]));
export const chain = createPublicClient({ chain: { ...hsk, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } }, transport: transports(RPCS) });
export const mainnet = createPublicClient({ chain: { ...hskMainnet, contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } } }, transport: transports(MAINNET_RPCS) });

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const poolAbi = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function observations(uint256) view returns (uint32,int56,uint160,bool)",
]);
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)", "function decimals() view returns (uint8)"]);

export interface Snap {
  sym: Sym;
  label: string;
  t: number;
  twapPx: number | null; // HSKSwap 300 s TWAP, USDT per asset
  twapPx8: bigint | null; // exact, as the vault sees it
  spotPx: number | null;
  poolUsdt: number | null;
  poolAsset: number | null;
  lastSwapAgoSec: number | null;
  hashkeyPx: number | null; // HashKey Global mid
  gatePx: number | null; // Gate.io mid
  fairPx: number | null; // mean of the exchange mids we could read
  chainlinkPx: number | null; // asset/USD ÷ USDT/USD
  chainlinkAgeSec: number | null;
  gapBps: number | null; // (fair - twap) / twap: positive = HSKSwap is cheap
  chainlinkDevBps: number | null; // |twap - chainlink| / chainlink
  r1h: number | null; // exchange returns
  r4h: number | null;
  r24h: number | null;
  vol1h: number | null; // stdev of 1 h log returns over 48 h
  swaps3h: number | null; // swaps in the pool over the last 5,000 blocks (~2.8 h)
  netFlowUsd3h: number | null; // USDT paid into the pool minus USDT taken out (positive = people bought the asset)
  maxSwapUsd3h: number | null;
}

const swapEv = parseAbiItem("event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)");
const flowCache = new Map<string, { t: number; v: { swaps3h: number; netFlowUsd3h: number; maxSwapUsd3h: number } }>();
/** On-chain flow: who has traded this pool lately, and which way. */
async function flow(a: AssetCfg) {
  const c = flowCache.get(a.sym);
  if (c && Date.now() - c.t < 5 * 60_000) return c.v;
  const head = await chain.getBlockNumber();
  const logs = await chain.getLogs({ address: a.pool, event: swapEv, fromBlock: head - 4_999n, toBlock: head });
  const usdtIs0 = USDT.toLowerCase() < a.token.toLowerCase();
  let net = 0, max = 0;
  for (const l of logs) {
    const u = Number((usdtIs0 ? l.args.amount0 : l.args.amount1) ?? 0n) / 1e6; // + = USDT into the pool
    net += u;
    max = Math.max(max, Math.abs(u));
  }
  const v = { swaps3h: logs.length, netFlowUsd3h: net, maxSwapUsd3h: max };
  flowCache.set(a.sym, { t: Date.now(), v });
  return v;
}

async function getJson(url: string, ms = 8000): Promise<unknown> {
  const ctl = AbortSignal.timeout(ms);
  const r = await fetch(url, { signal: ctl, headers: { "user-agent": "dictum-agent/1.0" } });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function hashkeyMid(a: AssetCfg): Promise<number | null> {
  try {
    const d = (await getJson(`https://api-glb.hashkey.com/quote/v1/ticker/bookTicker?symbol=${a.hashkey}`)) as { b: string; a: string }[];
    const b = Number(d[0]?.b), k = Number(d[0]?.a);
    return b > 0 && k > 0 ? (b + k) / 2 : null;
  } catch {
    return null;
  }
}

async function gateMid(a: AssetCfg): Promise<number | null> {
  try {
    const d = (await getJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${a.gate}`)) as { highest_bid: string; lowest_ask: string }[];
    const b = Number(d[0]?.highest_bid), k = Number(d[0]?.lowest_ask);
    return b > 0 && k > 0 ? (b + k) / 2 : null;
  } catch {
    return null;
  }
}

const klineCache = new Map<string, { t: number; closes: number[] }>();
async function closes(a: AssetCfg): Promise<number[] | null> {
  const c = klineCache.get(a.gate);
  if (c && Date.now() - c.t < 5 * 60_000) return c.closes;
  try {
    const d = (await getJson(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${a.gate}&interval=1h&limit=49`)) as string[][];
    const cl = d.map((r) => Number(r[2])).filter((x) => x > 0);
    klineCache.set(a.gate, { t: Date.now(), closes: cl });
    return cl;
  } catch {
    return c?.closes ?? null;
  }
}

function stats(cl: number[] | null, now: number | null) {
  if (!cl || cl.length < 30) return { r1h: null, r4h: null, r24h: null, vol1h: null };
  const last = now ?? cl[cl.length - 1];
  const at = (h: number) => cl[cl.length - 1 - h];
  const lr: number[] = [];
  for (let i = 1; i < cl.length; i++) lr.push(Math.log(cl[i] / cl[i - 1]));
  const m = lr.reduce((s, x) => s + x, 0) / lr.length;
  const vol = Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (lr.length - 1));
  return { r1h: last / at(1) - 1, r4h: last / at(4) - 1, r24h: last / at(24) - 1, vol1h: vol };
}

const usdtFeedCache = { t: 0, px: 1, at: 0 };
async function chainlink(a: AssetCfg): Promise<{ px: number | null; age: number | null }> {
  try {
    const [r, d] = await Promise.all([
      mainnet.readContract({ address: a.feed, abi: feedAbi, functionName: "latestRoundData" }),
      mainnet.readContract({ address: a.feed, abi: feedAbi, functionName: "decimals" }),
    ]);
    if (Date.now() - usdtFeedCache.t > 10 * 60_000) {
      const u = await mainnet.readContract({ address: FEED_USDT, abi: feedAbi, functionName: "latestRoundData" });
      usdtFeedCache.px = Number(u[1]) / 1e8;
      usdtFeedCache.at = Number(u[3]);
      usdtFeedCache.t = Date.now();
    }
    const px = Number(r[1]) / 10 ** d / usdtFeedCache.px;
    const updated = Math.min(Number(r[3]), usdtFeedCache.at || Number(r[3]));
    return { px, age: Math.floor(Date.now() / 1000) - updated };
  } catch {
    return { px: null, age: null };
  }
}

async function pool(a: AssetCfg) {
  const id = a.id;
  const res = await chain.multicall({
    allowFailure: true,
    contracts: [
      { address: VAULT, abi: vaultAbi, functionName: "twapPx", args: [id] },
      { address: VAULT, abi: vaultAbi, functionName: "spotPx", args: [id] },
      { address: USDT, abi: erc20, functionName: "balanceOf", args: [a.pool] },
      { address: a.token, abi: erc20, functionName: "balanceOf", args: [a.pool] },
      { address: a.pool, abi: poolAbi, functionName: "slot0" },
    ],
  });
  const twap8 = res[0].status === "success" ? (res[0].result as bigint) : null;
  const spot8 = res[1].status === "success" ? (res[1].result as bigint) : null;
  const pu = res[2].status === "success" ? Number(res[2].result as bigint) / 1e6 : null;
  const pa = res[3].status === "success" ? Number(res[3].result as bigint) / 10 ** a.decimals : null;
  let lastSwapAgoSec: number | null = null;
  if (res[4].status === "success") {
    const s0 = res[4].result as readonly [bigint, number, number, number, number, number, boolean];
    try {
      const o = await chain.readContract({ address: a.pool, abi: poolAbi, functionName: "observations", args: [BigInt(s0[2])] });
      const blk = await chain.getBlock();
      lastSwapAgoSec = Number(blk.timestamp) - Number(o[0]);
    } catch {}
  }
  return { twap8, spot8, pu, pa, lastSwapAgoSec };
}

export async function snapshot(): Promise<Snap[]> {
  const t = Math.floor(Date.now() / 1000);
  return Promise.all(
    ASSETS.map(async (a) => {
      const [p, hk, gt, cl, kl, fl] = await Promise.all([
        pool(a).catch(() => ({ twap8: null, spot8: null, pu: null, pa: null, lastSwapAgoSec: null })),
        hashkeyMid(a),
        gateMid(a),
        chainlink(a),
        closes(a),
        flow(a).catch(() => ({ swaps3h: null, netFlowUsd3h: null, maxSwapUsd3h: null })),
      ]);
      const mids = [hk, gt].filter((x): x is number => x !== null);
      const fair = mids.length ? mids.reduce((s, x) => s + x, 0) / mids.length : null;
      const twap = p.twap8 !== null ? Number(p.twap8) / 1e8 : null;
      const spot = p.spot8 !== null ? Number(p.spot8) / 1e8 : null;
      const st = stats(kl, fair);
      return {
        sym: a.sym,
        label: a.label,
        t,
        twapPx: twap,
        twapPx8: p.twap8,
        spotPx: spot,
        poolUsdt: p.pu,
        poolAsset: p.pa,
        lastSwapAgoSec: p.lastSwapAgoSec,
        hashkeyPx: hk,
        gatePx: gt,
        fairPx: fair,
        chainlinkPx: cl.px,
        chainlinkAgeSec: cl.age,
        gapBps: fair && twap ? ((fair - twap) / twap) * 1e4 : null,
        chainlinkDevBps: cl.px && twap ? (Math.abs(twap - cl.px) / cl.px) * 1e4 : null,
        ...st,
        ...fl,
      } satisfies Snap;
    }),
  );
}

export interface MainnetPool { twapPx: number | null; spotPx: number | null; lastSwapAgoSec: number | null; swaps3h: number | null }
const mainCache = new Map<string, { t: number; v: MainnetPool }>();
const pxOfTick = (a: AssetCfg, tick: number, assetIs0: boolean) => {
  const raw = Math.pow(1.0001, tick); // token1 per token0 in raw units
  return assetIs0 ? raw * 10 ** (a.decimals - 6) : 1 / (raw * 10 ** (6 - a.decimals));
};
/** The same pool on HSK mainnet (during rehearsal the fork drifts from it; this is what the real market shows). */
export async function mainnetPool(a: AssetCfg): Promise<MainnetPool> {
  const c = mainCache.get(a.sym);
  if (c && Date.now() - c.t < 60_000) return c.v;
  const pAbi = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)", "function observe(uint32[]) view returns (int56[],uint160[])", "function observations(uint256) view returns (uint32,int56,uint160,bool)"]);
  try {
    const assetIs0 = a.token.toLowerCase() < USDT.toLowerCase();
    const s0 = await mainnet.readContract({ address: a.pool, abi: pAbi, functionName: "slot0" });
    let twap: number | null = null;
    try {
      const o = await mainnet.readContract({ address: a.pool, abi: pAbi, functionName: "observe", args: [[300, 0]] });
      twap = pxOfTick(a, Math.floor(Number(o[0][1] - o[0][0]) / 300), assetIs0);
    } catch {}
    const ob = await mainnet.readContract({ address: a.pool, abi: pAbi, functionName: "observations", args: [BigInt(s0[2])] });
    const blk = await mainnet.getBlock();
    let swaps3h: number | null = null;
    try {
      const logs = await mainnet.getLogs({ address: a.pool, event: swapEv, fromBlock: blk.number - 4_999n, toBlock: blk.number });
      swaps3h = logs.length;
    } catch {}
    const v = { twapPx: twap, spotPx: pxOfTick(a, Number(s0[1]), assetIs0), lastSwapAgoSec: Number(blk.timestamp) - Number(ob[0]), swaps3h };
    mainCache.set(a.sym, { t: Date.now(), v });
    return v;
  } catch {
    return c?.v ?? { twapPx: null, spotPx: null, lastSwapAgoSec: null, swaps3h: null };
  }
}

export function assetOf(sym: Sym): AssetCfg {
  return ASSETS.find((a) => a.sym === sym)!;
}

export type { Address };
