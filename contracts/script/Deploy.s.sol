// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

import {WeirFactory} from "../src/WeirFactory.sol";
import {MockUSDT} from "../test/mocks/MockUSDT.sol";

/// @notice Deploys the factory. On testnet it first deploys the hostile MockUSDT;
///         on mainnet it requires a real USDT address in `USDT_ADDRESS`.
/// @dev    Run with: forge script script/Deploy.s.sol --rpc-url bot_mainnet --broadcast
contract Deploy is Script {
    function run() external returns (WeirFactory factory, address usdt) {
        // BOT Chain's own docs contradict themselves on which id is mainnet. Never assume.
        console.log("chainid:", block.chainid);

        usdt = vm.envOr("USDT_ADDRESS", address(0));

        vm.startBroadcast();

        if (usdt == address(0)) {
            require(block.chainid != 677, "refusing to deploy a mock USDT on mainnet 677");
            usdt = address(new MockUSDT());
            console.log("deployed MockUSDT:", usdt);
        } else {
            // The factory falls back to 6 decimals when `decimals()` reverts, which it also
            // does for an address holding no code. A mistyped token address would therefore
            // deploy a factory that looks entirely healthy and can never receive a payment.
            require(usdt.code.length > 0, "USDT_ADDRESS has no code on this chain");
        }

        factory = new WeirFactory(usdt);

        vm.stopBroadcast();

        console.log("usdt:", usdt);
        console.log("usdt decimals:", factory.usdtDecimals());
        console.log("minProcessed:", factory.minProcessed());
        console.log("WeirFactory:", address(factory));
    }
}
