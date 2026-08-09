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

export function explorerUrl(chainId: number, kind: 'address' | 'tx', value: string) {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId) ?? botChain
  return `${chain.blockExplorers.default.url}/${kind}/${value}`
}
