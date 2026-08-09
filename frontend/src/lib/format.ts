import {formatUnits, parseUnits} from 'viem'

import {BPS_DENOMINATOR} from '../config/contracts'

/**
 * USDT decimals are unknown on chain 677 and differ by bridge origin (6 on Ethereum,
 * 18 on BSC). Nothing here hardcodes them — every helper takes the value read from the
 * token at runtime.
 */
export function formatUsdt(value: bigint | undefined, decimals: number | undefined) {
  if (value === undefined || decimals === undefined) return '—'
  const n = Number(formatUnits(value, decimals))
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n < 1000 ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

export function formatUsdtCompact(value: bigint | undefined, decimals: number | undefined) {
  if (value === undefined || decimals === undefined) return '—'
  const n = Number(formatUnits(value, decimals))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`
  return formatUsdt(value, decimals)
}

export function parseUsdt(input: string, decimals: number | undefined) {
  if (decimals === undefined) return undefined
  const cleaned = input.trim().replace(/,/g, '')
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return undefined
  try {
    return parseUnits(cleaned, decimals)
  } catch {
    return undefined
  }
}

export function formatBps(bps: number | undefined) {
  if (bps === undefined) return '—'
  return `${(bps / BPS_DENOMINATOR) * 100}%`
}

export function shortAddress(address: string | undefined, size = 4) {
  if (!address) return '—'
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`
}

/** Percentage of `cap` repaid, clamped to 100 so a final overshoot never renders past full. */
export function repaymentProgress(received: bigint, cap: bigint) {
  if (cap === 0n) return 0
  const pct = Number((received * 10_000n) / cap) / 100
  return Math.min(pct, 100)
}

export function formatDeadline(timestamp: bigint | number | undefined) {
  if (timestamp === undefined) return '—'
  const ms = Number(timestamp) * 1000
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function timeRemaining(timestamp: bigint | number | undefined) {
  if (timestamp === undefined) return '—'
  const seconds = Number(timestamp) - Math.floor(Date.now() / 1000)
  if (seconds <= 0) return 'ended'
  const days = Math.floor(seconds / 86_400)
  if (days >= 1) return `${days}d left`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours}h left`
  return `${Math.max(1, Math.floor(seconds / 60))}m left`
}
