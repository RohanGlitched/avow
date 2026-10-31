import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AGENT_KEY_FILE, ASSETS, DATA_DIR, MODE, RPC, THINK_EVERY_MS, VAULT, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain, mainnetPool, snapshot, type MainnetPool, type Snap } from "./market.js";
import { enter, grade, mark } from "./shadow.js";
import { mandateEvents, mandateWords, readVault, type VaultView } from "./vault.js";
import { candidates, reshape, type Candidate } from "./signals.js";
import { PERSONA, ruleDecision } from "./personas.js";
import { reviewNote } from "./brain.js";
import { decide, statement, unsupportedNumbers } from "./brain.js";
import { journal } from "./journal.js";
import { history } from "./history.js";

const key = readFileSync(AGENT_KEY_FILE, "utf8").trim() as Hex;
export const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: hsk, transport: http(RPC, { timeout: 30_000 }) });

/** One plain sentence for each way the vault can refuse. */
export function words(e: unknown): { name: string; text: string } {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = r?.data?.errorName ?? r?.reason ?? e.shortMessage;
    const args = (r?.data?.args ?? []) as readonly unknown[];
    const n = (i: number) => Number(args[i] as bigint);
    const map: Record<string, string> = {
      Paused: "The mandate is paused, so no new note may be sworn.",
      Frozen: "The vault is frozen after a drawdown; only the owner can unfreeze it.",
      AssetNotAllowed: "The mandate does not allow this asset.",
      CooldownActive: `The cooldown between notes has not passed (ready at ${new Date(n(0) * 1000).toISOString().slice(11, 16)} UTC).`,
      NoteAlreadyOutstanding: "A note on this asset is already outstanding.",
      BadLevels: "The target and void levels are on the wrong sides of the entry.",
      StopTooWide: `The void level is ${(n(0) / 100).toFixed(2)}% away, wider than the ${(n(1) / 100).toFixed(2)}% the mandate allows.`,
      StopTooTight: "The void level is closer than 0.25%, inside normal noise.",
      RewardRiskTooLow: `Reward to risk is ${(n(0) / 100).toFixed(2)}, below the mandate's ${(n(1) / 100).toFixed(2)}.`,
      NegativeExpectancy: `At ${(n(0) / 100).toFixed(0)}% odds this note would be expected to lose.`,
      SelfFulfilling: "The agent's own swap would reach the target; that note would prove nothing.",
      BadExpiry: "The expiry is outside the horizon the mandate allows.",
      BadConfidence: "The stated odds are outside 50–99%: a note must claim at least even odds.",
      ExceedsDenomination: `$${(n(0) / 1e6).toFixed(2)} is more than the agent's denomination of $${(n(1) / 1e6).toFixed(2)}.`,
      ExceedsExposure: `Open exposure would reach $${(n(0) / 1e6).toFixed(2)}, above the $${(n(1) / 1e6).toFixed(2)} limit.`,
      DailyLossReached: `Today's realised loss ($${(n(0) / 1e6).toFixed(2)}) has reached the daily limit.`,
      SpotDeviation: `The live price is ${(n(2) / 100).toFixed(2)}% from the 5-minute TWAP, more than the mandate allows (a spike).`,
      NoTwap: "The pool has no 5-minute price history yet.",
      InsufficientInventory: "The vault does not hold enough free inventory of this asset to sell.",
      NotSettleable: "The note is neither past its target, past its void level, nor expired.",
      NotStricter: "That change would loosen the mandate; only the owner can sign it.",
    };
    return { name: String(name), text: map[String(name)] ?? `The vault refused: ${e.shortMessage}` };
  }
  return { name: "error", text: (e as Error)?.message ?? String(e) };
}

async function send(fn: "swear" | "settle" | "tighten" | "retract" | "tightenStop", args: readonly unknown[]) {
  const sim = await chain.simulateContract({ account, address: VAULT, abi: vaultAbi, functionName: fn, args: args as never });
  const gas = await chain.estimateContractGas({ account, address: VAULT, abi: vaultAbi, functionName: fn, args: args as never });
  const hash = await wallet.writeContract({ ...sim.request, gas: (gas * 125n) / 100n });
  const rc = await chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (rc.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return { hash, gasUsed: rc.gasUsed, effectiveGasPrice: rc.effectiveGasPrice };
}

const NL = String.fromCharCode(10);
const GAS = join(DATA_DIR, "gas.jsonl");
export const gasLog: { t: number; hsk: number; gas?: number }[] = existsSync(GAS) ? readFileSync(GAS, "utf8").split(NL).filter(Boolean).map((l) => JSON.parse(l)) : [];
function logGas(r: { gasUsed: bigint; effectiveGasPrice: bigint }) {
  const row = { t: Math.floor(Date.now() / 1000), hsk: Number(r.gasUsed * r.effectiveGasPrice) / 1e18, gas: Number(r.gasUsed) };
  gasLog.push(row);
  appendFileSync(GAS, JSON.stringify(row) + NL);
}

// ── keeper: anyone may settle; the agent does it every loop so stops are never late
export async function keep(v: VaultView) {
  const open = v.notes.filter((n) => n.status === "outstanding");
  if (!open.length) return;
  const res = await chain.multicall({ allowFailure: true, contracts: open.map((n) => ({ address: VAULT, abi: vaultAbi, functionName: "settleable", args: [BigInt(n.id)] }) as const) });
  for (let i = 0; i < open.length; i++) {
    const r = res[i];
    if (r.status !== "success") continue;
    const [ok, st] = r.result as readonly [boolean, number];
    if (!ok) continue;
    const n = open[i];
    const label = ASSETS[n.asset].label;
    try {
      const tx = await send("settle", [BigInt(n.id)]);
      logGas(tx);
      const how = ["", "", "honoured", "void", "lapsed"][st] ?? "settled";
      journal.add({ kind: "settled", asset: ASSETS[n.asset].sym, noteId: n.id, tx: tx.hash, title: `Settled ${label} note ${serial(n.id)}: ${how}`, detail: how === "honoured" ? "The pool reached the target before the void level and the expiry." : how === "void" ? "The pool crossed the void level: the stop executed." : "The note expired before either level." });
    } catch (e) {
      const w = words(e);
      journal.add({ kind: "error", asset: ASSETS[n.asset].sym, noteId: n.id, title: `Could not settle ${serial(n.id)}`, detail: w.text });
    }
  }
}

export const SERIAL_PREFIX = { avow: "AVW", bold: "BLD", fade: "FAD" }[PERSONA.id];
export const serial = (id: number) => `${SERIAL_PREFIX}·${String(id + 1).padStart(6, "0")}`;

const declined = new Map<string, number>(); // candidate key → last time the model declined it
let lastThink = 0;
let lastPassSig = "";

export async function think(snaps: Snap[], v: VaultView) {
  if (v.mandate.paused) return note("paused", "The mandate is paused. Avow is watching, not trading.");
  if (v.frozen) return note("frozen", "The vault is frozen after a drawdown. Waiting for the owner.");
  const cooldownLeft = v.lastSwearAt + v.mandate.cooldown - v.blockTime;
  if (v.lastSwearAt && cooldownLeft > 0) return;
  const { list, passes } = candidates(snaps, v);
  for (const c of list) enter(c, "passed", mainnetPools[c.sym], v.blockTime);
  if (process.env.DICTUM_DEBUG) console.log("think", list.map((c) => c.key).join(",") || "-", passes.map((p) => p.sym + ":" + p.reason.slice(0, 40)).join(" | "), "sinceThink", Math.round((Date.now() - lastThink) / 1000));

  const sig = passes.map((p) => `${p.sym}:${p.reason.replace(/[\d.]+%/g, "#")}`).join("|") + "|" + list.map((c) => c.key).join(",");
  if (!list.length) {
    if (sig !== lastPassSig || Date.now() - lastThink > 60 * 60_000) {
      lastPassSig = sig;
      lastThink = Date.now();
      journal.add({ kind: "considered", title: "Nothing worth swearing", detail: passes.map((p) => `${ASSETS.find((a) => a.sym === p.sym)!.label}: ${p.reason}.`).join(" ") });
    }
    return;
  }
  if (Date.now() - lastThink < THINK_EVERY_MS) return;
  const fresh = list.filter((c) => Date.now() - (declined.get(c.key) ?? 0) > 30 * 60_000);
  if (!fresh.length) return;
  lastThink = Date.now();
  lastPassSig = sig;

  if (PERSONA.kind === "rule") {
    const r = ruleDecision(fresh, v);
    if (!r.c) {
      for (const x of fresh) declined.set(x.key, Date.now());
      journal.add({ kind: "declined", asset: fresh[0].sym, title: `Declined: no side of these signals clears the fees with the inventory the vault holds`, detail: r.rationale, model: "rule", tokens: 0 });
      return;
    }
    return swearNote(r.c, r.confidence, r, snaps, v);
  }

  const recent = v.notes.filter((n) => n.status !== "outstanding").slice(0, 6).map((n) => `${ASSETS[n.asset].label} ${n.side ? "short" : "long"} at ${n.confidenceBps / 100}% → ${n.status}`);
  let d;
  try {
    d = await decide(fresh, passes, snaps, v, recent);
  } catch (e) {
    journal.add({ kind: "error", title: "The model did not answer", detail: (e as Error).message.slice(0, 300) });
    return;
  }
  const c0 = fresh.find((x) => x.key === d.candidate);
  // the model may shape the target and horizon; the rules re-check reward/risk and costs, and fall back to the rule's own shape
  const c = c0 ? reshape(c0, v, d.targetScale, d.horizonHours) ?? c0 : undefined;
  if (d.decision !== "swear" || !c) {
    for (const x of fresh) {
      declined.set(x.key, Date.now());
      mark(x.sym, x.kind, "declined");
    }
    journal.add({ kind: "declined", asset: fresh[0].sym, title: `Declined to swear: ${fresh.map((x) => `${ASSETS[x.assetId].label} ${x.side} (${x.kind})`).join(", ")}`, detail: d.rationale || d.because, model: d.model, tokens: d.tokens });
    return;
  }
  return swearNote(c, Number(d.confidence), d, snaps, v);
}

/** Guards, then the oath: the agent chooses and states odds; the rules and the vault decide what may be sworn. */
async function swearNote(c: Candidate, confidence: number, d: { rationale: string; because: string; model: string; tokens: number }, snaps: Snap[], v: VaultView) {
  const p = Math.min(0.99, Math.max(0.5, confidence));
  if (!Number.isFinite(p) || p <= c.pMin + 0.01) {
    declined.set(c.key, Date.now());
    journal.add({ kind: "declined", asset: c.sym, title: `Declined ${ASSETS[c.assetId].label} ${c.side}: odds below break-even`, detail: `The model gave ${Math.round(p * 100)}%; this note breaks even at ${Math.round(c.pMin * 100)}%. ${d.rationale}`, model: d.model, tokens: d.tokens });
    return;
  }
  if (c.notionalUsd < 1) {
    journal.add({ kind: "declined", asset: c.sym, title: `Declined ${ASSETS[c.assetId].label} ${c.side}: too small`, detail: "The size the rules allow is under $1." });
    return;
  }
  let because = d.because.replace(/\s+/g, " ").slice(0, 160);
  const bad = unsupportedNumbers(because, c);
  if (bad.length) because = c.why[0].toUpperCase() + c.why.slice(1) + ".";
  const expiry = v.blockTime + c.horizonSec;
  const text = statement(c, expiry, p, because);
  const args = [
    c.assetId,
    c.side === "long" ? 0 : 1,
    BigInt(Math.floor(c.notionalUsd * 1e6)),
    BigInt(Math.round(c.target * 1e8)),
    BigInt(Math.round(c.void * 1e8)),
    expiry,
    Math.round(p * 1e4),
    text,
    keccak256(toHex(d.rationale)),
  ] as const;
  try {
    const tx = await send("swear", args);
    logGas(tx);
    const v2 = await readVault();
    const id = v2.noteCount - 1;
    mark(c.sym, c.kind, "sworn");
    journal.add({ kind: "sworn", asset: c.sym, noteId: id, tx: tx.hash, title: `Swore ${serial(id)}: ${ASSETS[c.assetId].label} ${c.side}, $${c.notionalUsd.toFixed(2)} at ${Math.round(p * 100)}%`, detail: d.rationale + (bad.length ? ` (The published reason was replaced by the rule's own line because it quoted ${bad.join(", ")}, which is not in the facts.)` : ""), model: d.model, tokens: d.tokens });
    try {
      journal.rationale(id, { rationale: d.rationale, candidate: c, snaps: snaps.find((s) => s.sym === c.sym) ?? null });
    } catch (e) {
      console.error("rationale not saved", (e as Error).message);
    }
  } catch (e) {
    const w = words(e);
    declined.set(c.key, Date.now());
    journal.add({ kind: "blocked", asset: c.sym, title: `The vault refused a ${ASSETS[c.assetId].label} ${c.side} note`, detail: `${w.text} (${w.name})`, model: d.model, tokens: d.tokens });
  }
}

const lastReview = new Map<number, number>();

/** Every 15 minutes, a note that has moved, stalled or lost its reason is put back to the model: hold, tighten the stop, or retract. */
export async function review(snaps: Snap[], v: VaultView) {
  for (const n of v.notes.filter((x) => x.status === "outstanding")) {
    if (Date.now() - (lastReview.get(n.id) ?? 0) < 15 * 60_000) continue;
    const a = ASSETS[n.asset];
    const s = snaps.find((x) => x.sym === a.sym);
    if (!s?.twapPx) continue;
    const long_ = n.side === 0;
    const progress = (s.twapPx - n.entryPx) / (n.targetPx - n.entryPx); // 1 = at target, <0 = moving toward the void
    const elapsed = (v.blockTime - n.openedAt) / Math.max(1, n.expiry - n.openedAt);
    const gap = s.gapBps ?? 0; // + = pool cheap vs exchanges
    const thesisGone = n.side === 0 ? gap < 0 : gap > 0; // the exchanges no longer sit on the side the note bets toward
    const trigger = progress >= 0.5 ? "moved half-way to the target" : elapsed >= 0.5 && progress < 0.2 ? "half the time has passed with little progress" : thesisGone ? "the exchanges have moved to the other side of the pool" : null;
    if (!trigger) continue;
    lastReview.set(n.id, Date.now());
    const fee = (2 * 30 + 25) / 1e4; // two pool fees plus the minimum stop distance
    const breakeven = long_ ? n.entryPx * (1 + fee) : n.entryPx * (1 - fee);
    const canLockIn = long_ ? breakeven < s.twapPx && breakeven > n.voidPx : breakeven > s.twapPx && breakeven < n.voidPx;
    let r;
    try {
      r = await reviewNote(n, a.label, s, progress, elapsed, trigger, canLockIn ? breakeven : null);
    } catch (e) {
      journal.add({ kind: "error", noteId: n.id, title: `Could not review ${serial(n.id)}`, detail: (e as Error).message.slice(0, 200) });
      continue;
    }
    try {
      if (r.action === "tighten" && canLockIn) {
        const tx = await send("tightenStop", [BigInt(n.id), BigInt(Math.round(breakeven * 1e8))]);
        logGas(tx);
        journal.add({ kind: "reviewed", asset: a.sym, noteId: n.id, tx: tx.hash, title: `Reviewed ${serial(n.id)}: moved the stop to break-even (${trigger})`, detail: r.reason, model: r.model, tokens: r.tokens });
      } else if (r.action === "retract") {
        const tx = await send("retract", [BigInt(n.id)]);
        logGas(tx);
        journal.add({ kind: "reviewed", asset: a.sym, noteId: n.id, tx: tx.hash, title: `Reviewed ${serial(n.id)}: retracted, graded as a miss (${trigger})`, detail: r.reason, model: r.model, tokens: r.tokens });
      } else {
        journal.add({ kind: "reviewed", asset: a.sym, noteId: n.id, title: `Reviewed ${serial(n.id)}: holding (${trigger})`, detail: r.reason, model: r.model, tokens: r.tokens });
      }
    } catch (e) {
      const w = words(e);
      journal.add({ kind: "blocked", asset: a.sym, noteId: n.id, title: `The vault refused a review action on ${serial(n.id)}`, detail: `${w.text} (${w.name})` });
    }
  }
}

let lastStateNote = "";
function note(tag: string, text: string) {
  if (lastStateNote === tag) return;
  lastStateNote = tag;
  journal.add({ kind: "heartbeat", title: text });
}

/** Owner amendments and agent tightenings, journaled from the chain's own MandateChanged events. */
function journalMandateEvents() {
  const seen = new Set(journal.all().filter((j) => j.kind === "amended" || j.kind === "tightened").map((j) => j.tx));
  let prev: ReturnType<typeof mandateWords> | null = null;
  for (const e of mandateEvents) {
    const now = mandateWords(e.mandate);
    if (prev && !seen.has(e.tx)) {
      const diff = Object.keys(now).filter((k) => JSON.stringify((now as Record<string, unknown>)[k]) !== JSON.stringify((prev as Record<string, unknown>)[k])).map((k) => `${k}: ${JSON.stringify((prev as Record<string, unknown>)[k])} → ${JSON.stringify((now as Record<string, unknown>)[k])}`);
      if (diff.length) journal.add({ kind: e.tightening ? "tightened" : "amended", tx: e.tx, title: e.tightening ? "The agent tightened its own mandate" : "The owner amended the mandate", detail: diff.join("; ") });
    }
    prev = now;
  }
}

export const mainnetPools: Record<string, MainnetPool> = {};

export async function tick() {
  const [snaps, v] = await Promise.all([snapshot(), readVault()]);
  if (MODE === "mainnet") for (const s of snaps) mainnetPools[s.sym] = { twapPx: s.twapPx, spotPx: s.spotPx, lastSwapAgoSec: s.lastSwapAgoSec, swaps3h: s.swaps3h };
  else for (const a of ASSETS) mainnetPools[a.sym] = await mainnetPool(a);
  grade(mainnetPools, Math.floor(Date.now() / 1000));
  history.push(snaps);
  journalMandateEvents();
  await keep(v).catch((e) => journal.add({ kind: "error", title: "Keeper error", detail: words(e).text }));
  await review(snaps, v).catch((e) => journal.add({ kind: "error", title: "Review error", detail: words(e).text }));
  await think(snaps, v).catch((e) => journal.add({ kind: "error", title: "Think error", detail: words(e).text }));
  journal.beat();
  return { snaps, v };
}

export async function tightenMandate(next: VaultView["mandate"]) {
  const tx = await send("tighten", [next]);
  logGas(tx);
  return tx.hash;
}
