# Mainnet launch runbook (HSK Chain, chain 177)

Every step was rehearsed on a fork of mainnet on the VM. Gas for the pool upgrades was measured against mainnet itself with
`eth_estimateGas` on Oct 31 (research/est.mjs); everything else was measured on the fork. Mainnet gas price: 500 gwei; HSK ≈ $0.087.

## What actually happened (Oct 31, 2026)

- **Funding:** 28 + 1.50 USDC on Solana became 300.14 HSK and 0.00435 ETH on Ethereum through Relay (relay.link) in seconds, sent to the
  setup key; `agent/src/l1deposit.ts` then moved the HSK through HSK Chain's own OptimismPortal (`0xe7Aa…8bD3`,
  `depositERC20Transaction`, the call Superbridge makes) and it arrived as native HSK about 75 s later.
- **Launch:** `launch-mainnet.sh go` deployed the three vaults, upgraded the three pools to 240 observations, deployed the league registry
  and the ERC-8004 registries, registered agents #1–3 and funded the vaults. The public RPC is load-balanced, so reads right after a
  receipt can be a block behind; the scripts now wait for code and retry before broadcasting.
- **Balances after funding** (the funding run read a stale balance once, so the split is uneven): Avow 3 USDT + 12 WHSK (≈ $4.05),
  Bold ≈ $10.36, Fade ≈ $6.68. Agent gas: Avow 2, Bold 4.7, Fade 4.7 HSK. Outside keeper 0x1a71…850B: 3 HSK. Setup key reserve ≈ 33 HSK.
- **AvowGrader v2** (0x6a5c…c6aa) replaced the first grader (0x3C39…313F, retired before it posted anything): see SECURITY.md.
- **Ownership** of the three vaults and ERC-8004 agents #1–3 moved to the team wallet 0x2c9c…bF15.

## The plan as written: one transfer of about 290 HSK (≈ $25)

Send **≈ 290 HSK** on HSK Chain to the setup address **`0xCfDDe8CF26062229e1Bc12294c1029E531a7ac9A`** (a fresh key made for this launch
on the VM; backed up locally; never printed). HSK reaches HSK Chain by withdrawing from HashKey Global or Gate on the "HSK Chain" network.

The launch is three small vaults, one per league agent, each with a $5 cap (Probation notes are $1), $5 open exposure and a $2 daily loss
limit. Agent keys: Avow `0xCa3b5788a5296429CCc2729dBB1bB0d523e992Fd`, Bold `0x9145AcF83F1ff539dA1dDF0D50c791C302AfE890`, Fade
`0xD19CE1b12B3caD9E5a19455d1D368F52aCD2A761`.

| Item | HSK | ≈ USD |
|---|---|---|
| Three vault deployments (5.80M gas each at 500 gwei) | 8.7 | 0.76 |
| HSKSwap pools to 240 observation slots, once (15.49M gas, measured with `eth_estimateGas`; WBTC keeps only 1 today, so it has no TWAP without this) | 7.7 | 0.67 |
| AvowLeague registry and three entries (1.15M gas) | 0.6 | 0.05 |
| ERC-8004 Identity and Reputation registries, AvowGrader, three agents registered with on-chain registration files and linked (≈ 6.7M gas, measured on the fork) | 3.4 | 0.30 |
| Posting each settled note's grade to ERC-8004 (≈ 0.15M gas a note, paid by the agent) | in agent gas | |
| Funding swaps and deposits (≈ 1.3M gas per vault) | 2.0 | 0.17 |
| Capital per vault: $3 USDT + ≈ $1.20 each of WETH, WBTC, WHSK (stays yours; withdrawable by the owner) | 3 × 77 = 231 | 20.1 |
| Agent gas: Avow 2, Bold 5, Fade 5 (a note plus its settlement ≈ 0.46 HSK) | 12 | 1.04 |
| Margin | ≈ 25 | 2.2 |
| **Total** | **≈ 290** | **≈ 25** |

Why it barely trades at this size: a note and its settlement cost ≈ $0.04 of gas, 4% of a $1 note on top of the 0.6% pool fees. Avow's
rules count that cost, so it will mostly pass; the rule baselines (Bold, Fade) aim past it and trade, which gives the full mainnet loop:
a note sworn, then settled by a wallet that is neither the agent nor the owner. Raising the cap later (owner `amend`) makes notes cheaper
per dollar.

## What the script does (every swap bounded by the pool TWAP; nothing else touches the funds)

On the VM: `bash ~/dictum/launch-mainnet.sh check` (balances and plan, no transactions), then `bash ~/dictum/launch-mainnet.sh go`.
Each step is skipped when already done, so a re-run resumes after a failure (agent/scripts/launch-mainnet.sh).

1. Deploy the three AvowVaults (owner = the setup key until step 6) and raise the three pools' observation buffers to 240.
2. Deploy the AvowLeague registry and enter the three vaults as Avow, Bold and Fade; deploy the ERC-8004 registries and AvowGrader,
   register each agent (ERC-721 agent with a registration file) and link its vault, so every settled note's grade becomes ERC-8004 feedback.
3. Fund each vault (wrap HSK, swap to USDT, buy a little WETH and WBTC, deposit) and give each agent its gas.
4. Start the three agents as systemd services; the flagship (port 8788) serves the league table; point Vercel's `AVOW_AGENT_URL` at it.
5. Verify the sources on Blockscout: `forge verify-contract <address> src/AvowVault.sol:AvowVault --chain-id 177 --verifier blockscout
   --verifier-url https://hsk.blockscout.com/api/ --compiler-version 0.8.26 --num-of-optimizations 1 --via-ir --evm-version paris
   --constructor-args <abi-encoded>` (and the same for `src/AvowLeague.sol:AvowLeague`, no constructor arguments).
6. Hand each vault to the owner's own wallet: `DICTUM_OWNER_KEY_FILE=.keys/setup.key DICTUM_VAULT=<vault> node ../bin/owner.js transfer <wallet>`
   (≈ 30k gas each). League entries stay; renaming or leaving then needs the new owner.
7. Prove the permissionless stop: settle one note from a wallet that is neither agent nor owner (`cast send <vault> "settle(uint256)" <id>`).

Model: Gemini 3.5 Flash on Vertex AI, ≈ $0.002 per decision (Avow only; Bold and Fade use no model).

## Powers

Owner (your wallet after step 6): `amend` (any mandate change), `withdraw` (anything not locked in an open note; short proceeds keep a 20%
buy-back reserve), `revoke` (close any note without trading; it is still graded as a miss and marked at the TWAP), `unfreeze`, `setAgent`,
`transferOwnership`. The agent's key can only: swear notes inside the mandate, settle, retract (graded as a miss), move its own stops toward
the entry, and tighten its own mandate.

Tokens: USDT `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 dec), WETH `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0`,
WBTC `0x6119CA49a79f5825C8B345F8d7aC36B272565b14`, WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1`.
