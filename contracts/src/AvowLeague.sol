// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IAvowVaultOwner {
    function owner() external view returns (address);
    function agent() external view returns (address);
}

/// @title AvowLeague
/// @notice An open table of Avow vaults. Any vault's owner may enter it under a name; the league stores no scores.
/// Every number on the table (tier, Brier, notes) is read live from each vault, so a place cannot be bought or edited.
contract AvowLeague {
    struct Entry {
        address vault;
        address agent;
        uint64 enteredAt;
        string name;
    }

    Entry[] private entries;
    mapping(address => uint256) public indexOf; // vault => position + 1 (0 = not entered)

    event Entered(uint256 indexed id, address indexed vault, address indexed agent, string name);
    event Renamed(uint256 indexed id, string name);
    event Left(uint256 indexed id, address indexed vault);

    error NotVaultOwner();
    error AlreadyEntered();
    error NotEntered();
    error BadName();

    function enter(address vault, string calldata name) external returns (uint256 id) {
        if (IAvowVaultOwner(vault).owner() != msg.sender) revert NotVaultOwner();
        if (indexOf[vault] != 0) revert AlreadyEntered();
        if (bytes(name).length == 0 || bytes(name).length > 32) revert BadName();
        address agent = IAvowVaultOwner(vault).agent();
        entries.push(Entry(vault, agent, uint64(block.timestamp), name));
        id = entries.length - 1;
        indexOf[vault] = id + 1;
        emit Entered(id, vault, agent, name);
    }

    function rename(address vault, string calldata name) external {
        uint256 i = indexOf[vault];
        if (i == 0) revert NotEntered();
        if (IAvowVaultOwner(vault).owner() != msg.sender) revert NotVaultOwner();
        if (bytes(name).length == 0 || bytes(name).length > 32) revert BadName();
        entries[i - 1].name = name;
        emit Renamed(i - 1, name);
    }

    /// @notice The owner may take a vault off the table; its slot stays, marked by a zero vault, so ids never shift.
    function leave(address vault) external {
        uint256 i = indexOf[vault];
        if (i == 0) revert NotEntered();
        if (IAvowVaultOwner(vault).owner() != msg.sender) revert NotVaultOwner();
        delete entries[i - 1];
        indexOf[vault] = 0;
        emit Left(i - 1, vault);
    }

    function count() external view returns (uint256) {
        return entries.length;
    }

    function get(uint256 id) external view returns (Entry memory) {
        return entries[id];
    }

    function all() external view returns (Entry[] memory) {
        return entries;
    }
}
