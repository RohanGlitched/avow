// Owner-side wallet actions, in the browser with the owner's injected wallet (MetaMask, Rabby, OKX...).
// - Looser changes: the owner signs AvowVault.amend(Mandate) themselves.
// - Stricter changes: the owner signs a short message; the agent checks it against the vault's owner on chain and
//   applies the change with tighten(), which the contract only accepts if every field is equal or stricter.
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import type { ProposalRow } from "./mandate";
import type { State } from "./types";

export class WalletUnavailable extends Error {}

const hsk = {
  id: 177,
  name: "HSK Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://hsk.blockscout.com" } },
} as const;

const amendAbi = [
  {
    type: "function",
    name: "amend",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "next",
        type: "tuple",
        components: [
          { name: "maxSlippageBps", type: "uint16" },
          { name: "maxSpotDevBps", type: "uint16" },
          { name: "maxStopBps", type: "uint16" },
          { name: "minRewardRiskX100", type: "uint16" },
          { name: "maxDrawdownBps", type: "uint16" },
          { name: "cooldown", type: "uint32" },
          { name: "maxHorizon", type: "uint32" },
          { name: "maxNotional", type: "uint64" },
          { name: "maxExposure", type: "uint64" },
          { name: "dailyLossLimit", type: "uint64" },
          { name: "assetMask", type: "uint8" },
          { name: "paused", type: "bool" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

async function current(): Promise<State> {
  const r = await fetch("/api/state", { cache: "no-store" });
  if (!r.ok) throw new Error("The vault could not be read just now. Try again in a minute.");
  return r.json();
}

async function connect(s: State) {
  if (s.network.mode !== "mainnet" || !s.contracts.vault || !s.contracts.owner) {
    throw new WalletUnavailable("This is the rehearsal vault on a private fork of HSK mainnet: no wallet can reach it. Amendments are signed here once the mainnet vault is live.");
  }
  const eth = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (!eth) throw new WalletUnavailable("No browser wallet found. Open this page in a browser with MetaMask, Rabby or OKX Wallet.");
  const w = createWalletClient({ chain: hsk, transport: custom(eth) });
  const [account] = await w.requestAddresses();
  if (account.toLowerCase() !== s.contracts.owner.toLowerCase()) {
    throw new WalletUnavailable(`Only the vault's owner (${short(s.contracts.owner)}) can change its mandate. This wallet is ${short(account)}.`);
  }
  try {
    await w.switchChain({ id: 177 });
  } catch {
    await w.addChain({ chain: hsk });
  }
  return { w, account, vault: s.contracts.vault as Address };
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function applyRows(s: State, rows: ProposalRow[]) {
  const m = { ...s.mandate };
  for (const r of rows) (m as Record<string, unknown>)[r.field] = r.to;
  const assets = Array.isArray(m.assets) ? m.assets : String(m.assets).split(/[,\s]+/);
  const mask = (assets.includes("WETH") ? 1 : 0) | (assets.includes("WBTC") ? 2 : 0) | (assets.includes("WHSK") ? 4 : 0);
  return {
    maxSlippageBps: Math.round(Number(m.maxSlippageBps)),
    maxSpotDevBps: Math.round(Number(m.maxSpotDevBps)),
    maxStopBps: Math.round(Number(m.maxStopBps)),
    minRewardRiskX100: Math.round(Number(m.minRewardRisk) * 100),
    maxDrawdownBps: Math.round(Number(m.maxDrawdownBps)),
    cooldown: Math.round(Number(m.cooldownSec)),
    maxHorizon: Math.round(Number(m.maxHorizonSec)),
    maxNotional: BigInt(Math.round(Number(m.maxNotionalUsd) * 1e6)),
    maxExposure: BigInt(Math.round(Number(m.maxExposureUsd) * 1e6)),
    dailyLossLimit: BigInt(Math.round(Number(m.dailyLossLimitUsd) * 1e6)),
    assetMask: mask,
    paused: Boolean(m.paused),
  };
}

/** Looser (or any) changes: the owner signs AvowVault.amend with their own wallet. */
export async function signAmendment(proposal: ProposalRow[]): Promise<{ tx: `0x${string}` }> {
  const s = await current();
  const { w, account, vault } = await connect(s);
  const tx = await w.writeContract({ account, address: vault, abi: amendAbi, functionName: "amend", args: [applyRows(s, proposal)] });
  return { tx };
}

/** Stricter changes: the owner confirms with a signature; the agent applies them with tighten(). */
export async function requestTighten(proposal: ProposalRow[]): Promise<{ tx?: `0x${string}`; message: string }> {
  const s = await current();
  const { w, account } = await connect(s);
  const until = Math.floor(Date.now() / 1000) + 600;
  const message = `Avow: tighten\n${JSON.stringify(proposal.map((p) => ({ field: p.field, to: p.to })))}\nuntil ${until}`;
  const signature = await w.signMessage({ account, message });
  const r = await fetch("/api/tighten", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
  const j = (await r.json().catch(() => ({}))) as { tx?: `0x${string}`; error?: string };
  if (!r.ok) throw new Error(j.error ?? "Avow could not apply the change. Try again in a minute.");
  return { tx: j.tx, message: `Avow applied it on chain: ${j.tx}` };
}
