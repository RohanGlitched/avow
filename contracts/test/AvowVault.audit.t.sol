// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, stdError} from "forge-std/Test.sol";
import {AvowVault} from "../src/AvowVault.sol";
import {IERC20, IUniswapV3PoolLike, ISwapRouter02} from "../src/Interfaces.sol";
import {HSK} from "../script/Addresses.sol";

/// Audit proofs of concept. Every `test_poc_*` PASSES while the bug it names is present (it asserts the bad behaviour);
/// after the fix it should fail or be rewritten as a regression test. `test_control_*` show the intended behaviour.
contract AvowVaultAuditTest is Test {
    AvowVault v;
    address owner = makeAddr("owner");
    address agentKey = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address whale = makeAddr("whale");

    uint8 constant ETH = 0;
    uint8 constant BTC = 1;
    uint8 constant HSKA = 2;

    function setUp() public {
        vm.createSelectFork("hsk", HSK.FORK_BLOCK);
        IUniswapV3PoolLike(HSK.POOL_WETH).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WBTC).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WHSK).increaseObservationCardinalityNext(64);
        v = new AvowVault(owner, agentKey, HSK.USDT, HSK.ROUTER, HSK.assets(), HSK.defaultMandate());
        deal(HSK.USDT, address(v), 200e6);
        deal(HSK.WETH, address(v), 0.02e18);
        deal(HSK.WHSK, address(v), 300e18);
        deal(HSK.WBTC, address(v), 0.0005e8);
        vm.warp(vm.getBlockTimestamp() + 400);
        vm.roll(vm.getBlockNumber() + 200);
    }

    // ───────────────────────────────────────────── helpers (same as the fork test)

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

    function _swearX(uint8 a, AvowVault.Side side, uint64 notional, uint16 conf, uint256 stopBps, uint256 rr, uint256 horizon)
        internal
        returns (uint256 id)
    {
        (uint96 t, uint96 vd) = _levels(a, side == AvowVault.Side.Long, stopBps, rr);
        vm.prank(agentKey);
        id = v.swear(a, side, notional, t, vd, uint40(vm.getBlockTimestamp() + horizon), conf, "audit", bytes32(0));
    }

    function _swear(uint8 a, AvowVault.Side side, uint64 notional, uint16 conf) internal returns (uint256) {
        return _swearX(a, side, notional, conf, 200, 150, 6 hours);
    }

    function _token(uint8 a) internal view returns (address) {
        return v.assets()[a].token;
    }

    function _push(uint8 a, bool up, uint256 amount) internal {
        address token = _token(a);
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
        vm.roll(vm.getBlockNumber() + (s / 2 == 0 ? 1 : s / 2));
    }

    function _usdtBal() internal view returns (uint256) {
        return IERC20(HSK.USDT).balanceOf(address(v));
    }

    // ═════════════════════════════════════════════ H-1  fixed: odds start at 50 %, Apprentice needs a hit

    /// Was: 24 dust notes at 30 % retracted at once + one lucky win took the agent to Fiduciary.
    function test_fixed_H1_noLongShotNotesAndNoTierWithoutAHit() public {
        (uint96 t, uint96 vd) = _levels(ETH, true, 50, 240);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.BadConfidence.selector, 3000));
        v.swear(ETH, AvowVault.Side.Long, 5e6, t, vd, uint40(vm.getBlockTimestamp() + 10 minutes), 3000, "x", bytes32(0));
        // five calibrated coin flips that all missed do not earn Apprentice: a tier needs at least one honoured note
        for (uint256 i; i < 5; i++) {
            uint256 id = _swearX(ETH, AvowVault.Side.Long, 5e6, 5000, 200, 200, 6 hours);
            vm.prank(agentKey);
            v.retract(id);
            _wait(601);
        }
        assertEq(v.brier(), 25_000_000);
        assertEq(v.tier(), 0);
    }

    /// Was: a zero-notional long swept router dust and booked positive P&L.
    function test_fixed_H1b_noZeroNotionalNotes() public {
        deal(HSK.USDT, HSK.ROUTER, 0.05e6);
        (uint96 t, uint96 vd) = _levels(ETH, true, 50, 240);
        vm.prank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.ExceedsDenomination.selector, 0, 10e6));
        v.swear(ETH, AvowVault.Side.Long, 0, t, vd, uint40(vm.getBlockTimestamp() + 10 minutes), 9000, "z", bytes32(0));
    }

    // ═════════════════════════════════════════════ M-1  fixed: $1 minimum note, revoke always unlocks

    function test_fixed_M1_dustNotesRefused() public {
        (uint96 t, uint96 vd) = _levels(BTC, true, 200, 150);
        vm.startPrank(agentKey);
        vm.expectRevert(abi.encodeWithSelector(AvowVault.ExceedsDenomination.selector, 500, 10e6));
        v.swear(BTC, AvowVault.Side.Long, 500, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(AvowVault.ExceedsDenomination.selector, 8_000, 10e6));
        v.swear(BTC, AvowVault.Side.Long, 8_000, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
        vm.stopPrank();
    }

    function test_fixed_M1b_revokeUnlocksWithoutTrading() public {
        uint256 id = _swear(BTC, AvowVault.Side.Long, 1e6, 6000);
        uint256 q = v.getNote(id).amountOut;
        uint256 wbtcBefore = IERC20(HSK.WBTC).balanceOf(address(v));
        vm.prank(owner);
        v.revoke(id);
        assertEq(IERC20(HSK.WBTC).balanceOf(address(v)), wbtcBefore, "no swap on revoke");
        assertEq(v.lockedAsset(BTC), 0);
        assertEq(v.openNoteOf(BTC), 0);
        assertEq(v.ledger().revoked, 1);
        assertGt(q, 0);
    }

    // ═════════════════════════════════════════════ M-2  fixed: short proceeds keep a 20 % buy-back reserve

    function test_fixed_M2_withdrawKeepsShortReserve() public {
        _swear(HSKA, AvowVault.Side.Short, 10e6, 6000);
        uint256 locked = v.lockedUsdt();
        uint256 free = _usdtBal() - locked * 6 / 5;
        vm.prank(owner);
        vm.expectRevert(bytes("locked"));
        v.withdraw(HSK.USDT, free + 1, owner);
        vm.prank(owner);
        v.withdraw(HSK.USDT, free, owner);
        assertEq(_usdtBal(), locked * 6 / 5);
    }

    function test_fixed_M2b_longCannotSpendShortProceeds() public {
        _swear(HSKA, AvowVault.Side.Short, 10e6, 6000);
        uint256 free = _usdtBal() - v.lockedUsdt() * 6 / 5;
        vm.prank(owner);
        v.withdraw(HSK.USDT, free, owner);
        _wait(601);
        (uint96 t, uint96 vd) = _levels(ETH, true, 200, 150);
        vm.prank(agentKey);
        vm.expectPartialRevert(AvowVault.InsufficientInventory.selector);
        v.swear(ETH, AvowVault.Side.Long, 9e6, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), 6000, "x", bytes32(0));
    }

    function test_fixed_M2c_shortStaysClosableAfterWithdrawal() public {
        uint256 s = _swear(HSKA, AvowVault.Side.Short, 10e6, 6000);
        uint256 free = _usdtBal() - v.lockedUsdt() * 6 / 5;
        vm.prank(owner);
        v.withdraw(HSK.USDT, free, owner);
        _wait(6 hours + 1);
        v.settle(s);
        assertEq(uint8(v.getNote(s).status), uint8(AvowVault.Status.Lapsed));
        assertEq(v.lockedUsdt(), 0);
    }

    // ═════════════════════════════════════════════ M-3  fixed at deploy: 240 observations cannot be flooded inside 5 minutes

    function test_fixed_M3_floodCannotShortenTheTwapWith240Observations() public {
        IUniswapV3PoolLike(HSK.POOL_WETH).increaseObservationCardinalityNext(240);
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 8000);
        uint256 vd = v.getNote(id).voidPx;
        while (v.spotPx(ETH) > vd * 9900 / 10_000) _push(ETH, false, 0.05e18);
        // the attack that emptied a 64-slot ring: one tick-moving swap per 2 s block for 140 s
        for (uint256 i; i < 70; i++) {
            _wait(2);
            if (i % 2 == 0) _push(ETH, false, 0.002e18);
            else _push(ETH, true, 4e6);
        }
        (bool ok,) = v.settleable(id);
        assertFalse(ok, "the 5-minute TWAP still needs the price held for 5 minutes");
    }

    // ═════════════════════════════════════════════ L-1  fixed: a retreat counts toward the void streak

    function test_fixed_L1_retractCountsTowardTheStreak() public {
        for (uint256 i; i < 3; i++) {
            uint256 id = _swear(ETH, AvowVault.Side.Long, 5e6, 8000);
            vm.prank(agentKey);
            v.retract(id);
            _wait(601);
        }
        assertEq(v.ledger().voidStreak, 3);
    }

    // ═════════════════════════════════════════════ L-2  fixed: a retract exits within the mandate's normal slippage

    function test_fixed_L2_retractCannotBeSandwichedPastSlippage() public {
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        uint256 tw = v.twapPx(ETH);
        while (v.spotPx(ETH) > tw * 9900 / 10_000) _push(ETH, false, 0.01e18);
        vm.prank(agentKey);
        vm.expectRevert(); // Too little received: the 0.60 % bound holds
        v.retract(id);
    }

    // ═════════════════════════════════════════════ L-3 / L-4  fixed: hwm scales with flows and rises only with profit

    function test_fixed_L3_withdrawDoesNotDeepenTheDrawdown() public {
        AvowVault.Mandate memory m = v.mandate();
        m.maxDrawdownBps = 500;
        vm.prank(owner);
        v.amend(m);
        uint256 id = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        _push(ETH, false, 3e18);
        _wait(900);
        uint256 ratio0 = v.equity() * 1e18 / v.hwm();
        vm.prank(owner);
        v.withdraw(HSK.USDT, 150e6, owner);
        assertApproxEqRel(v.equity() * 1e18 / v.hwm(), ratio0, 0.001e18, "drawdown ratio unchanged by a withdrawal");
        v.settle(id);
        assertFalse(v.frozen());
    }

    function test_fixed_L4_pumpDoesNotRatchetTheHighWaterMark() public {
        uint256 a = _swear(ETH, AvowVault.Side.Long, 10e6, 6000);
        uint256 hwm0 = v.hwm();
        _push(ETH, true, 12_000e6);
        _wait(600);
        v.settle(a);
        int64 pnl = v.getNote(a).pnl;
        uint256 expected = pnl > 0 ? hwm0 + uint256(int256(pnl)) : hwm0;
        assertEq(v.hwm(), expected, "only realised profit raises the high-water mark");
    }

    // ═════════════════════════════════════════════ price math: both token orders, 6/8/18 decimals, full tick range

    function testFuzz_pxAtTick_fullRange(int24 tick, uint8 decSel) public {
        tick = int24(bound(int256(tick), -887272, 887272));
        uint8 dec = decSel % 3 == 0 ? 6 : decSel % 3 == 1 ? 8 : 18;
        PxHarness h = _harness();
        AvowVault.Asset memory a0 = AvowVault.Asset(address(0), address(0), 0, dec, true);
        AvowVault.Asset memory a1 = AvowVault.Asset(address(0), address(0), 0, dec, false);
        uint256 p0 = h.pxAtTick(a0, tick); // must not revert anywhere
        uint256 p1 = h.pxAtTick(a1, tick);
        uint256 base = 100 * 10 ** dec;
        // p0 = r·base, p1 = base/r  →  p0·p1 ≈ base² (both rounded down)
        if (p0 > 1e6 && p1 > 1e6) {
            assertApproxEqRel(p0 * p1, base * base, 1e12); // 1e-6 relative
        }
        // monotone in tick
        if (tick < 887272) {
            assertGe(h.pxAtTick(a0, tick + 1), p0);
            assertLe(h.pxAtTick(a1, tick + 1), p1);
        }
    }

    PxHarness _h;

    function _harness() internal returns (PxHarness) {
        if (address(_h) == address(0)) {
            _h = new PxHarness(owner, agentKey, HSK.USDT, HSK.ROUTER, HSK.assets(), HSK.defaultMandate());
        }
        return _h;
    }
}

contract PxHarness is AvowVault {
    constructor(address o, address ag, address u, address r, Asset[] memory a, Mandate memory m)
        AvowVault(o, ag, u, r, a, m)
    {}

    function pxAtTick(Asset memory a, int24 tick) external pure returns (uint256) {
        return _pxAtTick(a, tick);
    }
}

// ═════════════════════════════════════════════ stateful invariant (fork)

contract VaultHandler is Test {
    AvowVault public v;
    address public owner;
    address public agentKey;
    address whale = address(0xBA1E);

    // ghost Brier window, mirrors the contract's ring buffer
    uint32[32] public gWin;
    uint256 public gCount;
    uint256 public gHead;
    uint256 public gSum;
    uint256 public gGraded;
    int256 public gPnl;
    uint256 public calls;

    constructor(AvowVault v_, address owner_, address agent_) {
        v = v_;
        owner = owner_;
        agentKey = agent_;
    }

    function _wait(uint256 s) internal {
        vm.warp(vm.getBlockTimestamp() + s);
        vm.roll(vm.getBlockNumber() + (s / 2 == 0 ? 1 : s / 2));
    }

    function _record(uint256 id) internal {
        AvowVault.Note memory n = v.getNote(id);
        if (n.status == AvowVault.Status.Outstanding) return;
        uint256 p = uint256(n.confidenceBps) * 1e4;
        uint256 o = n.status == AvowVault.Status.Honoured ? 1e8 : 0;
        uint256 d = p > o ? p - o : o - p;
        uint256 e = d * d / 1e8;
        if (gCount < 32) {
            gWin[gCount] = uint32(e);
            gCount++;
        } else {
            gSum -= gWin[gHead];
            gWin[gHead] = uint32(e);
            gHead = (gHead + 1) % 32;
        }
        gSum += e;
        gGraded++;
        gPnl += n.pnl;
    }

    function swear(uint256 seed, uint64 notional, uint16 conf, uint16 stopBps, bool short_) external {
        calls++;
        uint8 a = uint8(seed % 3);
        AvowVault.Side side = short_ ? AvowVault.Side.Short : AvowVault.Side.Long;
        uint256 cap = v.denomination();
        notional = uint64(bound(notional, 1e6, cap)); // >= $1: dust notes are covered by test_poc_M1*
        conf = uint16(bound(conf, 5000, 9000));
        stopBps = uint16(bound(stopBps, 30, 700));
        _wait(601);
        uint256 e;
        try v.twapPx(a) returns (uint256 e_) {
            e = e_;
        } catch {
            return;
        }
        uint256 risk = e * stopBps / 10_000;
        uint256 reward = risk * 150 / 100 + 1;
        uint96 t = uint96(short_ ? e - reward : e + reward);
        uint96 vd = uint96(short_ ? e + risk : e - risk);
        vm.prank(agentKey);
        try v.swear(a, side, notional, t, vd, uint40(vm.getBlockTimestamp() + 1 hours), conf, "inv", bytes32(0)) {} catch {}
    }

    function _pick(uint256 seed) internal view returns (bool, uint256) {
        uint256 c = v.noteCount();
        if (c == 0) return (false, 0);
        for (uint256 k; k < c; k++) {
            uint256 id = (seed + k) % c;
            if (v.getNote(id).status == AvowVault.Status.Outstanding) return (true, id);
        }
        return (false, 0);
    }

    function settle(uint256 seed) external {
        calls++;
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        try v.settle(id) {
            _record(id);
        } catch {}
    }

    function retract(uint256 seed) external {
        calls++;
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        vm.prank(agentKey);
        try v.retract(id) {
            _record(id);
        } catch {}
    }

    function revoke(uint256 seed) external {
        calls++;
        (bool ok, uint256 id) = _pick(seed);
        if (!ok) return;
        vm.prank(owner);
        try v.revoke(id) {
            _record(id);
        } catch {}
    }

    function push(uint256 seed, uint256 amt, bool up) external {
        calls++;
        uint8 a = uint8(seed % 3);
        AvowVault.Asset memory as_ = v.assets()[a];
        address u = v.usdt();
        ISwapRouter02 r = v.router();
        uint256 px = v.spotPx(a); // USDT raw per 100 assets
        uint256 usdt = bound(amt, 1e6, 1_500e6);
        vm.startPrank(whale);
        if (up) {
            deal(u, whale, usdt);
            IERC20(u).approve(address(r), usdt);
            try r.exactInputSingle(ISwapRouter02.ExactInputSingleParams(u, as_.token, 3000, whale, usdt, 0, 0)) {} catch {}
        } else {
            uint256 q = usdt * 100 * 10 ** as_.decimals / px;
            if (q == 0) q = 1;
            deal(as_.token, whale, q);
            IERC20(as_.token).approve(address(r), q);
            try r.exactInputSingle(ISwapRouter02.ExactInputSingleParams(as_.token, u, 3000, whale, q, 0, 0)) {} catch {}
        }
        vm.stopPrank();
    }

    function wait(uint256 s) external {
        calls++;
        _wait(bound(s, 2, 2 hours));
    }

    function withdrawFreeUsdt(uint256 frac) external {
        calls++;
        address u = v.usdt();
        uint256 bal = IERC20(u).balanceOf(address(v));
        uint256 locked = v.lockedUsdt();
        if (bal <= locked) return;
        uint256 amt = (bal - locked) * bound(frac, 1, 100) / 100;
        vm.prank(owner);
        try v.withdraw(u, amt, owner) {} catch {}
    }

    function depositUsdt(uint256 amt) external {
        calls++;
        address u = v.usdt();
        amt = bound(amt, 1, 50e6);
        deal(u, address(this), amt);
        IERC20(u).approve(address(v), amt);
        v.deposit(u, amt);
    }
}

contract AvowVaultInvariantTest is Test {
    AvowVault v;
    VaultHandler h;
    address owner = makeAddr("owner");
    address agentKey = makeAddr("agent");

    function setUp() public {
        vm.createSelectFork("hsk", HSK.FORK_BLOCK);
        IUniswapV3PoolLike(HSK.POOL_WETH).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WBTC).increaseObservationCardinalityNext(64);
        IUniswapV3PoolLike(HSK.POOL_WHSK).increaseObservationCardinalityNext(64);
        AvowVault.Mandate memory m = HSK.defaultMandate();
        m.dailyLossLimit = 1_000e6; // let the fuzzer keep trading
        m.maxDrawdownBps = 10_000;
        v = new AvowVault(owner, agentKey, HSK.USDT, HSK.ROUTER, HSK.assets(), m);
        deal(HSK.USDT, address(v), 200e6);
        deal(HSK.WETH, address(v), 0.02e18);
        deal(HSK.WHSK, address(v), 300e18);
        deal(HSK.WBTC, address(v), 0.0005e8);
        vm.warp(vm.getBlockTimestamp() + 400);
        vm.roll(vm.getBlockNumber() + 200);
        h = new VaultHandler(v, owner, agentKey);
        bytes4[] memory sel = new bytes4[](9);
        sel[0] = VaultHandler.swear.selector;
        sel[1] = VaultHandler.swear.selector; // weight
        sel[2] = VaultHandler.settle.selector;
        sel[3] = VaultHandler.retract.selector;
        sel[4] = VaultHandler.revoke.selector;
        sel[5] = VaultHandler.push.selector;
        sel[6] = VaultHandler.wait.selector;
        sel[7] = VaultHandler.withdrawFreeUsdt.selector;
        sel[8] = VaultHandler.depositUsdt.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sel}));
        targetContract(address(h));
    }

    /// exposure, lockedAsset, lockedUsdt and openNoteOf equal what the outstanding notes say
    /// forge-config: default.invariant.runs = 12
    /// forge-config: default.invariant.depth = 30
    /// forge-config: default.invariant.fail-on-revert = false
    function invariant_bookkeepingMatchesNotes() public view {
        uint256 c = v.noteCount();
        uint256 exp;
        uint256 lu;
        uint256[3] memory la;
        uint256[3] memory open;
        for (uint256 i; i < c; i++) {
            AvowVault.Note memory n = v.getNote(i);
            if (n.status != AvowVault.Status.Outstanding) continue;
            exp += n.notional;
            if (n.side == AvowVault.Side.Long) la[n.asset] += n.amountOut;
            else lu += n.amountOut;
            open[n.asset] = i + 1;
        }
        assertEq(v.exposure(), exp, "exposure");
        assertEq(v.lockedUsdt(), lu, "lockedUsdt");
        for (uint8 a; a < 3; a++) {
            assertEq(v.lockedAsset(a), la[a], "lockedAsset");
            assertEq(v.openNoteOf(a), open[a], "openNoteOf");
        }
    }

    /// every locked asset is actually held
    /// forge-config: default.invariant.runs = 12
    /// forge-config: default.invariant.depth = 30
    /// forge-config: default.invariant.fail-on-revert = false
    function invariant_lockedAssetsBacked() public view {
        for (uint8 a; a < 3; a++) {
            assertLe(v.lockedAsset(a), IERC20(v.assets()[a].token).balanceOf(address(v)), "lockedAsset > balance");
        }
    }

    /// EXPECTED TO FAIL until M-2 is fixed: a long may spend a short's locked proceeds
    /// forge-config: default.invariant.runs = 12
    /// forge-config: default.invariant.depth = 30
    /// forge-config: default.invariant.fail-on-revert = false
    function invariant_lockedUsdtBacked() public view {
        assertLe(v.lockedUsdt(), IERC20(HSK.USDT).balanceOf(address(v)), "lockedUsdt > USDT balance");
    }

    /// the Brier window, graded count and realised P&L match an independent replay of every close
    /// forge-config: default.invariant.runs = 12
    /// forge-config: default.invariant.depth = 30
    /// forge-config: default.invariant.fail-on-revert = false
    function invariant_gradingMatchesReplay() public view {
        AvowVault.Ledger memory l = v.ledger();
        assertEq(l.graded, h.gGraded(), "graded");
        assertEq(l.graded, uint256(l.honoured) + l.voided + l.lapsed + l.retracted + l.revoked, "outcome counts");
        assertEq(l.windowCount, h.gCount(), "windowCount");
        assertEq(l.windowSqErrSum, h.gSum(), "windowSqErrSum");
        assertEq(int256(l.realisedPnl), h.gPnl(), "realisedPnl");
        assertLe(l.windowCount, 32);
    }
}
