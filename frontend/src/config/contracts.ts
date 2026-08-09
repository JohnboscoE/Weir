import type {Address} from 'viem'
import {isAddress} from 'viem'

import {botChain, botTestnet} from './chains'

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

export const TOKEN_ID = 1n
export const BPS_DENOMINATOR = 10_000
