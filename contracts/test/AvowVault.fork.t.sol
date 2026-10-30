// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AvowVault} from "../src/AvowVault.sol";
import {IERC20, IUniswapV3PoolLike, ISwapRouter02} from "../src/Interfaces.sol";
import {HSK} from "../script/Addresses.sol";

/// Rehearsal on a fork of HSK Chain mainnet: real HSKSwap pools, real Chainlink feeds, real tokens.
contract AvowVaultForkTest is Test {
    AvowVault v;
    address owner = makeAddr("owner");
    address agentKey = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address whale = makeAddr("whale");

    uint8 constant ETH = 0;
    uint8 constant BTC = 1;
    uint8 constant HSKA = 2;

    function setUp() public {
        vm.createSelectFork("hsk");
        // the WBTC pool keeps a single observation; give every pool room for a 5-minute TWAP
        IUniswapV3PoolLike(HSK.POOL_WETH).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WBTC).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WHSK).increaseObservationCardinalityNext(64);
        v = new AvowVault("Avow", owner, agentKey, HSK.USDT, HSK.ROUTER, HSK.assets(), HSK.defaultMandate());
        deal(HSK.USDT, address(v), 200e6);
        deal(HSK.WETH, address(v), 0.02e18);
        deal(HSK.WHSK, address(v), 300e18);
        deal(HSK.WBTC, address(v), 0.0005e8);
        // a fresh observation so the 300 s window is well defined in every test
        vm.warp(vm.getBlockTimestamp() + 400);
        vm.roll(vm.getBlockNumber() + 200);
    }

    // ───────────────────────────────────────────── helpers

    function _levels(uint8 a, bool long_, uint256 stopBps, uint256 rrX100)
        internal
        view
        returns (uint96 target, uint96 voidPx)
    {
        uint256 e = v.twapPx(a);
        uint256 risk = e * stopBps / 10_000;
        uint256 reward = risk * rrX100 / 100 + 1;
        if (long_) {
            target = uint96(e + reward);
            voidPx = uint96(e - risk);
        } else {
            target = uint96(e - reward);
            voidPx = uint96(e + risk);
        }
    }

    function _swear(uint8 a, AvowVault.Side side, uint64 notional, uint16 conf) internal returns (uint256 id) {
        (uint96 t, uint96 vd) = _levels(a, side == AvowVault.Side.Long, 200, 150);
        vm.prank(agentKey);
        id = v.swear(a, side, notional, t, vd, uint40(vm.getBlockTimestamp() + 6 hours), conf, "Avow swears a test of the rules.", bytes32(0));
    }

    /// Push the pool price by swapping `usdtIn` USDT for the asset (up) or `assetIn` asset for USDT (down).
    function _push(uint8 a, bool up, uint256 amount) internal {
        AvowVault.Asset[] memory as_ = v.assets();
        address token = as_[a].token;
        vm.startPrank(whale);
        if (up) {
            deal(HSK.USDT, whale, amount);
            IERC20(HSK.USDT).approve(HSK.ROUTER, amount);
            ISwapRouter02(HSK.ROUTER).exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(HSK.USDT, token, 3000, whale, amount, 0, 0)
            );
        } else {
            deal(token, whale, amount);
            IERC20(token).approve(HSK.ROUTER, amount);
            ISwapRouter02(HSK.ROUTER).exactInputSingle(
                ISwapRouter02.ExactInputSingleParams(token, HSK.USDT, 3000, whale, amount, 0, 0)
            );
        }
        vm.stopPrank();
    }

    function _wait(uint256 s) internal {
        vm.warp(vm.getBlockTimestamp() + s);
        vm.roll(vm.getBlockNumber() + s / 2);
    }

    // ───────────────────────────────────────────── prices

    function test_twapAndSpotAgreeOnAQuietPool() public view {
        for (uint8 a; a < 3; a++) {
            uint256 twap = v.twapPx(a);
            uint256 spot = v.spotPx(a);
            assertGt(twap, 0);
            assertApproxEqRel(twap, spot, 0.002e18);
        }
    }

    // ───────────────────────────────────────────── swearing

    function test_swearLongOpensAndPublishes() public {
        uint256 usdtBefore = IERC20(HSK.USDT).balanceOf(address(v));
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6500);
        AvowVault.Note memory n = v.getNote(id);
        assertEq(uint8(n.status), uint8(AvowVault.Status.Outstanding));
        assertEq(n.amountIn, 10e6);
        assertGt(n.amountOut, 0);
        assertEq(IERC20(HSK.USDT).balanceOf(address(v)), usdtBefore - 10e6);
        assertEq(v.lockedAsset(ETH), n.amountOut);
        assertEq(v.exposure(), 10e6);
        assertEq(v.openNoteOf(ETH), id + 1);
        assertEq(n.statementHash, keccak256("Avow swears a test of the rules."));
    }

    function test_swearShortSellsFreeInventoryOnly() public {
        uint256 id = _swear(HSKA, AvowVault.Side.Short, 10e6, 6000);
        AvowVault.Note memory n = v.getNote(id);
        assertGt(n.amountIn, 0);
        assertApproxEqRel(n.amountOut, 10e6, 0.01e18);
        assertEq(v.lockedUsdt(), n.amountOut);
    }

    function test_onlyAgentSwears() public {
        (uint96 t, uint96 vd) = _levels(ETH, true, 200, 150);
        vm.prank(stranger);
        vm.expectRevert(AvowVault.NotAgent.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    function test_denominationCapsProbation() public {
        // Probation = 20% of maxNotional ($50) = $10
        assertEq(v.denomination(), 10e6);
        (uint96 t, uint96 vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.ExceedsDenomination.selector, 11e6, 10e6));
        v.swear(ETH, AvowVault.Side.Long, 11e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    function test_stopTooWideAndRewardTooSmall() public {
        uint256 e = v.twapPx(ETH);
        vm.startPrank(agentKey);
        // 9% stop > 8% max
        vm.expectRevert();
        v.swear(ETH, AvowVault.Side.Long, 5e6, uint96(e * 120 / 100), uint96(e * 91 / 100), uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        // reward/risk 1.0 < 1.2
        vm.expectRevert();
        v.swear(ETH, AvowVault.Side.Long, 5e6, uint96(e * 102 / 100), uint96(e * 98 / 100), uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        // levels on the wrong side
        vm.expectRevert(AvowVault.BadLevels.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, uint96(e * 98 / 100), uint96(e * 97 / 100), uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        vm.stopPrank();
    }

    function test_cooldownOnePerAssetAndHorizon() public {
        _swear(ETH, AvowVault.Side.Long, 5e6, 6000);
        (uint96 t, uint96 vd) = _levels(BTC, true, 200, 150);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.CooldownActive.selector);
        v.swear(BTC, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        _wait(601);
        (t, vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.NoteAlreadyOutstanding.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        (t, vd) = _levels(BTC, true, 200, 150);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.BadExpiry.selector);
        v.swear(BTC, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 25 hours), 6000, "x", bytes32(0));
    }

    function test_noNegativeExpectancyNotes() public {
        // reward 3%, risk 2%: a coin flip would win on paper (0.5·3 > 0.5·2) but loses to the 0.60% round-trip fee
        (uint96 tg, uint96 vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.NegativeExpectancy.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, tg, vd, uint40(vm.getBlockTimestamp() + 1 hours), 5000, "x", bytes32(0));
        // at 60% it clears the fee: 0.6·(3 − 0.6) > 0.4·(2 + 0.6)
        vm.prank(agentKey);
        v.swear(ETH, AvowVault.Side.Long, 5e6, tg, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    function test_aTargetInsideTheFeeIsRefused() public {
        // a 0.5% target cannot pay a 0.6% round trip, whatever the odds
        AvowVault.Mandate memory m = v.mandate();
        m.minRewardRiskX100 = 100;
        vm.prank(owner);
        v.amend(m);
        uint256 e = v.twapPx(ETH);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.NegativeExpectancy.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, uint96(e * 1005 / 1000), uint96(e * 9960 / 10_000), uint40(vm.getBlockTimestamp() + 1 hours), 9900, "x", bytes32(0));
    }

    function test_aNoteCannotBeFulfilledByItsOwnSwap() public {
        // a $1,000 buy in the ~$48k WETH pool moves it ~4%: a +1% target would be reached by the agent's own trade
        AvowVault.Mandate memory m = v.mandate();
        m.maxNotional = 5_000e6;
        m.maxExposure = 5_000e6;
        m.minRewardRiskX100 = 100;
        m.maxSlippageBps = 1_000;
        vm.prank(owner);
        v.amend(m);
        deal(HSK.USDT, address(v), 2_000e6);
        uint256 e = v.twapPx(ETH);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.SelfFulfilling.selector);
        v.swear(ETH, AvowVault.Side.Long, 1_000e6, uint96(e * 1012 / 1000), uint96(e * 99 / 100), uint40(vm.getBlockTimestamp() + 1 hours), 9000, "x", bytes32(0));
    }

    function test_confidenceBounds() public {
        (uint96 t, uint96 vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.BadConfidence.selector, 9950));
        v.swear(ETH, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 9950, "x", bytes32(0));
    }

    function test_noSwearingIntoASpike() public {
        _push(ETH, true, 3_000e6); // spot jumps, the 5-minute TWAP has not moved yet
        uint256 e = v.twapPx(ETH);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.SpotDeviation.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, uint96(e * 103 / 100), uint96(e * 98 / 100), uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    // ───────────────────────────────────────────── settling and grading

    function test_lapsedNoteSettlesByAnyoneAndIsGradedAMiss() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        (bool ok,) = v.settleable(id);
        assertFalse(ok);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.NotSettleable.selector, id));
        v.settle(id);
        _wait(6 hours + 1);
        vm.prank(stranger);
        v.settle(id);
        AvowVault.Note memory n = v.getNote(id);
        assertEq(uint8(n.status), uint8(AvowVault.Status.Lapsed));
        assertLt(n.pnl, 0); // two pool fees
        assertGt(n.pnl, -int64(int256(uint256(10e6 * 70 / 10_000))));
        AvowVault.Ledger memory l = v.ledger();
        assertEq(l.graded, 1);
        assertEq(l.lapsed, 1);
        assertEq(v.brier(), 36_000_000); // (0.6 - 0)^2
        assertEq(v.exposure(), 0);
        assertEq(v.lockedAsset(ETH), 0);
    }

    function test_honouredLong() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 7000);
        _push(ETH, true, 2_500e6);
        _wait(900);
        (bool ok, AvowVault.Status s) = v.settleable(id);
        assertTrue(ok);
        assertEq(uint8(s), uint8(AvowVault.Status.Honoured));
        vm.prank(stranger);
        v.settle(id);
        AvowVault.Note memory n = v.getNote(id);
        assertEq(uint8(n.status), uint8(AvowVault.Status.Honoured));
        assertGt(n.pnl, 0);
        assertEq(v.brier(), 9_000_000); // (0.7 - 1)^2
    }

    function test_voidLongIsThePermissionlessStopLoss() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 8000);
        _push(ETH, false, 2e18); // dump WETH
        _wait(900);
        (bool ok, AvowVault.Status s) = v.settleable(id);
        assertTrue(ok);
        assertEq(uint8(s), uint8(AvowVault.Status.Void));
        vm.prank(stranger);
        v.settle(id);
        AvowVault.Note memory n = v.getNote(id);
        assertEq(uint8(n.status), uint8(AvowVault.Status.Void));
        assertLt(n.pnl, 0);
        assertEq(v.brier(), 64_000_000); // overconfident miss: (0.8 - 0)^2
        assertEq(v.ledger().voidStreak, 1);
    }

    function test_aSpikeDoesNotTriggerTheStop() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 8000);
        _push(ETH, false, 2e18); // spot crashes through the void level
        _wait(30); // ...but the 5-minute TWAP has barely moved
        (bool ok,) = v.settleable(id);
        assertFalse(ok, "spot alone must not trigger the stop");
    }

    function test_aLevelThePriceLeftAgainDoesNotCount() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 8000);
        _push(ETH, false, 2e18);
        _wait(900); // TWAP now below the void level
        _push(ETH, true, 5_000e6); // price recovers above it
        (bool ok,) = v.settleable(id);
        assertFalse(ok, "TWAP alone must not trigger the stop once the live price is back");
    }

    function test_honouredShortEarnsUsdt() public {
        uint256 id = _swear(HSKA, AvowVault.Side.Short, 10e6, 6500);
        _push(HSKA, false, 400_000e18); // HSK falls
        _wait(900);
        vm.prank(stranger);
        v.settle(id);
        AvowVault.Note memory n = v.getNote(id);
        assertEq(uint8(n.status), uint8(AvowVault.Status.Honoured));
        assertGt(n.pnl, 0);
        assertEq(v.lockedUsdt(), 0);
    }

    function test_retractAndRevokeAreBothGradedAsMisses() public {
        uint256 a = _swear(ETH, AvowVault.Side.Long, 5e6, 9000);
        vm.prank(agentKey);
        v.retract(a);
        assertEq(v.ledger().retracted, 1);
        assertEq(v.brier(), 81_000_000);
        _wait(601);
        uint256 b = _swear(ETH, AvowVault.Side.Long, 5e6, 9000);
        uint256 wethBefore = IERC20(HSK.WETH).balanceOf(address(v));
        vm.prank(owner);
        v.revoke(b);
        // the owner's revoke does not trade, but it cannot hide the note: it is graded as a miss and marked at the TWAP
        assertEq(IERC20(HSK.WETH).balanceOf(address(v)), wethBefore);
        assertEq(v.ledger().graded, 2);
        assertEq(v.ledger().revoked, 1);
        assertEq(v.brier(), 81_000_000);
        assertEq(uint8(v.getNote(b).status), uint8(AvowVault.Status.Revoked));
        assertLt(v.getNote(b).pnl, 0, "marked to market: the entry fee is a loss");
    }

    function test_tightenStopOnlyTowardEntry() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 5e6, 6000);
        AvowVault.Note memory n = v.getNote(id);
        vm.startPrank(agentKey);
        vm.expectRevert(AvowVault.StopNotTighter.selector);
        v.tightenStop(id, n.voidPx - 1);
        v.tightenStop(id, n.voidPx + 1);
        vm.stopPrank();
        assertEq(v.getNote(id).voidPx, n.voidPx + 1);
    }

    // ───────────────────────────────────────────── trust is earned

    function test_fiveCalibratedNotesWithAHitEarnApprentice() public {
        assertEq(v.tier(), 0);
        for (uint256 i; i < 5; i++) {
            (uint96 tg, uint96 vd) = _levels(ETH, true, 200, 200); // reward 4%, risk 2%: a coin flip clears the fee
            vm.prank(agentKey);
            uint256 id = v.swear(ETH, AvowVault.Side.Long, 5e6, tg, vd, uint40(vm.getBlockTimestamp() + 6 hours), 5000, "x", bytes32(0));
            if (i == 4) {
                _push(ETH, true, 4_500e6);
                _wait(900);
                v.settle(id);
                assertEq(uint8(v.getNote(id).status), uint8(AvowVault.Status.Honoured));
            } else {
                _wait(6 hours + 1);
                v.settle(id);
            }
        }
        // five coin-flip notes, one honoured: Brier exactly 0.25 and a hit on record → Apprentice, denomination doubles
        assertEq(v.brier(), 25_000_000);
        assertEq(v.tier(), 1);
        assertEq(v.denomination(), 20e6);
    }

    function test_overconfidenceKeepsTheAgentOnProbation() public {
        for (uint256 i; i < 5; i++) {
            uint256 id = _swear(ETH, AvowVault.Side.Long, 5e6, 9000);
            _wait(6 hours + 1);
            v.settle(id);
        }
        assertEq(v.tier(), 0, "confident misses never earn a larger note");
        assertEq(v.denomination(), 10e6);
    }

    // ───────────────────────────────────────────── the mandate

    function test_agentCanOnlyTighten() public {
        AvowVault.Mandate memory m = v.mandate();
        m.maxNotional = 40e6;
        m.assetMask = 1; // ETH only
        vm.prank(agentKey);
        v.tighten(m);
        assertEq(v.mandate().maxNotional, 40e6);
        m.maxNotional = 60e6;
        vm.prank(agentKey);
        vm.expectRevert();
        v.tighten(m);
        m.maxNotional = 40e6;
        m.assetMask = 7;
        vm.prank(agentKey);
        vm.expectRevert();
        v.tighten(m);
        vm.prank(agentKey);
        vm.expectRevert(AvowVault.NotOwner.selector);
        v.amend(m);
        vm.prank(owner);
        v.amend(m);
        assertEq(v.mandate().assetMask, 7);
    }

    function test_pausedAndDisallowedAssets() public {
        AvowVault.Mandate memory m = v.mandate();
        m.assetMask = 1;
        vm.prank(agentKey);
        v.tighten(m);
        (uint96 t, uint96 vd) = _levels(BTC, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.AssetNotAllowed.selector, BTC));
        v.swear(BTC, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        m.paused = true;
        vm.prank(agentKey);
        v.tighten(m);
        (t, vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert(AvowVault.Paused.selector);
        v.swear(ETH, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        m.paused = false;
        vm.prank(agentKey);
        vm.expectRevert(); // the agent cannot unpause itself
        v.tighten(m);
    }

    function test_drawdownFreezesTheVault() public {
        AvowVault.Mandate memory m = v.mandate();
        m.maxDrawdownBps = 5; // 0.05%
        vm.prank(owner);
        v.amend(m);
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        _wait(6 hours + 1);
        v.settle(id); // two fees lost ≈ 0.6% of $10 ≈ 0.03% of NAV — under 0.05%? lose more:
        if (!v.frozen()) {
            _wait(601);
            uint256 id2 = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
            _push(ETH, false, 2e18);
            _wait(900);
                v.settle(id2);
        }
        assertTrue(v.frozen());
        _wait(601);
        (uint96 t, uint96 vd) = _levels(BTC, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert(AvowVault.Frozen.selector);
        v.swear(BTC, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        vm.prank(owner);
        v.unfreeze();
        assertFalse(v.frozen());
    }

    function test_dailyLossLimit() public {
        AvowVault.Mandate memory m = v.mandate();
        m.dailyLossLimit = 1; // any realised loss stops new notes today
        vm.prank(owner);
        v.amend(m);
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        vm.prank(agentKey);
        v.retract(id);
        _wait(601);
        (uint96 t, uint96 vd) = _levels(BTC, true, 200, 150);
        vm.prank(agentKey);
        vm.expectRevert();
        v.swear(BTC, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    function test_ownerCannotWithdrawLockedFunds() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        uint256 locked = v.lockedAsset(ETH);
        uint256 bal = IERC20(HSK.WETH).balanceOf(address(v));
        vm.prank(owner);
        vm.expectRevert(bytes("locked"));
        v.withdraw(HSK.WETH, bal - locked + 1, owner);
        vm.prank(owner);
        v.withdraw(HSK.WETH, bal - locked, owner);
        assertEq(IERC20(HSK.WETH).balanceOf(address(v)), locked);
        vm.prank(stranger);
        vm.expectRevert(AvowVault.NotOwner.selector);
        v.withdraw(HSK.USDT, 1, stranger);
        id;
    }

    function test_aLapsedNoteWaitsForACalmPool() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        _wait(6 hours + 1);
        _push(ETH, false, 0.5e18); // someone shoves the pool just as the note expires
        (bool ok,) = v.settleable(id);
        assertFalse(ok, "no one may settle an expiry into a spike");
        _push(ETH, true, 1_100e6); // the price comes back
        (ok,) = v.settleable(id);
        assertTrue(ok);
    }

    function test_inventoryPriceMovesDoNotFreezeTheAgent() public {
        AvowVault.Mandate memory m = v.mandate();
        m.maxDrawdownBps = 100; // 1%
        vm.prank(owner);
        v.amend(m);
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        _push(HSKA, false, 2_000_000e18); // the owner's HSK inventory loses a large share of its value
        _wait(6 hours + 1);
        v.settle(id);
        assertLt(v.nav() * 100, v.hwm() * 99, "NAV fell well over 1%");
        assertFalse(v.frozen(), "only the agent's realised losses count toward the drawdown");
    }

    function test_tightenStopKeepsTheMinimumDistance() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 5e6, 6000);
        AvowVault.Note memory n = v.getNote(id);
        vm.prank(agentKey);
        vm.expectRevert(AvowVault.StopNotTighter.selector);
        v.tightenStop(id, uint96(uint256(n.entryPx) * 9990 / 10_000)); // 0.10% from entry: inside noise
        vm.prank(agentKey);
        v.tightenStop(id, uint96(uint256(n.entryPx) * 9970 / 10_000)); // 0.30%: allowed
    }

    function test_navCountsEverything() public view {
        uint256 n = v.nav();
        // 200 USDT + 0.02 ETH + 300 HSK + 0.0005 BTC ≈ 200 + 44.7 + 26.2 + 38.4
        assertGt(n, 290e6);
        assertLt(n, 330e6);
    }
}
