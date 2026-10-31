// Deploys the ERC-8004 Identity and Reputation registries and AvowGrader on HSK Chain (unless DICTUM_ERC8004_GRADER is set),
// registers each league agent with an ERC-8004 registration file, and links its vault to the agent so every settled note's
// grade can be posted. Signed by the vaults' owner.
//   node dist/erc8004-setup.js 0xVault:Avow:avow 0xVault:Bold:bold …
import { readFileSync } from "node:fs";
import { createWalletClient, decodeEventLog, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERC8004_GRADER, MODE, RPC, hsk } from "./config.js";
import { graderAbi, graderBytecode, identityAbi, identityBytecode, reputationAbi, reputationBytecode } from "./erc8004Contract.js";
import { chain } from "./market.js";
import { PERSONAS, type PersonaId } from "./personas.js";

const SITE = process.env.AVOW_SITE ?? "https://avow-world.vercel.app";
const owner = privateKeyToAccount(readFileSync(process.env.DICTUM_OWNER_KEY_FILE ?? "./.keys/deployer.key", "utf8").trim() as Hex);
const w = createWalletClient({ account: owner, chain: hsk, transport: http(RPC) });

/** The public RPC is load-balanced: a node may not see a contract for a few seconds after its receipt. */
async function codeAt(address: Address) {
  for (let i = 0; i < 30; i++) {
    if (((await chain.getCode({ address }).catch(() => undefined)) ?? "0x") !== "0x") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`no code at ${address} after 60 s`);
}

async function wait(hash: Hex, what: string) {
  const rc = await chain.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (rc.status !== "success") throw new Error(`${what} reverted ${hash}`);
  console.log(what, "gas", rc.gasUsed);
  return rc;
}

async function deploy(abi: readonly unknown[], bytecode: string, args: unknown[], what: string) {
  const hash = await w.deployContract({ abi: abi as never, bytecode: bytecode as Hex, args: args as never });
  const rc = await wait(hash, `deploy ${what}`);
  await codeAt(rc.contractAddress! as Address);
  return rc.contractAddress! as Address;
}

function registration(p: PersonaId, agentId: number, identity: Address, vault: Address) {
  const persona = PERSONAS[p];
  const file = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: `${persona.name} (Avow league)`,
    description: `${persona.strategy} Trades on HSKSwap only through its Avow vault ${vault} on HSK Chain, swearing every trade as a falsifiable note first. Reputation: AvowGrader posts each settled note's calibration grade (100 − 100·(stated odds − outcome)², tag avow-calibration).`,
    image: `${SITE}/icon.svg`,
    services: [
      { name: "web", endpoint: `${SITE}/league` },
      ...(p === "avow" ? [{ name: "MCP", endpoint: `${SITE}/api/mcp`, version: "2025-06-18" }] : []),
    ],
    x402Support: false,
    active: true,
    registrations: [{ agentId, agentRegistry: `eip155:177:${identity}` }],
    supportedTrust: ["reputation"],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`;
}

async function main() {
  console.log("mode", MODE, "owner", owner.address);
  let grader = ERC8004_GRADER;
  let identity: Address;
  if (!grader) {
    identity = await deploy(identityAbi, identityBytecode, [], "IdentityRegistry");
    const reputation = await deploy(reputationAbi, reputationBytecode, [identity], "ReputationRegistry");
    grader = await deploy(graderAbi, graderBytecode, [identity, reputation], "AvowGrader");
    console.log("identity", identity, "reputation", reputation);
  } else {
    identity = (await chain.readContract({ address: grader, abi: graderAbi, functionName: "identity" })) as Address;
  }
  for (const arg of process.argv.slice(2)) {
    const [vault, , persona, existing] = arg.split(":") as [Address, string, PersonaId, string | undefined];
    const linked = await chain.readContract({ address: grader, abi: graderAbi, functionName: "agentOf", args: [vault] }).then(Number, () => null);
    if (linked !== null) {
      console.log("already linked", vault, "agent", linked);
      continue;
    }
    let agentId: number;
    if (existing) agentId = Number(existing); // registered earlier (e.g. a run cut short): reuse it
    else {
      const rc = await wait(await w.writeContract({ address: identity, abi: identityAbi, functionName: "register", args: [] }), `register ${persona}`);
      const ev = rc.logs.map((l) => { try { return decodeEventLog({ abi: identityAbi, data: l.data, topics: l.topics }); } catch { return null; } }).find((e) => e?.eventName === "Registered");
      agentId = Number((ev?.args as { agentId: bigint }).agentId);
    }
    // the load-balanced RPC may not see the new agent for a few seconds
    for (let i = 0; i < 30; i++) {
      const o = await chain.readContract({ address: identity, abi: identityAbi, functionName: "ownerOf", args: [BigInt(agentId)] }).catch(() => null);
      if (o) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await wait(await w.writeContract({ address: identity, abi: identityAbi, functionName: "setAgentURI", args: [BigInt(agentId), registration(persona, agentId, identity, vault)] }), `registration file ${persona}`);
    await wait(await w.writeContract({ address: grader, abi: graderAbi, functionName: "link", args: [vault, BigInt(agentId)] }), `link ${persona} vault → agent ${agentId}`);
  }
  console.log("DICTUM_ERC8004_GRADER=" + grader);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
