// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AvowVault} from "../src/AvowVault.sol";
import {AvowGrader} from "../src/AvowGrader.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";

contract NotesVault {
    address public owner;
    mapping(uint256 => AvowVault.Note) private notes;

    constructor(address o) {
        owner = o;
    }

    function put(uint256 id, AvowVault.Status s, uint16 conf) external {
        notes[id].status = s;
        notes[id].confidenceBps = conf;
        notes[id].statementHash = keccak256(abi.encode(id));
    }

    function getNote(uint256 id) external view returns (AvowVault.Note memory) {
        return notes[id];
    }
}

contract AvowGraderTest is Test {
    IdentityRegistry id;
    ReputationRegistry rep;
    AvowGrader grader;
    NotesVault vault;
    address owner = address(0xA11CE);
    address stranger = address(0x5EE);
    uint256 agentId;

    function setUp() public {
        id = new IdentityRegistry();
        rep = new ReputationRegistry(id);
        grader = new AvowGrader(id, rep);
        vault = new NotesVault(owner);
        vm.prank(owner);
        agentId = id.register("data:application/json;base64,e30=");
        vm.prank(owner);
        grader.link(address(vault), agentId);
    }

    function test_identityIsAnErc721WithIncrementalIds() public {
        assertEq(agentId, 1);
        assertEq(id.ownerOf(1), owner);
        assertEq(id.balanceOf(owner), 1);
        assertEq(id.getAgentWallet(1), owner);
        vm.prank(stranger);
        assertEq(id.register(), 2);
        vm.prank(stranger);
        vm.expectRevert(IdentityRegistry.NotAuthorized.selector);
        id.setAgentURI(1, "https://evil");
    }

    function test_agentWalletIsReservedAndClearedOnTransfer() public {
        vm.prank(owner);
        vm.expectRevert(IdentityRegistry.ReservedKey.selector);
        id.setMetadata(1, "agentWallet", hex"01");
        (address w, uint256 k) = makeAddrAndKey("wallet");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                        keccak256("ERC8004 IdentityRegistry"),
                        keccak256("1"),
                        block.chainid,
                        address(id)
                    )
                ),
                keccak256(abi.encode(keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)"), uint256(1), w, block.timestamp + 60))
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(k, digest);
        vm.prank(owner);
        id.setAgentWallet(1, w, block.timestamp + 60, abi.encodePacked(r, s, v));
        assertEq(id.getAgentWallet(1), w);
        vm.prank(owner);
        id.transferFrom(owner, stranger, 1);
        assertEq(id.getAgentWallet(1), stranger);
    }

    function test_theOwnerCannotReviewTheirOwnAgent() public {
        vm.prank(owner);
        vm.expectRevert(ReputationRegistry.SelfFeedback.selector);
        rep.giveFeedback(1, 100, 0, "starred", "", "", "", bytes32(0));
        vm.prank(stranger);
        rep.giveFeedback(1, 80, 0, "starred", "", "", "", bytes32(0));
        assertEq(rep.getLastIndex(1, stranger), 1);
    }

    function test_gradesAreTheVaultsArithmetic() public {
        vault.put(0, AvowVault.Status.Honoured, 8000); // right at 80%: 1 − 0.2² = 0.96
        vault.put(1, AvowVault.Status.Void, 8000); // wrong at 80%: 1 − 0.8² = 0.36
        vault.put(2, AvowVault.Status.Lapsed, 5000); // a miss at 50%: 0.75
        vm.startPrank(stranger); // anyone may post
        assertEq(grader.post(address(vault), 0), 9600);
        assertEq(grader.post(address(vault), 1), 3600);
        assertEq(grader.post(address(vault), 2), 7500);
        vm.expectRevert(AvowGrader.AlreadyPosted.selector);
        grader.post(address(vault), 0);
        vm.stopPrank();

        address[] memory from = new address[](1);
        from[0] = address(grader);
        (uint64 n, int128 mean, uint8 dec) = rep.getSummary(1, from, "avow-calibration", "");
        assertEq(n, 3);
        assertEq(dec, 2);
        assertEq(mean, 6900); // 100·(1 − Brier): Brier = (0.04 + 0.64 + 0.25) / 3 = 0.31
        (int128 v,, string memory t1, string memory t2,) = rep.readFeedback(1, address(grader), 2);
        assertEq(v, 3600);
        assertEq(t1, "avow-calibration");
        assertEq(t2, "void");
    }

    function test_onlySettledNotesOfLinkedVaultsArePosted() public {
        vault.put(0, AvowVault.Status.Outstanding, 7000);
        vm.expectRevert(AvowGrader.NotSettled.selector);
        grader.post(address(vault), 0);
        NotesVault other = new NotesVault(stranger);
        other.put(0, AvowVault.Status.Honoured, 7000);
        vm.expectRevert(AvowGrader.NotLinked.selector);
        grader.post(address(other), 0);
        vm.prank(stranger); // owns the vault but not the agent
        vm.expectRevert(AvowGrader.NotOwner.selector);
        grader.link(address(other), agentId);
    }

    function test_revokedFeedbackLeavesTheSummary() public {
        vm.startPrank(stranger);
        rep.giveFeedback(1, 50, 0, "starred", "", "", "", bytes32(0));
        rep.giveFeedback(1, 90, 0, "starred", "", "", "", bytes32(0));
        rep.revokeFeedback(1, 1);
        vm.stopPrank();
        address[] memory from = new address[](1);
        from[0] = stranger;
        (uint64 n, int128 mean,) = rep.getSummary(1, from, "starred", "");
        assertEq(n, 1);
        assertEq(mean, 90);
        (address[] memory c,,,,,,) = rep.readAllFeedback(1, new address[](0), "", "", false);
        assertEq(c.length, 1);
        vm.expectRevert(ReputationRegistry.NoClients.selector);
        rep.getSummary(1, new address[](0), "", "");
    }

    function testFuzz_gradeIsBetweenZeroAndOneHundred(uint16 conf, bool honoured) public view {
        conf = uint16(bound(conf, 5000, 9900));
        AvowVault.Note memory n;
        n.status = honoured ? AvowVault.Status.Honoured : AvowVault.Status.Void;
        n.confidenceBps = conf;
        int128 g = grader.gradeOf(n);
        assertGe(g, 0);
        assertLe(g, 10_000);
    }
}
