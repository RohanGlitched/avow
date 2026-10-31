// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IdentityRegistry} from "./IdentityRegistry.sol";

/// @title ERC-8004 Reputation Registry (Draft, 2025-08-13), for HSK Chain
/// @notice Any client except the agent's owner or operators may give an agent feedback: a signed fixed-point value and two tags.
/// Readers filter by client address (getSummary requires a non-empty list), so a trusted client's feedback can be read on its own.
contract ReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    IdentityRegistry private immutable identity;
    mapping(uint256 => mapping(address => Feedback[])) private feedback; // feedbackIndex = position + 1
    mapping(uint256 => address[]) private clients;
    mapping(uint256 => mapping(address => bool)) private known;
    mapping(bytes32 => address[]) private responders; // keccak(agentId, client, index) => who responded, once per response

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash);

    error SelfFeedback();
    error BadDecimals();
    error NoSuchFeedback();
    error NoClients();

    constructor(IdentityRegistry identity_) {
        identity = identity_;
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identity);
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        if (valueDecimals > 18) revert BadDecimals();
        if (identity.isAuthorizedOrOwner(msg.sender, agentId)) revert SelfFeedback(); // also reverts for an unknown agent
        Feedback[] storage list = feedback[agentId][msg.sender];
        list.push(Feedback(value, valueDecimals, false, tag1, tag2));
        if (!known[agentId][msg.sender]) {
            known[agentId][msg.sender] = true;
            clients[agentId].push(msg.sender);
        }
        emit NewFeedback(agentId, msg.sender, uint64(list.length), value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback storage f = _get(agentId, msg.sender, feedbackIndex);
        f.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string calldata responseURI, bytes32 responseHash) external {
        _get(agentId, clientAddress, feedbackIndex);
        responders[keccak256(abi.encode(agentId, clientAddress, feedbackIndex))].push(msg.sender);
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function _get(uint256 agentId, address client, uint64 index) internal view returns (Feedback storage) {
        Feedback[] storage list = feedback[agentId][client];
        if (index == 0 || index > list.length) revert NoSuchFeedback();
        return list[index - 1];
    }

    // ── reads
    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        Feedback storage f = _get(agentId, clientAddress, feedbackIndex);
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    /// @notice Count and mean of the non-revoked feedback from these clients matching the tags (an empty tag matches any).
    /// Values are brought to the largest number of decimals among the matches before averaging.
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        if (clientAddresses.length == 0) revert NoClients();
        for (uint256 c; c < clientAddresses.length; c++) {
            Feedback[] storage list = feedback[agentId][clientAddresses[c]];
            for (uint256 i; i < list.length; i++) {
                if (_match(list[i], tag1, tag2) && list[i].valueDecimals > summaryValueDecimals) summaryValueDecimals = list[i].valueDecimals;
            }
        }
        int256 sum;
        for (uint256 c; c < clientAddresses.length; c++) {
            Feedback[] storage list = feedback[agentId][clientAddresses[c]];
            for (uint256 i; i < list.length; i++) {
                if (!_match(list[i], tag1, tag2)) continue;
                sum += int256(list[i].value) * int256(10 ** (summaryValueDecimals - list[i].valueDecimals));
                count++;
            }
        }
        if (count > 0) summaryValue = int128(sum / int256(uint256(count)));
    }

    function _match(Feedback storage f, string calldata tag1, string calldata tag2) internal view returns (bool) {
        if (f.isRevoked) return false;
        if (bytes(tag1).length > 0 && keccak256(bytes(f.tag1)) != keccak256(bytes(tag1))) return false;
        if (bytes(tag2).length > 0 && keccak256(bytes(f.tag2)) != keccak256(bytes(tag2))) return false;
        return true;
    }

    function readAllFeedback(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2, bool includeRevoked)
        external
        view
        returns (
            address[] memory outClients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        )
    {
        address[] memory from = clientAddresses.length > 0 ? clientAddresses : _clients(agentId);
        uint256 n;
        for (uint256 c; c < from.length; c++) n += feedback[agentId][from[c]].length;
        outClients = new address[](n);
        feedbackIndexes = new uint64[](n);
        values = new int128[](n);
        valueDecimals = new uint8[](n);
        tag1s = new string[](n);
        tag2s = new string[](n);
        revokedStatuses = new bool[](n);
        uint256 k;
        for (uint256 c; c < from.length; c++) {
            Feedback[] storage list = feedback[agentId][from[c]];
            for (uint256 i; i < list.length; i++) {
                Feedback storage f = list[i];
                if (f.isRevoked && !includeRevoked) continue;
                if (bytes(tag1).length > 0 && keccak256(bytes(f.tag1)) != keccak256(bytes(tag1))) continue;
                if (bytes(tag2).length > 0 && keccak256(bytes(f.tag2)) != keccak256(bytes(tag2))) continue;
                (outClients[k], feedbackIndexes[k], values[k], valueDecimals[k]) = (from[c], uint64(i + 1), f.value, f.valueDecimals);
                (tag1s[k], tag2s[k], revokedStatuses[k]) = (f.tag1, f.tag2, f.isRevoked);
                k++;
            }
        }
        assembly ("memory-safe") {
            mstore(outClients, k)
            mstore(feedbackIndexes, k)
            mstore(values, k)
            mstore(valueDecimals, k)
            mstore(tag1s, k)
            mstore(tag2s, k)
            mstore(revokedStatuses, k)
        }
    }

    function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] calldata responderList) external view returns (uint64 count) {
        address[] storage all = responders[keccak256(abi.encode(agentId, clientAddress, feedbackIndex))];
        if (responderList.length == 0) return uint64(all.length);
        for (uint256 i; i < all.length; i++) {
            for (uint256 j; j < responderList.length; j++) {
                if (all[i] == responderList[j]) {
                    count++;
                    break;
                }
            }
        }
    }

    function _clients(uint256 agentId) internal view returns (address[] memory) {
        return clients[agentId];
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return clients[agentId];
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return uint64(feedback[agentId][clientAddress].length);
    }
}
