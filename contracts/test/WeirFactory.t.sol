// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WeirBase} from "./WeirBase.t.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirFactory} from "../src/WeirFactory.sol";
import {WeirOffer} from "../src/WeirOffer.sol";

contract WeirFactoryTest is WeirBase {
    function test_minProcessed_derivedFromTokenDecimals() public view {
        assertEq(factory.usdtDecimals(), 6, "read from the token, never assumed");
        assertEq(factory.minProcessed(), 10 * USDT_UNIT);
    }

    function test_predictSplitter_matchesDeployedAddress() public {
        address predicted = factory.predictSplitter(merchant);

        // A merchant can publish this as their payment address before paying for deployment.
        MerchantSplitter splitter = _deploySplitter();

        assertEq(address(splitter), predicted);
        assertEq(splitter.merchant(), merchant);
        assertEq(splitter.factory(), address(factory));
    }

    function test_createSplitter_onePerMerchant() public {
        _deploySplitter();

        vm.prank(merchant);
        vm.expectRevert(WeirFactory.SplitterExists.selector);
        factory.createSplitter();
    }

    function test_createOffer_requiresSplitter() public {
        vm.prank(merchant);
        vm.expectRevert(WeirFactory.NoSplitter.selector);
        factory.createOffer(_defaultTerms());
    }

    // --------------------------------------------------------------------
    // The eligibility gate: payment history is the credit assessment
    // --------------------------------------------------------------------

    function test_eligibilityGate_blocksMerchantWithNoHistory() public {
        MerchantSplitter splitter = _deploySplitter();
        bytes memory notEligible =
            abi.encodeWithSelector(WeirFactory.NotEligible.selector, 0, factory.minProcessed());

        (bool eligible, uint256 processed) = factory.isEligible(merchant);
        assertFalse(eligible);
        assertEq(processed, 0);

        vm.prank(merchant);
        vm.expectRevert(notEligible);
        factory.createOffer(_defaultTerms());

        // Revenue that merely sits at the splitter does not count — it must be settled.
        _customerPays(splitter, 50 * USDT_UNIT);
        vm.prank(merchant);
        vm.expectRevert(notEligible);
        factory.createOffer(_defaultTerms());
    }

    function test_eligibilityGate_opensAfterEnoughSettledVolume() public {
        MerchantSplitter splitter = _deploySplitter();
        _customerPays(splitter, factory.minProcessed());
        vm.prank(keeper);
        splitter.settle();

        (bool eligible, uint256 processed) = factory.isEligible(merchant);
        assertTrue(eligible);
        assertEq(processed, factory.minProcessed());

        vm.prank(merchant);
        address offer = factory.createOffer(_defaultTerms());

        assertTrue(factory.isOffer(offer));
        assertEq(factory.offersCount(), 1);
        assertEq(factory.offersOf(merchant).length, 1);
    }

    // --------------------------------------------------------------------
    // One live offer at a time
    // --------------------------------------------------------------------

    function test_createOffer_blockedWhileAnotherIsLive() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);

        vm.prank(merchant);
        address first = factory.createOffer(_defaultTerms());

        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(WeirFactory.OfferStillLive.selector, first));
        factory.createOffer(_defaultTerms());
    }

    function test_createOffer_allowedAfterFailedRaiseGoesStale() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);

        vm.prank(merchant);
        address first = factory.createOffer(_defaultTerms());

        // Raise never filled; funding window closes. The merchant is not locked out forever.
        (,,, uint64 fundingEnds,) = WeirOffer(first).terms();
        vm.warp(fundingEnds + 1);

        vm.prank(merchant);
        address second = factory.createOffer(_defaultTerms());

        assertTrue(second != first);
        assertEq(factory.offersCount(), 2);
    }

    function test_createOffer_allowedAfterPreviousOfferRepaid() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);

        _customerPays(splitter, 1000 * USDT_UNIT); // blows past the cap
        vm.prank(keeper);
        splitter.settle();
        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Repaid));

        vm.prank(merchant);
        address second = factory.createOffer(_defaultTerms());
        assertTrue(second != address(offer));
    }

    // --------------------------------------------------------------------
    // Activation
    // --------------------------------------------------------------------

    function test_activateOffer_onlyMerchant() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);
        vm.prank(merchant);
        WeirOffer offer = WeirOffer(factory.createOffer(_defaultTerms()));
        _fund(offer, alice, TARGET);

        vm.prank(alice);
        vm.expectRevert(WeirFactory.NotMerchant.selector);
        factory.activateOffer(address(offer));
    }

    function test_activateOffer_rejectsUnknownOffer() public {
        vm.prank(merchant);
        vm.expectRevert(WeirFactory.UnknownOffer.selector);
        factory.activateOffer(address(0xBEEF));
    }

    function test_activateOffer_wiresSplitter() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);

        assertEq(splitter.activeOffer(), address(offer));
        assertEq(splitter.shareBps(), SHARE_BPS);
    }

    function test_activateOffer_unwiresFinishedOfferFirst() public {
        (MerchantSplitter splitter, WeirOffer first) = _liveOffer(TARGET, 0);

        // First offer expires unrepaid; the splitter still points at it.
        (,,,, uint64 expiresAt) = first.terms();
        vm.warp(expiresAt + 1);
        assertEq(splitter.activeOffer(), address(first));

        vm.prank(merchant);
        WeirOffer second = WeirOffer(factory.createOffer(_defaultTerms()));
        _fund(second, bob, TARGET);

        // Activation clears the stale offer without needing a settlement first.
        vm.prank(merchant);
        factory.activateOffer(address(second));

        assertEq(splitter.activeOffer(), address(second));
        assertEq(uint8(first.state()), uint8(WeirOffer.State.Expired));
    }

    // --------------------------------------------------------------------
    // Registry reads (no indexer on chain 677)
    // --------------------------------------------------------------------

    function test_offersSlice_pagesWithoutRunningOffTheEnd() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);

        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(merchant);
            address offer = factory.createOffer(_defaultTerms());
            (,,, uint64 fundingEnds,) = WeirOffer(offer).terms();
            vm.warp(fundingEnds + 1);
        }

        assertEq(factory.offersSlice(0, 2).length, 2);
        assertEq(factory.offersSlice(2, 10).length, 1, "clamps to the end");
        assertEq(factory.offersSlice(99, 10).length, 0, "past the end is empty, not a revert");
    }
}
