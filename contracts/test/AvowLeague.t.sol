// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AvowLeague} from "../src/AvowLeague.sol";

contract FakeVault {
    address public owner;
    address public agent;

    constructor(address o, address a) {
        owner = o;
        agent = a;
    }
}

contract AvowLeagueTest is Test {
    AvowLeague league;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    FakeVault va;

    function setUp() public {
        league = new AvowLeague();
        va = new FakeVault(alice, address(0xA6E));
    }

    function test_onlyTheVaultOwnerCanEnter() public {
        vm.prank(bob);
        vm.expectRevert(AvowLeague.NotVaultOwner.selector);
        league.enter(address(va), "Mine now");

        vm.prank(alice);
        uint256 id = league.enter(address(va), "Avow");
        AvowLeague.Entry memory e = league.get(id);
        assertEq(e.vault, address(va));
        assertEq(e.agent, address(0xA6E));
        assertEq(e.name, "Avow");
        assertEq(league.count(), 1);
    }

    function test_aVaultEntersOnceAndNamesAreBounded() public {
        vm.startPrank(alice);
        vm.expectRevert(AvowLeague.BadName.selector);
        league.enter(address(va), "");
        vm.expectRevert(AvowLeague.BadName.selector);
        league.enter(address(va), "a name that is far too long for the league table");
        league.enter(address(va), "Avow");
        vm.expectRevert(AvowLeague.AlreadyEntered.selector);
        league.enter(address(va), "Avow again");
        vm.stopPrank();
    }

    function test_leavingKeepsIdsStableAndAllowsReentry() public {
        FakeVault vb = new FakeVault(bob, address(0xB6E));
        vm.prank(alice);
        league.enter(address(va), "Avow");
        vm.prank(bob);
        league.enter(address(vb), "Bold");

        vm.prank(bob);
        vm.expectRevert(AvowLeague.NotVaultOwner.selector);
        league.leave(address(va));

        vm.prank(alice);
        league.leave(address(va));
        assertEq(league.get(0).vault, address(0));
        assertEq(league.get(1).name, "Bold");
        assertEq(league.indexOf(address(va)), 0);

        vm.prank(alice);
        uint256 id = league.enter(address(va), "Avow");
        assertEq(id, 2);
    }

    function test_renameNeedsTheOwner() public {
        vm.prank(alice);
        league.enter(address(va), "Avow");
        vm.prank(bob);
        vm.expectRevert(AvowLeague.NotVaultOwner.selector);
        league.rename(address(va), "Hijacked");
        vm.prank(alice);
        league.rename(address(va), "Avow v2");
        assertEq(league.get(0).name, "Avow v2");
    }
}
