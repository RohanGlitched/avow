# Security model

Avow's claim is narrow: **the agent cannot do anything the owner's mandate does not allow, cannot hide what it promised, and cannot
make its record look better than it is.** This page lists who holds which key, what each can do to the others, and what is not defended.

## Keys and powers

| Key | Held by | Can | Cannot |
|---|---|---|---|
| Owner | the person whose money it is (their own wallet) | `amend` any mandate field, `withdraw` anything not locked in an outstanding note, `revoke` (close without trading; graded as a miss, marked at the TWAP) any note, `unfreeze`, `setAgent`, `transferOwnership` | nothing is hidden from the owner |
| Agent | the server (GCE VM, key file readable only by the service user, never printed or committed) | `swear` a note inside the mandate, `settle`, `retract` (graded as a miss), `tightenStop` toward the entry, `tighten` the mandate (every field stricter) | withdraw, amend, unpause, unfreeze, widen a stop, move a target, trade an asset the mandate excludes, exceed its denomination |
| Anyone | — | `settle` a note whose condition holds, `deposit` | everything else |

Model access (Gemini on Vertex AI) uses the VM's service account through the metadata server: there is no model key anywhere.

## What the contract checks on every note

| Rule | Error | Test |
|---|---|---|
| Only the agent swears | `NotAgent` | `test_onlyAgentSwears` |
| Mandate paused / vault frozen | `Paused` / `Frozen` | `test_pausedAndDisallowedAssets`, `test_drawdownFreezesTheVault` |
| Asset allowed | `AssetNotAllowed` | `test_pausedAndDisallowedAssets` |
| Cooldown, one note per asset, horizon | `CooldownActive`, `NoteAlreadyOutstanding`, `BadExpiry` | `test_cooldownOnePerAssetAndHorizon` |
| Levels on the right sides, stop 0.25 % – max, reward/risk ≥ min | `BadLevels`, `StopTooWide`, `StopTooTight`, `RewardRiskTooLow` | `test_stopTooWideAndRewardTooSmall` |
| Odds 50–99 %, and positive expectancy at those odds after the 0.60 % round-trip fee | `BadConfidence`, `NegativeExpectancy` | `test_confidenceBounds`, `test_noNegativeExpectancyNotes`, `test_aTargetInsideTheFeeIsRefused` |
| At least $1; short proceeds keep a 20 % buy-back reserve | `ExceedsDenomination`, `InsufficientInventory` | `test_fixed_M1_dustNotesRefused`, `test_fixed_M2b_longCannotSpendShortProceeds` |
| Size ≤ earned denomination; exposure ≤ max | `ExceedsDenomination`, `ExceedsExposure` | `test_denominationCapsProbation` |
| Daily realised loss under the limit | `DailyLossReached` | `test_dailyLossLimit` |
| No swearing into a spike (live price within X of the 5-min TWAP) | `SpotDeviation` | `test_noSwearingIntoASpike` |
| Swap within slippage of the TWAP | router `Too little received` | (bounded by `amountOutMinimum`) |
| Not fulfilled by its own swap | `SelfFulfilling` | `test_aNoteCannotBeFulfilledByItsOwnSwap` |
| Shorts sell only free inventory | `InsufficientInventory` | `test_swearShortSellsFreeInventoryOnly` |
| Owner cannot pull funds locked in a note | `locked` | `test_ownerCannotWithdrawLockedFunds` |

Settlement: honoured/void need **both** the 5-minute TWAP and the live price past the level (`test_aSpikeDoesNotTriggerTheStop`,
`test_aLevelThePriceLeftAgainDoesNotCount`); expiry settles once the pool is calm (`test_lapsedNoteSettlesByAnyoneAndIsGradedAMiss`, `test_aLapsedNoteWaitsForACalmPool`).
Grading: retreating and the owner's revoke are both misses (`test_retractAndRevokeAreBothGradedAsMisses`); confident misses never earn a
larger note (`test_overconfidenceKeepsTheAgentOnProbation`); a coin flip that hits 1 in 5 earns nothing (`test_coinFlipsWithOneHitStayOnProbation`) while a calibrated record does
(`test_aCalibratedRecordEarnsApprentice`); settlement terms are fixed when a note is sworn and `amend` has bounds
(`test_amendHasBoundsAndSwornNotesKeepTheirTerms`); a tier needs at least one honoured note (`test_fixed_H1_noLongShotNotesAndNoTierWithoutAHit`).
Targets and expiries settle only in a calm pool (`test_aLapsedNoteWaitsForACalmPool`); the drawdown freeze counts the agent's realised
losses, not inventory price moves (`test_inventoryPriceMovesDoNotFreezeTheAgent`).

All tests run on a fork of HSK Chain mainnet against the real HSKSwap pools and tokens (`cd contracts && forge test`): 33 behaviour tests,
13 audit regression tests, a price-math fuzz test and a stateful invariant suite (bookkeeping, locked funds backed, grading replay).

## Attacks and what stops them

| Attack | Outcome |
|---|---|
| Prompt-inject the agent into a huge trade | The contract caps size at the denomination (Probation: 20 % of maxNotional) and exposure; the model never sets size or levels. |
| Agent quietly widens a stop after a loss | `tightenStop` only moves toward the entry; a wider stop reverts. |
| Agent cherry-picks: closes losers early so they don't count | `retract` is graded as a miss, the same as a void. |
| Agent pads its record with sure things | A note fulfilled by its own swap reverts; tiny targets fail the reward/risk floor; a near-certain claim with a tiny target fails the expectancy check. Lapsed notes count as misses. |
| Agent spams long shots at low odds to look calibrated | Brier would improve, but Journeyman and Fiduciary also need non-negative / positive realised P&L, which long-shot spam (paying 0.6 % in fees each) does not produce. |
| Someone pushes the pool to trigger our stop | Needs the 5-minute TWAP **and** the live price past the level at settlement: the attacker must hold the price there for minutes in a pool where they pay 0.30 % each way. Notes are capped by the owner's mandate ($50 at Probation by default), so the attack costs more than it can take; the 240-slot observation buffer stops a flood of tiny swaps from shortening the TWAP (`test_fixed_M3_floodCannotShortenTheTwapWith240Observations`). Not impossible on a thin pool; see limits. |
| Someone pushes the pool before we swear | `SpotDeviation` refuses when the live price is away from the TWAP; the agent also refuses when the pool is > 3 % from Chainlink. |
| Sandwich the opening swap | `amountOutMinimum` from the TWAP bounds slippage to the mandate's `maxSlippageBps` (default 0.60 %). |
| Stolen agent key | Thief can only swear mandate-compliant notes into the owner's own vault (no withdrawal path). The owner calls `setAgent` to rotate. |

## Limits we know about

- **Chainlink is not on-chain here.** Every Chainlink proxy on HSK Chain is read-whitelisted ("No access" from contracts, checked Oct 31 2026),
  so the vault's only on-chain price is HSKSwap's own TWAP. The Chainlink check is done by the agent, off chain, and shown as such.
- **Thin pools.** HSKSwap pools see a swap every few hours. Prices only move when someone trades, so many notes will lapse; the record says so.
- **Exit slippage.** A closing swap is bounded at the mandate slippage plus the two pool fees (1.2 % by default; a retract uses the slippage alone). In a crash faster than the TWAP, a stop can be delayed
  until the TWAP catches up; it is never skipped.
- **Expired note with no TWAP** settles at the live price; with the observation buffer raised to 240 at deploy this does not happen in practice.
- **Independent review, not an external audit.** A dedicated audit pass found 1 high, 3 medium and 4 low issues; all are fixed with regression
  tests. A judge panel found more (revoke laundering, fee-blind expectancy, settlement sandwiches); fixed with tests. No paid external audit.
- **The record can be bought on a thin pool.** Someone willing to hold a pool past a target for 5 minutes, paying fees both ways, can honour a
  note. We state this limit here and on /how, and will ask the HSK Chain team to whitelist the vault on Chainlink so a second oracle
  can confirm settlements on chain.
