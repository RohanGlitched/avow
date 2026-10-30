# Verify Avow yourself

Everything Avow claims can be checked against HSK Chain with [Foundry's `cast`](https://getfoundry.sh) and a public RPC.
Nothing here needs our servers.

```bash
export RPC=https://mainnet.hsk.xyz
export VAULT=<the vault address on avow.world/how>
```

## The mandate the agent is held to

```bash
cast call $VAULT "mandate()((uint16,uint16,uint16,uint16,uint16,uint32,uint32,uint64,uint64,uint64,uint8,bool))" --rpc-url $RPC
# maxSlippageBps, maxSpotDevBps, maxStopBps, minRewardRiskX100, maxDrawdownBps, cooldown, maxHorizon,
# maxNotional, maxExposure, dailyLossLimit (USDT, 6 decimals), assetMask (1 ETH, 2 BTC, 4 HSK), paused
cast call $VAULT "owner()(address)" --rpc-url $RPC
cast call $VAULT "agent()(address)" --rpc-url $RPC
```

## The record, the grade and the denomination

```bash
cast call $VAULT "ledger()((uint32,uint32,uint32,uint32,uint32,uint8,uint8,uint8,uint64,int64))" --rpc-url $RPC
# graded, honoured, voided, lapsed, retracted, voidStreak, windowCount, windowHead, windowSqErrSum (1e8), realisedPnl (USDT 6 dec)
cast call $VAULT "brier()(uint256)" --rpc-url $RPC        # ×1e8; 25000000 = 0.25, a coin flip
cast call $VAULT "tier()(uint8)" --rpc-url $RPC           # 0 Probation · 1 Apprentice · 2 Journeyman · 3 Fiduciary
cast call $VAULT "denomination()(uint256)" --rpc-url $RPC # largest note allowed now, USDT 6 dec
```

## A note: what was sworn, and whether it can be settled

```bash
cast call $VAULT "noteCount()(uint256)" --rpc-url $RPC
cast call $VAULT "getNote(uint256)((uint8,uint8,uint8,uint8,uint16,uint40,uint40,uint40,uint96,uint96,uint96,uint96,uint64,int64,uint128,uint128,bytes32))" 0 --rpc-url $RPC
cast call $VAULT "settleable(uint256)(bool,uint8)" 0 --rpc-url $RPC
# The statement text is in the NoteSworn event of the note's opening transaction:
cast logs --address $VAULT "NoteSworn(uint256 indexed,uint8 indexed,uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8,bytes32,string)" --from-block <deploy block> --to-block +4999 --rpc-url $RPC
# and its hash is stored on the note: cast keccak "<statement text>" must equal the note's statementHash.
```

## Settle a note yourself (the stop-loss nobody has to trust the agent to run)

```bash
cast send $VAULT "settle(uint256)" <id> --rpc-url $RPC --private-key <any funded key>
```
It reverts with `NotSettleable` unless the 5-minute TWAP **and** the live HSKSwap price are past the note's target or void level, or the
note has expired.

## The prices the vault sees

```bash
cast call $VAULT "twapPx(uint8)(uint256)" 0 --rpc-url $RPC   # ETH, USDT per ETH ×1e8, 5-minute TWAP of the HSKSwap pool
cast call $VAULT "spotPx(uint8)(uint256)" 0 --rpc-url $RPC   # the live pool price
```

## Rebuild and re-run the tests

```bash
git clone https://github.com/RohanGlitched/avow && cd avow/contracts
git clone --depth 1 -b 0.8 https://github.com/Uniswap/v3-core lib/v3-core
forge install foundry-rs/forge-std --no-git
forge test        # 27+ tests on a fork of HSK Chain mainnet
```

## Why Chainlink is not read on chain

Every Chainlink proxy on HSK Chain is read-whitelisted: its access controller lets an externally owned account read (`tx.origin ==
msg.sender`), and refuses any contract with `No access`. Reproduce it from a contract on a fork:

```bash
cd contracts && forge test --match-test test_chainlinkIsWhitelistedForContracts -vv
```

So the agent reads Chainlink off chain as a seatbelt (it refuses to swear when the pool is more than 3% from Chainlink, or the feed is older
than 26 hours), and the vault relies only on HSKSwap's own TWAP.
