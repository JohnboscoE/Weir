// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirFactory} from "../src/WeirFactory.sol";
import {WeirOffer} from "../src/WeirOffer.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

/// @dev Shared harness. Everything runs against the hostile MockUSDT: no boolean returns,
///      6 decimals, so the tests exercise the same edge cases bridged USDT might present.
abstract contract WeirBase is Test {
    MockUSDT internal usdt;
    WeirFactory internal factory;

    address internal merchant = makeAddr("merchant");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal keeper = makeAddr("keeper");

    uint256 internal constant USDT_UNIT = 1e6; // MockUSDT has 6 decimals

    uint256 internal constant TARGET = 100 * USDT_UNIT;
    uint256 internal constant CAP = 120 * USDT_UNIT;
    uint16 internal constant SHARE_BPS = 1_500; // 15%

    function setUp() public virtual {
        usdt = new MockUSDT();
        factory = new WeirFactory(address(usdt));

        // Start well past the epoch so `fundingEnds` arithmetic is never negative.
        vm.warp(1_700_000_000);
    }

    // --------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------

    function _defaultTerms() internal view returns (WeirOffer.Terms memory) {
        return WeirOffer.Terms({
            target: TARGET,
            cap: CAP,
            shareBps: SHARE_BPS,
            fundingEnds: uint64(block.timestamp + 3 days),
            expiresAt: uint64(block.timestamp + 90 days)
        });
    }

    function _deploySplitter() internal returns (MerchantSplitter) {
        vm.prank(merchant);
        return MerchantSplitter(factory.createSplitter());
    }

    /// @dev A customer paying the merchant: USDT simply appears at the splitter.
    function _customerPays(MerchantSplitter splitter, uint256 amount) internal {
        usdt.mint(address(splitter), amount);
    }

    /// @dev Push enough volume through the splitter to clear the eligibility gate.
    function _makeEligible(MerchantSplitter splitter) internal {
        _customerPays(splitter, factory.minProcessed());
        vm.prank(keeper);
        splitter.settle();
    }

    function _fund(WeirOffer offer, address funder, uint256 amount) internal {
        usdt.mint(funder, amount);
        vm.startPrank(funder);
        usdt.approve(address(offer), amount);
        offer.subscribe(amount);
        vm.stopPrank();
    }

    /// @dev Eligible merchant, fully funded offer, activated and wired to the splitter.
    function _liveOffer(uint256 aliceAmount, uint256 bobAmount)
        internal
        returns (MerchantSplitter splitter, WeirOffer offer)
    {
        splitter = _deploySplitter();
        _makeEligible(splitter);

        vm.prank(merchant);
        offer = WeirOffer(factory.createOffer(_defaultTerms()));

        if (aliceAmount > 0) _fund(offer, alice, aliceAmount);
        if (bobAmount > 0) _fund(offer, bob, bobAmount);

        vm.prank(merchant);
        factory.activateOffer(address(offer));
    }
}
