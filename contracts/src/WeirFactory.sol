// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {MerchantSplitter} from "./MerchantSplitter.sol";
import {WeirOffer} from "./WeirOffer.sol";
import {IWeirOffer} from "./interfaces/IWeirOffer.sol";

/// @title WeirFactory
/// @notice Deploys merchant splitters and offers, and is the registry the UI reads.
/// @dev    There is no indexer on BOT Chain, so the registry keeps plain arrays that a
///         frontend can walk with multicall instead of scanning event logs.
contract WeirFactory {
    /// @notice Minimum lifetime volume a merchant must have settled before raising.
    /// @dev The eligibility gate *is* the underwriting: payment history is the credit check.
    ///      Denominated in USDT units, resolved from the token's own `decimals()` at deploy.
    uint256 public immutable minProcessed;

    address public immutable usdt;
    uint8 public immutable usdtDecimals;

    /// @notice The splitter deployed for each merchant; address(0) if none.
    mapping(address => address) public splitterOf;
    /// @notice Every offer this factory deployed, oldest first.
    address[] public allOffers;
    /// @notice Offers per merchant, oldest first.
    mapping(address => address[]) internal _offersOf;
    mapping(address => bool) public isOffer;

    event SplitterCreated(address indexed merchant, address splitter);
    event OfferCreated(
        address indexed merchant, address indexed offer, address splitter, WeirOffer.Terms terms
    );
    event OfferActivated(address indexed merchant, address indexed offer, uint16 shareBps);

    error SplitterExists();
    error NoSplitter();
    error NotEligible(uint256 processed, uint256 required);
    error OfferStillLive(address offer);
    error UnknownOffer();
    error NotMerchant();
    error SplitterBusy();

    constructor(address usdt_) {
        usdt = usdt_;

        // Decimals are unknown on chain 677 — read them, never assume.
        uint8 decimals_ = 6;
        try IERC20Metadata(usdt_).decimals() returns (uint8 d) {
            decimals_ = d;
        } catch {}
        usdtDecimals = decimals_;
        minProcessed = 10 * (10 ** uint256(decimals_));
    }

    // --------------------------------------------------------------------
    // Splitters
    // --------------------------------------------------------------------

    /// @notice Deploy the caller's payment splitter at its deterministic address.
    function createSplitter() external returns (address splitter) {
        if (splitterOf[msg.sender] != address(0)) revert SplitterExists();

        splitter =
            address(new MerchantSplitter{salt: _salt(msg.sender)}(msg.sender, address(this), usdt));
        splitterOf[msg.sender] = splitter;

        emit SplitterCreated(msg.sender, splitter);
    }

    /// @notice The address a merchant's splitter will have, deployed or not — so a merchant
    ///         can publish their payment address before paying for the deployment.
    function predictSplitter(address merchant) public view returns (address) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(MerchantSplitter).creationCode, abi.encode(merchant, address(this), usdt)
            )
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(this), _salt(merchant), initCodeHash)
                    )
                )
            )
        );
    }

    // --------------------------------------------------------------------
    // Offers
    // --------------------------------------------------------------------

    /// @notice Open a raise against the caller's revenue. Requires the eligibility gate.
    function createOffer(WeirOffer.Terms calldata terms) external returns (address offer) {
        address splitter = splitterOf[msg.sender];
        if (splitter == address(0)) revert NoSplitter();

        uint256 processed = MerchantSplitter(splitter).lifetimeProcessed();
        if (processed < minProcessed) revert NotEligible(processed, minProcessed);

        address[] storage mine = _offersOf[msg.sender];
        if (mine.length > 0) {
            address last = mine[mine.length - 1];
            if (_isLive(last)) revert OfferStillLive(last);
        }

        offer = address(new WeirOffer(address(this), splitter, msg.sender, usdt, terms));
        isOffer[offer] = true;
        allOffers.push(offer);
        mine.push(offer);

        emit OfferCreated(msg.sender, offer, splitter, terms);
    }

    /// @notice Release escrow to the merchant and point their splitter at the offer.
    function activateOffer(address offer) external {
        if (!isOffer[offer]) revert UnknownOffer();

        address merchant = IWeirOffer(offer).merchant();
        if (msg.sender != merchant) revert NotMerchant();

        MerchantSplitter splitter = MerchantSplitter(splitterOf[merchant]);

        // Unwire a previous offer that has already finished, so this one can take its place.
        splitter.refreshActiveOffer();
        if (splitter.activeOffer() != address(0)) revert SplitterBusy();

        uint16 shareBps = IWeirOffer(offer).shareBps();
        IWeirOffer(offer).activate();
        splitter.setActiveOffer(offer, shareBps);

        emit OfferActivated(merchant, offer, shareBps);
    }

    // --------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------

    function offersCount() external view returns (uint256) {
        return allOffers.length;
    }

    function offersOf(address merchant) external view returns (address[] memory) {
        return _offersOf[merchant];
    }

    /// @notice Page through every offer, newest-last, without an indexer.
    function offersSlice(uint256 start, uint256 count) external view returns (address[] memory) {
        uint256 total = allOffers.length;
        if (start >= total) return new address[](0);
        uint256 end = start + count;
        if (end > total) end = total;

        address[] memory page = new address[](end - start);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = allOffers[i];
        }
        return page;
    }

    /// @notice Whether `merchant` has settled enough volume to open a raise.
    function isEligible(address merchant) external view returns (bool eligible, uint256 processed) {
        address splitter = splitterOf[merchant];
        if (splitter == address(0)) return (false, 0);
        processed = MerchantSplitter(splitter).lifetimeProcessed();
        eligible = processed >= minProcessed;
    }

    /// @dev An offer still occupying the merchant's slot: raising, or taking revenue.
    function _isLive(address offer) internal view returns (bool) {
        IWeirOffer.State state = IWeirOffer(offer).state();
        if (state == IWeirOffer.State.Funding) {
            (,, , uint64 fundingEnds,) = _termsOf(offer);
            return block.timestamp <= fundingEnds;
        }
        if (state == IWeirOffer.State.Active) {
            return IWeirOffer(offer).isAccepting();
        }
        return false;
    }

    function _termsOf(address offer)
        internal
        view
        returns (uint256 target, uint256 cap, uint16 shareBps, uint64 fundingEnds, uint64 expiresAt)
    {
        return WeirOffer(offer).terms();
    }

    function _salt(address merchant) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(merchant)));
    }
}
