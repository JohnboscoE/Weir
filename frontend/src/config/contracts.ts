import type {Address} from 'viem'
import {isAddress} from 'viem'

import {SUPPORTED_CHAINS, type WeirChainId, botChain, botTestnet} from './chains'

/**
 * Factory address per chain. Set these in `.env.local` after deploying — the app shows
 * an explicit "not configured" state rather than silently reading address zero.
 */
const RAW: Record<number, string | undefined> = {
  [botChain.id]: import.meta.env.VITE_FACTORY_ADDRESS_677,
  [botTestnet.id]: import.meta.env.VITE_FACTORY_ADDRESS_968,
}

export function factoryAddress(chainId: number | undefined): Address | undefined {
  if (chainId === undefined) return undefined
  const raw = RAW[chainId]
  return raw && isAddress(raw) ? (raw as Address) : undefined
}

/**
 * Which chain to read from when no wallet is connected.
 *
 * wagmi would otherwise fall back to `chains[0]`, so a visitor with no wallet — a judge
 * opening the funder page — would be told the factory is "not configured" whenever the
 * first chain happens to be the one that isn't deployed yet. Browsing offers requires no
 * wallet, so it should not require one.
 *
 * Declaration order in SUPPORTED_CHAINS is the preference order: mainnet wins as soon as
 * a mainnet address exists, without anyone remembering to flip a default back.
 */
export function defaultReadChainId(): WeirChainId {
  return SUPPORTED_CHAINS.find((c) => factoryAddress(c.id))?.id ?? botChain.id
}

export const TOKEN_ID = 1n
export const BPS_DENOMINATOR = 10_000
