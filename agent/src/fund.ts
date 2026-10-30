// Turns native HSK held by the setup key into a funded vault: gas for the deployer and the agent, then WHSK → USDT, a little WETH
// and WBTC, all deposited into the vault. One transfer of HSK from the owner is all it needs. Every swap is bounded by the pool TWAP.
import { readFileSync } from "node:fs";
import { createWalletClient, http, parseAbi, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ASSETS, ROUTER, RPC, USDT, VAULT, hsk } from "./config.js";
import { vaultAbi } from "./abi.js";
import { chain } from "./market.js";

const setup = privateKeyToAccount(readFileSync(process.env.DICTUM_SETUP_KEY_FILE ?? "./.keys/deployer.key", "utf8").trim() as Hex);
const agentAddr = process.env.DICTUM_AGENT_ADDRESS as Address;
const w = createWalletClient({ account: setup, chain: hsk, transport: http(RPC) });
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function deposit() payable"]);
const router = parseAbi([
  "struct I { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "struct O { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(I) payable returns (uint256)",
  "function exactOutputSingle(O) payable returns (uint256)",
]);
const n = (k: string, d: number) => Number(process.env[k] ?? d);
const USDT_TARGET = n("DICTUM_FUND_USDT", 40);
const ETH_USD = n("DICTUM_FUND_ETH_USD", 8);
const BTC_USD = n("DICTUM_FUND_BTC_USD", 8);
const HSK_USD = n("DICTUM_FUND_HSK_USD", 8);
const AGENT_GAS = n("DICTUM_AGENT_GAS_HSK", 3);
const KEEP_GAS = n("DICTUM_KEEP_GAS_HSK", 2);

async function tx(p: Promise<Hex>, what: string) {
  const h = await p;
  const r = await chain.waitForTransactionReceipt({ hash: h, timeout: 180_000 });
  if (r.status !== "success") throw new Error(`${what} reverted ${h}`);
  console.log(what, h, "gas", r.gasUsed);
}

async function main() {
  const WHSK = ASSETS[2].token;
  const px = async (id: number) => Number(await chain.readContract({ address: VAULT, abi: vaultAbi, functionName: "twapPx", args: [id] })) / 1e8;
  const [ethPx, btcPx, hskPx] = [await px(0), await px(1), await px(2)];
  const needHsk = (USDT_TARGET + ETH_USD + BTC_USD) / hskPx * 1.02 + HSK_USD / hskPx;
  const bal = Number(await chain.getBalance({ address: setup.address })) / 1e18;
  const agentBal = Number(await chain.getBalance({ address: agentAddr })) / 1e18;
  console.log({ setup: setup.address, hsk: bal, needHsk: Math.ceil(needHsk + AGENT_GAS + KEEP_GAS), prices: { ethPx, btcPx, hskPx } });
  if (bal < needHsk + KEEP_GAS + Math.max(0, AGENT_GAS - agentBal)) throw new Error(`setup key holds ${bal.toFixed(2)} HSK; needs ${(needHsk + KEEP_GAS + AGENT_GAS).toFixed(0)}`);

  if (agentBal < AGENT_GAS) await tx(w.sendTransaction({ to: agentAddr, value: parseEther((AGENT_GAS - agentBal).toFixed(6)) }), "gas → agent");
  await tx(w.writeContract({ address: WHSK, abi: erc20, functionName: "deposit", value: parseEther(needHsk.toFixed(6)) }), "wrap HSK");
  for (const t of [WHSK, USDT] as Address[]) await tx(w.writeContract({ address: t, abi: erc20, functionName: "approve", args: [ROUTER, 2n ** 255n] }), "approve router");

  // WHSK → exactly the USDT we need (USDT target + what the WETH and WBTC buys will spend)
  const usdtOut = BigInt(Math.round((USDT_TARGET + ETH_USD + BTC_USD) * 1e6));
  const maxIn = parseEther((((USDT_TARGET + ETH_USD + BTC_USD) / hskPx) * 1.015).toFixed(6));
  await tx(w.writeContract({ address: ROUTER, abi: router, functionName: "exactOutputSingle", args: [{ tokenIn: WHSK, tokenOut: USDT, fee: 3000, recipient: setup.address, amountOut: usdtOut, amountInMaximum: maxIn, sqrtPriceLimitX96: 0n }] }), "WHSK → USDT");
  const buy = async (id: number, usd: number, assetPx: number) => {
    const a = ASSETS[id];
    const minOut = BigInt(Math.floor((usd / assetPx) * 0.985 * 10 ** a.decimals));
    await tx(w.writeContract({ address: ROUTER, abi: router, functionName: "exactInputSingle", args: [{ tokenIn: USDT, tokenOut: a.token, fee: 3000, recipient: setup.address, amountIn: BigInt(Math.round(usd * 1e6)), amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }), `USDT → ${a.label}`);
  };
  if (ETH_USD > 0) await buy(0, ETH_USD, ethPx);
  if (BTC_USD > 0) await buy(1, BTC_USD, btcPx);

  for (const t of [USDT, ASSETS[0].token, ASSETS[1].token, WHSK] as Address[]) {
    const b = await chain.readContract({ address: t, abi: erc20, functionName: "balanceOf", args: [setup.address] });
    if (b === 0n) continue;
    await tx(w.writeContract({ address: t, abi: erc20, functionName: "approve", args: [VAULT, b] }), "approve vault");
    await tx(w.writeContract({ address: VAULT, abi: vaultAbi, functionName: "deposit", args: [t, b] }), `deposit ${t}`);
  }
  const nav = await chain.readContract({ address: VAULT, abi: vaultAbi, functionName: "nav" });
  console.log("vault NAV $", Number(nav) / 1e6);
}
main().catch((e) => { console.error(e); process.exit(1); });
