// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DictumVault} from "../src/DictumVault.sol";

/// HSK Chain mainnet (chain 177): HSKSwap, tokens and Chainlink feeds, checked on hsk.blockscout.com on Oct 31 2026.
/// The Chainlink proxies are read-whitelisted (contracts get "No access"), so only the agent reads them, off chain.
library HSK {
    address internal constant USDT = 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029;
    address internal constant WETH = 0xefd4bC9afD210517803f293ABABd701CaeeCdfd0;
    address internal constant WBTC = 0x6119CA49a79f5825C8B345F8d7aC36B272565b14;
    address internal constant WHSK = 0xB210D2120d57b758EE163cFfb43e73728c471Cf1;
    address internal constant ROUTER = 0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3;
    address internal constant QUOTER = 0x603f70466fDdbE3F238220B9a74FFF419a2BbFDD;
    address internal constant FACTORY = 0x972cA9D1662F5e029cD18327D29026532E84c742;
    address internal constant POOL_WETH = 0xb92b79ed6b370D5cFee2E14B1D0983C258304C16;
    address internal constant POOL_WBTC = 0xd9EA2cE468957Ba49cCC38C4758Ed6ecD561449A;
    address internal constant POOL_WHSK = 0x4ff515761864e7838B0AdB8b5b2B8B7A068905dC;
    address internal constant FEED_ETH = 0xbB091f3b515059b7A887eDcC73dC2a2Fa65E0242;
    address internal constant FEED_BTC = 0x204ED500ab56A2E19B051561258E3A45c850360F;
    address internal constant FEED_HSK = 0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b;
    address internal constant FEED_USDT = 0x823d7f90f7A3498DB6595886b6B5dC95E6B0B7f3;

    function assets() internal pure returns (DictumVault.Asset[] memory a) {
        a = new DictumVault.Asset[](3);
        a[0] = DictumVault.Asset(WETH, POOL_WETH, 3000, 0, false);
        a[1] = DictumVault.Asset(WBTC, POOL_WBTC, 3000, 0, false);
        a[2] = DictumVault.Asset(WHSK, POOL_WHSK, 3000, 0, false);
    }

    function defaultMandate() internal pure returns (DictumVault.Mandate memory) {
        return DictumVault.Mandate({
            maxSlippageBps: 60,
            maxSpotDevBps: 100,
            maxStopBps: 800,
            minRewardRiskX100: 120,
            maxDrawdownBps: 1500,
            cooldown: 600,
            maxHorizon: 24 hours,
            maxNotional: 50e6,
            maxExposure: 150e6,
            dailyLossLimit: 10e6,
            assetMask: 7,
            paused: false
        });
    }
}
