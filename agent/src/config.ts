import { defineChain, type Address } from "viem";

export type Mode = "mainnet" | "fork-rehearsal" | "testnet";
export const MODE = (process.env.DICTUM_MODE ?? "fork-rehearsal") as Mode;

/** The chain the vault lives on. In rehearsal this is an anvil fork of HSK mainnet on the same machine. */
/** Comma-separated: the first is used for sends, all of them (in order) as a fallback for reads. */
export const RPCS = (process.env.DICTUM_RPC ?? (MODE === "fork-rehearsal" ? "http://127.0.0.1:8545" : "https://mainnet.hsk.xyz")).split(",").map((x) => x.trim()).filter(Boolean);
export const RPC = RPCS[0];
/** Always the real mainnet: Chainlink seatbelt and the live HSKSwap reference read from here. */
export const MAINNET_RPCS = (process.env.DICTUM_MAINNET_RPC ?? "https://mainnet.hsk.xyz,https://hashkey.drpc.org").split(",").map((x) => x.trim()).filter(Boolean);
export const MAINNET_RPC = MAINNET_RPCS[0];

export const hsk = defineChain({
  id: 177,
  name: "HSK Chain",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://hsk.blockscout.com" } },
});
export const hskMainnet = defineChain({ ...hsk, rpcUrls: { default: { http: [MAINNET_RPC] } } });

export const VAULT = (process.env.DICTUM_VAULT ?? "") as Address;
export const DEPLOY_BLOCK = BigInt(process.env.DICTUM_DEPLOY_BLOCK ?? "0");
export const AGENT_KEY_FILE = process.env.DICTUM_AGENT_KEY_FILE ?? "./.keys/agent.key";
export const DATA_DIR = process.env.DICTUM_DATA_DIR ?? "./data";
export const PORT = Number(process.env.PORT ?? 8787);
export const DESK_SECRET = process.env.DICTUM_DESK_SECRET ?? "";
export const GCP_PROJECT = process.env.GCP_PROJECT ?? "project-5523359e-5941-4df4-998";

export const USDT: Address = "0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029";
export const ROUTER: Address = "0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3";
export const FEED_USDT: Address = "0x823d7f90f7A3498DB6595886b6B5dC95E6B0B7f3";

export type Sym = "WETH" | "WBTC" | "WHSK";
export interface AssetCfg {
  id: number;
  sym: Sym;
  label: string; // what people call it
  token: Address;
  pool: Address;
  decimals: number;
  feed: Address; // Chainlink X/USD on HSK mainnet (read-whitelisted for contracts; EOAs can read)
  hashkey: string; // HashKey Global symbol
  gate: string; // Gate.io pair
  pricePlaces: number; // decimals to print a price with
}

export const ASSETS: AssetCfg[] = [
  { id: 0, sym: "WETH", label: "ETH", token: "0xefd4bC9afD210517803f293ABABd701CaeeCdfd0", pool: "0xb92b79ed6b370D5cFee2E14B1D0983C258304C16", decimals: 18, feed: "0xbB091f3b515059b7A887eDcC73dC2a2Fa65E0242", hashkey: "ETHUSDT", gate: "ETH_USDT", pricePlaces: 2 },
  { id: 1, sym: "WBTC", label: "BTC", token: "0x6119CA49a79f5825C8B345F8d7aC36B272565b14", pool: "0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A", decimals: 8, feed: "0x204ED500ab56A2E19B051561258E3A45c850360F", hashkey: "BTCUSDT", gate: "BTC_USDT", pricePlaces: 0 },
  { id: 2, sym: "WHSK", label: "HSK", token: "0xB210D2120d57b758EE163cFfb43e73728c471Cf1", pool: "0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC", decimals: 18, feed: "0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b", hashkey: "HSKUSDT", gate: "HSK_USDT", pricePlaces: 5 },
];

export const POOL_FEE_BPS = 30;
/** Off-chain seatbelt: refuse to swear when the pool and Chainlink disagree by more than this, or Chainlink is older than this. */
export const CHAINLINK_MAX_DEV_BPS = 300;
export const CHAINLINK_MAX_AGE_S = 26 * 3600;

export const LOOP_MS = Number(process.env.DICTUM_LOOP_MS ?? 30_000);
export const THINK_EVERY_MS = Number(process.env.DICTUM_THINK_MS ?? 5 * 60_000);
export const MODELS = (process.env.DICTUM_MODELS ?? "gemini-3.5-flash,gemini-3.5-flash-lite").split(",");

/** League peers the flagship agent reports alongside its own record: "url,url" of other agents' /state endpoints. */
export const LEAGUE_PEERS = (process.env.DICTUM_LEAGUE ?? "").split(",").map((x) => x.trim()).filter(Boolean);
/** Only one process per fork may keep the fork's pools mirrored to mainnet. */
export const MIRROR = process.env.DICTUM_MIRROR !== "0";
/** The on-chain league registry, when deployed. */
export const LEAGUE_REGISTRY = (process.env.DICTUM_LEAGUE_REGISTRY ?? "") as Address;
/** AvowGrader: posts each settled note's grade as ERC-8004 reputation feedback, when deployed. */
export const ERC8004_GRADER = (process.env.DICTUM_ERC8004_GRADER ?? "") as Address;
