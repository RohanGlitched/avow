// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AvowVault} from "./AvowVault.sol";
import {IdentityRegistry} from "./erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "./erc8004/ReputationRegistry.sol";

/// @title AvowGrader
/// @notice Turns every settled Avow note into ERC-8004 reputation feedback. Anyone may post a note's grade; the grade is
/// computed here from the vault's own record, and only genuine AvowVaults (by runtime code hash) can be linked, so feedback
/// from this contract's address is arithmetic, not opinion. Each settled note yields two entries:
///  - "avow-calibration": 100 − 100·(stated odds − outcome)², two decimals; the mean is 100·(1 − Brier).
///  - "avow-skill": 100·((p0 − outcome)² − (stated odds − outcome)²), where p0 = risk / (reward + risk) is the probability the
///    note's own levels imply for a forecaster with no skill. Positive only when the stated odds beat what the levels give away,
///    so easy targets claimed at high odds earn nothing.
/// The endpoint field carries "avow:<vault>:<noteId>" so readers can filter by vault.
contract AvowGrader {
    IdentityRegistry public immutable identity;
    ReputationRegistry public immutable reputation;
    bytes32 public immutable vaultCodehash;

    mapping(address => uint256) private linked; // vault => agentId + 1
    mapping(uint256 => address) public vaultOf; // agentId => its one vault
    mapping(address => mapping(uint256 => bool)) public posted;

    string public constant TAG = "avow-calibration";
    string public constant SKILL_TAG = "avow-skill";

    event Linked(address indexed vault, uint256 indexed agentId);
    event Graded(address indexed vault, uint256 indexed noteId, uint256 indexed agentId, int128 calibration, int128 skill);

    error NotAvowVault();
    error OwnersDiffer();
    error AlreadyLinked();
    error NotLinked();
    error NotSettled();
    error AlreadyPosted();

    constructor(IdentityRegistry identity_, ReputationRegistry reputation_, bytes32 vaultCodehash_) {
        identity = identity_;
        reputation = reputation_;
        vaultCodehash = vaultCodehash_;
    }

    /// @notice Links a genuine AvowVault to an ERC-8004 agent, once and for good. Anyone may call it, but only when the same
    /// address owns both the vault and the agent, so a link always reflects its owner's choice.
    function link(address vault, uint256 agentId) external {
        if (vault.codehash != vaultCodehash) revert NotAvowVault();
        if (identity.ownerOf(agentId) != AvowVault(vault).owner()) revert OwnersDiffer();
        if (linked[vault] != 0 || vaultOf[agentId] != address(0)) revert AlreadyLinked();
        linked[vault] = agentId + 1;
        vaultOf[agentId] = vault;
        emit Linked(vault, agentId);
    }

    function agentOf(address vault) external view returns (uint256) {
        uint256 a = linked[vault];
        if (a == 0) revert NotLinked();
        return a - 1;
    }

    /// @notice The grades a settled note earns, in hundredths: calibration 0 to 10000; skill −10000 to 10000.
    function gradeOf(AvowVault.Note memory n) public pure returns (int128 calibration, int128 skill) {
        if (n.status < AvowVault.Status.Honoured) revert NotSettled();
        int256 o = n.status == AvowVault.Status.Honoured ? int256(10_000) : int256(0);
        int256 p = int256(uint256(n.confidenceBps));
        uint256 reward = n.targetPx > n.entryPx ? n.targetPx - n.entryPx : n.entryPx - n.targetPx;
        uint256 risk = n.voidPx > n.entryPx ? n.voidPx - n.entryPx : n.entryPx - n.voidPx;
        int256 p0 = reward + risk == 0 ? int256(5_000) : int256((risk * 10_000) / (reward + risk));
        int256 sq = ((p - o) * (p - o)) / 10_000;
        int256 sq0 = ((p0 - o) * (p0 - o)) / 10_000;
        calibration = int128(10_000 - sq);
        skill = int128(sq0 - sq);
    }

    function post(address vault, uint256 noteId) external returns (int128 calibration, int128 skill) {
        uint256 a = linked[vault];
        if (a == 0) revert NotLinked();
        if (posted[vault][noteId]) revert AlreadyPosted();
        AvowVault.Note memory n = AvowVault(vault).getNote(noteId);
        (calibration, skill) = gradeOf(n);
        posted[vault][noteId] = true;
        string memory where = string.concat("avow:", _hex(vault), ":", _dec(noteId));
        string memory how = _word(n.status);
        reputation.giveFeedback(a - 1, calibration, 2, TAG, how, where, "", n.statementHash);
        reputation.giveFeedback(a - 1, skill, 2, SKILL_TAG, how, where, "", n.statementHash);
        emit Graded(vault, noteId, a - 1, calibration, skill);
    }

    function _word(AvowVault.Status s) internal pure returns (string memory) {
        if (s == AvowVault.Status.Honoured) return "honoured";
        if (s == AvowVault.Status.Void) return "void";
        if (s == AvowVault.Status.Lapsed) return "lapsed";
        if (s == AvowVault.Status.Retracted) return "retracted";
        return "revoked";
    }

    function _hex(address a) internal pure returns (string memory) {
        bytes memory out = new bytes(42);
        bytes16 digits = "0123456789abcdef";
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            out[i] = digits[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }

    function _dec(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t > 0; t /= 10) len++;
        bytes memory out = new bytes(len);
        for (; v > 0; v /= 10) out[--len] = bytes1(uint8(48 + (v % 10)));
        return string(out);
    }
}
