// ERC-8004 reputation for the vault's agent: every settled note is posted through AvowGrader, which computes the grade from
// the vault itself (100 − 100·(stated odds − outcome)²), and the agent's summary is read back from the Reputation Registry.
// Anyone may post a grade; the agent does it after settling so the reputation is never behind the vault.
import { type Address } from "viem";
import { ERC8004_GRADER, VAULT } from "./config.js";
import { graderAbi, reputationAbi } from "./erc8004Contract.js";
import { chain } from "./market.js";
import type { VaultView } from "./vault.js";

export interface Erc8004View {
  grader: Address;
  identity: Address;
  reputation: Address;
  agentId: number | null; // null until the vault's owner links it
  posted: number; // grades posted from this vault
  mean: number | null; // mean grade, 0–100 (= 100·(1 − Brier) over the posted notes)
}

let info: { identity: Address; reputation: Address } | null = null;
let last: Erc8004View | null = null;

async function addresses() {
  if (!info) {
    const [identity, reputation] = await Promise.all([
      chain.readContract({ address: ERC8004_GRADER, abi: graderAbi, functionName: "identity" }),
      chain.readContract({ address: ERC8004_GRADER, abi: graderAbi, functionName: "reputation" }),
    ]);
    info = { identity: identity as Address, reputation: reputation as Address };
  }
  return info;
}

async function agentId(): Promise<number | null> {
  try {
    return Number(await chain.readContract({ address: ERC8004_GRADER, abi: graderAbi, functionName: "agentOf", args: [VAULT] }));
  } catch {
    return null;
  }
}

/** Notes settled in the vault whose grade is not yet posted. */
export async function unposted(v: VaultView): Promise<number[]> {
  if (!ERC8004_GRADER) return [];
  const settled = v.notes.filter((n) => n.status !== "outstanding");
  if (!settled.length) return [];
  const res = await chain.multicall({ allowFailure: true, contracts: settled.map((n) => ({ address: ERC8004_GRADER, abi: graderAbi, functionName: "posted", args: [VAULT, BigInt(n.id)] }) as const) });
  return settled.filter((_, i) => res[i].status === "success" && res[i].result === false).map((n) => n.id);
}

export async function read(): Promise<Erc8004View | null> {
  if (!ERC8004_GRADER) return null;
  try {
    const a = await addresses();
    const id = await agentId();
    let posted = 0;
    let mean: number | null = null;
    if (id !== null) {
      const [count, value, decimals] = (await chain.readContract({ address: a.reputation, abi: reputationAbi, functionName: "getSummary", args: [BigInt(id), [ERC8004_GRADER], "avow-calibration", ""] })) as readonly [bigint, bigint, number];
      posted = Number(count);
      mean = posted ? Number(value) / 10 ** decimals : null;
    }
    last = { grader: ERC8004_GRADER, ...a, agentId: id, posted, mean };
  } catch (e) {
    console.error("erc8004 read", (e as Error).message);
  }
  return last;
}

export const current = () => last;
