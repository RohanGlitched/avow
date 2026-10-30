# Mainnet launch runbook (HSK Chain, chain 177)

Every step was rehearsed on a fork of mainnet on the VM. Gas for the pool upgrades was measured against mainnet itself with
`eth_estimateGas` on Oct 31 (research/est.mjs); everything else was measured on the fork. Mainnet gas price: 500 gwei; HSK ≈ $0.087.

## What the owner does: one transfer

Send **HSK** on HSK Chain to the setup address **`0xCfDDe8CF26062229e1Bc12294c1029E531a7ac9A`** (a fresh key made for this launch on
the VM; backed up locally; never printed). The agent's key is `0xCa3b5788a5296429CCc2729dBB1bB0d523e992Fd`.

| Option | HSK to send | Becomes in the vault | Gas reserve |
|---|---|---|---|
| Lean | **≈ 950 HSK** (≈ $83) | 60 USDT + ≈ $7 each of WETH, WBTC, WHSK | 20 HSK |
| Recommended | **≈ 1,900 HSK** (≈ $165) | 100 USDT + ≈ $20 each of WETH, WBTC, WHSK | 20 HSK |

Why notes need size: a note and its settlement cost ≈ 0.92M gas ≈ 0.46 HSK ≈ $0.04. On a $10 note that is 0.4% on top of the 0.6% pool
fees; on a $50 note it is 0.08%. The mandate's cap is $250, so the agent starts at Probation with $50 notes (20% of the cap) and the
contract refuses any note that cannot pay its round trip at the agent's own odds. Short notes sell inventory, so they are sized to the
WETH/WBTC/WHSK the vault holds.

HSK reaches HSK Chain by withdrawing from HashKey Global or Gate on the "HSK Chain" network.

## What the scripts do (every swap bounded by the pool TWAP; nothing else touches the funds)

| Step | Command (on the VM, in ~/dictum/mainnet) | Gas | HSK |
|---|---|---|---|
| 1. Deploy AvowVault (owner = the setup key until step 6) | `DICTUM_MODE=mainnet DICTUM_RPC=https://mainnet.hsk.xyz DICTUM_DEPLOYER_KEY_FILE=.keys/setup.key DICTUM_AGENT_KEY_FILE=.keys/agent.key DICTUM_DATA_DIR=./data node ../bin/deploy.js` (then copy research/study.json and replay.json into ./data` | 5.80M | 2.90 |
| 2. Raise the observation buffer of the three HSKSwap pools to 240 (a 5-minute TWAP that a flood of tiny swaps cannot shorten; a public good for HSKSwap) | inside deploy.js | WETH 5.05M, WBTC 5.39M, WHSK 5.05M = 15.49M | 7.74 |
| 3. Verify the source on Blockscout | `forge verify-contract <vault> src/AvowVault.sol:AvowVault --chain-id 177 --verifier blockscout --verifier-url https://hsk.blockscout.com/api/ --compiler-version 0.8.26 --num-of-optimizations 1 --via-ir --evm-version paris --constructor-args <abi-encoded>` | — | — |
| 4. Gas to the agent (3 HSK), wrap HSK, swap WHSK → USDT, buy a little WETH and WBTC, deposit everything into the vault | `DICTUM_SETUP_KEY_FILE=.keys/setup.key DICTUM_AGENT_ADDRESS=0xCa3b…92Fd DICTUM_VAULT=<vault> DICTUM_FUND_USDT=60 DICTUM_FUND_ETH_USD=7 DICTUM_FUND_BTC_USD=7 DICTUM_FUND_HSK_USD=7 node ../bin/fund.js` | ≈ 1.1M | 0.55 |
| 5. Start the agent: fill the template `avow-mainnet.service.template` (vault, deploy block), `systemctl enable --now avow-mainnet`, point Vercel's AVOW_AGENT_URL at port 8788 | — | — | — |
| 6. Hand the vault to the owner's own wallet | `DICTUM_OWNER_KEY_FILE=.keys/setup.key DICTUM_VAULT=<vault> node ../bin/owner.js transfer <your wallet>` | ≈ 30k | 0.02 |
| 7. Prove the permissionless stop: settle one note from a wallet that is neither agent nor owner | `cast send <vault> "settle(uint256)" <id>` | ≈ 0.38M | 0.19 |

Total gas ≈ 11.2 HSK for the launch plus 3 HSK for the agent's first notes (≈ 0.27 HSK per note, ≈ 0.19 per settlement); the 20 HSK
reserve covers about 30 notes. Model: Gemini 3.5 Flash on Vertex AI, ≈ $0.002 per decision.

## Powers

Owner (your wallet after step 6): `amend` (any mandate change), `withdraw` (anything not locked in an open note; short proceeds keep a 20%
buy-back reserve), `revoke` (close any note without trading; it is still graded as a miss and marked at the TWAP), `unfreeze`, `setAgent`,
`transferOwnership`. The agent's key can only: swear notes inside the mandate, settle, retract (graded as a miss), move its own stops toward
the entry, and tighten its own mandate.

Tokens: USDT `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 dec), WETH `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0`,
WBTC `0x6119CA49a79f5825C8B345F8d7aC36B272565b14`, WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1`.
