// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

/// @notice Read-only probe of the bridged USDT on whatever chain the RPC points at.
/// @dev    This is the day-5 question answered early and without spending gas:
///         does `transfer` return a bool, and how many decimals does it use?
///         Run with: forge script script/ProbeUSDT.s.sol --rpc-url bot_mainnet
contract ProbeUSDT is Script {
    function run() external view {
        address usdt = vm.envAddress("USDT_ADDRESS");

        console.log("chainid:", block.chainid);
        console.log("usdt:", usdt);
        console.log("code size:", usdt.code.length);

        (bool ok, bytes memory data) = usdt.staticcall(abi.encodeWithSignature("decimals()"));
        if (ok && data.length >= 32) {
            console.log("decimals:", abi.decode(data, (uint8)));
        } else {
            console.log("decimals(): MISSING - factory will fall back to 6");
        }

        (ok, data) = usdt.staticcall(abi.encodeWithSignature("symbol()"));
        if (ok) console.log("symbol call returned bytes:", data.length);

        // The important one. A canonical-Tether-style token returns *nothing* here, which
        // is why every transfer in this codebase goes through SafeERC20.
        (ok, data) = usdt.staticcall(abi.encodeWithSignature("totalSupply()"));
        if (ok && data.length >= 32) console.log("totalSupply:", abi.decode(data, (uint256)));

        (ok, data) = usdt.staticcall(abi.encodeWithSignature("allowance(address,address)", address(1), address(2)));
        console.log("allowance() ok:", ok);
        console.log("allowance() returndata len:", data.length);

        console.log("");
        console.log("Next: simulate a transfer from a funded account with `cast call` and");
        console.log("inspect the returndata length. 0 bytes => non-standard, SafeERC20 required.");
    }
}
