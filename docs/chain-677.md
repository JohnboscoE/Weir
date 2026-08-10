# Chain 677 facts — verified on chain, not from docs

Answers the day-5 questions in CLAUDE.md §3 ahead of any mainnet spend. Every value
below was read from the RPC directly. BOT Chain's own documentation contradicts
itself on which chain id is mainnet, so nothing here is taken on trust.

Verified 2026-08-09.

## Chain ids

```
$ cast chain-id --rpc-url https://rpc.botchain.ai   ->  677   (mainnet)
$ cast chain-id --rpc-url https://rpc.bohr.life     ->  968   (testnet)
```

CLAUDE.md §3 is correct; the Bridge section of the BOT Chain docs, which calls 968
mainnet, is wrong. Mainnet is **677**.

## USDT on 677

The explorer lists two 6-decimal Tether-shaped tokens with byte-identical code
(codesize 6188 each), so both come from the same bridge template. The canonical one
is the one with the holder base:

| | Address | Name / Symbol | Holders |
|---|---|---|---|
| **Use this** | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` | Tether USD / USDT | 286,922 |
| Not this | `0x118f7B25a0907577041F1c10d7E0cBD153986f66` | BOT Wrapped Tether USD / BOUSDT | 70 |

Picking the wrong one produces a deployment that works perfectly and that no real
customer can pay into. The holder count is the distinguishing signal.

### The three failure modes from CLAUDE.md §3, resolved

1. **Return value — standard.** `transfer` and `approve` both return
   `0x…01`, a real ABI-encoded `bool true`. This token is *not* canonical-Tether
   shaped. Probed read-only against a funded holder, no gas spent:

   ```
   $ cast call 0xaBabc7… "transfer(address,uint256)" 0x…dEaD 1 \
       --from 0xeefdBdB186F6D4cD9c54335100D33c497f54B8C0 --rpc-url https://rpc.botchain.ai
   0x0000000000000000000000000000000000000000000000000000000000000001
   ```

   SafeERC20 stays everywhere regardless. It costs nothing here and it is the only
   reason the hostile-mock testnet path and the standard-token mainnet path can share
   one codebase.

2. **Decimals — 6.** Same as Ethereum, not BSC's 18. Still read at runtime in both
   the contracts and the frontend; the constant is recorded here for sanity-checking
   output, never for hardcoding. `MIN_PROCESSED = 10e6` is therefore **10 USDT**,
   which is the intended gate value.

3. **Fee-on-transfer — untested, and it does not matter.** Confirming this needs a
   real transfer with real tokens. Every accounting path already measures balance
   deltas before and after the transfer rather than trusting the requested amount, so
   the contracts are correct either way. Worth re-checking during the smoke deploy,
   when tokens are actually moving.

### Testnet is stricter than mainnet

`MockUSDT` returns no boolean and uses 6 decimals. Mainnet USDT returns a proper
boolean and uses 6 decimals. The mock is a strict superset of mainnet's hostility, so
the failure mode CLAUDE.md warns about — passing on 968, reverting on 677 — cannot
happen in the return-value dimension. Leave the mock hostile.

## Mainnet deploy

Simulated against 677 with the real token, no broadcast:

```
$ USDT_ADDRESS=0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C \
  forge script script/Deploy.s.sol --rpc-url bot_mainnet --sender <deployer>

chainid: 677
usdt decimals: 6
minProcessed: 10000000
Estimated total gas used: 5,199,902 @ 20 gwei  ->  ~0.104 BOT
```

(forge prints the cost as "ETH"; the native token is BOT.)

Deployer `0x5eec93861c5939c00e2bad9fc12b6964b60f6287` holds **0 BOT on 677** at
nonce 0. Fund it before the smoke deploy — 0.104 BOT for the factory, plus headroom
for a splitter deployment and a few settles. A handful of real USDT is also needed to
push through the splitter.
