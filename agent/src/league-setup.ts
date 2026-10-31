// Deploys the AvowLeague registry (unless DICTUM_LEAGUE_REGISTRY is set) and enters vaults by name, signed by their owner.
// node dist/league-setup.js 0xVault:Avow 0xVault:Bold …   (DICTUM_OWNER_KEY_FILE = the vaults' owner key)
import { readFileSync } from "node:fs";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LEAGUE_REGISTRY, MODE, RPC, hsk } from "./config.js";
import { leagueAbi, leagueBytecode } from "./leagueContract.js";
import { chain } from "./market.js";

const owner = privateKeyToAccount(readFileSync(process.env.DICTUM_OWNER_KEY_FILE ?? "./.keys/deployer.key", "utf8").trim() as Hex);
const w = createWalletClient({ account: owner, chain: hsk, transport: http(RPC) });

async function main() {
  console.log("mode", MODE, "owner", owner.address);
  let registry = LEAGUE_REGISTRY;
  if (!registry) {
    const hash = await w.deployContract({ abi: leagueAbi, bytecode: leagueBytecode as Hex });
    const rc = await chain.waitForTransactionReceipt({ hash, timeout: 180_000 });
    registry = rc.contractAddress! as Address;
    console.log("league", registry, "block", rc.blockNumber, "gas", rc.gasUsed);
  }
  for (const arg of process.argv.slice(2)) {
    const [vault, name] = arg.split(":") as [Address, string];
    const at = await chain.readContract({ address: registry, abi: leagueAbi, functionName: "indexOf", args: [vault] });
    if (at > 0n) {
      console.log("already entered", vault);
      continue;
    }
    const hash = await w.writeContract({ address: registry, abi: leagueAbi, functionName: "enter", args: [vault, name] });
    const rc = await chain.waitForTransactionReceipt({ hash, timeout: 180_000 });
    console.log("entered", name, vault, "gas", rc.gasUsed);
  }
  console.log("DICTUM_LEAGUE_REGISTRY=" + registry);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
