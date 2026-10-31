// Moves HSK held on Ethereum (the HSK ERC-20) to native HSK on HSK Chain through the chain's own OptimismPortal, the same call
// Superbridge makes: approve the portal, then depositERC20Transaction(to, mint, value, gasLimit, false, ""). Signed by the setup key.
//   node dist/l1deposit.js check   # balances only
//   node dist/l1deposit.js go      # approve + deposit the whole HSK balance to the same address on HSK Chain
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ETH_RPC = process.env.ETH_RPC ?? "https://ethereum-rpc.publicnode.com";
const PORTAL = "0xe7Aa79B59CAc06F9706D896a047fEb9d3BDA8bD3"; // read on chain: L2CrossDomainMessenger.otherMessenger().portal()
const HSK_L1 = "0xE7C6BF469e97eEB0bFB74C8dbFF5BD47D4C1C98a";
const ethereum = defineChain({ id: Number(process.env.ETH_CHAIN_ID ?? 1), name: "Ethereum", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [ETH_RPC] } } });

const setup = privateKeyToAccount(readFileSync(process.env.DICTUM_SETUP_KEY_FILE ?? "./.keys/setup.key", "utf8").trim() as Hex);
const l1 = createPublicClient({ chain: ethereum, transport: http(ETH_RPC) });
const l2 = createPublicClient({ transport: http("https://mainnet.hsk.xyz") });
const w = createWalletClient({ account: setup, chain: ethereum, transport: http(ETH_RPC) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const portal = parseAbi(["function depositERC20Transaction(address _to, uint256 _mint, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data)", "function paused() view returns (bool)"]);

async function main() {
  const [eth, hsk, l2hsk, paused] = await Promise.all([
    l1.getBalance({ address: setup.address }),
    l1.readContract({ address: HSK_L1, abi: erc20, functionName: "balanceOf", args: [setup.address] }),
    l2.getBalance({ address: setup.address }).catch(() => 0n),
    l1.readContract({ address: PORTAL, abi: portal, functionName: "paused" }),
  ]);
  console.log({ address: setup.address, ethOnEthereum: Number(eth) / 1e18, hskOnEthereum: Number(hsk) / 1e18, hskOnHskChain: Number(l2hsk) / 1e18, portalPaused: paused, gasGwei: Number(await l1.getGasPrice()) / 1e9 });
  if (process.argv[2] !== "go") return;
  if (paused) throw new Error("the portal is paused");
  if (hsk === 0n) throw new Error("no HSK on Ethereum yet");
  const allowance = await l1.readContract({ address: HSK_L1, abi: erc20, functionName: "allowance", args: [setup.address, PORTAL] });
  if (allowance < hsk) {
    const h = await w.writeContract({ address: HSK_L1, abi: erc20, functionName: "approve", args: [PORTAL, hsk] });
    const r = await l1.waitForTransactionReceipt({ hash: h });
    console.log("approve", h, r.status, "gas", r.gasUsed);
  }
  const h = await w.writeContract({ address: PORTAL, abi: portal, functionName: "depositERC20Transaction", args: [setup.address, hsk, hsk, 100_000n, false, "0x"] });
  const r = await l1.waitForTransactionReceipt({ hash: h });
  console.log("deposit", h, r.status, "gas", r.gasUsed, `${Number(hsk) / 1e18} HSK → native HSK on HSK Chain at ${setup.address} (arrives a few minutes after the Ethereum block)`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
