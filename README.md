# Weir

Programmable merchant revenue-share on BOT Chain.

Funders buy a slice of a merchant's future receipts. A contract-controlled payment
address splits every incoming USDT between the merchant and the funder pool until a
repayment cap is reached.

**The merchant never repays anyone.** Their customers pay the contract, and the contract
pays the merchant. Repayment happens before the merchant ever touches the money.

Built for the BOT Chain Builder Challenge #2, RWA track.

---

## Why this design

The hard problem in real-world assets is the oracle problem: who tells the contract that
the real-world thing happened? BOT Chain has no oracle — no Chainlink, no Pyth, no UMA,
no attestation layer of any kind.

Weir sidesteps it. The real-world cashflow *arrives as an on-chain payment*, so the
contract observes it directly. Nothing needs attesting because nothing is claimed
off-chain. The asset is real merchant revenue and there is no attestor to doubt.

### Payment history is the credit check

A merchant cannot open an offer until they have settled a minimum volume through their
own splitter. That single threshold does the underwriting: if a merchant has been
collecting through the contract already, the splitter address *is* their live payment
setup, and defecting means abandoning it.

No KYC, no documents, no identity verification. The wallet is the identity and the
payment record is the assessment.

---

## The structural weakness

**Nothing forces a merchant to keep routing revenue through the splitter.** They can
raise, withdraw, and tell customers to pay a different address. No code prevents this.

This is stated plainly here, in the UI, and to every funder before they subscribe,
because a risk a funder discovers on their own is worth less than one disclosed upfront.

Three mitigations, all product features rather than patches:

1. **Eligibility gate** — minimum processed volume before raising, so the splitter is
   already the merchant's real payment address.
2. **Public repayment history** — an on-chain per-merchant record of raised, repaid and
   stalled. A defector burns it permanently.
3. **Explicit risk disclosure** — funders see processed volume and a plain statement that
   repayment depends on continued revenue flow. No revenue means no repayment.

Weir is modeled on revenue-based financing, a real and widely-used instrument. It is not
a legal agreement, and nothing here is enforceable off-chain; a production deployment
would require jurisdiction-specific review.

---

## Architecture

Foundry, Solidity 0.8.28, OpenZeppelin.

| Contract | Role |
|---|---|
| `WeirFactory` | Deploys splitters, registry of merchants and offers, eligibility gate |
| `MerchantSplitter` | Per-merchant payment sink, deterministic CREATE2 address, permissionless `settle()` |
| `WeirOffer` | ERC-1155 claim tokens, subscription, accrual, claiming |

**Settlement is batched, not per-payment.** An incoming ERC-20 transfer cannot be hooked,
so funds accumulate at the splitter and `settle()` sweeps the whole balance at once.
`settle()` is permissionless — anyone may call it, and the money always goes to the
merchant and funders, never the caller.

**Distribution is pull-based.** Pushing USDT to N funders in a loop is unbounded gas and
the standard way this design dies. Claim tokens are ERC-1155 and therefore transferable,
so `_update` settles accrual on transfer — otherwise a transfer would silently steal
accrued revenue from the sender.

### Lifecycle

```
Funding  -> subscribe(), USDT escrowed, claim tokens minted 1:1
Active   -> merchant activated and received the raise; revenue accrues on settle()
Repaid   -> totalReceived hit the cap; overshoot returns to the merchant
Expired  -> hard expiry without the cap met; claiming stays open on what accrued
```

---

## Chain facts

BOT Chain's own documentation contradicts itself about which id is mainnet. Every value
below was read from the RPC directly rather than trusted. See `docs/chain-677.md`.

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | **677** | 968 |
| RPC | `https://rpc.botchain.ai` | `https://rpc.bohr.life` |
| Explorer | `https://scan.botchain.ai` | `https://scan.bohr.life` |

USDT on 677 is `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`, 6 decimals, and returns a
real boolean from `transfer`. Decimals are read at runtime everywhere and never
hardcoded; every accounting path measures balance deltas rather than trusting the
requested amount, so fee-on-transfer behaviour cannot corrupt the books. The testnet
`MockUSDT` deliberately returns *no* boolean, making testnet stricter than mainnet.

### Deployments

**Mainnet (677)** — live:

| | |
|---|---|
| `WeirFactory` | [`0xd4569Fd5F2D95374cd81Ad20E8c8544ccb8F7E4C`](https://scan.botchain.ai/address/0xd4569Fd5F2D95374cd81Ad20E8c8544ccb8F7E4C) |
| `USDT` (bridged, not deployed by us) | [`0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`](https://scan.botchain.ai/address/0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C) |

Read back from the deployed factory: `usdt()` resolves to the bridged token above,
`usdtDecimals()` is 6, `minProcessed()` is `10000000` — a 10 USDT eligibility gate.

**Testnet (968)** — full loop verified end to end on chain:

| | |
|---|---|
| `WeirFactory` | `0xb7b6844e7a428c9828c22a4b542b0e8622759fb8` |
| `MockUSDT` | `0xd4569fd5f2d95374cd81ad20e8c8544ccb8f7e4c` |

The mainnet factory and the testnet mock share an address. That is not a copy-paste
error: both are the first `CREATE` from the same deployer on their respective chains,
and contract addresses are a function of deployer and nonce.

---

## Running it

```bash
npm test              # 45 Foundry tests
npm run dev           # frontend at http://localhost:5173
```

Set the factory address for whichever chain you are targeting:

```bash
cp frontend/.env.example frontend/.env.local
# VITE_FACTORY_ADDRESS_677=0x…
# VITE_FACTORY_ADDRESS_968=0x…
```

Deploying:

```bash
cd contracts
USDT_ADDRESS=0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C \
  forge script script/Deploy.s.sol --rpc-url bot_mainnet --account <keystore> --broadcast
npm run sync-deployment 677    # writes the address into frontend/.env.local
```

On testnet, omit `USDT_ADDRESS` and the script deploys the hostile mock. It refuses to do
that on 677.

### Testing

45 tests covering the invariants that matter:

- Funder claims plus merchant receipts equal everything settled through the splitter
- `totalReceived` never exceeds the cap
- No claim path pays out more than `pending(user)`
- **A claim-token transfer never changes either party's total claimable** — the single
  most likely correctness bug in the design, tested first
- `settle()` with a zero balance reverts rather than silently succeeding
- Refunds are reachable only below target after funding ends
- `claim()`, `settle()`, `subscribe()` and `refund()` are all reentrancy-guarded

---

## Deliberately not built

KYC or identity verification. Any legal wrapper. A secondary market for claim tokens —
they are transferable because ERC-1155 is, but no liquidity venue exists. Default
recovery beyond marking an offer expired. Price feeds or non-USDT denomination. Subgraph
indexing, since no indexer is confirmed on 677 — the frontend reads on-chain arrays via
multicall instead of scanning event logs. A protocol fee; it ships at zero.

Roadmap: time-weighted volume, consistency scoring, and repayment history feeding a risk
tier — extending the eligibility gate from one threshold into real underwriting.
