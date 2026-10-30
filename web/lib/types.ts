// The one data contract between the chain/agent and the UI.
// GET /api/state returns `State`. Every number is already in human units (USD, whole tokens, unix seconds).

export type AssetSym = "WETH" | "WBTC" | "WHSK";
export type Side = "long" | "short";
export type NoteStatus = "outstanding" | "honoured" | "void" | "lapsed" | "retracted" | "revoked";

export interface Note {
  id: number;
  serial: string; // "AVW·000042"
  asset: AssetSym;
  side: Side;
  entryPx: number; // USD per whole asset (HSKSwap 300 s TWAP at swear time)
  targetPx: number;
  voidPx: number; // the stop: the note is void if the TWAP crosses it
  swornVoidPx?: number; // optional: the void level in the sworn statement, when the agent has since tightened the stop
  openedAt: number; // unix s
  expiry: number; // unix s
  confidence: number; // 0.30–0.99, the agent's stated probability that the target comes before the void level and expiry
  notionalUsd: number;
  amountIn: number; // tokens spent (USDT for long, asset for short)
  amountOut: number; // tokens received
  statement: string; // the sworn sentence, emitted on chain
  rationale: string; // the agent's reasons (off-chain journal; hash on chain)
  // spreadBps in basis points; momentum1h/4h and volatility in percent (e.g. -0.81 = -0.81%); fairPx in USD
  signals: { spreadBps?: number; momentum1h?: number; momentum4h?: number; volatility?: number; fairPx?: number };
  hash: `0x${string}`; // statement hash on chain (seeds the rosette)
  openTx: `0x${string}`;
  openBlock: number;
  tierAtOpen: number; // 0..3
  status: NoteStatus;
  exitPx?: number;
  settledAt?: number;
  settleTx?: `0x${string}`;
  settler?: `0x${string}`;
  pnlUsd?: number;
  sqError?: number; // (confidence - outcome)^2 once graded
  livePx?: number; // current TWAP for outstanding notes
}

export interface Mandate {
  maxSlippageBps: number;
  maxSpotDevBps: number; // the live pool price may be at most this far from the 5-minute TWAP when a note is sworn
  cooldownSec: number;
  maxHorizonSec: number;
  maxNotionalUsd: number;
  maxExposureUsd: number;
  dailyLossLimitUsd: number;
  maxDrawdownBps: number;
  minRewardRisk: number; // e.g. 1.2
  maxStopBps: number;
  assets: AssetSym[];
  paused: boolean;
}

export interface Tier {
  index: number; // 0..3
  name: "Probation" | "Apprentice" | "Journeyman" | "Fiduciary";
  capUsd: number; // the denomination: largest note the agent may write now
  share: number; // 0.2 / 0.4 / 0.7 / 1.0 of maxNotional
  requirement: string; // plain words, e.g. "12 graded notes, Brier ≤ 0.22, P&L ≥ 0"
}

export interface Record {
  graded: number;
  honoured: number;
  void: number;
  lapsed: number;
  retracted: number;
  brier: number | null; // rolling window (last 32 graded), null if none
  pnlUsd: number; // realised
  tier: Tier;
  tiers: Tier[]; // the ladder
  voidStreak: number;
  navUsd: number;
  hwmUsd: number;
  frozen: boolean;
  dailyLossUsd: number;
}

export interface MarketRow {
  asset: AssetSym;
  label: string; // "ETH"
  dexPx: number | null; // HSKSwap spot
  twapPx: number | null; // HSKSwap 300 s TWAP
  cexPx: number | null; // HashKey Global mid
  chainlinkPx: number | null;
  chainlinkAgeSec: number | null;
  spreadBps: number | null; // (dex - cex) / cex * 1e4
  poolUsdt: number | null; // USDT side of the pool
  poolAsset: number | null;
  lastSwapAgoSec: number | null;
  history: { t: number; dex: number | null; cex: number | null }[]; // recent series for sparklines/charts
}

export type JournalKind = "heartbeat" | "considered" | "declined" | "sworn" | "settled" | "blocked" | "amended" | "tightened" | "error";
export interface JournalEntry {
  t: number;
  kind: JournalKind;
  asset?: AssetSym;
  title: string; // one line, plain words
  detail?: string; // the model's reason or the rule that blocked it
  noteId?: number;
  tx?: `0x${string}`;
  model?: string; // "gemini-3.5-flash"
  tokens?: number;
}

export interface Holding {
  sym: "USDT" | AssetSym;
  amount: number;
  usd: number;
  locked: number; // in outstanding notes
}

export interface State {
  network: { chainId: number; name: string; explorer: string; rpc: string; mode: "mainnet" | "testnet" | "fork-rehearsal" };
  contracts: { vault: `0x${string}` | null; factory: `0x${string}` | null; agent: `0x${string}` | null; owner: `0x${string}` | null; deployBlock: number | null };
  asOf: number;
  source?: "fixture" | "chain"; // optional: "fixture" freezes the UI clock at asOf and labels the data as a sample
  block?: number; // optional: latest block the reader saw
  agentAlive: boolean; // last heartbeat < 3 min
  lastHeartbeat: number | null;
  mandate: Mandate;
  record: Record;
  holdings: Holding[];
  notes: Note[]; // newest first
  market: MarketRow[];
  journal: JournalEntry[]; // newest first, last ~200
  costs: { modelCalls24h: number; modelUsd24h: number; gasHsk24h: number; gasUsd24h: number };
}
