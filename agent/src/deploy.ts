// Deploys an Avow vault (DictumVault.sol until the rename) and prepares the HSKSwap pools (5-minute TWAP needs observation slots).
// Fork rehearsal: also funds the vault and the keys with anvil cheat calls. Mainnet: spends real HSK on gas only.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createWalletClient, encodeAbiParameters, http, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ASSETS, DATA_DIR, MODE, ROUTER, RPC, USDT, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { vaultBytecode } from "./bytecode.js";
import { chain } from "./market.js";

const deployer = privateKeyToAccount(readFileSync(process.env.DICTUM_DEPLOYER_KEY_FILE ?? "./.keys/deployer.key", "utf8").trim() as Hex);
const agent = privateKeyToAccount(readFileSync(process.env.DICTUM_AGENT_KEY_FILE ?? "./.keys/agent.key", "utf8").trim() as Hex);
const owner = (process.env.DICTUM_OWNER ?? deployer.address) as Address;
const w = createWalletClient({ account: deployer, chain: hsk, transport: http(RPC) });
const poolAbi = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)", "function increaseObservationCardinalityNext(uint16)"]);

const mandate = {
  maxSlippageBps: 60, maxSpotDevBps: 100, maxStopBps: 800, minRewardRiskX100: 120, maxDrawdownBps: 1500,
  cooldown: Number(process.env.DICTUM_COOLDOWN ?? 600), maxHorizon: 24 * 3600,
  maxNotional: BigInt(process.env.DICTUM_MAX_NOTIONAL ?? 50_000_000), maxExposure: BigInt(process.env.DICTUM_MAX_EXPOSURE ?? 150_000_000),
  dailyLossLimit: BigInt(process.env.DICTUM_DAILY_LOSS ?? 10_000_000), assetMask: 7, paused: false,
};

async function cheat(method: string, params: unknown[]) {
  return chain.request({ method: method as never, params: params as never });
}

async function main() {
  console.log("mode", MODE, "rpc", RPC, "deployer", deployer.address, "agent", agent.address, "owner", owner);
  if (MODE === "fork-rehearsal") {
    for (const a of [deployer.address, agent.address]) await cheat("anvil_setBalance", [a, toHex(10n ** 20n)]);
  }
  const bal = await chain.getBalance({ address: deployer.address });
  console.log("deployer HSK", Number(bal) / 1e18);
  const assets = ASSETS.map((a) => ({ token: a.token, pool: a.pool, fee: 3000, decimals: 0, assetIsToken0: false }));
  const hash = await w.deployContract({ abi: vaultAbi, bytecode: vaultBytecode as Hex, args: ["Avow", owner, agent.address, USDT, ROUTER, assets, mandate] });
  const rc = await chain.waitForTransactionReceipt({ hash, timeout: 180_000 });
  const vault = rc.contractAddress!;
  console.log("vault", vault, "block", rc.blockNumber, "gas", rc.gasUsed);
  for (const a of ASSETS) {
    const s0 = await chain.readContract({ address: a.pool, abi: poolAbi, functionName: "slot0" });
    if (s0[4] < 64) {
      const h = await w.writeContract({ address: a.pool, abi: poolAbi, functionName: "increaseObservationCardinalityNext", args: [64] });
      const r = await chain.waitForTransactionReceipt({ hash: h });
      console.log("cardinality →64", a.label, r.gasUsed);
    }
  }
  if (MODE === "fork-rehearsal") {
    const put = async (token: Address, who: Address, amount: bigint) => {
      const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 0n]));
      await cheat("anvil_setStorageAt", [token, slot, toHex(amount, { size: 32 })]);
    };
    await put(USDT, vault, 200_000_000n);
    await put(ASSETS[0].token, vault, 20_000_000_000_000_000n); // 0.02 WETH
    await put(ASSETS[1].token, vault, 50_000n); // 0.0005 WBTC
    await put(ASSETS[2].token, vault, 300n * 10n ** 18n); // 300 HSK
  }
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(`${DATA_DIR}/deploy.json`, JSON.stringify({ mode: MODE, vault, block: Number(rc.blockNumber), owner, agent: agent.address, deployer: deployer.address, tx: hash }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
