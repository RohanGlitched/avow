// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AvowVault} from "./AvowVault.sol";
import {IdentityRegistry} from "./erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "./erc8004/ReputationRegistry.sol";

/// @title AvowGrader
/// @notice Turns every settled Avow note into ERC-8004 reputation feedback. Anyone may post a note's grade; the grade is
/// computed here from the vault's own record, so feedback from this contract's address is arithmetic, not opinion:
/// value = 100 − 100·(stated odds − outcome)², two decimals, tag1 "avow-calibration", tag2 how the note ended.
/// The mean of an agent's values from this client is 100·(1 − Brier).
contract AvowGrader {
    IdentityRegistry public immutable identity;
    ReputationRegistry public immutable reputation;

    mapping(address => uint256) private linked; // vault => agentId + 1
    mapping(address => mapping(uint256 => bool)) public posted;

    string public constant TAG = "avow-calibration";

    event Linked(address indexed vault, uint256 indexed agentId);
    event Graded(address indexed vault, uint256 indexed noteId, uint256 indexed agentId, int128 value);

    error NotOwner();
    error NotLinked();
    error NotSettled();
    error AlreadyPosted();

    constructor(IdentityRegistry identity_, ReputationRegistry reputation_) {
        identity = identity_;
        reputation = reputation_;
    }

    /// @notice The vault's owner links it to an ERC-8004 agent they own. Every note the vault settles can then be posted.
    function link(address vault, uint256 agentId) external {
        if (AvowVault(vault).owner() != msg.sender || identity.ownerOf(agentId) != msg.sender) revert NotOwner();
        linked[vault] = agentId + 1;
        emit Linked(vault, agentId);
    }

    function agentOf(address vault) external view returns (uint256) {
        uint256 a = linked[vault];
        if (a == 0) revert NotLinked();
        return a - 1;
    }

    /// @notice The grade a settled note earns: 10000 − (confidence − outcome)², in hundredths (0 to 100.00).
    function gradeOf(AvowVault.Note memory n) public pure returns (int128) {
        if (n.status < AvowVault.Status.Honoured) revert NotSettled();
        uint256 outcome = n.status == AvowVault.Status.Honoured ? 10_000 : 0;
        uint256 d = n.confidenceBps > outcome ? n.confidenceBps - outcome : outcome - n.confidenceBps;
        return int128(int256(10_000 - (d * d) / 10_000));
    }

    function post(address vault, uint256 noteId) external returns (int128 value) {
        uint256 a = linked[vault];
        if (a == 0) revert NotLinked();
        if (posted[vault][noteId]) revert AlreadyPosted();
        AvowVault.Note memory n = AvowVault(vault).getNote(noteId);
        value = gradeOf(n);
        posted[vault][noteId] = true;
        reputation.giveFeedback(a - 1, value, 2, TAG, _word(n.status), "", "", n.statementHash);
        emit Graded(vault, noteId, a - 1, value);
    }

    function _word(AvowVault.Status s) internal pure returns (string memory) {
        if (s == AvowVault.Status.Honoured) return "honoured";
        if (s == AvowVault.Status.Void) return "void";
        if (s == AvowVault.Status.Lapsed) return "lapsed";
        if (s == AvowVault.Status.Retracted) return "retracted";
        return "revoked";
    }
}
