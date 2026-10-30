// Owner actions from a key file: `node owner.js amend '{"maxNotionalUsd":250}'` or `node owner.js transfer 0xNewOwner`.
import { readFileSync } from "node:fs";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RPC, VAULT, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain } from "./market.js";

const owner = privateKeyToAccount(readFileSync(process.env.DICTUM_OWNER_KEY_FILE ?? "./.keys/deployer.key", "utf8").trim() as Hex);
const w = createWalletClient({ account: owner, chain: hsk, transport: http(RPC) });
const [cmd, arg] = process.argv.slice(2);

async function main() {
  if (cmd === "amend") {
    const m = { ...(await chain.readContract({ address: VAULT, abi: vaultAbi, functionName: "mandate" })) } as Record<string, unknown>;
    const ch = JSON.parse(arg) as Record<string, number | boolean>;
    const usd = (k: string, f: string) => { if (ch[k] !== undefined) m[f] = BigInt(Math.round(Number(ch[k]) * 1e6)); };
    usd("maxNotionalUsd", "maxNotional");
    usd("maxExposureUsd", "maxExposure");
    usd("dailyLossLimitUsd", "dailyLossLimit");
    for (const [k, f] of [["maxStopBps", "maxStopBps"], ["maxSlippageBps", "maxSlippageBps"], ["maxSpotDevBps", "maxSpotDevBps"], ["maxDrawdownBps", "maxDrawdownBps"], ["cooldownSec", "cooldown"], ["maxHorizonSec", "maxHorizon"]]) if (ch[k] !== undefined) m[f] = Number(ch[k]);
    if (ch.minRewardRisk !== undefined) m.minRewardRiskX100 = Math.round(Number(ch.minRewardRisk) * 100);
    if (ch.paused !== undefined) m.paused = Boolean(ch.paused);
    const h = await w.writeContract({ address: VAULT, abi: vaultAbi, functionName: "amend", args: [m as never] });
    const r = await chain.waitForTransactionReceipt({ hash: h });
    console.log("amended", h, r.status);
  } else if (cmd === "transfer") {
    const h = await w.writeContract({ address: VAULT, abi: vaultAbi, functionName: "transferOwnership", args: [arg as Address] });
    const r = await chain.waitForTransactionReceipt({ hash: h });
    console.log("ownership →", arg, h, r.status);
  } else {
    console.log("usage: owner.js amend '<json>' | transfer <address>");
  }
}
main().catch((e) => { console.error(e?.shortMessage ?? e); process.exit(1); });
