// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WeirBase} from "./WeirBase.t.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirOffer} from "../src/WeirOffer.sol";

contract WeirOfferTest is WeirBase {
    // --------------------------------------------------------------------
    // The single most likely correctness bug in the project: claim units are
    // transferable, so a transfer must move future accrual without touching
    // either side's already-earned revenue.
    // --------------------------------------------------------------------

    function test_transfer_doesNotMoveAccruedRevenue() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(60 * USDT_UNIT, 40 * USDT_UNIT);

        uint256 funderCut = _settleRevenue(splitter, 100 * USDT_UNIT); // 15 USDT to the pool

        uint256 alicePendingBefore = offer.pending(alice);
        uint256 bobPendingBefore = offer.pending(bob);
        assertEq(alicePendingBefore, (funderCut * 60) / 100, "alice pro rata");
        assertEq(bobPendingBefore, (funderCut * 40) / 100, "bob pro rata");

        // Alice hands half her position to Bob.
        uint256 id = offer.TOKEN_ID();
        vm.prank(alice);
        offer.safeTransferFrom(alice, bob, id, 30 * USDT_UNIT, "");

        assertEq(offer.pending(alice), alicePendingBefore, "transfer stole alice's accrual");
        assertEq(offer.pending(bob), bobPendingBefore, "transfer gifted bob accrual");

        // Subsequent revenue follows the new balances: alice 30%, bob 70%.
        uint256 secondCut = _settleRevenue(splitter, 100 * USDT_UNIT);

        assertEq(offer.pending(alice), alicePendingBefore + (secondCut * 30) / 100);
        assertEq(offer.pending(bob), bobPendingBefore + (secondCut * 70) / 100);
    }

    function test_transfer_thenBothClaimFullEntitlement() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(60 * USDT_UNIT, 40 * USDT_UNIT);
        uint256 cut = _settleRevenue(splitter, 100 * USDT_UNIT);

        uint256 id = offer.TOKEN_ID();
        vm.prank(alice);
        offer.safeTransferFrom(alice, bob, id, 60 * USDT_UNIT, "");

        // Alice sold her entire position but keeps everything she earned before the sale.
        vm.prank(alice);
        offer.claim();
        assertEq(usdt.balanceOf(alice), (cut * 60) / 100);

        vm.prank(bob);
        offer.claim();
        assertEq(usdt.balanceOf(bob), (cut * 40) / 100);

        assertEq(offer.totalClaimed(), cut, "every unit of revenue accounted for");
    }

    // --------------------------------------------------------------------
    // Funding
    // --------------------------------------------------------------------

    function test_subscribe_mintsClaimUnitsOneToOne() public {
        WeirOffer offer = _pendingOffer();
        _fund(offer, alice, 40 * USDT_UNIT);

        assertEq(offer.balanceOf(alice, offer.TOKEN_ID()), 40 * USDT_UNIT);
        assertEq(offer.raised(), 40 * USDT_UNIT);
        assertEq(usdt.balanceOf(address(offer)), 40 * USDT_UNIT, "escrowed, not forwarded");
    }

    function test_subscribe_revertsOnOversubscription() public {
        WeirOffer offer = _pendingOffer();
        _fund(offer, alice, 90 * USDT_UNIT);

        usdt.mint(bob, 20 * USDT_UNIT);
        vm.startPrank(bob);
        usdt.approve(address(offer), 20 * USDT_UNIT);
        vm.expectRevert(abi.encodeWithSelector(WeirOffer.Oversubscribed.selector, 10 * USDT_UNIT));
        offer.subscribe(20 * USDT_UNIT);
        vm.stopPrank();
    }

    function test_subscribe_revertsAfterFundingEnds() public {
        WeirOffer offer = _pendingOffer();
        (,,, uint64 fundingEnds,) = offer.terms();
        vm.warp(fundingEnds + 1);

        usdt.mint(alice, 10 * USDT_UNIT);
        vm.startPrank(alice);
        usdt.approve(address(offer), 10 * USDT_UNIT);
        vm.expectRevert(WeirOffer.FundingClosed.selector);
        offer.subscribe(10 * USDT_UNIT);
        vm.stopPrank();
    }

    function test_activate_revertsBelowTarget() public {
        WeirOffer offer = _pendingOffer();
        _fund(offer, alice, 99 * USDT_UNIT);

        vm.prank(merchant);
        vm.expectRevert(WeirOffer.TargetNotReached.selector);
        factory.activateOffer(address(offer));
    }

    function test_activate_releasesEscrowToMerchant() public {
        (, WeirOffer offer) = _liveOffer(TARGET, 0);

        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Active));
        assertEq(usdt.balanceOf(merchant), factory.minProcessed() + TARGET, "eligibility volume + raise");
        assertEq(usdt.balanceOf(address(offer)), 0, "escrow fully released");
    }

    function test_refund_onlyAfterFundingEndsShortOfTarget() public {
        WeirOffer offer = _pendingOffer();
        _fund(offer, alice, 40 * USDT_UNIT);

        vm.prank(alice);
        vm.expectRevert(WeirOffer.FundingStillOpen.selector);
        offer.refund();

        (,,, uint64 fundingEnds,) = offer.terms();
        vm.warp(fundingEnds + 1);

        vm.prank(alice);
        offer.refund();

        assertEq(usdt.balanceOf(alice), 40 * USDT_UNIT);
        assertEq(offer.balanceOf(alice, offer.TOKEN_ID()), 0, "claim units burned");
        assertEq(offer.raised(), 0);
    }

    function test_refund_unreachableOnceActivated() public {
        (, WeirOffer offer) = _liveOffer(TARGET, 0);
        (,,, uint64 fundingEnds,) = offer.terms();
        vm.warp(fundingEnds + 1);

        vm.prank(alice);
        vm.expectRevert(WeirOffer.WrongState.selector);
        offer.refund();
    }

    // --------------------------------------------------------------------
    // Revenue, cap, expiry
    // --------------------------------------------------------------------

    function test_notifyRevenue_onlySplitter() public {
        (, WeirOffer offer) = _liveOffer(TARGET, 0);

        vm.prank(keeper);
        vm.expectRevert(WeirOffer.NotSplitter.selector);
        offer.notifyRevenue(1 * USDT_UNIT);
    }

    function test_totalReceivedNeverExceedsCap_andOvershootGoesToMerchant() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);

        // 15% of 1000 USDT is 150, well past the 120 cap.
        uint256 merchantBefore = usdt.balanceOf(merchant);
        _customerPays(splitter, 1000 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        assertEq(offer.totalReceived(), CAP, "capped exactly");
        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Repaid));

        // Merchant got their 85% plus the 30 USDT of overshoot.
        uint256 expected = (1000 * USDT_UNIT * (10_000 - SHARE_BPS)) / 10_000 + (150 * USDT_UNIT - CAP);
        assertEq(usdt.balanceOf(merchant) - merchantBefore, expected);

        // And the offer is unwired: later revenue is 100% the merchant's.
        assertEq(splitter.activeOffer(), address(0));
        assertEq(splitter.shareBps(), 0);
    }

    function test_repaid_stopsDivertingRevenue() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        _customerPays(splitter, 1000 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        uint256 merchantBefore = usdt.balanceOf(merchant);
        _customerPays(splitter, 50 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        assertEq(usdt.balanceOf(merchant) - merchantBefore, 50 * USDT_UNIT, "100% to merchant");
        assertEq(offer.totalReceived(), CAP, "cap unchanged");
    }

    function test_expiry_marksExpiredAndLeavesClaimingOpen() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        uint256 cut = _settleRevenue(splitter, 100 * USDT_UNIT);

        (,,,, uint64 expiresAt) = offer.terms();
        vm.warp(expiresAt + 1);

        offer.finalize();
        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Expired));
        assertFalse(offer.isAccepting());

        // Whatever accrued before expiry is still claimable.
        vm.prank(alice);
        offer.claim();
        assertEq(usdt.balanceOf(alice), cut);
    }

    function test_expiredOffer_stopsDivertingOnNextSettle() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        (,,,, uint64 expiresAt) = offer.terms();
        vm.warp(expiresAt + 1);

        uint256 merchantBefore = usdt.balanceOf(merchant);
        _customerPays(splitter, 100 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        assertEq(usdt.balanceOf(merchant) - merchantBefore, 100 * USDT_UNIT);
        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Expired));
        assertEq(splitter.activeOffer(), address(0));
    }

    // --------------------------------------------------------------------
    // Claiming
    // --------------------------------------------------------------------

    function test_claim_revertsWithNothingAccrued() public {
        (, WeirOffer offer) = _liveOffer(TARGET, 0);

        vm.prank(alice);
        vm.expectRevert(WeirOffer.NothingToClaim.selector);
        offer.claim();
    }

    function test_claim_cannotBeDrainedTwice() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        uint256 cut = _settleRevenue(splitter, 100 * USDT_UNIT);

        vm.prank(alice);
        offer.claim();
        assertEq(usdt.balanceOf(alice), cut);

        vm.prank(alice);
        vm.expectRevert(WeirOffer.NothingToClaim.selector);
        offer.claim();
    }

    function test_claim_neverExceedsPending() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(60 * USDT_UNIT, 40 * USDT_UNIT);
        _settleRevenue(splitter, 100 * USDT_UNIT);

        uint256 alicePending = offer.pending(alice);
        vm.prank(alice);
        offer.claim();
        assertEq(usdt.balanceOf(alice), alicePending);
        assertEq(offer.pending(alice), 0);

        // Bob's entitlement is untouched by Alice claiming.
        uint256 bobPending = offer.pending(bob);
        vm.prank(bob);
        offer.claim();
        assertEq(usdt.balanceOf(bob), bobPending);
    }

    function testFuzz_claimsNeverExceedRevenueReceived(uint96 paymentA, uint96 paymentB) public {
        paymentA = uint96(bound(paymentA, 1 * USDT_UNIT, 500 * USDT_UNIT));
        paymentB = uint96(bound(paymentB, 1 * USDT_UNIT, 500 * USDT_UNIT));

        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(60 * USDT_UNIT, 40 * USDT_UNIT);

        _customerPays(splitter, paymentA);
        vm.prank(keeper);
        splitter.settle();

        if (offer.isAccepting()) {
            _customerPays(splitter, paymentB);
            vm.prank(keeper);
            splitter.settle();
        }

        uint256 claimable = offer.pending(alice) + offer.pending(bob);
        assertLe(claimable, offer.totalReceived(), "cannot owe more than received");
        assertLe(offer.totalReceived(), CAP, "cap invariant");
        assertLe(claimable, usdt.balanceOf(address(offer)), "offer is solvent for every claim");
    }

    // --------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------

    function _pendingOffer() internal returns (WeirOffer offer) {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);
        vm.prank(merchant);
        offer = WeirOffer(factory.createOffer(_defaultTerms()));
    }

    /// @dev A customer payment settled through the splitter; returns the funder pool's cut.
    function _settleRevenue(MerchantSplitter splitter, uint256 payment)
        internal
        returns (uint256 funderCut)
    {
        funderCut = (payment * SHARE_BPS) / 10_000;
        _customerPays(splitter, payment);
        vm.prank(keeper);
        splitter.settle();
    }
}
