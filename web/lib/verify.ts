// Commands that reproduce each public claim. $VAULT and $DEPLOY_BLOCK are placeholders
// until the vault is on mainnet. TODO(lead): match the function names in AvowVault.sol.
import { POOLS } from "./chain";

const RPC = "https://mainnet.hsk.xyz";

export interface VerifyCmd {
  q: string;
  why: string;
  cmd: string;
}

export function verifyCommands(sample: { id: number; statement: string } | null): VerifyCmd[] {
  const id = sample?.id ?? 1;
  return [
    {
      q: "Read a note exactly as the vault stores it",
      why: "Entry, target, void, expiry, confidence and status",
      cmd: `export RPC=${RPC}\ncast call $VAULT "notes(uint256)" ${id} --rpc-url $RPC`,
    },
    {
      q: "Recompute the statement hash that seeds the rosette",
      why: "The hash must match the note; the rosette is drawn from its 32 bytes",
      cmd: `cast keccak "${sample?.statement ?? "Avow swears that …"}"`,
    },
    {
      q: "Find every sworn statement in full",
      why: "The text is emitted in the NoteSworn event",
      cmd: `cast logs --address $VAULT --from-block $DEPLOY_BLOCK --rpc-url $RPC`,
    },
    {
      q: "Check the mandate the agent is held to",
      why: "Every clause on the mandate page",
      cmd: `cast call $VAULT "mandate()" --rpc-url $RPC`,
    },
    {
      q: "Check the denomination and the record",
      why: "Tier, graded count and rolling Brier",
      cmd: `cast call $VAULT "denomination()(uint256)" --rpc-url $RPC\ncast call $VAULT "record()" --rpc-url $RPC`,
    },
    {
      q: "Read the HSKSwap price a note settles on",
      why: "The 5-minute TWAP from the pool's own oracle (ETH pool shown)",
      cmd: `cast call ${POOLS.WETH.address} "observe(uint32[])(int56[],uint160[])" "[300,0]" --rpc-url $RPC\ncast call ${POOLS.WETH.address} "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" --rpc-url $RPC`,
    },
    {
      q: "Settle a note yourself",
      why: "Anyone may; it only succeeds if a level is crossed or the note expired",
      cmd: `cast send $VAULT "settle(uint256)" ${id} --rpc-url $RPC --private-key $YOUR_KEY`,
    },
  ];
}
