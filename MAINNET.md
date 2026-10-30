# Mainnet launch runbook (HSK Chain, chain 177)

Everything below was rehearsed on a fork of mainnet (vault 0x0f91…6b05 on the VM's anvil). Costs measured on the fork at 500 gwei.

| Step | Who | Cost |
|---|---|---|
| 1. Send **6 HSK** to the deployer `DEPLOYER` (printed by keygen on the VM) | owner | 6 HSK ≈ $0.52 (≈4.6 used: vault 5.5M gas + three pool observation upgrades 3.6M gas) |
| 2. Send **3 HSK** to the agent `AGENT` (gas for notes and settlements, ≈ 0.27 HSK per note + 0.2 per settlement) | owner | 3 HSK ≈ $0.26 |
| 3. Deploy: `DICTUM_MODE=mainnet DICTUM_OWNER=<your wallet> node bin/deploy.js` on the VM | Claude, after your OK | from step 1 |
| 4. Fund the vault: send **USDT** (suggest 40–60) and a little **WETH / WBTC / WHSK** (≈ $10 each, so short notes have inventory) straight to the vault address | owner | your capital, stays yours: `withdraw` is owner-only |
| 5. Start `dictum-mainnet` service; point the site at it | Claude | — |

Owner powers (your wallet): `amend` (any mandate change), `withdraw` (anything not locked in an outstanding note), `revoke` (close any note), `unfreeze`, `setAgent`, `transferOwnership`.
The agent key can only: swear notes inside the mandate, settle, retract (graded as a miss), tighten its own stops and its own mandate.

USDT on HSK: `0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029` (6 decimals). WETH `0xefd4…Cdfd0`, WBTC `0x6119…65b14`, WHSK `0xB210…71Cf1` (wrap HSK at that contract).
