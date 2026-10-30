// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test, console} from "forge-std/Test.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {HSK} from "../script/Addresses.sol";

/// Prints the base slot of each token's balances mapping (used to fund the rehearsal fork with anvil_setStorageAt).
contract SlotsTest is Test {
    using stdStorage for StdStorage;
    function test_balanceSlots() public {
        vm.createSelectFork("hsk", HSK.FORK_BLOCK);
        address[4] memory toks = [HSK.USDT, HSK.WETH, HSK.WBTC, HSK.WHSK];
        address who = address(0xBEEF);
        for (uint256 i; i < 4; i++) {
            uint256 slot = stdstore.target(toks[i]).sig("balanceOf(address)").with_key(who).find();
            for (uint256 b; b < 300; b++) {
                if (uint256(keccak256(abi.encode(who, b))) == slot) { console.log(toks[i], "base slot", b); break; }
                if (uint256(keccak256(abi.encode(b, who))) == slot) { console.log(toks[i], "base slot (vyper order)", b); break; }
                if (b == 299) console.log(toks[i], "slot not a simple mapping", slot);
            }
        }
    }
}

interface IFeedProbe {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// Chainlink on HSK Chain refuses contract readers; this is why the vault does not use it.
contract ChainlinkWhitelistTest is Test {
    function test_chainlinkIsWhitelistedForContracts() public {
        vm.createSelectFork("hsk", HSK.FORK_BLOCK);
        vm.expectRevert(bytes("No access"));
        IFeedProbe(0xbB091f3b515059b7A887eDcC73dC2a2Fa65E0242).latestRoundData();
    }
}
