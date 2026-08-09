import {useMemo} from 'react'
import type {Address} from 'viem'
import {erc20Abi} from 'viem'
import {useAccount, useChainId, useReadContract, useReadContracts} from 'wagmi'

import {merchantSplitterAbi, weirFactoryAbi, weirOfferAbi} from '../abi'
import {TOKEN_ID, factoryAddress} from '../config/contracts'
import {decodeSnapshot, type OfferSnapshot} from '../lib/offer'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * There is no indexer on BOT Chain, so nothing here scans event logs over wide block
 * ranges. Every list comes from an on-chain array in the factory, and every detail from
 * a struct read. wagmi batches these into multicall where the chain supports it and
 * falls back to individual eth_calls where it does not — either way the reads work.
 */

export function useFactoryAddress() {
  const chainId = useChainId()
  return useMemo(() => factoryAddress(chainId), [chainId])
}

/** USDT metadata, read from the token rather than assumed. Decimals are the whole point. */
export function useUsdt() {
  const factory = useFactoryAddress()

  const {data: token} = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'usdt',
    query: {enabled: Boolean(factory)},
  })

  const {data: decimals} = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'decimals',
    query: {enabled: Boolean(token), staleTime: Infinity},
  })

  const {data: symbol} = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'symbol',
    query: {enabled: Boolean(token), staleTime: Infinity},
  })

  return {
    address: token,
    decimals: decimals === undefined ? undefined : Number(decimals),
    symbol: symbol ?? 'USDT',
  }
}

export function useUsdtBalance(owner: Address | undefined) {
  const {address: token} = useUsdt()
  return useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    query: {enabled: Boolean(token && owner)},
  })
}

export function useUsdtAllowance(owner: Address | undefined, spender: Address | undefined) {
  const {address: token} = useUsdt()
  return useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    query: {enabled: Boolean(token && owner && spender)},
  })
}

/** The connected merchant's splitter, plus the address it *will* have if not yet deployed. */
export function useMerchantSplitter(merchant?: Address) {
  const {address: connected} = useAccount()
  const account = merchant ?? connected
  const factory = useFactoryAddress()

  const deployed = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'splitterOf',
    args: account ? [account] : undefined,
    query: {enabled: Boolean(factory && account)},
  })

  const predicted = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'predictSplitter',
    args: account ? [account] : undefined,
    query: {enabled: Boolean(factory && account), staleTime: Infinity},
  })

  const address =
    deployed.data && deployed.data !== ZERO ? (deployed.data as Address) : undefined

  return {
    address,
    predicted: predicted.data as Address | undefined,
    isDeployed: Boolean(address),
    refetch: deployed.refetch,
  }
}

/** Lifetime settled volume and pending balance for a splitter. */
export function useSplitterStats(splitter: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      {abi: merchantSplitterAbi, address: splitter, functionName: 'lifetimeProcessed'},
      {abi: merchantSplitterAbi, address: splitter, functionName: 'pendingBalance'},
      {abi: merchantSplitterAbi, address: splitter, functionName: 'activeOffer'},
      {abi: merchantSplitterAbi, address: splitter, functionName: 'shareBps'},
    ],
    query: {enabled: Boolean(splitter), refetchInterval: 12_000},
  })

  const [processed, pending, activeOffer, shareBps] = result.data ?? []

  return {
    lifetimeProcessed: processed?.result as bigint | undefined,
    pendingBalance: pending?.result as bigint | undefined,
    activeOffer:
      activeOffer?.result && activeOffer.result !== ZERO
        ? (activeOffer.result as Address)
        : undefined,
    shareBps: shareBps?.result === undefined ? undefined : Number(shareBps.result),
    refetch: result.refetch,
    isLoading: result.isLoading,
  }
}

/** Whether a merchant has settled enough volume to raise. Payment history is the credit check. */
export function useEligibility(merchant: Address | undefined) {
  const factory = useFactoryAddress()

  const {data: minProcessed} = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'minProcessed',
    query: {enabled: Boolean(factory), staleTime: Infinity},
  })

  const {data, refetch} = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'isEligible',
    args: merchant ? [merchant] : undefined,
    query: {enabled: Boolean(factory && merchant), refetchInterval: 12_000},
  })

  const [eligible, processed] = (data as readonly [boolean, bigint] | undefined) ?? []

  return {
    minProcessed: minProcessed as bigint | undefined,
    isEligible: eligible ?? false,
    processed: processed as bigint | undefined,
    refetch,
  }
}

/** Every offer the factory has deployed, newest first. */
export function useAllOffers() {
  const factory = useFactoryAddress()

  const {data: addresses, refetch} = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'offersSlice',
    args: [0n, 200n],
    query: {enabled: Boolean(factory), refetchInterval: 20_000},
  })

  const list = (addresses as readonly Address[] | undefined) ?? []
  const snapshots = useOfferSnapshots(list)

  return {
    offers: useMemo(() => [...snapshots].reverse(), [snapshots]),
    isLoading: !addresses,
    refetch,
  }
}

export function useMerchantOffers(merchant: Address | undefined) {
  const factory = useFactoryAddress()

  const {data: addresses, refetch} = useReadContract({
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'offersOf',
    args: merchant ? [merchant] : undefined,
    query: {enabled: Boolean(factory && merchant), refetchInterval: 20_000},
  })

  const list = (addresses as readonly Address[] | undefined) ?? []
  const snapshots = useOfferSnapshots(list)

  return {offers: useMemo(() => [...snapshots].reverse(), [snapshots]), refetch}
}

/** Batch `snapshot()` across many offers — one struct read each, no log scanning. */
export function useOfferSnapshots(addresses: readonly Address[]): OfferSnapshot[] {
  const {data} = useReadContracts({
    contracts: addresses.map((address) => ({
      abi: weirOfferAbi,
      address,
      functionName: 'snapshot' as const,
    })),
    query: {enabled: addresses.length > 0, refetchInterval: 20_000},
  })

  return useMemo(() => {
    if (!data) return []
    const out: OfferSnapshot[] = []
    data.forEach((entry, i) => {
      if (entry.status === 'success' && entry.result) {
        out.push(decodeSnapshot(addresses[i], entry.result as readonly unknown[]))
      }
    })
    return out
  }, [data, addresses])
}

export function useOffer(address: Address | undefined) {
  const {address: account} = useAccount()

  const result = useReadContracts({
    contracts: [
      {abi: weirOfferAbi, address, functionName: 'snapshot'},
      {
        abi: weirOfferAbi,
        address,
        functionName: 'pending',
        args: account ? [account] : undefined,
      },
      {
        abi: weirOfferAbi,
        address,
        functionName: 'balanceOf',
        args: account ? [account, TOKEN_ID] : undefined,
      },
    ],
    query: {enabled: Boolean(address), refetchInterval: 12_000},
  })

  const [snapshot, pending, units] = result.data ?? []

  return {
    offer:
      snapshot?.status === 'success' && address
        ? decodeSnapshot(address, snapshot.result as readonly unknown[])
        : undefined,
    pending: pending?.result as bigint | undefined,
    units: units?.result as bigint | undefined,
    isLoading: result.isLoading,
    refetch: result.refetch,
  }
}
