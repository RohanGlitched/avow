import { readFileSync } from "node:fs";
import { BaseError, ContractFunctionRevertedError, createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AGENT_KEY_FILE, ASSETS, RPC, THINK_EVERY_MS, VAULT, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain, snapshot, type Snap } from "./market.js";
import { readVault, type VaultView } from "./vault.js";
import { candidates } from "./signals.js";
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
      BadConfidence: "The stated odds are outside 30–99%.",
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

export const gasLog: { t: number; hsk: number }[] = [];
function logGas(r: { gasUsed: bigint; effectiveGasPrice: bigint }) {
  gasLog.push({ t: Math.floor(Date.now() / 1000), hsk: Number(r.gasUsed * r.effectiveGasPrice) / 1e18 });
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

export const serial = (id: number) => `DCT·${String(id).padStart(6, "0")}`;

const declined = new Map<string, number>(); // candidate key → last time the model declined it
let lastThink = 0;
let lastPassSig = "";

export async function think(snaps: Snap[], v: VaultView) {
  if (v.mandate.paused) return note("paused", "The mandate is paused. Dictum is watching, not trading.");
  if (v.frozen) return note("frozen", "The vault is frozen after a drawdown. Waiting for the owner.");
  const cooldownLeft = v.lastSwearAt + v.mandate.cooldown - v.blockTime;
  if (v.lastSwearAt && cooldownLeft > 0) return;
  const { list, passes } = candidates(snaps, v);
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

  const recent = v.notes.filter((n) => n.status !== "outstanding").slice(0, 6).map((n) => `${ASSETS[n.asset].label} ${n.side ? "short" : "long"} at ${n.confidenceBps / 100}% → ${n.status}`);
  let d;
  try {
    d = await decide(fresh, passes, snaps, v, recent);
  } catch (e) {
    journal.add({ kind: "error", title: "The model did not answer", detail: (e as Error).message.slice(0, 300) });
    return;
  }
  const c = fresh.find((x) => x.key === d.candidate);
  if (d.decision !== "swear" || !c) {
    for (const x of fresh) declined.set(x.key, Date.now());
    journal.add({ kind: "declined", asset: fresh[0].sym, title: `Declined to swear: ${fresh.map((x) => `${ASSETS[x.assetId].label} ${x.side} (${x.kind})`).join(", ")}`, detail: d.rationale || d.because, model: d.model, tokens: d.tokens });
    return;
  }
  // ── guards: the model chooses and states odds; rules decide what may be sworn
  const p = Math.min(0.99, Math.max(0.3, Number(d.confidence)));
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
    journal.add({ kind: "sworn", asset: c.sym, noteId: id, tx: tx.hash, title: `Swore ${serial(id)}: ${ASSETS[c.assetId].label} ${c.side}, $${c.notionalUsd.toFixed(2)} at ${Math.round(p * 100)}%`, detail: d.rationale + (bad.length ? ` (The published reason was replaced by the rule's own line because it quoted ${bad.join(", ")}, which is not in the facts.)` : ""), model: d.model, tokens: d.tokens });
    journal.rationale(id, { rationale: d.rationale, candidate: c, snaps: snaps.find((s) => s.sym === c.sym) ?? null });
  } catch (e) {
    const w = words(e);
    declined.set(c.key, Date.now());
    journal.add({ kind: "blocked", asset: c.sym, title: `The vault refused a ${ASSETS[c.assetId].label} ${c.side} note`, detail: `${w.text} (${w.name})`, model: d.model, tokens: d.tokens });
  }
}

let lastStateNote = "";
function note(tag: string, text: string) {
  if (lastStateNote === tag) return;
  lastStateNote = tag;
  journal.add({ kind: "heartbeat", title: text });
}

export async function tick() {
  const [snaps, v] = await Promise.all([snapshot(), readVault()]);
  history.push(snaps);
  await keep(v).catch((e) => journal.add({ kind: "error", title: "Keeper error", detail: words(e).text }));
  await think(snaps, v).catch((e) => journal.add({ kind: "error", title: "Think error", detail: words(e).text }));
  journal.beat();
  return { snaps, v };
}

export async function tightenMandate(next: VaultView["mandate"]) {
  const tx = await send("tighten", [next]);
  logGas(tx);
  return tx.hash;
}
