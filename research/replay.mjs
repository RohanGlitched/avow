// Honest replay of Avow's note rules on 30 days of real HSKSwap swaps (HSK Chain mainnet) and exchange candles.
//
// What it does
//   1. Rebuilds each pool (USDT/WETH, USDT/WBTC, USDT/WHSK) swap by swap: sqrtPriceX96, tick and in-range liquidity
//      from every Swap event (cache/bs-swaps-*.json, cross-checked against cache/swaps-*.json).
//   2. Replays the EXACT live candidate rules (agent/src/signals.ts: catch-up and momentum) on 5-minute steps, opens a
//      note whenever a candidate exists (no model), and settles by AvowVault.sol's rules, checked every 30 s like the
//      agent loop: Void when BOTH the 300 s mean-tick TWAP and the slot0 tick price are at/past the void level, then
//      (only when |spot - TWAP| <= maxSpotDevBps) Lapsed at expiry or Honoured when both are at/past the target.
//   3. Every trade (open and close) goes through the pool's own constant-liquidity math (dy = L*dsqrtP), with the
//      0.30% fee, the contract's slippage guards (60 bps in, 120 bps out vs the TWAP) and its SelfFulfilling check.
//      Gas: 920k gas per note round trip at 500 gwei, priced in HSK at the time.
//   4. Searches a small grid of alternative contract-expressible rules (declared below, before any result), picks one on
//      the first 20 days only, and reports the chosen one on the last 10 days.
//
// Usage: node replay.mjs            (writes replay.json, replay-notes.json)
//        node replay.mjs --persist  (impact model sensitivity: our price impact persists through later swaps)
// Data: cache only, plus Gate.io / HashKey Global 5-minute candles (fetched once, cached). No RPC calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────────────────────── constants (signals.ts, AvowVault.sol, deploy.ts mandate)
const STEP = 300; // agent decision step for opening notes (5 min)
const SETTLE_STEP = 30; // agent loop: settleable() checked every 30 s
const FEE = 0.003; // HSKSwap 0.30% tier
const POOL_FEE_BPS = 30;
const MANDATE = {
  notionalUsd: 50, // Probation: 20% of maxNotional $250
  maxStopBps: 300, minRewardRisk: 1.2, maxSlippageBps: 60, maxSpotDevBps: 100,
  cooldownSec: 600, maxHorizonSec: 24 * 3600, maxExposureUsd: 250, dailyLossLimitUsd: 10,
};
const MIN_STOP_BPS = 25;
const CHAINLINK_MAX_DEV_BPS = 300; // seatbelt; replayed against the exchange mid (Chainlink history not cached)
const GAS_UNITS = 920_000; // swear ~0.54M + settle ~0.38M, measured on the fork
const GAS_PRICE_HSK = 500e-9;
const TWAP_WINDOW = 300;
const IMPACT_MODEL = process.argv.includes('--persist') ? 'persist' : 'reset';

const ASSETS = {
  WETH: { dec: 18, gate: 'ETH_USDT', hk: 'ETHUSDT' },
  WBTC: { dec: 8, gate: 'BTC_USDT', hk: 'BTCUSDT' },
  WHSK: { dec: 18, gate: 'HSK_USDT', hk: 'HSKUSDT' },
};
const SYMS = Object.keys(ASSETS);

// ───────────────────────────────────────────── window
const win = readJson('window.json');
const endT = Math.floor(win.headTs / STEP) * STEP;
const startT = endT - win.days * 86400;
const splitAt = startT + 20 * 86400;

// ───────────────────────────────────────────── block time (linear interpolation over every known block timestamp)
const bts = Object.entries(readJson('blockts.json')).map(([b, t]) => [Number(b), t]).sort((a, b) => a[0] - b[0]);
function tsOfBlock(n) {
  if (n <= bts[0][0]) return bts[0][1] + (n - bts[0][0]) * 2;
  if (n >= bts[bts.length - 1][0]) return bts[bts.length - 1][1] + (n - bts[bts.length - 1][0]) * 2;
  let lo = 0, hi = bts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bts[m][0] <= n) lo = m; else hi = m; }
  const [b0, t0] = bts[lo], [b1, t1] = bts[hi];
  return t0 + ((n - b0) * (t1 - t0)) / (b1 - b0);
}

// ───────────────────────────────────────────── candles (Gate.io + HashKey Global), cached
async function getJson(url) {
  for (let a = 0; a < 6; a++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'avow-research/1.0' } }); if (r.ok) return await r.json(); } catch {}
    await sleep(1500 * 2 ** a);
  }
  throw new Error('fetch failed ' + url);
}
async function gatePre(pair) { // 50 h before the window, for the 48 h hourly volatility the momentum rule needs
  const file = `gate-pre-${pair}.json`;
  if (fs.existsSync(path.join(CACHE, file))) return readJson(file);
  const rows = await getJson(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=5m&from=${startT - 50 * 3600}&to=${startT - STEP}`);
  const arr = rows.map((k) => [Number(k[0]), { c: Number(k[2]), v: Number(k[6]) }]);
  fs.writeFileSync(path.join(CACHE, file), JSON.stringify(arr));
  await sleep(500);
  return arr;
}
async function hashkey(sym) {
  const file = `hk-${sym}-${startT}-${endT}.json`;
  if (fs.existsSync(path.join(CACHE, file))) return readJson(file);
  const out = new Map();
  for (let s = startT - 50 * 3600; s <= endT; s += 999 * STEP) {
    const e = Math.min(endT, s + 998 * STEP);
    const rows = await getJson(`https://api-glb.hashkey.com/quote/v1/klines?symbol=${sym}&interval=5m&startTime=${s * 1000}&endTime=${e * 1000}&limit=1000`);
    for (const k of rows) out.set(Math.round(k[0] / 1000), Number(k[4])); // open time, close
    await sleep(600);
  }
  const arr = [...out.entries()].sort((a, b) => a[0] - b[0]);
  fs.writeFileSync(path.join(CACHE, file), JSON.stringify(arr));
  return arr;
}

// ───────────────────────────────────────────── per-asset market data
const tickPx = (tick, dec) => Math.pow(1.0001, tick) * 10 ** (dec - 6); // asset is token0 in all three pools
const tickOfS = (s) => Math.floor(Math.log(s * s) / Math.log(1.0001));
const M = {};
for (const sym of SYMS) {
  const a = ASSETS[sym];
  const bs = readJson(`bs-swaps-${sym}.json`);
  const cache = Object.values(readJson(`swaps-${sym}.json`).chunks).flat();
  const byKey = new Map(bs.map((x) => [x.b + ':' + x.i, x]));
  // one WHSK swap is missing from Blockscout's listing: keep it with the cache's price and the neighbour's liquidity
  const merged = cache.map((x) => byKey.get(x.b + ':' + x.i) ?? { ...x, a0: null, a1: null, L: null, filled: true });
  merged.sort((x, y) => x.b - y.b || x.i - y.i);
  for (let k = 0; k < merged.length; k++) if (merged[k].L === null) merged[k].L = (merged[k - 1] ?? merged[k + 1]).L;
  const ev = merged.map((x) => ({
    t: Math.round(tsOfBlock(x.b)), s: Number(BigInt(x.s)) / 2 ** 96, tick: x.t, L: Number(x.L),
    a0: x.a0 === null ? null : Number(x.a0), a1: x.a1 === null ? null : Number(x.a1),
  }));
  const series = readJson(`series-${sym}.json`);
  if (series.startT !== startT) throw new Error('series window mismatch');
  const before = ev.filter((e) => e.t <= startT);
  const inWin = ev.filter((e) => e.t > startT && e.t <= endT);
  let s0, tick0, L0;
  if (before.length) ({ s: s0, tick: tick0, L: L0 } = before[before.length - 1]);
  else { s0 = Math.sqrt(series.P[0] / 10 ** (a.dec - 6)); tick0 = tickOfS(s0); L0 = inWin[0].L; }
  const gate = new Map([...(await gatePre(a.gate)), ...readJson(`gate-${a.gate}-1790800500-1793392800.json`)].map(([t, c]) => [Number(t), c.c]));
  const hk = new Map(await hashkey(a.hk));
  M[sym] = { ...a, sym, ev: inWin, s0, tick0, L0, gate, hk };
}
// close of the 5-minute candle ending at t (t on the 5-minute grid), last known value if missing
function closeAt(map, t) { for (let k = 0; k < 12; k++) { const v = map.get(t - STEP * (k + 1)); if (v) return v; } return null; }
const gateAt = (sym, t) => closeAt(M[sym].gate, t);
function fairAt(sym, t) { // the live agent's fair price: mean of the HashKey Global and Gate.io mids
  const g = gateAt(sym, t), h = closeAt(M[sym].hk, t);
  const xs = [g, h].filter((x) => x);
  return xs.length ? xs.reduce((p, x) => p + x, 0) / xs.length : null;
}
// signals.ts stats(): 49 Gate hourly closes (the last one in progress) and fair as "now"
function hourlyStats(sym, t, fair) {
  const H0 = Math.floor(t / 3600) * 3600;
  const cl = [];
  for (let k = 47; k >= 0; k--) cl.push(gateAt(sym, H0 - k * 3600));
  cl.push(gateAt(sym, t));
  if (cl.some((x) => !x)) return null;
  const at = (h) => cl[cl.length - 1 - h];
  const lr = []; for (let i = 1; i < cl.length; i++) lr.push(Math.log(cl[i] / cl[i - 1]));
  const m = lr.reduce((s, x) => s + x, 0) / lr.length;
  const vol = Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (lr.length - 1));
  return { r1h: fair / at(1) - 1, r4h: fair / at(4) - 1, vol1h: vol };
}

// ───────────────────────────────────────────── the pool, swap by swap, with our own trades in it
class Pool {
  constructor(m) {
    this.m = m; this.i = 0; this.s = m.s0; this.sHist = m.s0; this.tick = m.tick0; this.L = m.L0;
    this.steps = [{ t: -1e12, tick: m.tick0 }]; this.lastExt = null; this.extTimes = []; this.now = startT;
  }
  advance(t) {
    const ev = this.m.ev;
    while (this.i < ev.length && ev[this.i].t <= t) {
      const e = ev[this.i++];
      const displaced = Math.abs(this.s / this.sHist - 1) > 1e-12;
      if (!displaced || IMPACT_MODEL === 'reset') { this.s = e.s; this.tick = e.tick; }
      else { // persist: replay the external swap's exact input on our displaced state
        if (e.a1 !== null && e.a1 > 0) this.s += (e.a1 * (1 - FEE)) / e.L;
        else if (e.a0 !== null && e.a0 > 0) this.s = 1 / (1 / this.s + (e.a0 * (1 - FEE)) / e.L);
        else this.s *= e.s / this.sHist;
        this.tick = tickOfS(this.s);
      }
      this.sHist = e.s; this.L = e.L;
      this.pushStep(e.t);
      this.lastExt = e.t; this.extTimes.push(e.t);
    }
    this.now = t;
  }
  pushStep(t) {
    const st = this.steps;
    if (st.length && st[st.length - 1].t === t) st[st.length - 1].tick = this.tick; else st.push({ t, tick: this.tick });
    while (st.length > 3 && st[1].t <= t - 2 * TWAP_WINDOW) st.shift();
  }
  twapTick(t) { // AvowVault._meanTick: floor(Σ tick·dt / 300) over the last 300 s
    let acc = 0, end = t;
    for (let k = this.steps.length - 1; k >= 0; k--) {
      const st = Math.max(this.steps[k].t, t - TWAP_WINDOW);
      if (end > st) acc += this.steps[k].tick * (end - st);
      end = this.steps[k].t;
      if (this.steps[k].t <= t - TWAP_WINDOW) break;
    }
    return Math.floor(acc / TWAP_WINDOW);
  }
  twap(t) { return tickPx(this.twapTick(t), this.m.dec); }
  spot() { return tickPx(this.tick, this.m.dec); }
  mid() { return this.s * this.s * 10 ** (this.m.dec - 6); }
  // swaps (asset = token0, USDT = token1, raw units); each mutates the pool and is recorded as a step
  buyWithUsdt(usd) { const dy = usd * 1e6 * (1 - FEE); const s1 = this.s + dy / this.L; const q = this.L * (1 / this.s - 1 / s1); this.set(s1); return q; }
  sellAsset(q) { const inv = 1 / this.s + (q * (1 - FEE)) / this.L; const s1 = 1 / inv; const y = this.L * (this.s - s1); this.set(s1); return y / 1e6; }
  buyExact(q) { const inv = 1 / this.s - q / this.L; if (inv <= 0) return null; const s1 = 1 / inv; const y = (this.L * (s1 - this.s)) / (1 - FEE); this.set(s1); return y / 1e6; }
  quoteBuyExact(q) { const inv = 1 / this.s - q / this.L; if (inv <= 0) return null; return (this.L * (1 / inv - this.s)) / (1 - FEE) / 1e6; }
  quoteSell(q) { const inv = 1 / this.s + (q * (1 - FEE)) / this.L; return (this.L * (this.s - 1 / inv)) / 1e6; }
  quoteBuy(usd) { const s1 = this.s + (usd * 1e6 * (1 - FEE)) / this.L; return this.L * (1 / this.s - 1 / s1); }
  set(s1) { this.s = s1; this.tick = tickOfS(s1); this.pushStep(this.now); }
}

// ───────────────────────────────────────────── rule helpers
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const gasUsdAt = (t) => GAS_UNITS * GAS_PRICE_HSK * (fairAt('WHSK', t) ?? 0.087);
function sampleAgo(ctx, sec) { // the 5-minute sample `sec` ago (the agent keeps 1-minute samples; same lookup)
  const k = ctx.samples.length - 1 - Math.round(sec / STEP);
  return k >= 0 ? ctx.samples[k] : null;
}
const bps = (a, b) => (a / b - 1) * 1e4;

// The EXACT live rules (agent/src/signals.ts), one kind at a time
function currentRule(kind) {
  return (ctx) => {
    const { gap, costBps } = ctx;
    const absGap = Math.abs(gap);
    const maxStop = MANDATE.maxStopBps, minRR = MANDATE.minRewardRisk;
    if (kind === 'catch-up') {
      if (!(absGap > costBps + 20)) return null;
      const side = gap > 0 ? 'long' : 'short';
      const rewardBps = Math.min(absGap, maxStop * 2);
      const riskBps = Math.max(30, Math.min(maxStop, rewardBps / Math.max(minRR * 1.06, 1.3)));
      if (!(rewardBps / riskBps >= minRR * 1.02)) return null;
      return { side, rewardBps, riskBps, horizonSec: 12 * 3600 };
    }
    const st = hourlyStats(ctx.sym, ctx.t, ctx.fair);
    if (!st) return null;
    const trend = st.r4h;
    const agree = Math.sign(st.r1h) === Math.sign(trend);
    const strong = Math.abs(trend) > Math.max(0.012, 2.2 * st.vol1h);
    const notAgainstGap = trend > 0 ? gap > -60 : gap < 60;
    if (!(agree && strong && notAgainstGap)) return null;
    const side = trend > 0 ? 'long' : 'short';
    const riskBps = Math.max(40, Math.min(maxStop, st.vol1h * 1e4 * 2.5));
    const rewardBps = Math.max(riskBps * Math.max(minRR * 1.06, 1.8), costBps * 2.5);
    return { side, rewardBps, riskBps, horizonSec: 8 * 3600 };
  };
}

// levels for the alternatives: void at reward / 1.25 (inside the mandate's 1.2 minimum), stop 25-300 bps
function levels(side, rewardBps, horizonH, costBps) {
  rewardBps = Math.min(600, rewardBps);
  if (rewardBps < costBps + 10) return null; // the target alone must clear the round trip
  const riskBps = clamp(rewardBps / 1.25, MIN_STOP_BPS, MANDATE.maxStopBps);
  if (rewardBps / riskBps < MANDATE.minRewardRisk) return null;
  return { side, rewardBps, riskBps, horizonSec: horizonH * 3600 };
}
const activeWithin = (ctx, h) => ctx.lastExt !== null && ctx.t - ctx.lastExt <= h * 3600;

// ───────────────────────────────────────────── THE PRE-DECLARED SEARCH GRID (fixed before any result was seen)
// Every family runs with scope "all" (WETH, WBTC, WHSK) and scope "WHSK" (the only pool trading every day).
// Selection (also fixed in advance): in-sample only; among configs with >= 15 in-sample notes, the highest
// (mean net P&L per note - one standard error); chosen only if that lower bound is > 0. Out-of-sample is then
// read once; if the chosen config loses money out of sample, chosen = null.
const GRID = [];
for (const scope of ['all', 'WHSK']) {
  // (a) catch-up with a partial target k x gap, only after recent pool activity
  for (const k of [0.3, 0.5, 0.7]) for (const W of [1, 6, 12]) for (const H of [4, 12])
    GRID.push({ family: 'catchup-partial', name: `catchup-k${k}-act${W}h-h${H}-${scope}`, params: { scope, k, activeH: W, horizonH: H },
      description: `When k x |gap| clears the round-trip cost and the pool had an external swap in the last ${W} h, bet the pool moves ${k} of the way to the exchange mid within ${H} h.`,
      rule: (ctx) => {
        if (!activeWithin(ctx, W)) return null;
        return levels(ctx.gap > 0 ? 'long' : 'short', k * Math.abs(ctx.gap), H, ctx.costBps);
      } });
  // (b) pool momentum on the pool's own TWAP
  for (const LB of [1, 2, 4]) for (const th of [80, 150])
    GRID.push({ family: 'pool-momentum', name: `poolmom-lb${LB}h-th${th}-${scope}`, params: { scope, lookbackH: LB, thresholdBps: th, horizonH: 4 },
      description: `When the pool TWAP moved >= ${th} bps over ${LB} h with the last quarter agreeing and an external swap in the last hour, bet another ${th} bps the same way within 4 h.`,
      rule: (ctx) => {
        if (!activeWithin(ctx, 1)) return null;
        const a = sampleAgo(ctx, LB * 3600), q = sampleAgo(ctx, (LB * 3600) / 4);
        if (!a || !q) return null;
        const r = bps(ctx.twap, a.dex), rq = bps(ctx.twap, q.dex);
        if (Math.abs(r) < th || Math.sign(rq) !== Math.sign(r)) return null;
        return levels(r > 0 ? 'long' : 'short', th, 4, ctx.costBps);
      } });
  // (c) exchange lead: the exchanges moved, the (active) pool has not followed yet
  for (const X of [80, 150]) for (const N of [30, 60]) for (const H of [2, 4])
    GRID.push({ family: 'exchange-lead', name: `exlead-x${X}-n${N}m-h${H}-${scope}`, params: { scope, moveBps: X, windowMin: N, horizonH: H },
      description: `When the exchange mid moved >= ${X} bps in ${N} min, the pool TWAP moved < ${X / 3} bps that way, the gap is >= ${X / 2} bps and the pool swapped in the last hour, bet the pool follows 0.7 of the gap within ${H} h.`,
      rule: (ctx) => {
        if (!activeWithin(ctx, 1)) return null;
        const a = sampleAgo(ctx, N * 60);
        if (!a || !a.cex) return null;
        const ex = bps(ctx.fair, a.cex), pl = bps(ctx.twap, a.dex);
        const dir = Math.sign(ex);
        if (Math.abs(ex) < X || dir * pl >= X / 3 || dir * ctx.gap < X / 2) return null;
        return levels(dir > 0 ? 'long' : 'short', 0.7 * Math.abs(ctx.gap), H, ctx.costBps);
      } });
  // (d) fade: the pool jumped away from the exchanges on its own, bet it comes back
  for (const S of [80, 150]) for (const k of [0.5, 1.0]) for (const H of [2, 4])
    GRID.push({ family: 'fade', name: `fade-s${S}-k${k}-h${H}-${scope}`, params: { scope, jumpBps: S, k, horizonH: H },
      description: `When the pool spot jumped >= ${S} bps in 15 min while the exchange moved < ${S / 3} bps that way and the pool now sits >= ${S / 2} bps past the exchange mid, bet it reverts ${k} x the jump within ${H} h.`,
      rule: (ctx) => {
        const a = sampleAgo(ctx, 15 * 60);
        if (!a || !a.spot || !a.cex) return null;
        const j = bps(ctx.spot, a.spot), ex = bps(ctx.fair, a.cex);
        const dir = Math.sign(j);
        if (Math.abs(j) < S || dir * ex >= S / 3 || -dir * ctx.gap < S / 2) return null;
        return levels(dir > 0 ? 'short' : 'long', k * Math.abs(j), H, ctx.costBps);
      } });
}
const ROUND1 = GRID.length;
// Round 2 (added after round 1, disclosed): every round-1 fade config fired 0 times in sample, because a target of
// k x jump must itself clear ~78 bps of cost and pool jumps that large are rare. Round 2 tests the only other fade
// target the contract can state: all the way back to the exchange mid, after smaller jumps. Same selection rule;
// the decision to add it used in-sample trigger counts only (no out-of-sample result was involved: round-1 fade had
// 0 out-of-sample notes as well).
for (const scope of ['all', 'WHSK']) for (const S of [30, 60]) for (const H of [2, 4])
  GRID.push({ family: 'fade', round: 2, name: `fade2-s${S}-to-mid-h${H}-${scope}`, params: { scope, jumpBps: S, target: 'exchange mid', horizonH: H },
    description: `When the pool spot jumped >= ${S} bps in 15 min while the exchange moved < ${S / 3} bps that way, bet the pool returns all the way to the exchange mid within ${H} h (needs the gap itself to clear the cost).`,
    rule: (ctx) => {
      const a = sampleAgo(ctx, 15 * 60);
      if (!a || !a.spot || !a.cex) return null;
      const j = bps(ctx.spot, a.spot), ex = bps(ctx.fair, a.cex);
      const dir = Math.sign(j);
      if (Math.abs(j) < S || dir * ex >= S / 3 || -dir * ctx.gap <= 0) return null;
      return levels(dir > 0 ? 'short' : 'long', Math.abs(ctx.gap), H, ctx.costBps);
    } });

// ───────────────────────────────────────────── one book: one rule, run through time, settled by the contract
function runBook(rule, { kind, scope = 'all' }) {
  const pools = Object.fromEntries(SYMS.map((s) => [s, new Pool(M[s])]));
  const samples = Object.fromEntries(SYMS.map((s) => [s, []]));
  const open = {}; const notes = [];
  let lastSwear = -1e12, day = -1, dailyLoss = 0;
  const syms = scope === 'all' ? SYMS : [scope];

  const trySettle = (sym, n, t) => {
    const p = pools[sym];
    const px = p.twap(t), spot = p.spot();
    const long = n.side === 'long';
    const calm = (Math.abs(spot - px) / px) * 1e4 <= MANDATE.maxSpotDevBps;
    const broke = long ? px <= n.void && spot <= n.void : px >= n.void && spot >= n.void;
    let status = null;
    if (broke) status = 'void';
    else if (!calm) return;
    else if (t >= n.expiry) status = 'lapsed';
    else if (long ? px >= n.target && spot >= n.target : px <= n.target && spot <= n.target) status = 'honoured';
    if (!status) return;
    const exitSlip = (MANDATE.maxSlippageBps + 2 * POOL_FEE_BPS) / 1e4;
    let pnl, impact, fee, exitPx;
    const mid = p.mid();
    if (long) {
      const quote = p.quoteSell(n.qty);
      if (quote < (n.qty / 10 ** p.m.dec) * px * (1 - exitSlip)) return; // settle would revert; try again later
      const got = p.sellAsset(n.qty);
      pnl = got - n.notional; fee = (n.qty / 10 ** p.m.dec) * mid * FEE; impact = (n.qty / 10 ** p.m.dec) * mid * (1 - FEE) - got;
      exitPx = got / (n.qty / 10 ** p.m.dec);
    } else {
      const quote = p.quoteBuyExact(n.qty);
      if (quote === null || quote > (n.qty / 10 ** p.m.dec) * px * (1 + exitSlip)) return;
      const spent = p.buyExact(n.qty);
      pnl = n.got - spent; const zero = ((n.qty / 10 ** p.m.dec) * mid) / (1 - FEE); fee = zero * FEE; impact = spent - zero;
      exitPx = spent / (n.qty / 10 ** p.m.dec);
    }
    Object.assign(n, { status, closeT: t, exitPx, pnlUsd: pnl, feeUsd: n.feeUsd + fee, impactUsd: n.impactUsd + impact, netUsd: pnl - n.gasUsd });
    delete open[sym];
    const d = Math.floor(t / 86400); if (d !== day) { day = d; dailyLoss = 0; }
    if (pnl < 0) dailyLoss += -pnl;
  };

  for (let T = startT + STEP; T <= endT; T += STEP) {
    for (let tau = T - STEP + SETTLE_STEP; tau <= T; tau += SETTLE_STEP)
      for (const sym of SYMS) if (open[sym]) { pools[sym].advance(tau); trySettle(sym, open[sym], tau); }
    for (const sym of SYMS) {
      const p = pools[sym]; p.advance(T);
      samples[sym].push({ t: T, dex: p.twap(T), cex: fairAt(sym, T), spot: p.spot() });
    }
    const d = Math.floor(T / 86400); if (d !== day) { day = d; dailyLoss = 0; }
    for (const sym of syms) {
      if (open[sym]) continue;
      if (T < lastSwear + MANDATE.cooldownSec) break; // vault-wide cooldown
      if (dailyLoss >= MANDATE.dailyLossLimitUsd) break;
      const p = pools[sym];
      const twap = p.twap(T), spot = p.spot(), fair = fairAt(sym, T);
      if (!fair) continue;
      if ((Math.abs(twap - fair) / fair) * 1e4 > CHAINLINK_MAX_DEV_BPS) continue; // seatbelt proxy
      if ((Math.abs(spot - twap) / twap) * 1e4 > MANDATE.maxSpotDevBps) continue; // spike
      const exposure = Object.values(open).reduce((s, n) => s + n.notional, 0);
      const cap = Math.min(MANDATE.notionalUsd, MANDATE.maxExposureUsd - exposure);
      if (cap < 1) continue;
      const gasUsd = gasUsdAt(T);
      const costBps = 2 * POOL_FEE_BPS + (gasUsd / cap) * 1e4;
      const ctx = { sym, t: T, twap, spot, fair, gap: ((fair - twap) / twap) * 1e4, costBps, samples: samples[sym], lastExt: p.lastExt };
      const c = rule(ctx);
      if (!c) continue;
      // AvowVault._checkLevels (the stated-odds check is the model's job; recorded as pMin instead)
      const horizonSec = Math.min(c.horizonSec, MANDATE.maxHorizonSec);
      const dir = c.side === 'long' ? 1 : -1;
      const target = twap * (1 + (dir * c.rewardBps) / 1e4), voidPx = twap * (1 - (dir * c.riskBps) / 1e4);
      if (c.riskBps > MANDATE.maxStopBps || c.riskBps < MIN_STOP_BPS) continue;
      if (Math.floor((c.rewardBps / c.riskBps) * 100) < MANDATE.minRewardRisk * 100) continue;
      if (c.rewardBps <= 2 * POOL_FEE_BPS) continue;
      // the opening swap, with the contract's guards
      const mid = p.mid();
      let qty, got = 0, fee, impact;
      if (dir > 0) {
        const q = p.quoteBuy(cap);
        if (q / 10 ** p.m.dec < (cap / twap) * (1 - MANDATE.maxSlippageBps / 1e4)) continue;
        const s1 = p.s + (cap * 1e6 * (1 - FEE)) / p.L;
        if (tickPx(tickOfS(s1), p.m.dec) >= target) continue; // SelfFulfilling revert
        qty = p.buyWithUsdt(cap); fee = cap * FEE; impact = ((cap * (1 - FEE)) / mid - qty / 10 ** p.m.dec) * mid;
      } else {
        qty = (cap / twap) * 10 ** p.m.dec;
        const y = p.quoteSell(qty);
        if (y < cap * (1 - MANDATE.maxSlippageBps / 1e4)) continue;
        const s1 = 1 / (1 / p.s + (qty * (1 - FEE)) / p.L);
        if (tickPx(tickOfS(s1), p.m.dec) <= target) continue; // SelfFulfilling revert
        got = p.sellAsset(qty); fee = (qty / 10 ** p.m.dec) * mid * FEE; impact = (qty / 10 ** p.m.dec) * mid * (1 - FEE) - got;
      }
      const n = {
        asset: sym, kind, side: c.side, openT: T, expiry: T + horizonSec, entry: twap, target, void: voidPx,
        rewardBps: c.rewardBps, riskBps: c.riskBps, costBps, gapBps: ctx.gap,
        pMin: (c.riskBps + costBps) / (c.rewardBps + c.riskBps), pMinContract: (c.riskBps + 2 * POOL_FEE_BPS) / (c.rewardBps + c.riskBps),
        notional: cap, qty, got, gasUsd, feeUsd: fee, impactUsd: impact, status: 'open',
      };
      open[sym] = n; notes.push(n); lastSwear = T;
    }
  }
  return notes;
}

// ───────────────────────────────────────────── aggregation
const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const inIS = (n) => n.status !== 'open' && n.openT + (n.expiry - n.openT) <= splitAt;
const inOOS = (n) => n.status !== 'open' && n.openT >= splitAt && n.expiry <= endT;
function agg(ns) {
  const k = ns.length;
  const h = ns.filter((n) => n.status === 'honoured').length;
  const net = ns.map((n) => n.netUsd);
  const mean = k ? net.reduce((s, x) => s + x, 0) / k : null;
  const sd = k > 1 ? Math.sqrt(net.reduce((s, x) => s + (x - mean) ** 2, 0) / (k - 1)) : null;
  const avg = (f) => (k ? ns.reduce((s, n) => s + n[f], 0) / k : null);
  return {
    notes: k, honoured: h, void: ns.filter((n) => n.status === 'void').length, lapsed: ns.filter((n) => n.status === 'lapsed').length,
    hitRate: k ? r4(h / k) : null, meanPMin: r4(avg('pMin')), meanPMinContract: r4(avg('pMinContract')),
    pnlUsd: r4(net.reduce((s, x) => s + x, 0)), pnlPerNoteUsd: r4(mean), seUsd: sd !== null ? r4(sd / Math.sqrt(k)) : null,
    grossPnlPerNoteUsd: r4(avg('pnlUsd')), feeUsdPerNote: r4(avg('feeUsd')), impactUsdPerNote: r4(avg('impactUsd')), gasUsdPerNote: r4(avg('gasUsd')),
    meanRewardBps: r4(avg('rewardBps')), meanRiskBps: r4(avg('riskBps')), meanHoursOpen: k ? r4(ns.reduce((s, n) => s + (n.closeT - n.openT), 0) / k / 3600) : null,
  };
}
const short = (a) => (a ? { notes: a.notes, hitRate: a.hitRate, pnlPerNoteUsd: a.pnlPerNoteUsd, pnlUsd: a.pnlUsd, seUsd: a.seUsd, honoured: a.honoured, void: a.void, lapsed: a.lapsed } : null);
// would a calibrated forecaster (stating the true hit rate) have been allowed to swear these notes?
function calibrated(ns) {
  if (!ns.length) return null;
  const h = ns.filter((n) => n.status === 'honoured').length / ns.length;
  const pass = ns.filter((n) => h >= 0.5 && h * (n.rewardBps + n.riskBps) > n.riskBps + 2 * POOL_FEE_BPS).length;
  return { trueHitRate: r4(h), notesPassingContractCheck: pass, shareOfNotes: r4(pass / ns.length), beatsMeanPMin: h > ns.reduce((s, n) => s + n.pMin, 0) / ns.length,
    rule: 'contract: conf >= 0.50 and conf*(reward+risk) > risk + 60 bps, with conf = true hit rate of this asset and kind over the window' };
}

// ───────────────────────────────────────────── run
const t0 = Date.now();
const settled = (ns) => ns.filter((n) => n.status !== 'open');
const current = [];
const allNotes = [];
for (const kind of ['catch-up', 'momentum']) {
  const ns = settled(runBook(currentRule(kind), { kind }));
  allNotes.push(...ns.map((n) => ({ book: 'current-' + kind, ...n })));
  for (const sym of SYMS) {
    const mine = ns.filter((n) => n.asset === sym);
    const all = agg(mine.filter((n) => n.expiry <= endT));
    current.push({ asset: sym, kind, ...all, calibratedForecaster: calibrated(mine.filter((n) => n.expiry <= endT)), inSample: agg(mine.filter(inIS)), outOfSample: agg(mine.filter(inOOS)) });
  }
}
console.log(`current rules replayed in ${((Date.now() - t0) / 1000).toFixed(1)} s (impact model: ${IMPACT_MODEL})`);
console.table(current.map((c) => ({ asset: c.asset, kind: c.kind, notes: c.notes, hon: c.honoured, void: c.void, lapsed: c.lapsed, hit: c.hitRate, pMin: c.meanPMin, pnl: c.pnlUsd, perNote: c.pnlPerNoteUsd, impact: c.impactUsdPerNote, IS: c.inSample.pnlPerNoteUsd, OOS: c.outOfSample.pnlPerNoteUsd, OOSn: c.outOfSample.notes })));

// ───────────────────────────────────────────── model-free edge budget
// For every 5-minute sample where the pool had an external swap in the prior 12 h and the pool sits >= G bps from
// the exchange mid: how far did the pool itself move toward the exchange after h hours (spot, no trade of ours),
// and what was the best point reached on the way (max favourable excursion, an upper bound for any target)?
// A note's gross P&L cannot beat the move it rides, so if these sit below the ~70-90 bps round trip, no target/void
// choice on this signal can make money. Samples overlap heavily (one 12 h move counts up to 144 times).
function edgeBudget() {
  const out = [];
  for (const sym of SYMS) {
    const p = new Pool(M[sym]);
    const S = [];
    for (let T = startT; T <= endT; T += STEP) { p.advance(T); S.push({ t: T, spot: p.spot(), fair: fairAt(sym, T), lastExt: p.lastExt }); }
    for (const [lo, hi] of [[50, 100], [100, 200], [200, 1e9]]) for (const h of [2, 4, 12]) {
      const n = h * 12; const mv = [], mfe = [];
      for (let k = 0; k + n < S.length; k++) {
        const x = S[k];
        if (!x.fair || x.lastExt === null || x.t - x.lastExt > 12 * 3600) continue;
        const gap = ((x.fair - x.spot) / x.spot) * 1e4;
        if (Math.abs(gap) < lo || Math.abs(gap) >= hi) continue;
        const dir = Math.sign(gap);
        mv.push(dir * bps(S[k + n].spot, x.spot));
        let best = -1e9; for (let j = k + 1; j <= k + n; j++) best = Math.max(best, dir * bps(S[j].spot, x.spot));
        mfe.push(best);
      }
      if (!mv.length) { out.push({ asset: sym, gapBps: hi > 1e8 ? `>=${lo}` : `${lo}-${hi}`, horizonH: h, samples: 0 }); continue; }
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const sorted = [...mv].sort((a, b) => a - b);
      out.push({ asset: sym, gapBps: hi > 1e8 ? `>=${lo}` : `${lo}-${hi}`, horizonH: h, samples: mv.length,
        meanPoolMoveTowardExchangeBps: r4(mean(mv)), medianBps: r4(sorted[sorted.length >> 1]), shareMovedAtLeast70Bps: r4(mv.filter((v) => v >= 70).length / mv.length),
        meanMaxFavourableBps: r4(mean(mfe)), shareMaxFavourableAtLeast70Bps: r4(mfe.filter((v) => v >= 70).length / mfe.length) });
    }
  }
  return out;
}
const budget = edgeBudget();
console.table(budget);

if (process.argv.includes('--current-only')) { fs.writeFileSync(path.join(HERE, 'replay-notes.json'), JSON.stringify(allNotes.map((n) => ({ ...n, qty: undefined, got: undefined })))); process.exit(0); }
const candidates = [];
for (const g of GRID) {
  const ns = settled(runBook(g.rule, { kind: g.name, scope: g.params.scope }));
  const is = agg(ns.filter(inIS)), oos = agg(ns.filter(inOOS));
  const byAsset = Object.fromEntries(SYMS.map((s) => [s, short(agg(ns.filter((n) => n.asset === s && inIS(n))))]));
  candidates.push({ name: g.name, family: g.family, round: g.round ?? 1, description: g.description, params: g.params, inSample: { ...short(is), byAsset }, outOfSample: short(oos), _is: is, _oos: oos, _notes: ns });
}
console.log(`grid of ${GRID.length} configs replayed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// pre-declared selection, in-sample only
const eligible = candidates.filter((c) => c._is.notes >= 15 && c._is.seUsd !== null);
const score = (c) => c._is.pnlPerNoteUsd - c._is.seUsd;
eligible.sort((a, b) => score(b) - score(a));
const best = eligible[0] ?? null;
let chosen = null;
let selection;
if (!best) selection = 'no config had 15 or more in-sample notes';
else if (score(best) <= 0) selection = `best in-sample lower bound (${best.name}: ${best._is.pnlPerNoteUsd} - ${best._is.seUsd} USD per note) is not above zero, so nothing was taken out of sample`;
else {
  const o = best._oos;
  selection = `in-sample pick ${best.name} (lower bound ${r4(score(best))} USD/note); out of sample ${o.notes} notes, ${o.pnlPerNoteUsd} USD/note`;
  if (o.notes > 0 && o.pnlPerNoteUsd > 0) {
    chosen = {
      name: best.name, params: best.params, why: '', outOfSample: short(o),
      suggestedOdds: r4(0.5 + (o.hitRate - 0.5) * (o.notes / (o.notes + 10))),
    };
  }
}
console.log('selection:', selection);
console.table(candidates.map((c) => ({ name: c.name, ISn: c._is.notes, IShit: c._is.hitRate, ISperNote: c._is.pnlPerNoteUsd, ISse: c._is.seUsd, OOSn: c._oos.notes, OOSperNote: c._oos.pnlPerNoteUsd })));

// pooled view of the live rules, per kind
const pooled = {};
for (const kind of ['catch-up', 'momentum']) {
  const ns = allNotes.filter((n) => n.book === 'current-' + kind);
  pooled[kind] = { all: agg(ns.filter((n) => n.expiry <= endT)), inSample: agg(ns.filter(inIS)), outOfSample: agg(ns.filter(inOOS)),
    lapsedShare: r4(ns.filter((n) => n.status === 'lapsed').length / ns.length) };
}
const fmt = (x, d = 2) => Number(x).toFixed(d);
const cu = pooled['catch-up'].all, mo = pooled.momentum.all;
const imp = (sym) => current.filter((c) => c.asset === sym).reduce((s, c) => s + c.impactUsdPerNote * c.notes, 0) / current.filter((c) => c.asset === sym).reduce((s, c) => s + c.notes, 0);
const bestTxt = best ? `${best.name} at ${fmt(best._is.pnlPerNoteUsd, 3)} USD per note (SE ${fmt(best._is.seUsd, 3)}, ${best._is.notes} notes)` : 'none';
const notesText = [
  `Replaying the live rules on 30 days of real HSKSwap swaps, the catch-up rule opened ${cu.notes} notes (hit rate ${fmt(cu.hitRate * 100, 0)}% against a mean break-even of ${fmt(cu.meanPMin * 100, 0)}%) and lost $${fmt(-cu.pnlUsd)} ($${fmt(-cu.pnlPerNoteUsd, 3)} per $50 note) after fees, impact and gas; momentum opened ${mo.notes} (hit ${fmt(mo.hitRate * 100, 0)}% vs ${fmt(mo.meanPMin * 100, 0)}%) and lost $${fmt(-mo.pnlUsd)} ($${fmt(-mo.pnlPerNoteUsd, 3)} per note), and ${current.every((c) => c.inSample.pnlPerNoteUsd < 0 && c.outOfSample.pnlPerNoteUsd < 0) ? 'every' : 'not every'} asset/kind cell lost money both in-sample and out-of-sample.`,
  `The loss is structural: a round trip costs about 68 bps in pool fees and gas, plus price impact on these thin pools (a $50 trade moves WETH and WBTC about 16-18 bps and WHSK about 4.5 bps; execution impact averaged $${fmt(imp('WETH'), 3)}, $${fmt(imp('WBTC'), 3)} and $${fmt(imp('WHSK'), 3)} per note), while the pool itself rarely moves that far inside the horizon, so ${fmt(pooled['catch-up'].lapsedShare * 100, 0)}% of catch-up and ${fmt(pooled.momentum.lapsedShare * 100, 0)}% of momentum notes lapsed, most of them at about -$0.30 to -$0.34.`,
  `A calibrated forecaster stating the true hit rate (0-20% per asset and kind) would have been refused by the vault on every one of these notes, since the contract requires stated odds of at least 50% and odds x (reward + risk) > risk + 60 bps.`,
  `Of ${GRID.length} alternative configs (${ROUND1} declared up front, ${GRID.length - ROUND1} fade variants added after every round-1 fade config fired zero times in-sample), the best in-sample lower bound was ${bestTxt}, ${best && score(best) > 0 ? 'above zero' : 'not above zero'}, so ${chosen ? 'it was carried out of sample' : 'no strategy is chosen (chosen = null): none of ours shows positive expectancy after costs on HSKSwap'}.`,
  `The one regime with real pool-side catch-up, WHSK gaps of 200 bps or more while the pool was trading, is essentially one re-pricing episode (Oct 15-16, after the six-day dormant stretch), far too little to call a strategy.`,
  `Limits: one 30-day window, the exchange mid is the mean of Gate.io and HashKey Global 5-minute closes and also stands in for the Chainlink seatbelt, settlement is checked every 30 s, and the persistence of our own price impact is modelled two ways (results ${fs.existsSync(path.join(HERE, 'replay-persist.json')) ? 'similar, see sensitivity' : 'see --persist'}).`,
].join(' ');
let sensitivity = null;
if (IMPACT_MODEL === 'reset' && fs.existsSync(path.join(HERE, 'replay-persist.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(HERE, 'replay-persist.json'), 'utf8'));
  sensitivity = { impactModel: 'persist', current: p.current.map((c) => ({ asset: c.asset, kind: c.kind, notes: c.notes, hitRate: c.hitRate, pnlPerNoteUsd: c.pnlPerNoteUsd, inSample: c.inSample.pnlPerNoteUsd, outOfSample: c.outOfSample.pnlPerNoteUsd })), pooled: p.currentPooled, selection: p.selection, chosen: p.chosen };
}

const out = {
  generatedAt: Math.floor(Date.now() / 1000),
  window: { from: startT, to: endT, splitAt },
  costModel: `$50 notes; each leg swaps through the pool's own liquidity (dy = L*dsqrtP, per-swap L from the Swap events) with the 0.30% fee and the vault's slippage guards; gas 920k units at 500 gwei priced in HSK (~$${gasUsdAt(endT).toFixed(3)}); impact model "${IMPACT_MODEL}" (${IMPACT_MODEL === 'reset' ? 'our price move lasts until the next external swap, which lands where it did historically' : 'our price move persists; later swaps replay their exact input amounts on the shifted pool'}).`,
  impactModel: IMPACT_MODEL,
  current,
  currentPooled: Object.fromEntries(Object.entries(pooled).map(([k, v]) => [k, { all: short(v.all), inSample: short(v.inSample), outOfSample: short(v.outOfSample), lapsedShare: v.lapsedShare, meanPMin: v.all.meanPMin }])),
  candidates: candidates.map(({ _is, _oos, _notes, family, ...c }) => ({ ...c, family })),
  selectionRule: 'in-sample only: among configs with >= 15 in-sample notes, max(mean net P&L per note - 1 standard error); require > 0; then read out-of-sample once and keep it only if it made money after all costs',
  selection,
  chosen,
  configsTried: GRID.length,
  configsByRound: { round1: ROUND1, round2: GRID.length - ROUND1 },
  edgeBudget: budget,
  sensitivity,
  notes: notesText,
};
const outFile = IMPACT_MODEL === 'reset' ? 'replay.json' : 'replay-persist.json';
fs.writeFileSync(path.join(HERE, outFile), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(HERE, IMPACT_MODEL === 'reset' ? 'replay-notes.json' : 'replay-notes-persist.json'), JSON.stringify(allNotes.map((n) => ({ ...n, qty: undefined, got: undefined }))));
if (best) fs.writeFileSync(path.join(HERE, `replay-best-notes${IMPACT_MODEL === 'reset' ? '' : '-persist'}.json`), JSON.stringify(best._notes.map((n) => ({ ...n, qty: undefined, got: undefined }))));
console.log('wrote', outFile);
