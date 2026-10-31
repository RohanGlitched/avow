// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

/// @title ERC-8004 Identity Registry (Draft, 2025-08-13), for HSK Chain
/// @notice Each agent is an ERC-721 token; its tokenURI points to the agent's registration file. Implements the Draft's
/// register / setAgentURI / metadata / agentWallet functions and its events over a minimal ERC-721.
contract IdentityRegistry {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    string public constant name = "ERC-8004 Agent";
    string public constant symbol = "AGENT";

    uint256 private next = 1; // agentIds are assigned incrementally from 1
    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private approvals;
    mapping(address => mapping(address => bool)) private operators;
    mapping(uint256 => string) private uris;
    mapping(uint256 => mapping(string => bytes)) private metadata;
    mapping(uint256 => address) private wallets;

    bytes32 private constant WALLET_TYPEHASH = keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");
    bytes32 private immutable DOMAIN;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);

    error NotAuthorized();
    error NoSuchAgent();
    error ReservedKey();
    error BadSignature();
    error Expired();
    error BadReceiver();

    constructor() {
        DOMAIN = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ERC8004 IdentityRegistry"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ── registration
    function register(string calldata agentURI, MetadataEntry[] calldata entries) external returns (uint256 agentId) {
        agentId = _register(agentURI);
        for (uint256 i; i < entries.length; i++) _setMetadata(agentId, entries[i].metadataKey, entries[i].metadataValue);
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _register(agentURI);
    }

    function register() external returns (uint256 agentId) {
        agentId = _register("");
    }

    function _register(string memory agentURI) internal returns (uint256 agentId) {
        agentId = next++;
        owners[agentId] = msg.sender;
        balances[msg.sender]++;
        uris[agentId] = agentURI;
        emit Transfer(address(0), msg.sender, agentId);
        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        uris[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        return metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function _setMetadata(uint256 agentId, string memory key, bytes memory value) internal {
        if (keccak256(bytes(key)) == keccak256("agentWallet")) revert ReservedKey();
        metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    // ── agentWallet: starts as the owner; a new wallet must sign (EIP-712); cleared on transfer
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN, keccak256(abi.encode(WALLET_TYPEHASH, agentId, newWallet, deadline))));
        if (signature.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (ecrecover(digest, v, r, s) != newWallet || newWallet == address(0)) revert BadSignature();
        wallets[agentId] = newWallet;
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(newWallet));
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        address w = wallets[agentId];
        return w == address(0) ? ownerOf(agentId) : w;
    }

    function unsetAgentWallet(uint256 agentId) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        delete wallets[agentId];
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(ownerOf(agentId)));
    }

    /// @notice True for the owner, an approved address or an operator: the parties the Reputation Registry refuses feedback from.
    function isAuthorizedOrOwner(address spender, uint256 agentId) public view returns (bool) {
        address o = ownerOf(agentId);
        return spender == o || approvals[agentId] == spender || operators[o][spender];
    }

    // ── ERC-721
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = owners[tokenId];
        if (o == address(0)) revert NoSuchAgent();
    }

    function balanceOf(address o) external view returns (uint256) {
        return balances[o];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return uris[tokenId];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !operators[o][msg.sender]) revert NotAuthorized();
        approvals[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return approvals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address o, address operator) external view returns (bool) {
        return operators[o][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (!isAuthorizedOrOwner(msg.sender, tokenId) || ownerOf(tokenId) != from) revert NotAuthorized();
        if (to == address(0)) revert BadReceiver();
        delete approvals[tokenId];
        delete wallets[tokenId];
        balances[from]--;
        balances[to]++;
        owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0 && IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) != IERC721Receiver.onERC721Received.selector) revert BadReceiver();
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC-165, ERC-721, ERC-721 metadata
    }
}
