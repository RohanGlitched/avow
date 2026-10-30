# Mainnet launch runbook (HSK Chain, chain 177)

Every step below was rehearsed on a fork of mainnet on the VM (vault `0x0f91…6b05`, deploy, pool prep and funding scripts).
Gas measured on the fork at mainnet's 500 gwei.

## What the owner does: one transfer

Send **HSK** on HSK Chain to the setup address **`0xCfDDe8CF26062229e1Bc12294c1029E531a7ac9A`** (a fresh key made for this launch on the VM; backed up locally, never printed). The agent key is `0xCa3b5788a5296429CCc2729dBB1bB0d523e992Fd`.

| Budget | HSK to send | Becomes |
|---|---|---|
| Small (recommended) | **≈ 590 HSK** (≈ $51) | 30 USDT + $5 WETH + $5 WBTC + $5 WHSK in the vault, ~8 HSK of gas |
| Rehearsed size | ≈ 770 HSK (≈ $67) | 40 USDT + $8 each of WETH, WBTC, WHSK, ~11 HSK of gas |

HSK reaches HSK Chain by withdrawing from HashKey Global or Gate on the "HSK Chain" network.

## What the scripts do (all bounded by the pool TWAP, nothing else touches the funds)

| Step | Script | Gas |
|---|---|---|
| 1. Deploy the vault (owner = the setup key, later moved to your wallet with `transferOwnership`) | `bin/deploy.js` (DICTUM_MODE=mainnet) | 5.52M gas ≈ 2.8 HSK |
| 2. Raise the observation buffer of the three HSKSwap pools to 64 (needed for a 5-minute TWAP; a public good for HSKSwap) | inside deploy.js | 3.62M gas ≈ 1.8 HSK |
| 3. Gas to the agent key (3 HSK), wrap HSK, swap WHSK → USDT on HSKSwap, buy a little WETH and WBTC, deposit all into the vault | `bin/fund.js` | ≈ 1.1M gas ≈ 0.55 HSK |
| 4. Start `dictum-mainnet` (agent + keeper) and point the site at it | systemd | — |
| 5. `transferOwnership(<your wallet>)` so `amend`, `withdraw`, `revoke`, `unfreeze` are yours | cast / site | 30k gas |

Running cost after launch: a note ≈ 0.54M gas ≈ 0.27 HSK ($0.02); a settlement ≈ 0.38M gas ≈ 0.19 HSK. Model: Gemini 3.5 Flash on Vertex,
about $0.001 per decision.

## Powers

Owner (your wallet after step 5): `amend` (any mandate change), `withdraw` (anything not locked in an outstanding note), `revoke` (close any
note), `unfreeze`, `setAgent`, `transferOwnership`. The agent key can only: swear notes inside the mandate, settle, retract (graded as a miss),
tighten its own stops and its own mandate.

Tokens: USDT `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 dec), WETH `0xefd4bC9afD210517803f293ABABd701CaeeCdfd0`,
WBTC `0x6119CA49a79f5825C8B345F8d7aC36B272565b14`, WHSK `0xB210D2120d57b758EE163cFfb43e73728c471Cf1`.
