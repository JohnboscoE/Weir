// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {WeirBase} from "./WeirBase.t.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirOffer} from "../src/WeirOffer.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

/// @dev Minting claim units invokes the ERC-1155 acceptance hook, which is the one place an
///      attacker gets control mid-`subscribe`. It tries to subscribe again from there.
contract ReentrantSubscriber is ERC1155Holder {
    WeirOffer public offer;
    MockUSDT public usdt;
    bool internal reentered;

    constructor(WeirOffer offer_, MockUSDT usdt_) {
        offer = offer_;
        usdt = usdt_;
    }

    function attack(uint256 amount) external {
        usdt.approve(address(offer), type(uint256).max);
        offer.subscribe(amount);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory)
        public
        override
        returns (bytes4)
    {
        if (!reentered) {
            reentered = true;
            offer.subscribe(1); // must be blocked by the guard
        }
        return this.onERC1155Received.selector;
    }
}

/// @dev Claims its revenue from inside the acceptance hook when it receives claim units.
///      This is legitimate — `_update` has already settled both sides' accrual by then —
///      so it must succeed *and* pay out exactly nothing extra.
contract ClaimOnReceive is ERC1155Holder {
    WeirOffer public offer;
    uint256 public claimedDuringReceive;

    constructor(WeirOffer offer_) {
        offer = offer_;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes memory)
        public
        override
        returns (bytes4)
    {
        if (offer.pending(address(this)) > 0) {
            claimedDuringReceive = offer.pending(address(this));
            offer.claim();
        }
        return this.onERC1155Received.selector;
    }

    function claim() external {
        offer.claim();
    }
}

contract ReentrancyTest is WeirBase {
    function test_subscribe_blocksReentrancyFromAcceptanceHook() public {
        MerchantSplitter splitter = _deploySplitter();
        _makeEligible(splitter);
        vm.prank(merchant);
        WeirOffer offer = WeirOffer(factory.createOffer(_defaultTerms()));

        ReentrantSubscriber attacker = new ReentrantSubscriber(offer, usdt);
        usdt.mint(address(attacker), 50 * USDT_UNIT);

        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        attacker.attack(10 * USDT_UNIT);
    }

    function test_claimFromAcceptanceHook_paysExactEntitlementOnly() public {
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);
        uint256 cut = _settleRevenueOnce(splitter, 100 * USDT_UNIT);

        ClaimOnReceive receiver = new ClaimOnReceive(offer);
        uint256 id = offer.TOKEN_ID();

        // Alice sells half her position to a contract that immediately tries to claim.
        vm.prank(alice);
        offer.safeTransferFrom(alice, address(receiver), id, TARGET / 2, "");

        // The receiver had accrued nothing before the transfer, so it gets nothing.
        assertEq(receiver.claimedDuringReceive(), 0, "hook must not capture alice's accrual");
        assertEq(usdt.balanceOf(address(receiver)), 0);

        // Alice's earnings survived the transfer intact.
        assertEq(offer.pending(alice), cut);
        vm.prank(alice);
        offer.claim();
        assertEq(usdt.balanceOf(alice), cut);

        // Going forward the receiver earns on its half.
        uint256 nextCut = _settleRevenueOnce(splitter, 100 * USDT_UNIT);
        receiver.claim();
        assertEq(usdt.balanceOf(address(receiver)), nextCut / 2);
    }

    function test_settle_guardHoldsAcrossOfferCallback() public {
        // settle() -> notifyRevenue() -> finalize() re-enters neither contract's guarded path.
        (MerchantSplitter splitter, WeirOffer offer) = _liveOffer(TARGET, 0);

        _customerPays(splitter, 1000 * USDT_UNIT); // overshoots the cap in one settlement
        vm.prank(keeper);
        splitter.settle();

        assertEq(uint8(offer.state()), uint8(WeirOffer.State.Repaid));
        assertEq(splitter.activeOffer(), address(0));
    }

    function _settleRevenueOnce(MerchantSplitter splitter, uint256 payment)
        internal
        returns (uint256 funderCut)
    {
        funderCut = (payment * SHARE_BPS) / 10_000;
        _customerPays(splitter, payment);
        vm.prank(keeper);
        splitter.settle();
    }
}
