// Builds data/fixture.json: a realistic development snapshot of `State` (lib/types.ts).
// Market levels come from the measurements in DESIGN.md §2 (Oct 31 2026, HSK mainnet).
// Prices are a seeded random walk anchored at every note's entry and exit, so every
// note's outcome is consistent with the price path drawn under it.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../data/fixture.json", import.meta.url));

// 31 Oct 2026 12:00 IST
const AS_OF = Date.UTC(2026, 9, 31, 6, 30) / 1000;
const H = 3600;
const STEP = 20 * 60;
const POINTS = (72 * H) / STEP + 1;
const AS_OF_BLOCK = 23_184_560;

let seed = 177;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const hex = (s, n = 64) => "0x" + createHash("sha256").update(s).digest("hex").slice(0, n);

const ADDR = {
  // A fork rehearsal deploys from the standard local development accounts.
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  agent: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  stranger: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  vault: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  factory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};

const ASSETS = {
  WETH: { label: "ETH", dp: 2, start: 2251.4, end: 2235.0, cexEnd: 2224.6, vol: 0.0021, chainlink: 2256.0, clAge: 3.5 * H, poolUsdt: 48210, poolAsset: 21.4, lastSwap: 2 * H + 10 * 60 },
  WBTC: { label: "BTC", dp: 2, start: 77620, end: 76827, cexEnd: 76556, vol: 0.0016, chainlink: 77569, clAge: 5.2 * H, poolUsdt: 50140, poolAsset: 0.66, lastSwap: H + 50 * 60 },
  WHSK: { label: "HSK", dp: 5, start: 0.0888, end: 0.08735, cexEnd: 0.0869, vol: 0.0026, chainlink: 0.086957, clAge: 1.1 * H, poolUsdt: 436020, poolAsset: 5_004_300, lastSwap: 41 * 60 },
};

const fmtPx = (asset, v) =>
  v.toLocaleString("en-US", { minimumFractionDigits: ASSETS[asset].dp, maximumFractionDigits: ASSETS[asset].dp });
const istTime = (t) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(t * 1000);
const istDay = (t) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(t * 1000);
const roundTo = (asset, v) => Number(v.toFixed(ASSETS[asset].dp));

// ---- notes (oldest first) -------------------------------------------------
// open/settle in hours before AS_OF. tgt/vd are fractional distances from entry.
const SPEC = [
  { id: 1, asset: "WHSK", side: "short", open: 70, entry: 0.08912, tgt: 0.013, vd: 0.0095, conf: 0.62, notional: 9.8, outcome: "honoured", settle: 64, settler: "agent",
    signals: { spreadBps: 58, momentum1h: -0.12, momentum4h: -0.44, volatility: 2.4 },
    rationale: "HSKSwap HSK sits 58 bps above the HashKey Global mid and the exchange has drifted lower for four hours. The pool last traded 3 h ago, so the premium is stale rather than informed. A sale here and a buy-back near the exchange price clears the 60 bps round trip with room to spare." },
  { id: 2, asset: "WETH", side: "long", open: 66, entry: 2262.4, tgt: 0.015, vd: 0.011, conf: 0.56, notional: 9.6, outcome: "void", settle: 58, settler: "agent",
    signals: { spreadBps: -22, momentum1h: 0.31, momentum4h: 0.92, volatility: 2.9 },
    rationale: "ETH is up 0.9% in four hours on HashKey Global while HSKSwap trails it by 22 bps. Momentum and a discount point the same way. Confidence is modest because the 4 h move is already large." },
  { id: 3, asset: "WBTC", side: "short", open: 60, entry: 77940, tgt: 0.01, vd: 0.008, conf: 0.64, notional: 9.9, outcome: "honoured", settle: 51, settler: "stranger",
    signals: { spreadBps: 49, momentum1h: -0.21, momentum4h: -0.63, volatility: 2.1 },
    rationale: "BTC trades 49 bps rich on HSKSwap and the exchange is falling. The WBTC pool is thin (0.7 BTC), so a single arbitrage swap would close the gap." },
  { id: 4, asset: "WHSK", side: "long", open: 55, entry: 0.0877, tgt: 0.014, vd: 0.0105, conf: 0.55, notional: 9.5, outcome: "lapsed", settle: 31, settler: "agent", exit: 0.0879,
    signals: { spreadBps: -8, momentum1h: 0.18, momentum4h: 0.71, volatility: 2.2 },
    rationale: "HSK has climbed 0.7% in four hours on HashKey Global with rising volume; HSKSwap is roughly at par. A momentum note with a wide horizon, sworn at low confidence." },
  { id: 5, asset: "WETH", side: "short", open: 50, entry: 2281.7, tgt: 0.012, vd: 0.009, conf: 0.66, notional: 9.75, outcome: "honoured", settle: 44, settler: "agent",
    signals: { spreadBps: 63, momentum1h: -0.18, momentum4h: -0.52, volatility: 2.6 },
    rationale: "A 63 bps HSKSwap premium on ETH with the exchange easing lower. The premium alone pays for the round trip; momentum adds to it." },
  { id: 6, asset: "WBTC", side: "long", open: 40, entry: 77120, tgt: 0.013, vd: 0.0095, conf: 0.55, notional: 9.85, outcome: "retracted", settle: 36, settler: "agent", exit: 76980,
    signals: { spreadBps: -14, momentum1h: 0.27, momentum4h: 0.66, volatility: 2.0 },
    rationale: "BTC broke above its 12 h range on the exchange; HSKSwap lags by 14 bps. Retracted after 4 h when the exchange reversed 0.4% in one hour; retreating is graded as a miss." },
  { id: 7, asset: "WETH", side: "short", open: 30, entry: 2255.3, tgt: 0.011, vd: 0.009, conf: 0.58, notional: 19.6, outcome: "void", settle: 26, settler: "agent",
    signals: { spreadBps: 54, momentum1h: 0.05, momentum4h: -0.21, volatility: 2.8 },
    rationale: "A 54 bps premium on ETH. Momentum is flat, so this is a pure convergence note; the risk is that the exchange catches up to the pool rather than the other way round." },
  { id: 8, asset: "WHSK", side: "short", open: 24, entry: 0.0884, tgt: 0.012, vd: 0.009, conf: 0.6, notional: 18.9, outcome: "revoked", settle: 20, settler: "owner", exit: 0.08822,
    signals: { spreadBps: 51, momentum1h: -0.09, momentum4h: -0.3, volatility: 2.3 },
    rationale: "HSKSwap HSK 51 bps above the exchange, exchange drifting lower. Revoked by the owner before a mandate amendment; a revoked note is graded as a miss." },
  { id: 9, asset: "WHSK", side: "short", open: 9, entry: 0.08802, tgtPx: 0.0869, vdPx: 0.08893, tightenedTo: 0.0888, conf: 0.63, notional: 19.2, outcome: "outstanding",
    signals: { spreadBps: 55, momentum1h: -0.15, momentum4h: -0.48, volatility: 2.5 },
    rationale: "HSK trades 55 bps rich on HSKSwap and the exchange keeps leaking lower. Target is the exchange level; the void level sits beyond the last 12 h high on the pool. Stop tightened once since." },
  { id: 10, asset: "WBTC", side: "short", open: 2.4, entry: 76912, tgtPx: 76080, vdPx: 77470, conf: 0.61, notional: 19.4, outcome: "outstanding",
    signals: { spreadBps: 52, momentum1h: -0.24, momentum4h: -0.81, volatility: 2.2 },
    rationale: "BTC is 52 bps rich on HSKSwap and down 0.81% in four hours on HashKey Global. The pool has 0.66 BTC of depth, so one arbitrage swap closes most of the gap. Target is just under the exchange mid; void sits above the 24 h pool high." },
];

const FEE = 0.003;
const tAt = (hAgo) => Math.round((AS_OF - hAgo * H) / 60) * 60;

const notes = SPEC.map((s) => {
  const openedAt = tAt(s.open);
  const expiry = openedAt + 24 * H;
  const dir = s.side === "long" ? 1 : -1;
  const targetPx = s.tgtPx ?? roundTo(s.asset, s.entry * (1 + dir * s.tgt));
  const swornVoid = s.vdPx ?? roundTo(s.asset, s.entry * (1 - dir * s.vd));
  const voidPx = s.tightenedTo ?? swornVoid;
  const L = ASSETS[s.asset].label;
  const statement =
    `Avow swears that ${L} will trade ${s.side === "long" ? "above" : "below"} ${fmtPx(s.asset, targetPx)} on HSKSwap ` +
    `before ${istTime(expiry)} IST on ${istDay(expiry)}, or this note is void at ${fmtPx(s.asset, swornVoid)}.`;
  const amountIn = s.side === "long" ? s.notional : s.notional / s.entry;
  const amountOut = s.side === "long" ? (s.notional / s.entry) * (1 - FEE) : s.notional * (1 - FEE);
  const note = {
    id: s.id,
    serial: `AVW·${String(s.id).padStart(6, "0")}`,
    asset: s.asset,
    side: s.side,
    entryPx: s.entry,
    targetPx,
    voidPx,
    ...(s.tightenedTo ? { swornVoidPx: swornVoid } : {}),
    openedAt,
    expiry,
    confidence: s.conf,
    notionalUsd: s.notional,
    amountIn: Number(amountIn.toPrecision(6)),
    amountOut: Number(amountOut.toPrecision(6)),
    statement,
    rationale: s.rationale,
    signals: { ...s.signals, fairPx: roundTo(s.asset, s.entry / (1 + s.signals.spreadBps / 1e4)) },
    hash: hex("statement:" + statement),
    openTx: hex("open:" + s.id),
    openBlock: AS_OF_BLOCK - Math.round((AS_OF - openedAt) / 2),
    tierAtOpen: s.notional > 10 ? 1 : 0,
    status: s.outcome,
  };
  if (s.outcome !== "outstanding") {
    const settledAt = s.outcome === "lapsed" ? expiry : tAt(s.settle);
    let exitPx;
    if (s.outcome === "honoured") exitPx = roundTo(s.asset, targetPx * (1 + dir * 0.0004));
    else if (s.outcome === "void") exitPx = roundTo(s.asset, voidPx * (1 - dir * 0.0004));
    else exitPx = s.exit;
    const move = s.side === "long" ? exitPx / s.entry - 1 : s.entry / exitPx - 1;
    const pnl = s.notional * (move - 2 * FEE) - 0.03; // two pool fees + two transactions of gas
    const graded = true; // revoked notes are graded as misses too
    const o = s.outcome === "honoured" ? 1 : 0;
    Object.assign(note, {
      exitPx,
      settledAt,
      settleTx: hex("settle:" + s.id),
      settler: ADDR[s.settler],
      pnlUsd: Number(pnl.toFixed(4)),
      ...(graded ? { sqError: Number(((s.conf - o) ** 2).toFixed(4)) } : {}),
      spotDevBps: 100,
      exitSlipBps: 60,
    });
  }
  return note;
});

// ---- price paths ------------------------------------------------------------
const idxOf = (t) => Math.max(0, Math.min(POINTS - 1, Math.round((t - (AS_OF - 72 * H)) / STEP)));
const times = Array.from({ length: POINTS }, (_, i) => AS_OF - 72 * H + i * STEP);

function buildPath(asset) {
  const A = ASSETS[asset];
  const anchors = new Map([[0, A.start], [POINTS - 1, A.end]]);
  const corridors = [];
  for (const n of notes.filter((n) => n.asset === asset)) {
    anchors.set(idxOf(n.openedAt), n.entryPx);
    if (n.exitPx != null) anchors.set(idxOf(n.settledAt), n.exitPx);
    const lo = Math.min(n.targetPx, n.swornVoidPx ?? n.voidPx, n.voidPx);
    const hi = Math.max(n.targetPx, n.voidPx);
    const end = n.settledAt ?? AS_OF;
    corridors.push({ a: idxOf(n.openedAt) + 1, b: idxOf(end) - 1, lo, hi });
  }
  if (asset === "WBTC") anchors.set(idxOf(AS_OF - A.lastSwap), A.end);
  if (asset === "WHSK") anchors.set(idxOf(AS_OF - 4 * H), 0.08761);
  const keys = [...anchors.keys()].sort((a, b) => a - b);
  const v = new Array(POINTS);
  for (let k = 0; k < keys.length - 1; k++) {
    const i0 = keys[k], i1 = keys[k + 1];
    const v0 = anchors.get(i0), v1 = anchors.get(i1);
    const n = i1 - i0;
    const w = [0];
    for (let j = 1; j <= n; j++) w.push(w[j - 1] + gauss() * A.vol * 0.55);
    for (let j = 0; j <= n; j++) {
      const u = n === 0 ? 0 : j / n;
      const bridge = w[j] - u * w[n];
      v[i0 + j] = v0 + (v1 - v0) * u + v0 * bridge;
    }
  }
  for (const c of corridors) {
    for (let i = c.a; i <= c.b; i++) {
      if (anchors.has(i)) continue;
      const pad = (c.hi - c.lo) * 0.06;
      v[i] = Math.min(c.hi - pad, Math.max(c.lo + pad, v[i]));
    }
  }
  // The exchange moves continuously; the thin pool only moves when someone swaps,
  // so HSKSwap is a held (stepped) copy of the fair path plus a drifting premium.
  const dex = new Array(POINTS);
  const lastSwapIdx = idxOf(AS_OF - A.lastSwap);
  for (let i = 0; i < POINTS; i++) {
    const hold = i > 0 && !anchors.has(i) && (rnd() < 0.55 || i > lastSwapIdx);
    dex[i] = hold ? dex[i - 1] : v[i];
  }
  dex[POINTS - 1] = A.end;
  for (let i = lastSwapIdx; i < POINTS; i++) dex[i] = A.end;
  const spreadEnd = A.end / A.cexEnd - 1;
  let s = 0.0042;
  const cex = v.map((x, i) => {
    s = s + (0.0045 - s) * 0.08 + gauss() * 0.0006;
    const u = i / (POINTS - 1);
    const sp = s * (1 - u ** 6) + spreadEnd * u ** 6;
    return x / (1 + sp) + x * gauss() * A.vol * 0.12;
  });
  cex[POINTS - 1] = A.cexEnd;
  const r = (x) => Number(x.toPrecision(asset === "WHSK" ? 5 : 7));
  return times.map((t, i) => ({ t, dex: r(dex[i]), cex: r(cex[i]) }));
}

const market = Object.entries(ASSETS).map(([asset, A]) => {
  const history = buildPath(asset);
  const twapPx = Number((A.end * (1 + (asset === "WHSK" ? 0.0001 : 0))).toPrecision(7));
  return {
    asset,
    label: A.label,
    dexPx: A.end,
    twapPx,
    cexPx: A.cexEnd,
    chainlinkPx: A.chainlink,
    chainlinkAgeSec: Math.round(A.clAge),
    spreadBps: Number((((A.end - A.cexEnd) / A.cexEnd) * 1e4).toFixed(1)),
    poolUsdt: A.poolUsdt,
    poolAsset: A.poolAsset,
    lastSwapAgoSec: A.lastSwap,
    history,
  };
});
for (const n of notes) if (n.status === "outstanding") n.livePx = market.find((m) => m.asset === n.asset).twapPx;

// ---- record -----------------------------------------------------------------
const graded = notes.filter((n) => n.sqError != null);
const brier = graded.reduce((a, n) => a + n.sqError, 0) / graded.length;
const pnlUsd = notes.reduce((a, n) => a + (n.status !== "revoked" ? n.pnlUsd ?? 0 : 0), 0);
const MAX_NOTIONAL = 50;
const tiers = [
  { index: 0, name: "Probation", share: 0.2, requirement: "Every new agent starts here, until its record shows calibration" },
  { index: 1, name: "Apprentice", share: 0.4, requirement: "5 graded notes, a Brier score better than a coin flip (below 0.25), and honoured notes at least 80% of the hits its stated odds claimed" },
  { index: 2, name: "Journeyman", share: 0.7, requirement: "12 graded notes, Brier 0.22 or better, realised P&L not negative" },
  { index: 3, name: "Fiduciary", share: 1.0, requirement: "25 graded notes, Brier 0.20 or better, realised P&L positive" },
].map((t) => ({ ...t, capUsd: Number((t.share * MAX_NOTIONAL).toFixed(2)) }));

const revokedPnl = notes.find((n) => n.status === "revoked").pnlUsd;
const dailyLoss = notes
  .filter((n) => n.settledAt && n.settledAt > AS_OF - 24 * H && (n.pnlUsd ?? 0) < 0)
  .reduce((a, n) => a - n.pnlUsd, 0);

const record = {
  graded: graded.length,
  honoured: notes.filter((n) => n.status === "honoured").length,
  void: notes.filter((n) => n.status === "void").length,
  lapsed: notes.filter((n) => n.status === "lapsed").length,
  retracted: notes.filter((n) => n.status === "retracted").length,
  revoked: notes.filter((n) => n.status === "revoked").length,
  brier: Number(brier.toFixed(4)),
  pnlUsd: Number((pnlUsd + revokedPnl).toFixed(4)),
  tier: tiers[0], // the revoked miss leaves the rolling Brier just above 0.25
  tiers,
  voidStreak: 1,
  navUsd: 203.18,
  hwmUsd: 206.4,
  frozen: false,
  dailyLossUsd: Number(dailyLoss.toFixed(4)),
};

// ---- holdings ---------------------------------------------------------------
const holdings = [
  { sym: "USDT", amount: 151.37, usd: 151.37, locked: Number((notes[8].amountOut + notes[9].amountOut).toFixed(2)) },
  { sym: "WETH", amount: 0.00912, usd: Number((0.00912 * 2235).toFixed(2)), locked: 0 },
  { sym: "WBTC", amount: 0.000183, usd: Number((0.000183 * 76827).toFixed(2)), locked: 0 },
  { sym: "WHSK", amount: 105.4, usd: Number((105.4 * 0.08735).toFixed(2)), locked: 0 },
];

// ---- journal ----------------------------------------------------------------
const M = "gemini-3.5-flash";
const N = (id) => notes.find((n) => n.id === id);
const J = [];
const add = (hAgo, kind, e) => J.push({ t: tAt(hAgo) - (e.sec ?? 0), kind, ...e, sec: undefined });
const swore = (id) => {
  const n = N(id);
  add((AS_OF - n.openedAt) / H + 0.03, "considered", { asset: n.asset, title: `Candidate: ${ASSETS[n.asset].label} ${n.side}, premium ${n.signals.spreadBps} bps, 4 h momentum ${n.signals.momentum4h > 0 ? "+" : "−"}${Math.abs(n.signals.momentum4h).toFixed(2)}%`, detail: `Levels computed by the candidate builder: target ${fmtPx(n.asset, n.targetPx)}, void ${fmtPx(n.asset, n.swornVoidPx ?? n.voidPx)}, size up to $${n.tierAtOpen ? "20.00" : "10.00"}.` });
  add((AS_OF - n.openedAt) / H, "sworn", { asset: n.asset, noteId: id, tx: n.openTx, model: M, tokens: 2100 + id * 37, title: `Swore ${n.serial} at ${Math.round(n.confidence * 100)}% confidence for $${n.notionalUsd.toFixed(2)}`, detail: n.statement });
};
const settled = (id, extra = "") => {
  const n = N(id);
  const verb = { honoured: "honoured", void: "void", lapsed: "lapsed", retracted: "retracted by Avow", revoked: "revoked by the owner" }[n.status];
  const by = n.settler === ADDR.stranger ? " Settled by an outside address; anyone may settle." : n.settler === ADDR.agent ? " Settled by the keeper." : "";
  const grade = n.sqError != null ? ` Graded ${n.status === "honoured" ? 1 : 0} against ${n.confidence.toFixed(2)}: squared error ${n.sqError.toFixed(3)}.` : " Not graded.";
  add((AS_OF - n.settledAt) / H, "settled", { asset: n.asset, noteId: id, tx: n.settleTx, title: `${n.serial} ${verb} at ${fmtPx(n.asset, n.exitPx)}, P&L ${n.pnlUsd >= 0 ? "+" : "−"}$${Math.abs(n.pnlUsd).toFixed(2)}`, detail: (grade + by + extra).trim() });
};

add(0, "heartbeat", { sec: 40, title: "Alive. 118 cycles in the last hour, 3 candidates, nothing new sworn.", detail: "Watching AVW·000009 (HSK) and AVW·000010 (BTC). Both inside their corridors." });
add(0.45, "considered", { asset: "WHSK", noteId: 9, title: "AVW·000009 is 76% of the way from its void level to its target", detail: "TWAP 0.08735 against target 0.08690. No action: the keeper settles the moment the TWAP crosses." });
add(1.0, "declined", { asset: "WETH", model: M, tokens: 2310, title: "Declined ETH: a 41 bps premium does not pay for the round trip", detail: "HSKSwap ETH sat 41 bps above HashKey Global. Selling here and buying back costs 60 bps in pool fees plus about 1 bp of gas, and I want 15 bps of edge on top. Momentum was flat (+0.08% in 1 h). Nothing worth swearing." });
add(1.6, "declined", { asset: "WHSK", title: "Skipped HSK: AVW·000009 is already outstanding", detail: "One outstanding note per asset. The candidate was dropped before reaching the model." });
add(2.0, "heartbeat", { title: "Alive. 120 cycles in the last hour, 2 candidates.", detail: "HashKey Global and Gate.io mids agree within 3 bps on all three assets." });
swore(10);
add(3.1, "declined", { asset: "WBTC", model: M, tokens: 2244, title: "Declined BTC: momentum alone is not enough at 35 bps", detail: "BTC was down 0.4% in 4 h but the HSKSwap premium was only 35 bps. I would have sworn at 0.53, and a note I barely believe costs more in calibration than it earns." });
add(4.0, "tightened", { asset: "WHSK", noteId: 9, tx: hex("tighten:9"), title: "Tightened the void level on AVW·000009 from 0.08893 to 0.08880", detail: "HSK eased 0.5% on HashKey Global. Moving the void level toward entry shrinks the worst case. The contract only lets the agent move a stop in this direction." });
add(4.5, "heartbeat", { title: "Alive. 119 cycles in the last hour, 1 candidate." });
add(5.2, "declined", { asset: "WETH", model: M, tokens: 2198, title: "Declined ETH long on 4 h momentum", detail: "HashKey Global ETH was up 0.62% in 4 h, but HSKSwap already traded 44 bps above it, so a long here buys the premium. My honest confidence was about 0.52." });
add(6.1, "error", { title: "HashKey Global ticker timed out twice; Gate.io mids used for one cycle", detail: "No note is ever sworn on a single price source. The cycle abstained; the next one had both sources." });
add(7.5, "heartbeat", { title: "Alive. 117 cycles in the last hour, no candidates." });
swore(9);
add(10.6, "declined", { asset: "WBTC", model: M, tokens: 2287, title: "Declined BTC: Chainlink BTC/USD was 9 h old", detail: "The off-chain seatbelt passed (the feed was inside 26 h and within 3% of the pool), but with a reference that stale I could not say the 49 bps premium was real. Abstained." });
add(12.0, "heartbeat", { title: "Alive. 120 cycles in the last hour, 4 candidates, 1 sent to the model." });
add(14.0, "blocked", { asset: "WETH", title: "Blocked by the slippage clause: quoted fill 64 bps from the TWAP", detail: "The quote for a $19.80 ETH sale filled at 2,251.20 against a 300 s TWAP of 2,236.90. The mandate allows 60 bps. The vault reverted in simulation; nothing was sent." });
add(16.5, "declined", { asset: "WHSK", model: M, tokens: 2140, title: "Declined HSK: premium collapsed to 12 bps after a large swap", detail: "A 240k WHSK swap moved the pool to the exchange price. No edge left." });
add(16.9, "blocked", { asset: "WHSK", title: "Blocked by the spike clause: live price 128 bps from the 5-minute TWAP", detail: "Right after a 240k WHSK swap the pool spot jumped away from its TWAP. The vault refuses to swear into a spike; the mandate allows 100 bps." });
add(18.0, "blocked", { asset: "WBTC", title: "Blocked by the denomination: asked for $26.00, Apprentice may write $20.00", detail: "The model sized the note above the tier cap. The guard caught it before the vault would have; the candidate was sent back at $20.00 and then declined on confidence." });
settled(8);
add(20.2, "amended", { tx: hex("amend:1"), title: "Owner amended the mandate: horizon 36 h to 24 h, cooldown 5 min to 10 min", detail: "Signed by the owner wallet. Both changes are stricter; Avow could have applied them itself." });
add(22.0, "heartbeat", { title: "Alive. 120 cycles in the last hour, 2 candidates." });
swore(8);
settled(7, " Void streak: 1 of 3.");
add(28.0, "declined", { asset: "WBTC", model: M, tokens: 2205, title: "Declined BTC: exchange and pool moved together", detail: "BTC fell 0.6% on both venues at once; the premium stayed at 18 bps. Nothing to converge." });
swore(7);
settled(4);
add(33.0, "blocked", { asset: "WHSK", title: "Blocked by the cooldown: 3 min 10 s left of 5 min", detail: "A second HSK candidate came 1 min 50 s after the last transaction. The vault enforces a pause between notes." });
settled(6, " Promoted to Apprentice: 5 graded notes, Brier 0.201. Denomination rises from $10 to $20.");
add(38.0, "heartbeat", { title: "Alive. 120 cycles in the last hour, no candidates." });
swore(6);
add(42.0, "blocked", { asset: "WETH", title: "Blocked by the stop clause: void level 912 bps away, 800 bps allowed", detail: "A wide-stop ETH long proposed in a volatile hour. Too far to the void level for this mandate." });
settled(5);
add(47.0, "error", { title: "RPC refused a 12,000-block log query; retried in 5,000-block pages", detail: "HSK mainnet RPC caps eth_getLogs at 10,000 blocks. The reader now pages by 5,000." });
swore(5);
settled(3);
swore(4);
settled(2);
swore(3);
add(62.0, "declined", { asset: "WHSK", model: M, tokens: 2112, title: "Declined HSK: spread 33 bps, under the round trip", detail: "Round trip costs 60 bps. Waited." });
settled(1);
swore(2);
add(71.4, "heartbeat", { title: "Agent started on the fork. First cycle read all three pools, Chainlink and both exchanges." });
swore(1);
add(71.7, "amended", { tx: hex("amend:0"), title: "Owner wrote the first mandate", detail: "Max note $50, max exposure $150, slippage 60 bps, spot deviation 100 bps, cooldown 5 min, horizon 36 h, daily loss $10, drawdown 15%, reward/risk 1.2, stop 800 bps, assets WETH, WBTC, WHSK." });

const journal = J.map(({ sec, ...e }) => e).sort((a, b) => b.t - a.t);

const state = {
  network: { chainId: 177, name: "HashKey Chain", explorer: "https://hsk.blockscout.com", rpc: "https://mainnet.hsk.xyz", mode: "fork-rehearsal" },
  contracts: { vault: ADDR.vault, factory: null, agent: ADDR.agent, owner: ADDR.owner, deployBlock: AS_OF_BLOCK - Math.round((72 * H) / 2) },
  asOf: AS_OF,
  source: "fixture",
  block: AS_OF_BLOCK,
  agentAlive: true,
  lastHeartbeat: AS_OF - 40,
  mandate: {
    maxSlippageBps: 60, maxSpotDevBps: 100, cooldownSec: 600, maxHorizonSec: 24 * H, maxNotionalUsd: 50, maxExposureUsd: 150,
    dailyLossLimitUsd: 10, maxDrawdownBps: 1500, minRewardRisk: 1.2, maxStopBps: 800, assets: ["WETH", "WBTC", "WHSK"], paused: false,
  },
  record,
  holdings,
  notes: [...notes].reverse(),
  market,
  journal,
  costs: { modelCalls24h: 212, modelUsd24h: 0.41, gasHsk24h: 1.08, gasUsd24h: 0.094 },
  replay: {
    generatedAt: AS_OF - 3 * H,
    window: { from: AS_OF - 30 * 24 * H, to: AS_OF - 3 * H, splitAt: AS_OF - 10 * 24 * H },
    costModel: "two 0.30% pool fees, price impact from each pool's liquidity at the swap size, and gas at 500 gwei with HSK at $0.087, on a $50 note",
    current: [
      { asset: "WBTC", kind: "catch-up", notes: 9, honoured: 3, void: 4, lapsed: 2, hitRate: 0.333, meanPMin: 0.71, pnlUsd: -2.61, pnlPerNoteUsd: -0.29, inSample: { notes: 6, hitRate: 0.333, pnlPerNoteUsd: -0.27 }, outOfSample: { notes: 3, hitRate: 0.333, pnlPerNoteUsd: -0.33 } },
      { asset: "WHSK", kind: "catch-up", notes: 4, honoured: 2, void: 1, lapsed: 1, hitRate: 0.5, meanPMin: 0.66, pnlUsd: -0.42, pnlPerNoteUsd: -0.105, inSample: { notes: 3, hitRate: 0.667, pnlPerNoteUsd: 0.04 }, outOfSample: { notes: 1, hitRate: 0, pnlPerNoteUsd: -0.55 } },
      { asset: "WETH", kind: "catch-up", notes: 0, honoured: 0, void: 0, lapsed: 0, hitRate: null, meanPMin: null, pnlUsd: 0, pnlPerNoteUsd: null, inSample: { notes: 0 }, outOfSample: { notes: 0 } },
    ],
    candidates: [
      { name: "Wider gap", description: "Swear only when the gap is at least 1.0%, twice the usual threshold.", params: { minGapBps: 100 }, inSample: { notes: 4, hitRate: 0.5, pnlPerNoteUsd: 0.06 }, outOfSample: { notes: 2, hitRate: 0, pnlPerNoteUsd: -0.61 } },
      { name: "Longer horizon", description: "Give each note 36 hours instead of 24 to let the pool catch up.", params: { horizonH: 36 }, inSample: { notes: 9, hitRate: 0.444, pnlPerNoteUsd: -0.08 }, outOfSample: { notes: 4, hitRate: 0.25, pnlPerNoteUsd: -0.31 } },
      { name: "Fade with momentum", description: "Require the exchange price to be moving toward the pool before swearing.", params: { minMomentum1hPct: 0.2 }, inSample: { notes: 3, hitRate: 0.667, pnlPerNoteUsd: 0.11 }, outOfSample: { notes: 1, hitRate: 0, pnlPerNoteUsd: -0.52 } },
    ],
    chosen: null,
    configsTried: 12,
    notes: "Sample data for development. Swaps are read from HSKSwap's Swap events on mainnet; the agent's candidate builder and guards run unchanged on each 30-second step, and a note is settled by the same rules the vault uses.\n\nThe family of alternatives was written down before the last 10 days were looked at. Twelve configurations is a small family, but even so the best in-sample result is expected to look better than it is; that is why each was run only once on the held-out days.",
  },
};

writeFileSync(OUT, JSON.stringify(state, null, 1));
console.log(`wrote ${OUT}: ${notes.length} notes, ${journal.length} journal entries, brier ${record.brier}, pnl ${record.pnlUsd}`);
