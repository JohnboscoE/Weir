# Weir frontend

React + TypeScript + Vite, wagmi + viem, Tailwind. See the [root README](../README.md)
for what Weir is and how the contracts work.

```bash
npm install
npm run dev       # http://localhost:5173
```

Vite binds IPv6 here, so use `http://localhost:5173` — `127.0.0.1` will refuse the
connection. A cold start takes ~25s while wagmi and viem are pre-bundled; it prints
nothing until ready.

## Configuration

```bash
cp .env.example .env.local
```

The app reads one factory address per chain and shows an explicit "no deployment on this
chain" state rather than silently reading address zero. With no wallet connected it falls
back to the first supported chain that actually has an address, so offers are browsable
without connecting anything — declaration order in `SUPPORTED_CHAINS` puts mainnet first,
so it takes over as soon as a mainnet address exists.

`npm run sync-deployment <chainId>` writes the address straight out of Foundry's broadcast
artifact, so a deployment is never transcribed by hand.

## Notes

- **No indexer on BOT Chain.** Nothing scans event logs over wide block ranges. Every list
  comes from an on-chain array in the factory and every detail from a struct read, batched
  through multicall.
- **Decimals are read from the token**, never assumed. USDT is 6 decimals on 677 but that
  is a fact to verify, not to hardcode.
- **The testnet faucet** on the merchant and offer screens renders only when the active
  chain is flagged `testnet`. It cannot appear on mainnet.
- `npm run sync-abis` regenerates `src/abi` from the Foundry build output.
