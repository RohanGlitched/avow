// Catch-up convergence study for Avow on HSKSwap (HSK Chain mainnet, Uniswap v3 fork).
// Question: when a pool price is more than the 0.30% fee away from the centralised-exchange
// price, how often, how fast and by whom is the gap closed?
//
// Usage: node convergence.mjs [--days 30]
// Everything fetched is cached under ./cache so reruns are free. Output: study.json, study-supplement.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
fs.mkdirSync(CACHE, { recursive: true });

const RPC = 'https://mainnet.hsk.xyz';
const MIN_GAP_MS = 350; // pacing between RPC calls, strictly serial (never more than 1 in flight)
const CHUNK = 5000; // getLogs block span
const BLOCK_S = 2;
const DAYS = Number((process.argv.indexOf('--days') > 0 && process.argv[process.argv.indexOf('--days') + 1]) || 30);
const STEP = 300; // 5 minutes
const H12 = 12 * 3600, H2 = 2 * 3600;
const CONV_BPS = 30; // converged when |gap| < 30 bps (about the 0.30% pool fee)
const ENTRY_BPS = 40;

const USDT = '0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029'.toLowerCase();
const ASSETS = {
  WETH: { pool: '0xb92b79ed6b370D5cFee2E14B1D0983C258304C16', token: '0xefd4bC9afD210517803f293ABABd701CaeeCdfd0', dec: 18, gate: 'ETH_USDT' },
  WBTC: { pool: '0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A', token: '0x6119CA49a79f5825C8B345F8d7aC36B272565b14', dec: 8, gate: 'BTC_USDT' },
  WHSK: { pool: '0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC', token: '0xB210D2120d57b758EE163cFfb43e73728c471Cf1', dec: 18, gate: 'HSK_USDT' },
};
const SWAP_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const BUCKETS = [
  { label: '40–60 bps', lo: 40, hi: 60 },
  { label: '60–100 bps', lo: 60, hi: 100 },
  { label: '100–200 bps', lo: 100, hi: 200 },
  { label: '>200 bps', lo: 200, hi: Infinity },
];
const bucketOf = (a) => BUCKETS.findIndex((b) => a >= b.lo && a < b.hi);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(path.join(CACHE, f), JSON.stringify(v));

// ---------- RPC with pacing + backoff ----------
let lastCall = 0;
let rpcCalls = 0, rpcRetries = 0;
async function rpc(method, params) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    rpcCalls++;
    let res, txt;
    try {
      res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      txt = await res.text();
    } catch (e) { rpcRetries++; await sleep(Math.min(60000, 1000 * 2 ** attempt)); continue; }
    if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 520 || /1015|rate.?limit|too many requests/i.test(txt) && res.status !== 200) {
      rpcRetries++;
      const ms = Math.min(60000, 1500 * 2 ** attempt);
      log('rate limited, backing off', ms, 'ms');
      await sleep(ms);
      continue;
    }
    let j; try { j = JSON.parse(txt); } catch { rpcRetries++; await sleep(Math.min(60000, 1000 * 2 ** attempt)); continue; }
    if (j.error) { const e = new Error(j.error.message || JSON.stringify(j.error)); e.rpc = true; throw e; }
    return j.result;
  }
  throw new Error('rpc failed after retries: ' + method);
}
const hex = (n) => '0x' + n.toString(16);

// ---------- block <-> time ----------
const tsCache = readJson('blockts.json', {});
async function blockTs(n) {
  if (tsCache[n]) return tsCache[n];
  const b = await rpc('eth_getBlockByNumber', [hex(n), false]);
  tsCache[n] = parseInt(b.timestamp, 16);
  return tsCache[n];
}
const saveTs = () => writeJson('blockts.json', tsCache);

// ---------- logs ----------
async function getLogsRange(pool, from, to) {
  try {
    const r = await rpc('eth_getLogs', [{ address: pool.toLowerCase(), topics: [SWAP_TOPIC], fromBlock: hex(from), toBlock: hex(to) }]);
    return r;
  } catch (e) {
    if (e.rpc && to > from && /limit|more than|range|exceed|too many|large/i.test(e.message)) {
      const mid = Math.floor((from + to) / 2);
      const a = await getLogsRange(pool, from, mid);
      const b = await getLogsRange(pool, mid + 1, to);
      return a.concat(b);
    }
    throw e;
  }
}
const word = (d, i) => d.slice(2 + i * 64, 2 + (i + 1) * 64);
function decodeSwap(l) {
  return { b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), s: BigInt('0x' + word(l.data, 2)).toString(), t: Number(BigInt.asIntN(24, BigInt('0x' + word(l.data, 4)))) };
}

async function loadSwaps(name, pool, fromBlock, toBlock) {
  const file = `swaps-${name}.json`;
  const store = readJson(file, { chunks: {} });
  let n = 0;
  const base = Math.floor(fromBlock / CHUNK) * CHUNK; // absolute alignment so reruns reuse the cache
  for (let s = base; s <= toBlock; s += CHUNK) {
    const e = Math.min(toBlock, s + CHUNK - 1);
    const key = `${s}-${e}`;
    if (store.chunks[key]) continue;
    store.chunks[key] = (await getLogsRange(pool, s, e)).map(decodeSwap);
    if (++n % 25 === 0) { writeJson(file, store); log(name, 'chunks fetched', n, 'at block', s, 'of', toBlock); }
  }
  writeJson(file, store);
  const all = [];
  for (let s = base; s <= toBlock; s += CHUNK) {
    const e = Math.min(toBlock, s + CHUNK - 1);
    all.push(...store.chunks[`${s}-${e}`].filter((x) => x.b >= fromBlock && x.b <= toBlock));
  }
  all.sort((x, y) => x.b - y.b || x.i - y.i);
  return all;
}

// ---------- Gate.io candles ----------
async function gateCandles(pair, from, to) {
  const file = `gate-${pair}-${from}-${to}.json`;
  const c = readJson(file, null);
  if (c) return c;
  const out = new Map();
  for (let s = from; s <= to; s += 990 * STEP) {
    const e = Math.min(to, s + 989 * STEP);
    const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=5m&from=${s}&to=${e}`;
    let rows = null;
    for (let a = 0; a < 6; a++) {
      const r = await fetch(url);
      const t = await r.text();
      if (r.ok) { rows = JSON.parse(t); break; }
      log('gate retry', r.status, t.slice(0, 100));
      await sleep(1500 * 2 ** a);
    }
    if (!rows) throw new Error('gate failed ' + pair);
    for (const k of rows) out.set(Number(k[0]), { c: Number(k[2]), v: Number(k[6]) }); // t, close, base volume
    await sleep(400);
  }
  const arr = [...out.entries()].sort((a, b) => a[0] - b[0]);
  writeJson(file, arr);
  return arr;
}

// ---------- math helpers ----------
function priceOf(sqrtStr, token0IsUsdt, dec) {
  const r = Number(BigInt(sqrtStr)) / 2 ** 96;
  const p = r * r;
  const scale = 10 ** (dec - 6);
  return token0IsUsdt ? scale / p : p * scale;
}
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// ---------- main ----------
// pin the window head on first run so reruns reproduce the same numbers (delete cache/window.json for a fresh window)
let win = readJson('window.json', null);
if (!win || win.days !== DAYS) {
  const h = parseInt(await rpc('eth_blockNumber', []), 16);
  win = { days: DAYS, head: h, headTs: await blockTs(h) };
  writeJson('window.json', win);
}
const head = win.head, headTs = win.headTs;
const endT = Math.floor(headTs / STEP) * STEP; // last aligned sample time
const startT = endT - DAYS * 86400;
log('head', head, 'headTs', headTs, 'window', new Date(startT * 1000).toISOString(), '->', new Date(endT * 1000).toISOString());

// anchors for interpolation
const ANCHOR = 20000;
const startGuess = head - Math.ceil((headTs - startT) / BLOCK_S) - 2000; // a bit before
const anchorBlocks = [];
for (let b = startGuess; b < head; b += ANCHOR) anchorBlocks.push(b);
anchorBlocks.push(head);
const anchors = [];
for (const b of anchorBlocks) anchors.push([b, await blockTs(b)]);
saveTs();
const tsOfBlock = (n) => {
  let lo = 0, hi = anchors.length - 1;
  if (n <= anchors[0][0]) return anchors[0][1];
  if (n >= anchors[hi][0]) return anchors[hi][1];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (anchors[m][0] <= n) lo = m; else hi = m; }
  const [b0, t0] = anchors[lo], [b1, t1] = anchors[hi];
  return t0 + ((n - b0) * (t1 - t0)) / (b1 - b0);
};
// validate interpolation with random blocks
let maxErr = 0;
for (let k = 0; k < 8; k++) {
  const b = startGuess + Math.floor(Math.random() * (head - startGuess));
  maxErr = Math.max(maxErr, Math.abs((await blockTs(b)) - tsOfBlock(b)));
}
saveTs();
log('block-time interpolation max error on 8 random blocks (s):', maxErr);

// first block with timestamp >= startT (binary search on anchors then blocks)
let lo = startGuess, hi = head;
while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((await blockTs(m)) >= startT) hi = m; else lo = m; }
const startBlock = hi; // first block with ts >= startT
saveTs();
log('startBlock', startBlock, 'ts', await blockTs(startBlock));

// exchange series
const exch = {};
for (const [name, a] of Object.entries(ASSETS)) {
  const arr = await gateCandles(a.gate, startT - STEP, endT);
  exch[name] = new Map(arr);
  log('gate', a.gate, 'candles', arr.length);
}

const N = (endT - startT) / STEP; // samples k=0..N at times startT + k*STEP
const result = { generatedAt: Math.floor(Date.now() / 1000), windowDays: DAYS, rows: [], swapsPerDay: {}, notes: '' };
const supplement = { meta: { startT, endT, startBlock, head, step: STEP, blockTimeInterpErrS: maxErr, rpcCalls, rpcRetries }, assets: {} };
const perAssetEpisodes = {};

for (const [name, a] of Object.entries(ASSETS)) {
  const pool = a.pool.toLowerCase();
  const t0 = await rpc('eth_call', [{ to: pool, data: '0x0dfe1681' }, 'latest']); // token0()
  const token0 = '0x' + t0.slice(26).toLowerCase();
  const token0IsUsdt = token0 === USDT;
  if (!token0IsUsdt && token0 !== a.token.toLowerCase()) throw new Error('unexpected token0 ' + token0);
  log(name, 'token0', token0, 'USDT is token0:', token0IsUsdt);

  // price at window start
  let startSqrt = null;
  const s0 = await rpc('eth_call', [{ to: pool, data: '0x3850c7bd' }, hex(startBlock)]).catch(() => '0x'); // slot0()
  if (s0 && s0.length >= 66) startSqrt = BigInt('0x' + s0.slice(2, 66)).toString();
  if (!startSqrt || startSqrt === '0') startSqrt = null;

  const swaps = await loadSwaps(name, pool, startBlock, head);
  log(name, 'swaps in window', swaps.length);
  // step function events
  const ev = [];
  if (startSqrt) ev.push({ t: startT, p: priceOf(startSqrt, token0IsUsdt, a.dec), swap: false });
  for (const s of swaps) ev.push({ t: tsOfBlock(s.b), p: priceOf(s.s, token0IsUsdt, a.dec), swap: true });
  const activeFrom = ev[0].t;
  const activeDays = (endT - Math.max(startT, activeFrom)) / 86400;
  result.swapsPerDay[name] = round(swaps.length / activeDays, 1);

  // sample arrays
  const P = new Array(N + 1), E = new Array(N + 1), valid = new Array(N + 1).fill(false);
  const swapIdxAtOrBefore = new Array(N + 1); // index into ev of the last event with t <= sample time
  let ei = 0, lastE = null;
  for (let k = 0; k <= N; k++) {
    const t = startT + k * STEP;
    while (ei + 1 < ev.length && ev[ei + 1].t <= t) ei++;
    const havePool = ev[ei].t <= t;
    const c = exch[name].get(t - STEP); // candle [t-5m, t): close ~ exchange price at t
    if (c) lastE = c.c;
    P[k] = havePool ? ev[ei].p : null;
    E[k] = lastE;
    swapIdxAtOrBefore[k] = ei;
    valid[k] = havePool && lastE != null;
  }
  const G = P.map((p, k) => (valid[k] ? ((p - E[k]) / E[k]) * 1e4 : null)); // bps
  const A = G.map((g) => (g == null ? null : Math.abs(g)));

  // ---- episodes (first crossing after being below CONV_BPS) ----
  const episodes = [];
  let armed = false;
  for (let k = 0; k <= N; k++) {
    if (A[k] == null) { armed = false; continue; }
    if (A[k] < CONV_BPS) { armed = true; continue; }
    if (!armed || A[k] < ENTRY_BPS) continue;
    armed = false;
    const ep = { k, t: startT + k * STEP, bucket: bucketOf(A[k]), gap0: G[k], P0: P[k], E0: E[k] };
    ep.fullyObserved = k * STEP + H12 <= N * STEP;
    // convergence
    ep.convK = null;
    for (let j = k + 1; j <= N; j++) {
      if (A[j] == null) continue;
      if (A[j] < CONV_BPS) { ep.convK = j; break; }
    }
    if (ep.convK != null) {
      const j = ep.convK, jp = j - 1;
      ep.hours = ((j - k) * STEP) / 3600;
      // attribute the final step: which side's move closed more of the gap?
      const s = Math.sign(G[jp] ?? G[k]);
      const dlogP = Math.log(P[j] / P[jp]);
      const dlogE = Math.log(E[j] / E[jp]);
      const poolPart = -s * dlogP, exPart = s * dlogE;
      ep.side = poolPart >= exPart ? 'pool' : 'exchange';
    }
    // pool movement toward exchange (vs. entry exchange price) within 12h, using every swap price
    const target = ep.P0 - Math.sign(ep.P0 - ep.E0) * 0.5 * Math.abs(ep.P0 - ep.E0);
    const dir = Math.sign(ep.P0 - ep.E0); // +1: pool above exchange, needs to fall
    let moved = false;
    for (let m = swapIdxAtOrBefore[k] + 1; m < ev.length && ev[m].t <= ep.t + H12; m++) {
      if (dir > 0 ? ev[m].p <= target : ev[m].p >= target) { moved = true; break; }
    }
    ep.poolMovedHalf = moved;
    ep.dormant = ep.t - ev[swapIdxAtOrBefore[k]].t > H12; // no swap in the 12 h before entry
    episodes.push(ep);
  }
  perAssetEpisodes[name] = episodes;

  // ---- table rows ----
  const censored = episodes.filter((e) => !e.fullyObserved).length;
  BUCKETS.forEach((bk, bi) => {
    const eps = episodes.filter((e) => e.bucket === bi && e.fullyObserved);
    const c12 = eps.filter((e) => e.convK != null && e.hours <= 12);
    const c2 = eps.filter((e) => e.convK != null && e.hours <= 2);
    const poolSide = c12.filter((e) => e.side === 'pool').length;
    result.rows.push({
      asset: name,
      gapBucket: bk.label,
      episodes: eps.length,
      convergedWithin12h: c12.length,
      convergedWithin2h: c2.length,
      poolMovedHalfWithin12h: eps.filter((e) => e.poolMovedHalf).length,
      medianHoursToConverge: round(median(c12.map((e) => e.hours)), 2),
      poolSideShare: c12.length ? round(poolSide / c12.length, 3) : null,
    });
  });

  // ---- supplement: sample-level view (any entry time), time in gap, direction, data quality ----
  const validCount = valid.filter(Boolean).length;
  const timeIn = BUCKETS.map((bk) => A.filter((a) => a != null && a >= bk.lo && a < bk.hi).length / validCount);
  const sampleLevel = BUCKETS.map((bk, bi) => {
    let n = 0, c12 = 0, half = 0;
    for (let k = 0; k <= N - H12 / STEP; k++) {
      if (A[k] == null || !(A[k] >= bk.lo && A[k] < bk.hi)) continue;
      n++;
      let conv = false;
      for (let j = k + 1; j <= k + H12 / STEP; j++) if (A[j] != null && A[j] < CONV_BPS) { conv = true; break; }
      if (conv) c12++;
      const dir = Math.sign(P[k] - E[k]);
      const target = P[k] - dir * 0.5 * Math.abs(P[k] - E[k]);
      const t = startT + k * STEP;
      for (let m = swapIdxAtOrBefore[k] + 1; m < ev.length && ev[m].t <= t + H12; m++) {
        if (dir > 0 ? ev[m].p <= target : ev[m].p >= target) { half++; break; }
      }
    }
    return { gapBucket: bk.label, samples: n, shareConvergedWithin12h: n ? round(c12 / n, 3) : null, sharePoolMovedHalfWithin12h: n ? round(half / n, 3) : null };
  });
  fs.writeFileSync(path.join(CACHE, `series-${name}.json`), JSON.stringify({ startT, step: STEP, P, E }));
  const absG = A.filter((x) => x != null);
  const signedMedian = median(G.filter((x) => x != null));
  const perDay = [];
  for (let d = 0; d < DAYS; d++) {
    const seg = A.slice(d * 288, (d + 1) * 288).filter((x) => x != null);
    const sg = G.slice(d * 288, (d + 1) * 288).filter((x) => x != null);
    perDay.push({ day: new Date((startT + d * 86400) * 1000).toISOString().slice(0, 10), medianAbsBps: round(median(seg), 0), medianSignedBps: round(median(sg), 0), swaps: swaps.filter((x) => { const t = tsOfBlock(x.b); return t >= startT + d * 86400 && t < startT + (d + 1) * 86400; }).length });
  }
  const ge40 = absG.filter((x) => x >= ENTRY_BPS).length / absG.length;
  const zeroVolExchange = [...exch[name].values()].filter((c) => c.v === 0).length / exch[name].size;
  supplement.assets[name] = {
    pool, token0IsUsdt, swapsInWindow: swaps.length, activeFromIso: new Date(Math.max(startT, activeFrom) * 1000).toISOString(),
    medianSignedGapBps: round(signedMedian, 1), perDay,
    samplesValid: validCount, medianAbsGapBps: round(median(absG), 1), p90AbsGapBps: round([...absG].sort((x, y) => x - y)[Math.floor(absG.length * 0.9)], 1),
    shareTimeAbs40plus: round(ge40, 3), shareOfSamplesByBucket: Object.fromEntries(BUCKETS.map((b, i) => [b.label, round(timeIn[i], 3)])),
    episodesTotal: episodes.length, episodesCensoredLast12h: censored,
    episodesNeverConverged: episodes.filter((e) => e.fullyObserved && e.convK == null).length,
    episodesPoolAboveExchange: episodes.filter((e) => e.gap0 > 0).length,
    medianSecondsBetweenSwaps: round(median(swaps.slice(1).map((s, i) => tsOfBlock(s.b) - tsOfBlock(swaps[i].b))), 0),
    exchangeZeroVolumeCandleShare: round(zeroVolExchange, 3),
    sampleLevelAnyEntry: sampleLevel,
    byPoolActivityAtEntry: ['live (swap within prior 12h)', 'dormant (no swap in prior 12h)'].map((lab, i) => {
      const eps = episodes.filter((e) => e.fullyObserved && e.dormant === (i === 1));
      const c12 = eps.filter((e) => e.convK != null && e.hours <= 12);
      return { activity: lab, episodes: eps.length, convergedWithin12h: c12.length, poolSideOfConverged: c12.filter((e) => e.side === 'pool').length, poolMovedHalfWithin12h: eps.filter((e) => e.poolMovedHalf).length };
    }),
    convergedAtAnyTimeInWindow: BUCKETS.map((bk, bi) => {
      const eps = episodes.filter((e) => e.bucket === bi && e.fullyObserved);
      return { gapBucket: bk.label, episodes: eps.length, convergedAfter12hOrLater: eps.filter((e) => e.convK != null && e.hours > 12).length, neverConverged: eps.filter((e) => e.convK == null).length };
    }),
  };
  log(name, 'episodes', episodes.length, 'swaps/day', result.swapsPerDay[name]);
}

// notes: hand-written file wins, else a short generated default
const notesFile = path.join(HERE, 'notes.txt');
result.notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : 'Auto-generated: see STUDY.md. Edit notes.txt to override.';
supplement.pooledAllAssets = BUCKETS.map((bk) => {
  const rs = result.rows.filter((r) => r.gapBucket === bk.label);
  const sum = (f) => rs.reduce((a, r) => a + r[f], 0);
  const n = sum('episodes');
  return { gapBucket: bk.label, episodes: n, convergedWithin12hShare: n ? round(sum('convergedWithin12h') / n, 3) : null, convergedWithin2hShare: n ? round(sum('convergedWithin2h') / n, 3) : null, poolMovedHalfWithin12hShare: n ? round(sum('poolMovedHalfWithin12h') / n, 3) : null };
});
supplement.meta.rpcCalls = rpcCalls; supplement.meta.rpcRetries = rpcRetries;
fs.writeFileSync(path.join(HERE, 'study.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(HERE, 'study-supplement.json'), JSON.stringify(supplement, null, 2));
// raw episode list for audit
fs.writeFileSync(path.join(CACHE, 'episodes.json'), JSON.stringify(perAssetEpisodes));
log('done. rpc calls', rpcCalls, 'retries', rpcRetries);
console.table(result.rows);
console.log(result.swapsPerDay);
