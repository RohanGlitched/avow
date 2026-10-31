// An outside keeper: a wallet that is neither any vault's owner nor its agent settles every note the moment the vault allows
// it, proving that settlement needs nobody's permission. It checks every few seconds, so it usually beats the agents' own keepers.
//   DICTUM_OUTSIDE_KEY_FILE=… DICTUM_OUTSIDE_VAULTS=0x…,0x… node dist/outside.js
import { readFileSync } from "node:fs";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RPC, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain } from "./market.js";

const me = privateKeyToAccount(readFileSync(process.env.DICTUM_OUTSIDE_KEY_FILE ?? "./.keys/outside.key", "utf8").trim() as Hex);
const w = createWalletClient({ account: me, chain: hsk, transport: http(RPC, { timeout: 20_000 }) });
const VAULTS = (process.env.DICTUM_OUTSIDE_VAULTS ?? "").split(",").filter(Boolean) as Address[];
const done = new Set<string>();

async function sweep() {
  for (const vault of VAULTS) {
    const count = Number(await chain.readContract({ address: vault, abi: vaultAbi, functionName: "noteCount" }));
    for (let id = 0; id < count; id++) {
      const key = `${vault}:${id}`;
      if (done.has(key)) continue;
      const [ok, status] = (await chain.readContract({ address: vault, abi: vaultAbi, functionName: "settleable", args: [BigInt(id)] })) as readonly [boolean, number];
      if (!ok) {
        if (status >= 2) done.add(key); // already settled by someone
        continue;
      }
      try {
        const sim = await chain.simulateContract({ account: me, address: vault, abi: vaultAbi, functionName: "settle", args: [BigInt(id)] });
        const hash = await w.writeContract(sim.request);
        const rc = await chain.waitForTransactionReceipt({ hash, timeout: 120_000 });
        console.log(new Date().toISOString(), "settled", vault, id, rc.status, hash);
        done.add(key);
      } catch (e) {
        console.log(new Date().toISOString(), "not settled", vault, id, (e as Error).message.split("\n")[0]); // the agent's keeper may have been first
      }
    }
  }
}

console.log("outside keeper", me.address, "watching", VAULTS.join(", "));
setInterval(() => sweep().catch((e) => console.error("sweep", (e as Error).message.split("\n")[0])), 4_000);
