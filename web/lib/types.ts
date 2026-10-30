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
  confidence: number; // 0.50–0.99, the agent's stated probability that the target comes before the void level and expiry
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
  unrealisedPnlUsd?: number; // outstanding notes: marked at the live pool price minus the exit fee
  /** Settlement terms frozen when the note was sworn: the live price must be within this many bps of the TWAP to settle a target or expiry. */
  spotDevBps?: number;
  /** Settlement terms frozen when the note was sworn: the closing swap's slippage bound, in bps. */
  exitSlipBps?: number;
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
  pnlUsd: number; // realised, on chain (after pool fees; gas and model spend are not in it)
  netPnlUsd?: number; // realised P&L minus gas and model spend
  gasUsdAll?: number;
  modelUsdAll?: number;
  revoked?: number;
  tier: Tier;
  tiers: Tier[]; // the ladder
  voidStreak: number;
  navUsd: number;
  hwmUsd: number; // high-water mark of realised equity (0 until the first note is sworn)
  equityUsd?: number; // realised equity: what the drawdown clause measures
  frozen: boolean;
  dailyLossUsd: number;
}

export interface MarketRow {
  asset: AssetSym;
  label: string; // "ETH"
  dexPx: number | null; // HSKSwap spot
  twapPx: number | null; // HSKSwap 300 s TWAP
  cexPx: number | null; // the exchanges' mid (HashKey Global and Gate)
  hashkeyPx?: number | null; // HashKey Global mid
  gatePx?: number | null; // Gate mid
  chainlinkPx: number | null;
  chainlinkAgeSec: number | null;
  spreadBps: number | null; // (dex - cex) / cex * 1e4
  poolUsdt: number | null; // USDT side of the pool
  poolAsset: number | null;
  lastSwapAgoSec: number | null;
  history: { t: number; dex: number | null; cex: number | null }[]; // recent series for sparklines/charts
  /** The real mainnet pool, shown next to the fork figures during a rehearsal. */
  mainnet?: { twapPx: number | null; spotPx: number | null; lastSwapAgoSec: number | null; swaps3h: number | null };
  swaps3h?: number;
}

export type JournalKind = "heartbeat" | "considered" | "declined" | "sworn" | "settled" | "blocked" | "amended" | "tightened" | "reviewed" | "error";
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
  costs: { modelCalls24h: number; modelUsd24h: number; gasHsk24h: number; gasUsd24h: number; modelCallsAll?: number; modelUsdAll?: number; gasHskAll?: number; gasUsdAll?: number };
  /** True in a fork rehearsal: outside arbitrageurs and noise traders on the fork are scripted by the agent's simulator. */
  simulatedOutsideTraders?: boolean;
  /** An empirical study of how often real HSKSwap gaps against the exchanges closed, from mainnet swap logs. */
  study?: Study;
  /** The agent's exact rules, and a small pre-declared family of alternatives, replayed over 30 days of real HSKSwap swaps (research/REPLAY.md). */
  replay?: Replay;
  /** Every candidate the rules produced, sworn or declined, entered at the real HSK mainnet pool price and graded live against real mainnet prices by the vault's own rules. */
  shadow?: Shadow;
}

export type ShadowStatus = "open" | "honoured" | "void" | "lapsed";
export interface ShadowRow {
  id: number;
  t: number; // unix s, when the candidate was seen
  sym: string; // "WETH"
  side: Side;
  kind: string; // "catch-up", "momentum"
  entry: number;
  target: number;
  void: number;
  expiry: number;
  pMin: number; // break-even probability after fees and gas
  notionalUsd: number;
  decision: "sworn" | "declined" | "passed";
  status: ShadowStatus;
  exitPx?: number;
  settledAt?: number;
  pnlUsd?: number;
}
export interface Shadow {
  method: string;
  since: number | null;
  counts: { total: number; open: number; honoured: number; void: number; lapsed: number };
  pnlUsd: number; // every graded candidate
  refusedPnlUsd: number; // the candidates Avow declined or passed: negative means a loss avoided
  swornPnlUsd: number; // the candidates it swore
  recent: ShadowRow[];
}

/** A metric bag from the replay: keys such as notes, hitRate, meanPMin, pnlUsd, pnlPerNoteUsd. */
export type ReplayStats = { [k: string]: number | null | object };
export interface ReplayCurrent {
  asset: string;
  kind: string;
  notes: number;
  honoured: number;
  void: number;
  lapsed: number;
  hitRate: number | null;
  meanPMin: number | null; // mean break-even probability of the notes it would have sworn
  pnlUsd: number;
  pnlPerNoteUsd: number | null; // per $50 note, after fees, price impact and gas
  grossPnlPerNoteUsd?: number | null; // before fees, impact and gas
  feeUsdPerNote?: number | null;
  impactUsdPerNote?: number | null;
  gasUsdPerNote?: number | null;
  /** What the vault would have done had the agent stated the odds these notes really achieved. */
  calibratedForecaster?: { trueHitRate: number; notesPassingContractCheck: number; shareOfNotes?: number; beatsMeanPMin?: boolean; rule?: string };
  inSample?: ReplayStats;
  outOfSample?: ReplayStats;
}
export interface ReplayCandidate {
  name: string;
  family?: string;
  description: string;
  params: { [k: string]: unknown };
  inSample: ReplayStats;
  outOfSample: ReplayStats;
}
export interface Replay {
  generatedAt: number;
  window: { from: number; to: number; splitAt: number };
  costModel: string;
  current: ReplayCurrent[];
  candidates: ReplayCandidate[];
  chosen: { name: string; params: { [k: string]: unknown }; why: string; outOfSample: ReplayStats; suggestedOdds: number } | null;
  configsTried: number;
  notes: string;
}

export interface StudyRow {
  asset: string;
  gapBucket: string;
  episodes: number;
  convergedWithin12h: number;
  medianHoursToConverge: number | null;
  convergedWithin2h?: number;
  /** episodes where the pool itself moved at least half the gap within 12 h (what a catch-up note needs) */
  poolMovedHalfWithin12h?: number;
  /** share of the closing move that came from the pool side (0..1) */
  poolSideShare?: number | null;
}
export interface Study {
  generatedAt: number;
  windowDays: number;
  rows: StudyRow[];
  notes: string;
}
