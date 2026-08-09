// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from
    "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WeirOffer
/// @notice One merchant raise. Funders subscribe USDT and receive ERC-1155 claim units
///         (token id 1, minted 1:1 with USDT). Once active, the merchant's splitter
///         forwards a share of every settlement here, where it accrues to holders until
///         the repayment cap is reached.
/// @dev    Distribution is pull-based via an accumulator. Claim units are transferable,
///         so accrual is settled inside `_update` — a transfer must never move a
///         counterparty's already-earned revenue.
contract WeirOffer is ERC1155Supply, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Funding,
        Active,
        Repaid,
        Expired
    }

    struct Terms {
        uint256 target; // USDT to raise
        uint256 cap; // total USDT owed to funders, cap > target
        uint16 shareBps; // share of each settlement diverted to this offer
        uint64 fundingEnds; // subscription deadline
        uint64 expiresAt; // hard expiry -> State.Expired
    }

    uint256 public constant TOKEN_ID = 1;
    uint256 internal constant ACC_PRECISION = 1e18;
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    address public immutable factory;
    address public immutable splitter;
    address public immutable merchant;
    IERC20 public immutable usdt;

    Terms public terms;
    State public state;

    /// @notice USDT subscribed so far (escrowed until activation).
    uint256 public raised;
    /// @notice Revenue counted toward the cap. Never exceeds `terms.cap`.
    uint256 public totalReceived;
    /// @notice Revenue paid out to funders so far.
    uint256 public totalClaimed;

    /// @notice Accumulated revenue per claim unit, scaled by ACC_PRECISION.
    uint256 public accPerShare;
    /// @dev Accrual already accounted for at each holder's current balance.
    mapping(address => uint256) public rewardDebt;
    /// @dev Earned but not yet withdrawn, banked whenever a balance changes.
    mapping(address => uint256) public credited;

    event Subscribed(address indexed funder, uint256 amount, uint256 raised);
    event Refunded(address indexed funder, uint256 amount);
    event Activated(uint256 amount, uint64 at);
    event RevenueAccrued(uint256 counted, uint256 returnedToMerchant, uint256 totalReceived);
    event Claimed(address indexed funder, uint256 amount);
    event StateChanged(State indexed previous, State indexed current);

    error NotFactory();
    error NotSplitter();
    error WrongState();
    error FundingClosed();
    error FundingStillOpen();
    error ZeroAmount();
    error Oversubscribed(uint256 remaining);
    error TargetNotReached();
    error NothingToClaim();
    error UnbackedRevenue();
    error InvalidTerms();

    constructor(
        address factory_,
        address splitter_,
        address merchant_,
        address usdt_,
        Terms memory terms_
    ) ERC1155("") {
        if (terms_.target == 0) revert InvalidTerms();
        if (terms_.cap <= terms_.target) revert InvalidTerms();
        if (terms_.shareBps == 0 || terms_.shareBps > BPS_DENOMINATOR) revert InvalidTerms();
        if (terms_.fundingEnds <= block.timestamp) revert InvalidTerms();
        if (terms_.expiresAt <= terms_.fundingEnds) revert InvalidTerms();

        factory = factory_;
        splitter = splitter_;
        merchant = merchant_;
        usdt = IERC20(usdt_);
        terms = terms_;
        state = State.Funding;
    }

    // --------------------------------------------------------------------
    // Funding
    // --------------------------------------------------------------------

    /// @notice Subscribe `amount` USDT. Mints claim units 1:1 with the amount received.
    /// @dev Oversubscription reverts rather than pro-rating; partial fills are a bug farm.
    function subscribe(uint256 amount) external nonReentrant {
        if (state != State.Funding) revert WrongState();
        if (block.timestamp > terms.fundingEnds) revert FundingClosed();
        if (amount == 0) revert ZeroAmount();

        uint256 remaining = terms.target - raised;
        if (amount > remaining) revert Oversubscribed(remaining);

        // Credit only what actually arrived, in case USDT takes a transfer fee.
        uint256 before = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = usdt.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        raised += received;
        _mint(msg.sender, TOKEN_ID, received, "");

        emit Subscribed(msg.sender, received, raised);
    }

    /// @notice Reclaim escrow when funding closed short of target. Burns the claim units,
    ///         so whoever holds them at that point is refunded.
    function refund() external nonReentrant {
        if (state != State.Funding) revert WrongState();
        if (block.timestamp <= terms.fundingEnds) revert FundingStillOpen();

        uint256 units = balanceOf(msg.sender, TOKEN_ID);
        if (units == 0) revert ZeroAmount();

        _burn(msg.sender, TOKEN_ID, units);
        raised -= units;
        usdt.safeTransfer(msg.sender, units);

        emit Refunded(msg.sender, units);
    }

    /// @notice Release escrow to the merchant and open the offer to revenue.
    /// @dev Called by the factory, which also wires the splitter in the same transaction.
    function activate() external nonReentrant {
        if (msg.sender != factory) revert NotFactory();
        if (state != State.Funding) revert WrongState();
        if (block.timestamp > terms.fundingEnds) revert FundingClosed();
        if (raised != terms.target) revert TargetNotReached();

        _setState(State.Active);
        usdt.safeTransfer(merchant, raised);

        emit Activated(raised, uint64(block.timestamp));
    }

    // --------------------------------------------------------------------
    // Revenue
    // --------------------------------------------------------------------

    /// @notice Credit revenue the splitter has just transferred in.
    /// @param amount USDT actually received by this contract, measured by the splitter.
    function notifyRevenue(uint256 amount) external nonReentrant {
        if (msg.sender != splitter) revert NotSplitter();
        if (state != State.Active) revert WrongState();
        if (amount == 0) revert ZeroAmount();

        // The revenue must actually be sitting here, on top of what funders are already owed.
        uint256 owed = totalReceived - totalClaimed;
        if (usdt.balanceOf(address(this)) < owed + amount) revert UnbackedRevenue();

        uint256 remaining = terms.cap - totalReceived;
        uint256 counted = amount > remaining ? remaining : amount;
        uint256 excess = amount - counted;

        if (counted > 0) {
            totalReceived += counted;
            accPerShare += (counted * ACC_PRECISION) / totalSupply(TOKEN_ID);
        }

        // Overshoot past the cap belongs to the merchant, not the funders.
        if (excess > 0) {
            usdt.safeTransfer(merchant, excess);
        }

        emit RevenueAccrued(counted, excess, totalReceived);

        finalize();
    }

    /// @notice Withdraw everything accrued to the caller.
    function claim() external nonReentrant {
        _bankAccrual(msg.sender);
        _syncDebt(msg.sender);

        uint256 amount = credited[msg.sender];
        if (amount == 0) revert NothingToClaim();

        credited[msg.sender] = 0;
        totalClaimed += amount;
        usdt.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    /// @notice Move a finished offer into its terminal state. Permissionless, idempotent.
    function finalize() public {
        if (state != State.Active) return;
        if (totalReceived >= terms.cap) {
            _setState(State.Repaid);
        } else if (block.timestamp > terms.expiresAt) {
            _setState(State.Expired);
        }
    }

    // --------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------

    /// @notice True while this offer can still take revenue from the splitter.
    function isAccepting() public view returns (bool) {
        return state == State.Active && block.timestamp <= terms.expiresAt
            && totalReceived < terms.cap;
    }

    /// @notice USDT currently claimable by `user`.
    function pending(address user) public view returns (uint256) {
        uint256 accrued = (balanceOf(user, TOKEN_ID) * accPerShare) / ACC_PRECISION;
        return credited[user] + accrued - rewardDebt[user];
    }

    function shareBps() external view returns (uint16) {
        return terms.shareBps;
    }

    /// @notice Everything the UI needs about this offer in one call.
    function snapshot()
        external
        view
        returns (
            State state_,
            Terms memory terms_,
            uint256 raised_,
            uint256 totalReceived_,
            uint256 totalClaimed_,
            uint256 totalUnits_,
            address merchant_,
            address splitter_
        )
    {
        return (
            state,
            terms,
            raised,
            totalReceived,
            totalClaimed,
            totalSupply(TOKEN_ID),
            merchant,
            splitter
        );
    }

    // --------------------------------------------------------------------
    // Accrual bookkeeping
    // --------------------------------------------------------------------

    /// @dev Claim units are transferable, so every balance change must first bank what the
    ///      holder has already earned, then re-baseline their debt against the new balance.
    ///      Without this, a transfer would hand the sender's accrued revenue to the receiver.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0)) _bankAccrual(from);
        if (to != address(0)) _bankAccrual(to);

        super._update(from, to, ids, values);

        if (from != address(0)) _syncDebt(from);
        if (to != address(0)) _syncDebt(to);
    }

    function _bankAccrual(address user) internal {
        uint256 accrued = (balanceOf(user, TOKEN_ID) * accPerShare) / ACC_PRECISION;
        uint256 debt = rewardDebt[user];
        if (accrued > debt) {
            credited[user] += accrued - debt;
            rewardDebt[user] = accrued;
        }
    }

    function _syncDebt(address user) internal {
        rewardDebt[user] = (balanceOf(user, TOKEN_ID) * accPerShare) / ACC_PRECISION;
    }

    function _setState(State next) internal {
        State previous = state;
        state = next;
        emit StateChanged(previous, next);
    }
}
