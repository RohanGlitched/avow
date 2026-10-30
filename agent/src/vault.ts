import { parseAbi, parseEventLogs, type Hex } from "viem";
import { ASSETS, DEPLOY_BLOCK, USDT, VAULT, type Sym } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain } from "./market.js";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
export const STATUS = ["none", "outstanding", "honoured", "void", "lapsed", "retracted", "revoked"] as const;
export type StatusName = (typeof STATUS)[number];
export const TIER_NAMES = ["Probation", "Apprentice", "Journeyman", "Fiduciary"] as const;
export const TIER_SHARE = [0.2, 0.4, 0.7, 1.0];
export const TIER_RULE = [
  "Every new agent starts here: fewer than 5 graded notes, or a Brier score worse than a coin flip",
  "5 graded notes with a Brier score of 0.25 or better",
  "12 graded notes, Brier 0.22 or better, realised P&L not negative",
  "25 graded notes, Brier 0.20 or better, realised P&L positive",
];

export interface RawMandate {
  maxSlippageBps: number;
  maxSpotDevBps: number;
  maxStopBps: number;
  minRewardRiskX100: number;
  maxDrawdownBps: number;
  cooldown: number;
  maxHorizon: number;
  maxNotional: bigint;
  maxExposure: bigint;
  dailyLossLimit: bigint;
  assetMask: number;
  paused: boolean;
}

export interface ChainNote {
  id: number;
  asset: number;
  side: number;
  status: StatusName;
  tierAtOpen: number;
  confidenceBps: number;
  openedAt: number;
  expiry: number;
  settledAt: number;
  entryPx: number;
  targetPx: number;
  voidPx: number;
  exitPx: number;
  entryPx8: bigint;
  targetPx8: bigint;
  voidPx8: bigint;
  notional: number;
  pnl: number;
  amountIn: bigint;
  amountOut: bigint;
  statementHash: Hex;
  statement?: string;
  rationaleHash?: Hex;
  openTx?: Hex;
  openBlock?: number;
  settleTx?: Hex;
  settler?: Hex;
  sqErr?: number;
}

export interface VaultView {
  mandate: RawMandate;
  ledger: { graded: number; honoured: number; voided: number; lapsed: number; retracted: number; voidStreak: number; windowCount: number; realisedPnl: number };
  brier: number | null;
  tier: number;
  denomination: number;
  nav: number;
  hwm: number;
  frozen: boolean;
  dailyLoss: number;
  lossDay: number;
  exposure: number;
  lastSwearAt: number;
  noteCount: number;
  owner: Hex;
  agent: Hex;
  balances: { sym: "USDT" | Sym; raw: bigint; amount: number; locked: number }[];
  notes: ChainNote[];
  blockTime: number;
}

// ── events, read incrementally in 5,000-block chunks (the public RPC refuses ranges ≥ 10,000)
const evCache: { to: bigint; sworn: Map<number, { statement: string; rationaleHash: Hex; tx: Hex; block: number }>; settled: Map<number, { tx: Hex; settler: Hex; sqErr: number }> } = {
  to: DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK - 1n : 0n,
  sworn: new Map(),
  settled: new Map(),
};

async function syncEvents() {
  const head = await chain.getBlockNumber();
  let from = evCache.to + 1n;
  if (from === 1n && DEPLOY_BLOCK === 0n) from = head > 4_999n ? head - 4_999n : 0n;
  while (from <= head) {
    const to = from + 4_999n > head ? head : from + 4_999n;
    const logs = await chain.getLogs({ address: VAULT, fromBlock: from, toBlock: to });
    const parsed = parseEventLogs({ abi: vaultAbi, logs, strict: false });
    for (const l of parsed) {
      if (l.eventName === "NoteSworn") {
        const a = l.args as { id: bigint; statement: string; rationaleHash: Hex };
        evCache.sworn.set(Number(a.id), { statement: a.statement, rationaleHash: a.rationaleHash, tx: l.transactionHash!, block: Number(l.blockNumber) });
      } else if (l.eventName === "NoteSettled") {
        const a = l.args as { id: bigint; settler: Hex; sqErr: bigint };
        evCache.settled.set(Number(a.id), { tx: l.transactionHash!, settler: a.settler, sqErr: Number(a.sqErr) / 1e8 });
      }
    }
    evCache.to = to;
    from = to + 1n;
  }
}

const noteCache = new Map<number, ChainNote>(); // settled notes never change

export async function readVault(): Promise<VaultView> {
  await syncEvents().catch((e) => console.error("events", e?.shortMessage ?? e));
  const base = (await chain.multicall({
    allowFailure: false,
    contracts: [
      { address: VAULT, abi: vaultAbi, functionName: "mandate" },
      { address: VAULT, abi: vaultAbi, functionName: "ledger" },
      { address: VAULT, abi: vaultAbi, functionName: "brier" },
      { address: VAULT, abi: vaultAbi, functionName: "tier" },
      { address: VAULT, abi: vaultAbi, functionName: "denomination" },
      { address: VAULT, abi: vaultAbi, functionName: "nav" },
      { address: VAULT, abi: vaultAbi, functionName: "hwm" },
      { address: VAULT, abi: vaultAbi, functionName: "frozen" },
      { address: VAULT, abi: vaultAbi, functionName: "dailyLoss" },
      { address: VAULT, abi: vaultAbi, functionName: "lossDay" },
      { address: VAULT, abi: vaultAbi, functionName: "exposure" },
      { address: VAULT, abi: vaultAbi, functionName: "lastSwearAt" },
      { address: VAULT, abi: vaultAbi, functionName: "noteCount" },
      { address: VAULT, abi: vaultAbi, functionName: "owner" },
      { address: VAULT, abi: vaultAbi, functionName: "agent" },
      { address: VAULT, abi: vaultAbi, functionName: "lockedUsdt" },
      { address: USDT, abi: erc20, functionName: "balanceOf", args: [VAULT] },
      ...ASSETS.map((a) => ({ address: a.token, abi: erc20, functionName: "balanceOf", args: [VAULT] }) as const),
      ...ASSETS.map((a) => ({ address: VAULT, abi: vaultAbi, functionName: "lockedAsset", args: [a.id] }) as const),
    ] as never,
  })) as unknown[];
  const [m, l, br, tier, denom, nav, hwm, frozen, dailyLoss, lossDay, exposure, lastSwearAt, noteCount, owner, agent, lockedUsdt, usdtBal] = base as unknown as [
    RawMandate,
    { graded: number; honoured: number; voided: number; lapsed: number; retracted: number; voidStreak: number; windowCount: number; realisedPnl: bigint },
    bigint, number, bigint, bigint, bigint, boolean, bigint, bigint, bigint, bigint, bigint, Hex, Hex, bigint, bigint,
  ];
  const n = ASSETS.length;
  const assetBals = base.slice(17, 17 + n) as bigint[];
  const locks = base.slice(17 + n, 17 + 2 * n) as bigint[];

  const count = Number(noteCount);
  const want: number[] = [];
  for (let i = 0; i < count; i++) if (!noteCache.has(i)) want.push(i);
  // outstanding notes are re-read every time
  for (const [id, c] of noteCache) if (c.status === "outstanding") want.push(id);
  if (want.length) {
    const rows = await chain.multicall({ allowFailure: false, contracts: want.map((id) => ({ address: VAULT, abi: vaultAbi, functionName: "getNote", args: [BigInt(id)] }) as const) });
    rows.forEach((r, i) => {
      const x = r as unknown as {
        asset: number; side: number; status: number; tierAtOpen: number; confidenceBps: number; openedAt: number; expiry: number; settledAt: number;
        entryPx: bigint; targetPx: bigint; voidPx: bigint; exitPx: bigint; notional: bigint; pnl: bigint; amountIn: bigint; amountOut: bigint; statementHash: Hex;
      };
      const id = want[i];
      noteCache.set(id, {
        id,
        asset: x.asset,
        side: x.side,
        status: STATUS[x.status],
        tierAtOpen: x.tierAtOpen,
        confidenceBps: x.confidenceBps,
        openedAt: Number(x.openedAt),
        expiry: Number(x.expiry),
        settledAt: Number(x.settledAt),
        entryPx: Number(x.entryPx) / 1e8,
        targetPx: Number(x.targetPx) / 1e8,
        voidPx: Number(x.voidPx) / 1e8,
        exitPx: Number(x.exitPx) / 1e8,
        entryPx8: x.entryPx,
        targetPx8: x.targetPx,
        voidPx8: x.voidPx,
        notional: Number(x.notional) / 1e6,
        pnl: Number(x.pnl) / 1e6,
        amountIn: x.amountIn,
        amountOut: x.amountOut,
        statementHash: x.statementHash,
      });
    });
  }
  const notes = [...noteCache.values()]
    .map((c) => {
      const s = evCache.sworn.get(c.id);
      const z = evCache.settled.get(c.id);
      return { ...c, statement: s?.statement, rationaleHash: s?.rationaleHash, openTx: s?.tx, openBlock: s?.block, settleTx: z?.tx, settler: z?.settler, sqErr: z?.sqErr };
    })
    .sort((a, b) => b.id - a.id);

  const blk = await chain.getBlock();
  return {
    mandate: m,
    ledger: { ...l, realisedPnl: Number(l.realisedPnl) / 1e6 },
    brier: br > 10n ** 30n ? null : Number(br) / 1e8,
    tier,
    denomination: Number(denom) / 1e6,
    nav: Number(nav) / 1e6,
    hwm: Number(hwm) / 1e6,
    frozen,
    dailyLoss: Number(dailyLoss) / 1e6,
    lossDay: Number(lossDay),
    exposure: Number(exposure) / 1e6,
    lastSwearAt: Number(lastSwearAt),
    noteCount: count,
    owner,
    agent,
    balances: [
      { sym: "USDT", raw: usdtBal, amount: Number(usdtBal) / 1e6, locked: Number(lockedUsdt) / 1e6 },
      ...ASSETS.map((a, i) => ({ sym: a.sym, raw: assetBals[i], amount: Number(assetBals[i]) / 10 ** a.decimals, locked: Number(locks[i]) / 10 ** a.decimals })),
    ],
    notes,
    blockTime: Number(blk.timestamp),
  };
}

export function mandateWords(m: RawMandate) {
  return {
    maxSlippageBps: m.maxSlippageBps,
    maxSpotDevBps: m.maxSpotDevBps,
    maxStopBps: m.maxStopBps,
    minRewardRisk: m.minRewardRiskX100 / 100,
    maxDrawdownBps: m.maxDrawdownBps,
    cooldownSec: m.cooldown,
    maxHorizonSec: m.maxHorizon,
    maxNotionalUsd: Number(m.maxNotional) / 1e6,
    maxExposureUsd: Number(m.maxExposure) / 1e6,
    dailyLossLimitUsd: Number(m.dailyLossLimit) / 1e6,
    assets: ASSETS.filter((a) => (m.assetMask >> a.id) & 1).map((a) => a.sym),
    paused: m.paused,
  };
}
