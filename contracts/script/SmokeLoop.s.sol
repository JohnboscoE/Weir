// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {MerchantSplitter} from "../src/MerchantSplitter.sol";
import {WeirFactory} from "../src/WeirFactory.sol";
import {WeirOffer} from "../src/WeirOffer.sol";

/// @notice Drives the whole business loop once against a live deployment, with real USDT.
///
/// @dev    Exists to answer the one question `docs/chain-677.md` could not settle by
///         reading: does the bridged token take a transfer fee? Nothing short of moving
///         real units through the splitter can tell you, and finding out during the demo
///         video is the wrong time.
///
///         Principal is not spent. `settle()` with no active offer returns the full
///         balance to the merchant, and `claim()` returns the funder's share, so the USDT
///         ends the run back in the caller's hands. Gas is the only real expenditure.
///
///         The merchant subscribes to their own offer here. Nothing in the contracts
///         forbids it and for a mechanics check it removes the need for a second funded
///         key — but it is not how the demo should be filmed, where merchant and funder
///         want to be visibly different addresses.
///
///         Run with:
///           FACTORY=0x… WORKING=2000000 \
///           forge script script/SmokeLoop.s.sol --rpc-url bot_mainnet \
///             --account <keystore> --sender <addr> --broadcast
contract SmokeLoop is Script {
    using SafeERC20 for IERC20;

    /// @dev Fraction of the working amount raised, and the repayment multiple on it. The
    ///      cap must exceed the target, and both must stay inside one working amount so a
    ///      single settlement can carry the offer all the way to Repaid.
    uint256 constant TARGET_NUMERATOR = 1;
    uint256 constant TARGET_DENOMINATOR = 2;
    uint256 constant CAP_BPS = 12_000; // 1.2x the target

    /// @dev Everything to funders until the cap, so the loop closes in one settlement.
    uint16 constant SHARE_BPS = 10_000;

    function run() external {
        WeirFactory factory = WeirFactory(vm.envAddress("FACTORY"));
        uint256 working = vm.envOr("WORKING", uint256(2_000_000));

        address me = msg.sender;
        IERC20 usdt = IERC20(factory.usdt());

        require(block.chainid == 677, "SmokeLoop is for mainnet 677");

        uint256 startBalance = usdt.balanceOf(me);
        console.log("chainid:      ", block.chainid);
        console.log("caller:       ", me);
        console.log("usdt balance: ", startBalance);
        console.log("working:      ", working);
        require(startBalance >= working, "working amount exceeds USDT balance");

        vm.startBroadcast();

        MerchantSplitter splitter = _splitter(factory, me);

        _becomeEligible(factory, splitter, usdt, working);

        WeirOffer offer = _openAndFund(factory, usdt, working);

        _repay(splitter, offer, usdt, working);

        vm.stopBroadcast();

        _report(offer, usdt, me, startBalance);
    }

    // ------------------------------------------------------------------
    // Steps
    // ------------------------------------------------------------------

    function _splitter(WeirFactory factory, address me) internal returns (MerchantSplitter) {
        address existing = factory.splitterOf(me);
        if (existing != address(0)) {
            console.log("splitter (existing):", existing);
            return MerchantSplitter(existing);
        }

        address created = factory.createSplitter();
        console.log("splitter (created): ", created);
        return MerchantSplitter(created);
    }

    /// @dev Recycles the same USDT until the eligibility counter clears the gate. The
    ///      counter is cumulative and settling with no active offer refunds everything, so
    ///      a small working amount reaches the threshold in more passes rather than
    ///      needing more principal.
    function _becomeEligible(
        WeirFactory factory,
        MerchantSplitter splitter,
        IERC20 usdt,
        uint256 working
    ) internal {
        uint256 gate = factory.minProcessed();

        while (splitter.lifetimeProcessed() < gate) {
            usdt.safeTransfer(address(splitter), working);
            splitter.settle();
            console.log("lifetimeProcessed:", splitter.lifetimeProcessed());
        }

        console.log("eligible at gate: ", gate);
    }

    function _openAndFund(WeirFactory factory, IERC20 usdt, uint256 working)
        internal
        returns (WeirOffer offer)
    {
        uint256 target = (working * TARGET_NUMERATOR) / TARGET_DENOMINATOR;
        uint256 cap = (target * CAP_BPS) / 10_000;
        require(target > 0 && cap > target, "working amount too small to form terms");

        offer = WeirOffer(
            factory.createOffer(
                WeirOffer.Terms({
                    target: target,
                    cap: cap,
                    shareBps: SHARE_BPS,
                    fundingEnds: uint64(block.timestamp + 1 days),
                    expiresAt: uint64(block.timestamp + 30 days)
                })
            )
        );
        console.log("offer:            ", address(offer));
        console.log("target / cap:     ", target, cap);

        usdt.forceApprove(address(offer), target);
        offer.subscribe(target);

        factory.activateOffer(address(offer));
        console.log("activated, raised:", offer.raised());
    }

    function _repay(MerchantSplitter splitter, WeirOffer offer, IERC20 usdt, uint256 working)
        internal
    {
        // One settlement at 100% share carries the offer to its cap, with the overshoot
        // going back to the merchant rather than to funders.
        usdt.safeTransfer(address(splitter), working);
        splitter.settle();

        console.log("totalReceived:    ", offer.totalReceived());
        console.log("pending:          ", offer.pending(msg.sender));

        offer.claim();
    }

    // ------------------------------------------------------------------
    // Assertions — the point of the run, not decoration
    // ------------------------------------------------------------------

    function _report(WeirOffer offer, IERC20 usdt, address me, uint256 startBalance)
        internal
        view
    {
        uint256 endBalance = usdt.balanceOf(me);
        (, uint256 cap,,,) = offer.terms();

        console.log("--- result ---");
        console.log("state (2 == Repaid):", uint8(offer.state()));
        console.log("totalReceived:      ", offer.totalReceived());
        console.log("cap:                ", cap);
        console.log("usdt before:        ", startBalance);
        console.log("usdt after:         ", endBalance);

        require(offer.state() == WeirOffer.State.Repaid, "offer did not reach Repaid");
        require(offer.totalReceived() == cap, "totalReceived != cap");

        // The fee-on-transfer answer. Principal round-trips, so a shortfall here is the
        // token skimming transfers — which the contracts already tolerate, since every
        // accounting path measures balance deltas, but it changes what the UI should say.
        if (endBalance < startBalance) {
            console.log("SHORTFALL (fee-on-transfer?):", startBalance - endBalance);
        } else {
            console.log("no shortfall: token does not take a transfer fee");
        }
    }
}
