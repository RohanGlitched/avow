// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import {IERC20, IUniswapV3PoolLike, ISwapRouter02} from "./Interfaces.sol";

/// @title DictumVault
/// @notice A vault an AI agent may trade only by swearing falsifiable notes. The owner's mandate is enforced here,
///         every note is published with the swap that opens it, anyone can settle a note once the HSKSwap TWAP and the
///         live price have both crossed its target or void level (or it expires), and the agent's largest allowed note
///         (its denomination) is earned from its graded, calibrated record.
/// @dev Prices are USDT per whole asset, scaled 1e8 ("px8"). USDT has 6 decimals.
contract DictumVault {
    // ─────────────────────────────────────────────────────────────── types

    enum Side {
        Long, // spend USDT on the asset, sell it back on settlement
        Short // sell free asset inventory for USDT, buy the same amount back on settlement
    }

    enum Status {
        None,
        Outstanding,
        Honoured, // TWAP reached the target
        Void, // TWAP crossed the void level (the stop)
        Lapsed, // expired before either
        Retracted, // closed early by the agent (graded as a miss)
        Revoked // closed by the owner (not graded)
    }

    struct Asset {
        address token;
        address pool; // HSKSwap v3 pool against USDT
        uint24 fee;
        uint8 decimals;
        bool assetIsToken0;
    }

    struct Mandate {
        uint16 maxSlippageBps; // swap price vs pool TWAP
        uint16 maxSpotDevBps; // live pool price vs TWAP when a note is sworn (no swearing into a spike)
        uint16 maxStopBps; // distance from entry to the void level
        uint16 minRewardRiskX100; // (target - entry) / (entry - void) * 100
        uint16 maxDrawdownBps; // NAV below high-water mark that freezes the vault
        uint32 cooldown; // seconds between notes
        uint32 maxHorizon; // longest expiry, seconds
        uint64 maxNotional; // USDT raw, the Fiduciary denomination
        uint64 maxExposure; // USDT raw, sum of outstanding notionals
        uint64 dailyLossLimit; // USDT raw, realised loss per UTC day
        uint8 assetMask; // bit i = asset i may be traded
        bool paused;
    }

    struct Note {
        uint8 asset;
        Side side;
        Status status;
        uint8 tierAtOpen;
        uint16 confidenceBps;
        uint40 openedAt;
        uint40 expiry;
        uint40 settledAt;
        uint96 entryPx;
        uint96 targetPx;
        uint96 voidPx;
        uint96 exitPx;
        uint64 notional;
        int64 pnl; // USDT raw
        uint128 amountIn; // long: USDT spent · short: asset sold
        uint128 amountOut; // long: asset bought · short: USDT received
        bytes32 statementHash;
    }

    struct Ledger {
        uint32 graded;
        uint32 honoured;
        uint32 voided;
        uint32 lapsed;
        uint32 retracted;
        uint8 voidStreak;
        uint8 windowCount; // ≤ WINDOW
        uint8 windowHead;
        uint64 windowSqErrSum; // Σ (p - o)², scaled 1e8, over the window
        int64 realisedPnl; // USDT raw, lifetime
    }

    // ─────────────────────────────────────────────────────────────── constants

    uint32 public constant TWAP_WINDOW = 300;
    uint32 public constant TWAP_FALLBACK = 60;
    uint16 public constant MIN_STOP_BPS = 25;
    uint32 public constant MIN_HORIZON = 10 minutes;
    uint16 public constant MIN_CONFIDENCE = 3000;
    uint16 public constant MAX_CONFIDENCE = 9900;
    uint8 public constant WINDOW = 32;
    uint256 private constant SQ_ONE = 1e8; // (1.0)² in sqErr units
    uint256 private constant BPS = 10_000;

    // ─────────────────────────────────────────────────────────────── state

    address public owner;
    address public agent;
    address public immutable usdt;
    ISwapRouter02 public immutable router;
    string public name;

    Asset[] internal _assets;
    Mandate internal _mandate;
    Ledger internal _ledger;
    uint32[WINDOW] internal _window; // sqErr per graded note, ring buffer

    Note[] internal _notes;
    mapping(uint8 => uint256) public openNoteOf; // asset → note id + 1
    mapping(uint8 => uint256) public lockedAsset; // asset held by outstanding longs
    uint256 public lockedUsdt; // proceeds held by outstanding shorts
    uint256 public exposure; // Σ notional of outstanding notes
    uint256 public lastSwearAt;
    uint256 public hwm; // high-water NAV, USDT raw
    bool public frozen;
    uint256 public lossDay; // UTC day index of dailyLoss
    uint256 public dailyLoss; // USDT raw
    uint256 private _lock = 1;

    // ─────────────────────────────────────────────────────────────── events

    event NoteSworn(
        uint256 indexed id,
        uint8 indexed asset,
        Side side,
        uint256 entryPx,
        uint256 targetPx,
        uint256 voidPx,
        uint256 expiry,
        uint256 confidenceBps,
        uint256 notional,
        uint256 amountIn,
        uint256 amountOut,
        uint8 tier,
        bytes32 rationaleHash,
        string statement
    );
    event NoteSettled(
        uint256 indexed id, Status status, uint256 exitPx, int256 pnl, uint256 sqErr, address indexed settler
    );
    event StopTightened(uint256 indexed id, uint256 oldVoidPx, uint256 newVoidPx);
    event MandateChanged(Mandate mandate, address indexed by, bool tightening);
    event TierChanged(uint8 from, uint8 to);
    event VaultFrozen(uint256 nav, uint256 hwm);
    event VaultUnfrozen(uint256 nav);
    event Deposited(address indexed token, address indexed from, uint256 amount, uint256 valueUsdt);
    event Withdrawn(address indexed token, address indexed to, uint256 amount, uint256 valueUsdt);
    event AgentChanged(address indexed agent);
    event OwnerChanged(address indexed owner);

    // ─────────────────────────────────────────────────────────────── errors

    error NotOwner();
    error NotAgent();
    error Reentrancy();
    error Paused();
    error Frozen();
    error AssetNotAllowed(uint8 asset);
    error CooldownActive(uint256 readyAt);
    error NoteAlreadyOutstanding(uint8 asset, uint256 id);
    error BadLevels();
    error StopTooWide(uint256 stopBps, uint256 maxStopBps);
    error StopTooTight(uint256 stopBps);
    error RewardRiskTooLow(uint256 rrX100, uint256 minX100);
    error NegativeExpectancy(uint256 confidenceBps, uint256 rrX100);
    error SelfFulfilling(uint256 spotAfter, uint256 targetPx);
    error BadExpiry(uint256 expiry);
    error BadConfidence(uint256 confidenceBps);
    error ExceedsDenomination(uint256 notional, uint256 cap);
    error ExceedsExposure(uint256 exposure, uint256 maxExposure);
    error DailyLossReached(uint256 loss, uint256 limit);
    error SpotDeviation(uint256 spotPx, uint256 twapPx, uint256 devBps);
    error NoTwap(address pool);
    error InsufficientInventory(uint256 free, uint256 needed);
    error NotOutstanding(uint256 id);
    error NotSettleable(uint256 id);
    error NotStricter(uint8 field);
    error StopNotTighter();
    error TransferFailed();
    error BadAsset();

    // ─────────────────────────────────────────────────────────────── setup

    constructor(
        string memory name_,
        address owner_,
        address agent_,
        address usdt_,
        address router_,
        Asset[] memory assets_,
        Mandate memory mandate_
    ) {
        require(assets_.length > 0 && assets_.length <= 8, "assets");
        name = name_;
        owner = owner_;
        agent = agent_;
        usdt = usdt_;
        router = ISwapRouter02(router_);
        for (uint256 i; i < assets_.length; i++) {
            Asset memory a = assets_[i];
            address t0 = IUniswapV3PoolLike(a.pool).token0();
            address t1 = IUniswapV3PoolLike(a.pool).token1();
            require((t0 == a.token && t1 == usdt_) || (t1 == a.token && t0 == usdt_), "pool");
            a.assetIsToken0 = t0 == a.token;
            a.decimals = IERC20(a.token).decimals();
            _assets.push(a);
            _approve(a.token, router_);
        }
        _approve(usdt_, router_);
        _mandate = mandate_;
        emit MandateChanged(mandate_, owner_, false);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ─────────────────────────────────────────────────────────────── the agent's word

    /// @notice Open a position by swearing a note. The statement is published in the same transaction as the swap.
    /// @param notional USDT raw value of the position (long: USDT spent; short: USDT value of asset sold)
    function swear(
        uint8 assetId,
        Side side,
        uint64 notional,
        uint96 targetPx,
        uint96 voidPx,
        uint40 expiry,
        uint16 confidenceBps,
        string calldata statement,
        bytes32 rationaleHash
    ) external onlyAgent nonReentrant returns (uint256 id) {
        Mandate memory m = _mandate;
        if (m.paused) revert Paused();
        if (frozen) revert Frozen();
        if (assetId >= _assets.length) revert BadAsset();
        if (m.assetMask & (uint8(1) << assetId) == 0) revert AssetNotAllowed(assetId);
        if (lastSwearAt != 0 && block.timestamp < lastSwearAt + m.cooldown) {
            revert CooldownActive(lastSwearAt + m.cooldown);
        }
        if (openNoteOf[assetId] != 0) revert NoteAlreadyOutstanding(assetId, openNoteOf[assetId] - 1);
        if (expiry < block.timestamp + MIN_HORIZON || expiry > block.timestamp + m.maxHorizon) revert BadExpiry(expiry);
        if (confidenceBps < MIN_CONFIDENCE || confidenceBps > MAX_CONFIDENCE) revert BadConfidence(confidenceBps);
        _rollDay();
        if (dailyLoss >= m.dailyLossLimit) revert DailyLossReached(dailyLoss, m.dailyLossLimit);

        Asset memory a = _assets[assetId];
        uint256 entry = _twap(a);
        _checkSpot(a, entry, m);
        _checkLevels(side, entry, targetPx, voidPx, confidenceBps, m);

        uint8 t = tier();
        uint256 cap = denominationOf(t);
        if (notional > cap) revert ExceedsDenomination(notional, cap);
        if (exposure + notional > m.maxExposure) revert ExceedsExposure(exposure + notional, m.maxExposure);

        uint256 amountIn;
        uint256 amountOut;
        if (side == Side.Long) {
            amountIn = notional;
            uint256 expected = _usdtToAsset(notional, entry, a.decimals);
            amountOut = _swapIn(usdt, a.token, a.fee, amountIn, expected * (BPS - m.maxSlippageBps) / BPS);
            lockedAsset[assetId] += amountOut;
            uint256 after_ = _spot(a);
            if (after_ >= targetPx) revert SelfFulfilling(after_, targetPx);
        } else {
            amountIn = _usdtToAsset(notional, entry, a.decimals);
            uint256 free = IERC20(a.token).balanceOf(address(this)) - lockedAsset[assetId];
            if (free < amountIn) revert InsufficientInventory(free, amountIn);
            amountOut = _swapIn(a.token, usdt, a.fee, amountIn, uint256(notional) * (BPS - m.maxSlippageBps) / BPS);
            lockedUsdt += amountOut;
            uint256 after_ = _spot(a);
            if (after_ <= targetPx) revert SelfFulfilling(after_, targetPx);
        }

        id = _notes.length;
        _notes.push(
            Note({
                asset: assetId,
                side: side,
                status: Status.Outstanding,
                tierAtOpen: t,
                confidenceBps: confidenceBps,
                openedAt: uint40(block.timestamp),
                expiry: expiry,
                settledAt: 0,
                entryPx: uint96(entry),
                targetPx: targetPx,
                voidPx: voidPx,
                exitPx: 0,
                notional: notional,
                pnl: 0,
                amountIn: uint128(amountIn),
                amountOut: uint128(amountOut),
                statementHash: keccak256(bytes(statement))
            })
        );
        openNoteOf[assetId] = id + 1;
        exposure += notional;
        lastSwearAt = block.timestamp;
        if (hwm == 0) hwm = nav();

        emit NoteSworn(
            id,
            assetId,
            side,
            entry,
            targetPx,
            voidPx,
            expiry,
            confidenceBps,
            notional,
            amountIn,
            amountOut,
            t,
            rationaleHash,
            statement
        );
    }

    /// @notice Anyone may settle a note once its condition holds. Target and void need both the 5-minute TWAP and the
    ///         live price past the level (a spike cannot trigger them, and a level the price has left again does not
    ///         count); expiry needs nothing.
    function settle(uint256 id) external nonReentrant {
        Note storage n = _note(id);
        (bool ok, Status s) = settleable(id);
        if (!ok) revert NotSettleable(id);
        _close(id, n, s);
    }

    /// @notice The agent closes a note early. It is graded as a miss, so retreating never improves the record.
    function retract(uint256 id) external onlyAgent nonReentrant {
        Note storage n = _note(id);
        _close(id, n, Status.Retracted);
    }

    /// @notice The owner closes any note. Not graded.
    function revoke(uint256 id) external onlyOwner nonReentrant {
        Note storage n = _note(id);
        _close(id, n, Status.Revoked);
    }

    /// @notice The agent may move a stop toward the entry, never away from it.
    function tightenStop(uint256 id, uint96 newVoidPx) external onlyAgent {
        Note storage n = _note(id);
        if (n.side == Side.Long ? newVoidPx <= n.voidPx || newVoidPx >= n.targetPx : newVoidPx >= n.voidPx || newVoidPx <= n.targetPx) {
            revert StopNotTighter();
        }
        emit StopTightened(id, n.voidPx, newVoidPx);
        n.voidPx = newVoidPx;
    }

    // ─────────────────────────────────────────────────────────────── the mandate

    /// @notice The agent may make its own mandate stricter, never looser. Every field is checked.
    function tighten(Mandate calldata next) external onlyAgent {
        Mandate memory m = _mandate;
        if (next.maxSlippageBps > m.maxSlippageBps) revert NotStricter(0);
        if (next.maxSpotDevBps > m.maxSpotDevBps) revert NotStricter(1);
        if (next.maxStopBps > m.maxStopBps) revert NotStricter(2);
        if (next.minRewardRiskX100 < m.minRewardRiskX100) revert NotStricter(3);
        if (next.maxDrawdownBps > m.maxDrawdownBps) revert NotStricter(4);
        if (next.cooldown < m.cooldown) revert NotStricter(5);
        if (next.maxHorizon > m.maxHorizon) revert NotStricter(6);
        if (next.maxNotional > m.maxNotional) revert NotStricter(7);
        if (next.maxExposure > m.maxExposure) revert NotStricter(8);
        if (next.dailyLossLimit > m.dailyLossLimit) revert NotStricter(9);
        if (next.assetMask & ~m.assetMask != 0) revert NotStricter(10);
        if (m.paused && !next.paused) revert NotStricter(11);
        _mandate = next;
        emit MandateChanged(next, msg.sender, true);
    }

    /// @notice The owner may change anything.
    function amend(Mandate calldata next) external onlyOwner {
        _mandate = next;
        emit MandateChanged(next, msg.sender, false);
    }

    // ─────────────────────────────────────────────────────────────── owner

    function deposit(address token, uint256 amount) external nonReentrant {
        uint256 value = _valueOf(token, amount);
        _pull(token, msg.sender, amount);
        hwm += value;
        emit Deposited(token, msg.sender, amount, value);
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        uint256 locked = token == usdt ? lockedUsdt : _lockedOf(token);
        require(IERC20(token).balanceOf(address(this)) - locked >= amount, "locked");
        uint256 value = _valueOf(token, amount);
        hwm = hwm > value ? hwm - value : 0;
        _push(token, to, amount);
        emit Withdrawn(token, to, amount, value);
    }

    function unfreeze() external onlyOwner {
        frozen = false;
        hwm = nav();
        emit VaultUnfrozen(hwm);
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function transferOwnership(address owner_) external onlyOwner {
        require(owner_ != address(0), "owner");
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    // ─────────────────────────────────────────────────────────────── views

    function mandate() external view returns (Mandate memory) {
        return _mandate;
    }

    function ledger() external view returns (Ledger memory) {
        return _ledger;
    }

    function assets() external view returns (Asset[] memory) {
        return _assets;
    }

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function noteCount() external view returns (uint256) {
        return _notes.length;
    }

    function getNote(uint256 id) external view returns (Note memory) {
        return _notes[id];
    }

    /// @notice Rolling Brier score over the last WINDOW graded notes, scaled 1e8 (0.25 = 25_000_000). Max if none.
    function brier() public view returns (uint256) {
        Ledger memory l = _ledger;
        if (l.windowCount == 0) return type(uint256).max;
        return uint256(l.windowSqErrSum) / l.windowCount;
    }

    /// @notice 0 Probation · 1 Apprentice · 2 Journeyman · 3 Fiduciary
    function tier() public view returns (uint8 t) {
        Ledger memory l = _ledger;
        uint256 b = brier();
        if (l.windowCount >= 5 && b <= 25_000_000) t = 1;
        if (t == 1 && l.graded >= 12 && b <= 22_000_000 && l.realisedPnl >= 0) t = 2;
        if (t == 2 && l.graded >= 25 && b <= 20_000_000 && l.realisedPnl > 0) t = 3;
        if (l.voidStreak >= 3 && t > 0) t -= 1;
    }

    function denominationOf(uint8 t) public view returns (uint256) {
        uint256 share = t == 0 ? 2000 : t == 1 ? 4000 : t == 2 ? 7000 : 10_000;
        return uint256(_mandate.maxNotional) * share / BPS;
    }

    function denomination() external view returns (uint256) {
        return denominationOf(tier());
    }

    function twapPx(uint8 assetId) external view returns (uint256) {
        return _twap(_assets[assetId]);
    }

    function spotPx(uint8 assetId) external view returns (uint256) {
        return _spot(_assets[assetId]);
    }

    function _spot(Asset memory a) internal view returns (uint256) {
        (, int24 tick,,,,,) = IUniswapV3PoolLike(a.pool).slot0();
        return _pxAtTick(a, tick);
    }

    /// @notice Whether a note can be settled now, and how.
    function settleable(uint256 id) public view returns (bool, Status) {
        if (id >= _notes.length) return (false, Status.None);
        Note memory n = _notes[id];
        if (n.status != Status.Outstanding) return (false, n.status);
        if (block.timestamp >= n.expiry) return (true, Status.Lapsed);
        Asset memory a = _assets[n.asset];
        (bool hasTwap, uint256 px) = _tryTwap(a);
        if (!hasTwap) return (false, Status.Outstanding);
        (, int24 tick,,,,,) = IUniswapV3PoolLike(a.pool).slot0();
        uint256 spot = _pxAtTick(a, tick);
        bool long_ = n.side == Side.Long;
        bool hit = long_ ? px >= n.targetPx && spot >= n.targetPx : px <= n.targetPx && spot <= n.targetPx;
        bool broke = long_ ? px <= n.voidPx && spot <= n.voidPx : px >= n.voidPx && spot >= n.voidPx;
        if (!hit && !broke) return (false, Status.Outstanding);
        return (true, hit ? Status.Honoured : Status.Void);
    }

    /// @notice Net asset value in USDT raw at pool TWAPs.
    function nav() public view returns (uint256 v) {
        v = IERC20(usdt).balanceOf(address(this));
        for (uint256 i; i < _assets.length; i++) {
            Asset memory a = _assets[i];
            uint256 bal = IERC20(a.token).balanceOf(address(this));
            if (bal == 0) continue;
            (bool ok, uint256 px) = _tryTwap(a);
            if (ok) v += _assetToUsdt(bal, px, a.decimals);
        }
    }

    // ─────────────────────────────────────────────────────────────── internals: closing and grading

    function _close(uint256 id, Note storage n, Status s) internal {
        Asset memory a = _assets[n.asset];
        Mandate memory m = _mandate;
        uint256 exitSlip = uint256(m.maxSlippageBps) * 2 > 150 ? uint256(m.maxSlippageBps) * 2 : 150;
        (bool hasTwap, uint256 px) = _tryTwap(a);
        if (!hasTwap) {
            (, int24 tick,,,,,) = IUniswapV3PoolLike(a.pool).slot0();
            px = _pxAtTick(a, tick);
        }

        int256 pnl;
        uint256 exitPx;
        if (n.side == Side.Long) {
            uint256 qty = n.amountOut;
            uint256 expected = _assetToUsdt(qty, px, a.decimals);
            uint256 got = _swapIn(a.token, usdt, a.fee, qty, expected * (BPS - exitSlip) / BPS);
            lockedAsset[n.asset] -= qty;
            pnl = int256(got) - int256(uint256(n.amountIn));
            exitPx = got * 100 * (10 ** a.decimals) / qty;
        } else {
            uint256 qty = n.amountIn;
            uint256 expectedIn = _assetToUsdt(qty, px, a.decimals);
            uint256 maxIn = expectedIn * (BPS + exitSlip) / BPS;
            uint256 spent = _swapOut(usdt, a.token, a.fee, qty, maxIn);
            lockedUsdt -= n.amountOut;
            pnl = int256(uint256(n.amountOut)) - int256(spent);
            exitPx = spent * 100 * (10 ** a.decimals) / qty;
        }

        n.status = s;
        n.settledAt = uint40(block.timestamp);
        n.exitPx = uint96(exitPx);
        n.pnl = int64(pnl);
        openNoteOf[n.asset] = 0;
        exposure -= n.notional;

        _rollDay();
        if (pnl < 0) dailyLoss += uint256(-pnl);

        uint256 sqErr;
        if (s != Status.Revoked) sqErr = _grade(n, s, pnl);

        uint256 v = nav();
        if (v > hwm) hwm = v;
        if (!frozen && v < hwm * (BPS - m.maxDrawdownBps) / BPS) {
            frozen = true;
            emit VaultFrozen(v, hwm);
        }
        emit NoteSettled(id, s, exitPx, pnl, sqErr, msg.sender);
    }

    function _grade(Note storage n, Status s, int256 pnl) internal returns (uint256 sqErr) {
        uint8 before = tier();
        Ledger storage l = _ledger;
        uint256 p = uint256(n.confidenceBps) * 1e4; // probability scaled 1e8
        uint256 o = s == Status.Honoured ? 1e8 : 0;
        uint256 d = p > o ? p - o : o - p;
        sqErr = d * d / SQ_ONE;

        if (l.windowCount < WINDOW) {
            _window[l.windowCount] = uint32(sqErr);
            l.windowCount += 1;
        } else {
            l.windowSqErrSum -= _window[l.windowHead];
            _window[l.windowHead] = uint32(sqErr);
            l.windowHead = uint8((l.windowHead + 1) % WINDOW);
        }
        l.windowSqErrSum += uint64(sqErr);
        l.graded += 1;
        l.realisedPnl += int64(pnl);
        if (s == Status.Honoured) {
            l.honoured += 1;
            l.voidStreak = 0;
        } else if (s == Status.Void) {
            l.voided += 1;
            l.voidStreak += 1;
        } else if (s == Status.Lapsed) {
            l.lapsed += 1;
        } else {
            l.retracted += 1;
        }
        uint8 afterT = tier();
        if (afterT != before) emit TierChanged(before, afterT);
    }

    // ─────────────────────────────────────────────────────────────── internals: checks

    function _checkLevels(Side side, uint256 entry, uint256 target, uint256 voidPx, uint256 conf, Mandate memory m)
        internal
        pure
    {
        uint256 risk;
        uint256 reward;
        if (side == Side.Long) {
            if (!(target > entry && voidPx < entry && voidPx > 0)) revert BadLevels();
            risk = entry - voidPx;
            reward = target - entry;
        } else {
            if (!(target < entry && voidPx > entry && target > 0)) revert BadLevels();
            risk = voidPx - entry;
            reward = entry - target;
        }
        uint256 stopBps = risk * BPS / entry;
        if (stopBps > m.maxStopBps) revert StopTooWide(stopBps, m.maxStopBps);
        if (stopBps < MIN_STOP_BPS) revert StopTooTight(stopBps);
        uint256 rr = reward * 100 / risk;
        if (rr < m.minRewardRiskX100) revert RewardRiskTooLow(rr, m.minRewardRiskX100);
        // no note the agent expects to lose at its own stated odds: p·reward > (1 − p)·risk
        if (conf * (reward + risk) <= BPS * risk) revert NegativeExpectancy(conf, rr);
    }

    function _checkSpot(Asset memory a, uint256 twap, Mandate memory m) internal view {
        (, int24 tick,,,,,) = IUniswapV3PoolLike(a.pool).slot0();
        uint256 spot = _pxAtTick(a, tick);
        uint256 dev = (spot > twap ? spot - twap : twap - spot) * BPS / twap;
        if (dev > m.maxSpotDevBps) revert SpotDeviation(spot, twap, dev);
    }

    function _rollDay() internal {
        uint256 d = block.timestamp / 1 days;
        if (d != lossDay) {
            lossDay = d;
            dailyLoss = 0;
        }
    }

    // ─────────────────────────────────────────────────────────────── internals: prices

    function _twap(Asset memory a) internal view returns (uint256 px) {
        bool ok;
        (ok, px) = _tryTwap(a);
        if (!ok) revert NoTwap(a.pool);
    }

    function _tryTwap(Asset memory a) internal view returns (bool, uint256) {
        int24 tick;
        bool ok;
        (ok, tick) = _meanTick(a.pool, TWAP_WINDOW);
        if (!ok) (ok, tick) = _meanTick(a.pool, TWAP_FALLBACK);
        if (!ok) return (false, 0);
        return (true, _pxAtTick(a, tick));
    }

    function _meanTick(address pool, uint32 window) internal view returns (bool, int24) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        try IUniswapV3PoolLike(pool).observe(ago) returns (int56[] memory cum, uint160[] memory) {
            int56 delta = cum[1] - cum[0];
            int24 t = int24(delta / int56(uint56(window)));
            if (delta < 0 && (delta % int56(uint56(window)) != 0)) t--;
            return (true, t);
        } catch {
            return (false, 0);
        }
    }

    /// @dev USDT raw for 100 whole assets at `tick` = USDT per asset scaled 1e8.
    function _pxAtTick(Asset memory a, int24 tick) internal pure returns (uint256) {
        uint128 base = uint128(100 * (10 ** a.decimals));
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        // token1 per token0 = (sqrtRatio / 2^96)^2
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            return a.assetIsToken0 ? FullMath.mulDiv(ratioX192, base, 1 << 192) : FullMath.mulDiv(1 << 192, base, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            return a.assetIsToken0 ? FullMath.mulDiv(ratioX128, base, 1 << 128) : FullMath.mulDiv(1 << 128, base, ratioX128);
        }
    }

    function _usdtToAsset(uint256 usdtAmt, uint256 px8, uint8 dec) internal pure returns (uint256) {
        return FullMath.mulDiv(usdtAmt, 100 * (10 ** dec), px8);
    }

    function _assetToUsdt(uint256 amt, uint256 px8, uint8 dec) internal pure returns (uint256) {
        return FullMath.mulDiv(amt, px8, 100 * (10 ** dec));
    }

    function _valueOf(address token, uint256 amount) internal view returns (uint256) {
        if (token == usdt) return amount;
        (bool found, uint8 i) = _find(token);
        if (!found) return 0;
        Asset memory a = _assets[i];
        (bool ok, uint256 px) = _tryTwap(a);
        return ok ? _assetToUsdt(amount, px, a.decimals) : 0;
    }

    function _find(address token) internal view returns (bool, uint8) {
        for (uint8 i; i < _assets.length; i++) {
            if (_assets[i].token == token) return (true, i);
        }
        return (false, 0);
    }

    function _indexOf(address token) internal view returns (uint8) {
        (bool found, uint8 i) = _find(token);
        if (!found) revert BadAsset();
        return i;
    }

    function _lockedOf(address token) internal view returns (uint256) {
        (bool found, uint8 i) = _find(token);
        return found ? lockedAsset[i] : 0;
    }

    function _note(uint256 id) internal view returns (Note storage n) {
        if (id >= _notes.length) revert NotOutstanding(id);
        n = _notes[id];
        if (n.status != Status.Outstanding) revert NotOutstanding(id);
    }

    // ─────────────────────────────────────────────────────────────── internals: tokens and swaps

    function _swapIn(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256)
    {
        return router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _swapOut(address tokenIn, address tokenOut, uint24 fee, uint256 amountOut, uint256 maxIn)
        internal
        returns (uint256)
    {
        return router.exactOutputSingle(
            ISwapRouter02.ExactOutputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountOut: amountOut,
                amountInMaximum: maxIn,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _approve(address token, address spender) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.approve.selector, spender, type(uint256).max));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _pull(address token, address from, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _push(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
