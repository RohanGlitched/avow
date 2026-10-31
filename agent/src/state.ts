import { PERSONA } from "./personas.js";
import { current as currentErc8004 } from "./erc8004.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSETS, DATA_DIR, DEPLOY_BLOCK, MODE, VAULT } from "./config.js";
import type { MainnetPool } from "./market.js";
import type { Snap } from "./market.js";
import { TIER_NAMES, TIER_RULE, TIER_SHARE, mandateWords, type VaultView } from "./vault.js";
import { journal } from "./journal.js";
import { history } from "./history.js";
import { spend24h, spendAll } from "./llm.js";
import { gasLog, serial } from "./agent.js";
import { shadowState } from "./shadow.js";

let hskUsd = 0.087;

/** The State the web app renders (web/lib/types.ts). */
const readJson = (name: string): unknown => {
  try {
    const f = join(DATA_DIR, name);
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  } catch {
    return null;
  }
};
const study = readJson("study.json");
const replay = readJson("replay.json");

export function buildState(snaps: Snap[], v: VaultView, agentAddr: string, mainnetPools: Record<string, MainnetPool> = {}) {
  const hskSnap = snaps.find((s) => s.sym === "WHSK");
  if (hskSnap?.fairPx) hskUsd = hskSnap.fairPx;
  const maxNotional = Number(v.mandate.maxNotional) / 1e6;
  const tiers = TIER_NAMES.map((name, i) => ({ index: i, name, capUsd: maxNotional * TIER_SHARE[i], share: TIER_SHARE[i], requirement: TIER_RULE[i] }));
  const now = Math.floor(Date.now() / 1000);
  const since = now - 86_400;
  const gas24 = gasLog.filter((g) => g.t >= since).reduce((s, g) => s + g.hsk, 0);
  // gas priced at mainnet's 500 gwei even in rehearsal, so the net figure is honest about what mainnet costs
  const gasUsdAll = gasLog.reduce((s, g) => s + (g.gas ? g.gas * 500e-9 : g.hsk), 0) * hskUsd;
  const spend = spend24h();
  const pxOf = (sym: string) => snaps.find((s) => s.sym === sym);

  const notes = v.notes.map((n) => {
    const a = ASSETS[n.asset];
    const r = journal.rationaleOf(n.id) as { rationale?: string; snaps?: Snap; candidate?: { kind?: string } } | undefined;
    const s = r?.snaps;
    return {
      id: n.id,
      serial: serial(n.id),
      asset: a.sym,
      side: n.side === 0 ? "long" : "short",
      entryPx: n.entryPx,
      targetPx: n.targetPx,
      voidPx: n.voidPx,
      openedAt: n.openedAt,
      expiry: n.expiry,
      confidence: n.confidenceBps / 1e4,
      notionalUsd: n.notional,
      amountIn: n.side === 0 ? Number(n.amountIn) / 1e6 : Number(n.amountIn) / 10 ** a.decimals,
      amountOut: n.side === 0 ? Number(n.amountOut) / 10 ** a.decimals : Number(n.amountOut) / 1e6,
      statement: n.statement ?? "",
      rationale: r?.rationale ?? (journal.all().find((j) => j.kind === "sworn" && j.noteId === n.id)?.detail ?? "").replace(/ \(The published reason was replaced.*$/, ""),
      // spread = HSKSwap premium over the exchanges in bps; momentum and volatility in percent
      signals: s
        ? {
            spreadBps: s.twapPx && s.fairPx ? ((s.twapPx - s.fairPx) / s.fairPx) * 1e4 : undefined,
            momentum1h: s.r1h !== null ? s.r1h * 100 : undefined,
            momentum4h: s.r4h !== null ? s.r4h * 100 : undefined,
            volatility: s.vol1h !== null ? s.vol1h * 100 : undefined,
            fairPx: s.fairPx ?? undefined,
            kind: r?.candidate?.kind,
          }
        : {},
      hash: n.statementHash,
      openTx: n.openTx ?? null,
      openBlock: n.openBlock ?? null,
      tierAtOpen: n.tierAtOpen,
      spotDevBps: n.spotDevBps,
      exitSlipBps: n.exitSlipBps,
      status: n.status,
      exitPx: n.status === "outstanding" ? undefined : n.exitPx,
      settledAt: n.settledAt || undefined,
      settleTx: n.settleTx,
      settler: n.settler,
      pnlUsd: n.status === "outstanding" ? undefined : n.pnl,
      sqError: n.sqErr,
      livePx: n.status === "outstanding" ? pxOf(a.sym)?.twapPx ?? undefined : undefined,
      // marked at the live TWAP, less the 0.30% fee to close
      unrealisedPnlUsd: (() => {
        const px = pxOf(a.sym)?.twapPx;
        if (n.status !== "outstanding" || !px) return undefined;
        return n.side === 0
          ? (Number(n.amountOut) / 10 ** a.decimals) * px * 0.997 - Number(n.amountIn) / 1e6
          : Number(n.amountOut) / 1e6 - (Number(n.amountIn) / 10 ** a.decimals) * px * 1.003;
      })(),
    };
  });

  const holdings = v.balances.map((b) => {
    const px = b.sym === "USDT" ? 1 : pxOf(b.sym)?.twapPx ?? 0;
    return { sym: b.sym, amount: b.amount, usd: b.amount * px, locked: b.locked };
  });

  const market = snaps.map((s) => ({
    asset: s.sym,
    label: s.label,
    dexPx: s.spotPx,
    twapPx: s.twapPx,
    cexPx: s.fairPx,
    hashkeyPx: s.hashkeyPx,
    gatePx: s.gatePx,
    chainlinkPx: s.chainlinkPx,
    chainlinkAgeSec: s.chainlinkAgeSec,
    spreadBps: s.twapPx && s.fairPx ? ((s.twapPx - s.fairPx) / s.fairPx) * 1e4 : null,
    poolUsdt: s.poolUsdt,
    poolAsset: s.poolAsset,
    lastSwapAgoSec: s.lastSwapAgoSec,
    r1h: s.r1h,
    r4h: s.r4h,
    vol1h: s.vol1h,
    swaps3h: s.swaps3h,
    netFlowUsd3h: s.netFlowUsd3h,
    maxSwapUsd3h: s.maxSwapUsd3h,
    history: history.of(s.sym).map((h) => ({ t: h.t, dex: h.dex, cex: h.cex })),
    mainnet: MODE === "mainnet" ? { twapPx: s.twapPx, spotPx: s.spotPx, lastSwapAgoSec: s.lastSwapAgoSec, swaps3h: s.swaps3h } : mainnetPools[s.sym] ?? null,
  }));

  const beat = journal.lastBeat();
  return {
    network: {
      chainId: 177,
      name: MODE === "mainnet" ? "HSK Chain mainnet" : "Rehearsal on a fork of HSK Chain mainnet",
      explorer: "https://hsk.blockscout.com",
      rpc: "https://mainnet.hsk.xyz",
      mode: MODE,
    },
    contracts: { vault: VAULT, factory: null, agent: agentAddr, owner: v.owner, deployBlock: DEPLOY_BLOCK ? Number(DEPLOY_BLOCK) : null },
    asOf: now,
    source: "chain" as const,
    block: v.blockNumber,
    agentAlive: beat > 0 && now - beat < 180,
    lastHeartbeat: beat || null,
    mandate: mandateWords(v.mandate),
    persona: PERSONA,
    erc8004: currentErc8004(),
    record: {
      graded: v.ledger.graded,
      honoured: v.ledger.honoured,
      void: v.ledger.voided,
      lapsed: v.ledger.lapsed,
      retracted: v.ledger.retracted,
      brier: v.brier,
      pnlUsd: v.ledger.realisedPnl,
      tier: tiers[v.tier],
      tiers,
      voidStreak: v.ledger.voidStreak,
      navUsd: v.nav,
      hwmUsd: v.hwm,
      equityUsd: v.equity,
      frozen: v.frozen,
      dailyLossUsd: v.dailyLoss,
      revoked: v.ledger.revoked,
      gasUsdAll: Number(gasUsdAll.toFixed(4)),
      modelUsdAll: Number(spendAll().usd.toFixed(4)),
      netPnlUsd: Number((v.ledger.realisedPnl - gasUsdAll - spendAll().usd).toFixed(4)),
    },
    simulatedOutsideTraders: MODE === "fork-rehearsal",
    study,
    replay,
    shadow: shadowState(),
    holdings,
    notes,
    market,
    journal: journal.recent(200),
    costs: {
      modelCalls24h: spend.calls,
      modelUsd24h: Number(spend.usd.toFixed(4)),
      gasHsk24h: Number(gas24.toFixed(5)),
      gasUsd24h: Number((gas24 * hskUsd).toFixed(4)),
      modelCallsAll: spendAll().calls,
      modelUsdAll: Number(spendAll().usd.toFixed(4)),
      gasHskAll: Number(gasLog.reduce((s, g) => s + g.hsk, 0).toFixed(5)),
    },
  };
}
