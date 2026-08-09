// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockUSDT — deliberately hostile
/// @notice Testnet stand-in for bridged USDT on BOT Chain. It is written to be *stricter*
///         than anything we expect on mainnet, so the failure mode of "passes on testnet,
///         reverts on 677" cannot happen:
///           - `transfer` / `transferFrom` / `approve` return nothing, like canonical Tether
///           - 6 decimals, so nothing can quietly assume 18
///           - optional fee-on-transfer, off by default
/// @dev Intentionally does NOT declare `is IERC20` — the non-standard return types are the point.
contract MockUSDT {
    string public constant name = "Mock Bridged USDT";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Fee taken from every transfer, in basis points. Zero by default.
    uint16 public feeBps;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setFeeBps(uint16 feeBps_) external {
        require(feeBps_ <= 10_000, "fee too high");
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    // NOTE: no `returns (bool)` — this is the whole reason the mock exists.
    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
    }

    function transfer(address to, uint256 amount) external {
        _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;

        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;

        balanceOf[to] += net;
        if (fee > 0) {
            totalSupply -= fee; // burned, so balances still sum to totalSupply
        }
        emit Transfer(from, to, net);
    }
}
