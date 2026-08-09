// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IWeirOffer} from "./interfaces/IWeirOffer.sol";

/// @title MerchantSplitter
/// @notice A merchant's payment sink. Customers pay USDT here; `settle()` sweeps the
///         accumulated balance to the merchant, diverting a share to the funder pool
///         while an offer is active.
/// @dev    The split is *batched*, not per-payment: an incoming ERC-20 transfer cannot be
///         hooked, so funds pool here until someone calls `settle()`. This is by design.
contract MerchantSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 internal constant BPS_DENOMINATOR = 10_000;

    address public immutable merchant;
    address public immutable factory;
    IERC20 public immutable usdt;

    /// @notice The offer currently receiving a share of revenue; address(0) when none.
    address public activeOffer;
    /// @notice Funder share of each settlement while `activeOffer` is set.
    uint16 public shareBps;
    /// @notice Total USDT ever settled through this splitter. Drives the eligibility gate.
    uint256 public lifetimeProcessed;

    event Settled(uint256 amount, uint256 merchantCut, uint256 funderCut, address indexed offer);
    event ActiveOfferSet(address indexed offer, uint16 shareBps);
    event ActiveOfferCleared(address indexed offer);

    error NothingToSettle();
    error NotFactory();
    error OfferAlreadyActive();

    constructor(address merchant_, address factory_, address usdt_) {
        merchant = merchant_;
        factory = factory_;
        usdt = IERC20(usdt_);
    }

    /// @notice Wire an activated offer to this splitter. Only the factory may call.
    function setActiveOffer(address offer, uint16 shareBps_) external {
        if (msg.sender != factory) revert NotFactory();
        if (activeOffer != address(0)) revert OfferAlreadyActive();
        activeOffer = offer;
        shareBps = shareBps_;
        emit ActiveOfferSet(offer, shareBps_);
    }

    /// @notice Sweep the accumulated balance. Permissionless by design — the merchant is
    ///         naturally incentivized to call it, since it is how they get paid.
    function settle() external nonReentrant {
        uint256 balance = usdt.balanceOf(address(this));
        if (balance == 0) revert NothingToSettle();

        // A finished offer (cap reached, or expired) stops diverting revenue immediately.
        refreshActiveOffer();
        address offer = activeOffer;

        uint256 funderCut;
        if (offer != address(0)) {
            funderCut = (balance * shareBps) / BPS_DENOMINATOR;
        }
        uint256 merchantCut = balance - funderCut;

        if (funderCut > 0) {
            // Measure what the offer actually received, in case USDT takes a transfer fee.
            uint256 before = usdt.balanceOf(offer);
            usdt.safeTransfer(offer, funderCut);
            uint256 received = usdt.balanceOf(offer) - before;

            IWeirOffer(offer).notifyRevenue(received);

            // The cap may have been reached by this very settlement.
            refreshActiveOffer();
        }

        if (merchantCut > 0) {
            usdt.safeTransfer(merchant, merchantCut);
        }

        lifetimeProcessed += balance;

        emit Settled(balance, merchantCut, funderCut, offer);
    }

    /// @notice Finalize and unwire the active offer if it has finished. Permissionless and
    ///         idempotent — lets a merchant open a new raise without waiting for a settlement.
    function refreshActiveOffer() public {
        address offer = activeOffer;
        if (offer == address(0)) return;
        if (IWeirOffer(offer).isAccepting()) return;
        IWeirOffer(offer).finalize();
        _clearActiveOffer(offer);
    }

    /// @notice USDT sitting here awaiting the next `settle()`.
    function pendingBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function _clearActiveOffer(address offer) internal {
        activeOffer = address(0);
        shareBps = 0;
        emit ActiveOfferCleared(offer);
    }
}
