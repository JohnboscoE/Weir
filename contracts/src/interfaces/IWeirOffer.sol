// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice The subset of WeirOffer that MerchantSplitter and WeirFactory depend on.
interface IWeirOffer {
    enum State {
        Funding,
        Active,
        Repaid,
        Expired
    }

    /// @return True while the offer can still take revenue: active, unexpired, under cap.
    function isAccepting() external view returns (bool);

    /// @notice Credit `amount` of USDT already transferred in by the splitter.
    /// @dev Only callable by the merchant's splitter.
    function notifyRevenue(uint256 amount) external;

    /// @notice Move a stale Active offer into its terminal state. Permissionless.
    function finalize() external;

    /// @notice Release escrow to the merchant and move Funding -> Active. Only the factory.
    function activate() external;

    function state() external view returns (State);

    function shareBps() external view returns (uint16);

    function merchant() external view returns (address);
}
