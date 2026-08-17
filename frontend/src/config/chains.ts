import {defineChain} from 'viem'

/**
 * BOT Chain's own documentation contradicts itself about which id is mainnet — the
 * bridge page calls 968 "mainnet" while the quick guide calls it testnet. Neither is
 * trusted here. 677 is treated as mainnet on the evidence of scan.botchain.ai, and
 * `npm run dev` surfaces the chain id the wallet actually reports so a mismatch is
 * visible rather than silent.
 */
export const botChain = defineChain({
  id: 677,
  name: 'BOT Chain',
  nativeCurrency: {name: 'BOT', symbol: 'BOT', decimals: 18},
  rpcUrls: {default: {http: ['https://rpc.botchain.ai']}},
  blockExplorers: {default: {name: 'BOTScan', url: 'https://scan.botchain.ai'}},
})

export const botTestnet = defineChain({
  id: 968,
  name: 'BOT Chain Testnet',
  nativeCurrency: {name: 'tBOT', symbol: 'tBOT', decimals: 18},
  rpcUrls: {default: {http: ['https://rpc.bohr.life']}},
  blockExplorers: {default: {name: 'Bohr Scan', url: 'https://scan.bohr.life'}},
  testnet: true,
})

export const SUPPORTED_CHAINS = [botChain, botTestnet] as const

/**
 * `677 | 968`, not `number`. wagmi narrows its `chainId` option to the ids in the config,
 * so anything wider fails to typecheck at the call site — which is the point: a chain id
 * this app has no transport for should not be expressible.
 */
export type WeirChainId = (typeof SUPPORTED_CHAINS)[number]['id']

/** A chain Weir actually deploys to, carrying the fields `wallet_addEthereumChain` needs. */
export type WeirChain = (typeof SUPPORTED_CHAINS)[number]

export function explorerUrl(chainId: number | undefined, kind: 'address' | 'tx', value: string) {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId) ?? botChain
  return `${chain.blockExplorers.default.url}/${kind}/${value}`
}
