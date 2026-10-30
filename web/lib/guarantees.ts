// What the contract guarantees, where it is enforced, and the fork test that proves it.
// Tests run against real HSK mainnet state (contracts/test).
export interface Guarantee {
  promise: string;
  enforced: string;
  test: string;
  home?: boolean;
}

export const GUARANTEES: Guarantee[] = [
  { promise: "Avow cannot trade without swearing a note in the same transaction.", enforced: "swear() is the agent's only route to the HSKSwap router", test: "test_honouredLong", home: true },
  { promise: "No note is larger than the denomination Avow has earned.", enforced: "swear(): notional ≤ min(tier cap, maxNotional)", test: "test_denominationCapsProbation", home: true },
  { promise: "Stops stay inside the mandate, and every note must stand to win more than it risks.", enforced: "swear(): stop ≤ maxStopBps, reward/risk ≥ minRewardRisk", test: "test_stopTooWideAndRewardTooSmall" },
  { promise: "One note per asset, a pause between notes, and a hard horizon.", enforced: "swear(): cooldown, one outstanding per asset, expiry ≤ maxHorizon", test: "test_cooldownOnePerAssetAndHorizon" },
  { promise: "No note is sworn into a price spike.", enforced: "swear(): |spot − 5-minute TWAP| ≤ maxSpotDevBps", test: "test_noSwearingIntoASpike", home: true },
  { promise: "No note can be fulfilled by its own trade.", enforced: "swear(): after the swap, spot is still short of the target", test: "test_aNoteCannotBeFulfilledByItsOwnSwap", home: true },
  { promise: "Avow cannot swear a note it expects to lose at its own odds.", enforced: "swear(): p·reward > (1 − p)·risk, odds 50–99%", test: "test_noNegativeExpectancyNotes" },
  { promise: "Anyone can stop a losing note. The stop needs no keeper and no permission.", enforced: "settle(id) is public", test: "test_voidLongIsThePermissionlessStopLoss", home: true },
  { promise: "A spike cannot trigger a stop or a target.", enforced: "settle(): both the TWAP and the live price must be past the level", test: "test_aSpikeDoesNotTriggerTheStop" },
  { promise: "A level the price has already left again does not count.", enforced: "settle(): reads the current TWAP and spot, not a past touch", test: "test_aLevelThePriceLeftAgainDoesNotCount" },
  { promise: "Every note ends: at expiry anyone may settle it, and it is graded a miss.", enforced: "settle(): now ≥ expiry → Lapsed, outcome 0", test: "test_lapsedNoteSettlesByAnyoneAndIsGradedAMiss", home: true },
  { promise: "An honoured short buys back the asset and books its gain in USDT.", enforced: "settle(): closing swap with an exit slippage bound", test: "test_honouredShortEarnsUsdt" },
  { promise: "Retreating never improves the record; the owner's own closes are not graded.", enforced: "retract() grades 0; revoke() is ungraded", test: "test_retractIsGradedAMissAndRevokeIsNotGraded" },
  { promise: "A stop can only move toward the entry, never away from it.", enforced: "tightenStop(): new void between old void and entry", test: "test_tightenStopOnlyTowardEntry" },
  { promise: "Autonomy is earned: five calibrated notes lift Avow from Probation to Apprentice.", enforced: "grading: rolling Brier over the last 32 graded notes", test: "test_fiveCalibratedMissesEarnApprentice", home: true },
  { promise: "Overconfidence is punished: a poorly calibrated record stays on Probation.", enforced: "tier rule: Brier ≤ 0.25 to leave Probation", test: "test_overconfidenceKeepsTheAgentOnProbation" },
  { promise: "Avow can tighten its own mandate but never loosen it.", enforced: "tighten(): every field equal or stricter, assets a subset", test: "test_agentCanOnlyTighten", home: true },
  { promise: "A paused vault swears nothing; a removed asset cannot be traded.", enforced: "swear(): not paused, asset allowed", test: "test_pausedAndDisallowedAssets" },
  { promise: "A drawdown past the limit freezes the vault until the owner unfreezes it.", enforced: "NAV < HWM × (1 − maxDrawdown) → frozen", test: "test_drawdownFreezesTheVault" },
  { promise: "After the daily loss limit, nothing new is sworn until the next day.", enforced: "swear(): dailyLoss < dailyLossLimit", test: "test_dailyLossLimit" },
  { promise: "Funds inside an outstanding note cannot be withdrawn, even by the owner.", enforced: "withdraw(): amount ≤ free balance", test: "test_ownerCannotWithdrawLockedFunds" },
  { promise: "No note may be sworn that loses at its own odds after the 0.60% round-trip pool fee.", enforced: "swear(): p·(reward − fee) > (1 − p)·(risk + fee)", test: "test_aTargetInsideTheFeeIsRefused" },
  { promise: "The owner cannot launder a loss: a revoked note is graded as a miss and marked at the TWAP.", enforced: "revoke() → _grade(miss), P&L marked to market", test: "test_retractAndRevokeAreBothGradedAsMisses" },
  { promise: "No one can settle a target or an expiry into a price spike; a stop never waits.", enforced: "settleable(): live price within maxSpotDevBps of the TWAP, except for a void", test: "test_aLapsedNoteWaitsForACalmPool" },
  { promise: "Only the agent's realised losses count toward the drawdown freeze, not the owner's inventory price moves.", enforced: "_close(): realised equity vs its high-water mark", test: "test_inventoryPriceMovesDoNotFreezeTheAgent" },
];

export const FORK_TESTS_PASSING = 31;
export const AUDIT_REGRESSION_TESTS = 13;
export const INVARIANTS = 4;
/** "31 fork tests, 13 audit regression tests and 4 invariants" */
export const TEST_SUMMARY = `${FORK_TESTS_PASSING} fork tests, ${AUDIT_REGRESSION_TESTS} audit regression tests and ${INVARIANTS} invariants`;
