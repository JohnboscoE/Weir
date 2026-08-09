// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {WeirBase} from "./WeirBase.t.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirOffer} from "../src/WeirOffer.sol";

contract MerchantSplitterTest is WeirBase {
    function test_settle_revertsOnZeroBalance() public {
        MerchantSplitter splitter = _deploySplitter();

        vm.prank(keeper);
        vm.expectRevert(MerchantSplitter.NothingToSettle.selector);
        splitter.settle();
    }

    function test_settle_isPermissionless() public {
        MerchantSplitter splitter = _deploySplitter();
        _customerPays(splitter, 50 * USDT_UNIT);

        // A stranger, not the merchant, sweeps it — and the merchant still gets the money.
        vm.prank(keeper);
        splitter.settle();

        assertEq(usdt.balanceOf(merchant), 50 * USDT_UNIT);
        assertEq(usdt.balanceOf(keeper), 0, "caller earns nothing");
    }

    function test_settle_withoutOffer_sendsEverythingToMerchant() public {
        MerchantSplitter splitter = _deploySplitter();
        _customerPays(splitter, 30 * USDT_UNIT);
        _customerPays(splitter, 20 * USDT_UNIT); // batched: two payments, one settlement

        vm.prank(keeper);
        splitter.settle();

        assertEq(usdt.balanceOf(merchant), 50 * USDT_UNIT);
        assertEq(splitter.lifetimeProcessed(), 50 * USDT_UNIT);
        assertEq(usdt.balanceOf(address(splitter)), 0);
    }

    function test_settle_withOffer_splitsByShareBps() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        uint256 merchantBefore = usdt.balanceOf(merchant);

        _customerPays(splitter, 200 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        uint256 funderCut = (200 * USDT_UNIT * SHARE_BPS) / 10_000;
        assertEq(usdt.balanceOf(address(offer)), funderCut);
        assertEq(usdt.balanceOf(merchant) - merchantBefore, 200 * USDT_UNIT - funderCut);
        assertEq(offer.totalReceived(), funderCut);
    }

    function test_lifetimeProcessed_countsFullAmountNotMerchantCut() public {
        (MerchantSplitter splitter,) = _liveOffer(TARGET, 0);
        uint256 processedBefore = splitter.lifetimeProcessed();

        _customerPays(splitter, 200 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        assertEq(splitter.lifetimeProcessed() - processedBefore, 200 * USDT_UNIT);
    }

    function test_setActiveOffer_onlyFactory() public {
        MerchantSplitter splitter = _deploySplitter();

        vm.prank(merchant);
        vm.expectRevert(MerchantSplitter.NotFactory.selector);
        splitter.setActiveOffer(address(0xBEEF), 5_000);
    }

    function test_refreshActiveOffer_isIdempotentNoop() public {
        MerchantSplitter bare = _deploySplitter();
        bare.refreshActiveOffer(); // no offer wired: must not revert
        assertEq(bare.activeOffer(), address(0));

        _makeEligible(bare);
        vm.prank(merchant);
        WeirOffer offer = WeirOffer(factory.createOffer(_defaultTerms()));
        _fund(offer, alice, TARGET);
        vm.prank(merchant);
        factory.activateOffer(address(offer));

        bare.refreshActiveOffer(); // still accepting: must not unwire
        assertEq(bare.activeOffer(), address(offer));
        assertEq(bare.shareBps(), SHARE_BPS);
    }

    // --------------------------------------------------------------------
    // Fee-on-transfer USDT
    // --------------------------------------------------------------------

    function test_feeOnTransfer_accountsByBalanceDelta() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);

        usdt.setFeeBps(100); // 1% burned on every transfer
        uint256 merchantBefore = usdt.balanceOf(merchant);

        _customerPays(splitter, 200 * USDT_UNIT);
        vm.prank(keeper);
        splitter.settle();

        uint256 funderCut = (200 * USDT_UNIT * SHARE_BPS) / 10_000; // 30 requested
        uint256 merchantCut = 200 * USDT_UNIT - funderCut; // 170 requested

        // The offer is credited with what actually landed, not what was sent.
        uint256 netToOffer = funderCut - (funderCut / 100);
        assertEq(usdt.balanceOf(address(offer)), netToOffer);
        assertEq(offer.totalReceived(), netToOffer, "accrual matches real receipts");
        assertEq(usdt.balanceOf(merchant) - merchantBefore, merchantCut - (merchantCut / 100));

        // The claim must still be payable in full from the offer's real balance.
        uint256 pendingAlice = offer.pending(alice);
        assertLe(pendingAlice, usdt.balanceOf(address(offer)));
    }

    function test_feeOnTransfer_subscriptionCreditsNetAmount() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);
        vm.prank(merchant);
        WeirOffer offer = WeirOffer(factory.createOffer(_defaultTerms()));

        usdt.setFeeBps(100);
        _fund(offer, alice, 100 * USDT_UNIT);

        // 1% was taken in flight, so the funder is credited 99, not 100.
        assertEq(offer.raised(), 99 * USDT_UNIT);
        assertEq(offer.balanceOf(alice, offer.TOKEN_ID()), 99 * USDT_UNIT);
        assertEq(usdt.balanceOf(address(offer)), 99 * USDT_UNIT, "escrow matches claim units");
    }

    // --------------------------------------------------------------------
    // Conservation
    // --------------------------------------------------------------------

    /// @dev Nothing is created or destroyed: every USDT that entered the system ends up
    ///      with the merchant, a funder, or still held by one of the contracts.
    function test_conservation_acrossFullLifecycle() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(60 * USDT_UNIT, 40 * USDT_UNIT);

        uint256 minted = factory.minProcessed() + TARGET; // eligibility volume + funder capital

        for (uint256 i = 0; i < 5; ++i) {
            _customerPays(splitter, 100 * USDT_UNIT);
            minted += 100 * USDT_UNIT;
            vm.prank(keeper);
            splitter.settle();

            if (offer.pending(alice) > 0) {
                vm.prank(alice);
                offer.claim();
            }
        }

        vm.prank(bob);
        offer.claim();

        uint256 held = usdt.balanceOf(merchant) + usdt.balanceOf(alice) + usdt.balanceOf(bob)
            + usdt.balanceOf(address(offer)) + usdt.balanceOf(address(splitter));

        assertEq(held, minted, "USDT conserved end to end");
        assertEq(usdt.totalSupply(), minted, "no fee configured, nothing burned");
    }
}
