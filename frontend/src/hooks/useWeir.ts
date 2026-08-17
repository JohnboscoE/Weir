import {useMemo} from 'react'
import type {Address} from 'viem'
import {erc20Abi} from 'viem'
import {useAccount, useReadContract, useReadContracts} from 'wagmi'

import {merchantSplitterAbi, weirFactoryAbi, weirOfferAbi} from '../abi'
import {SUPPORTED_CHAINS, type WeirChainId} from '../config/chains'
import {TOKEN_ID, defaultReadChainId, factoryAddress} from '../config/contracts'
import {decodeSnapshot, type OfferSnapshot} from '../lib/offer'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * There is no indexer on BOT Chain, so nothing here scans event logs over wide block
 * ranges. Every list comes from an on-chain array in the factory, and every detail from
 * a struct read. wagmi batches these into multicall where the chain supports it and
 * falls back to individual eth_calls where it does not — either way the reads work.
 */

/**
 * The chain the wallet is *actually* on, including chains Weir does not support.
 *
 * Deliberately not `useChainId()`. That returns `config.state.chainId`, which wagmi
 * refuses to move to an unconfigured chain — see the `isChainConfigured` guard in
 * `@wagmi/core`'s `createConfig`. So a wallet that switches to Base leaves `useChainId()`
 * reporting 677, and every check built on it concludes all is well while the wallet is
 * somewhere else entirely. `useAccount().chainId` comes from the connection itself and
 * reports the truth.
 */
export function useWalletChainId() {
  const {isConnected, chainId} = useAccount()
  return isConnected ? chainId : undefined
}

/**
 * The chain every read in this file targets. A connected wallet decides; a visitor with no
 * wallet gets the first chain that actually has a deployment.
 *
 * `undefined` when the wallet is on a chain Weir has no deployment on. That propagates to
 * `useFactoryAddress`, which is what makes `AppShell` show its wrong-network panel instead
 * of rendering a working-looking surface whose buttons would send transactions into the
 * void.
 *
 * Every `useReadContract` below passes this explicitly rather than letting wagmi infer the
 * ambient chain. If the factory address were resolved for one chain while the reads ran
 * against another, the calls would return empty rather than error — an offer list that is
 * silently, plausibly wrong is worse than one that fails loudly.
 */
export function useWeirChainId(): WeirChainId | undefined {
  const wallet = useWalletChainId()
  if (wallet === undefined) return defaultReadChainId()
  return SUPPORTED_CHAINS.find((c) => c.id === wallet)?.id
}

export function useFactoryAddress() {
  const chainId = useWeirChainId()
  return useMemo(() => factoryAddress(chainId), [chainId])
}

/** USDT metadata, read from the token rather than assumed. Decimals are the whole point. */
export function useUsdt() {
  const chainId = useWeirChainId()
  const factory = useFactoryAddress()

  const {data: token} = useReadContract({
    chainId,
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'usdt',
    query: {enabled: Boolean(factory)},
  })

  const {data: decimals} = useReadContract({
    chainId,
    abi: erc20Abi,
    address: token,
    functionName: 'decimals',
    query: {enabled: Boolean(token), staleTime: Infinity},
  })

  const {data: symbol} = useReadContract({
    chainId,
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
  const chainId = useWeirChainId()
  const {address: token} = useUsdt()
  return useReadContract({
    chainId,
    abi: erc20Abi,
    address: token,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    query: {enabled: Boolean(token && owner)},
  })
}

export function useUsdtAllowance(owner: Address | undefined, spender: Address | undefined) {
  const chainId = useWeirChainId()
  const {address: token} = useUsdt()
  return useReadContract({
    chainId,
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
  const chainId = useWeirChainId()
  const factory = useFactoryAddress()

  const deployed = useReadContract({
    chainId,
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'splitterOf',
    args: account ? [account] : undefined,
    query: {enabled: Boolean(factory && account)},
  })

  const predicted = useReadContract({
    chainId,
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
  const chainId = useWeirChainId()

  const result = useReadContracts({
    contracts: [
      {chainId, abi: merchantSplitterAbi, address: splitter, functionName: 'lifetimeProcessed'},
      {chainId, abi: merchantSplitterAbi, address: splitter, functionName: 'pendingBalance'},
      {chainId, abi: merchantSplitterAbi, address: splitter, functionName: 'activeOffer'},
      {chainId, abi: merchantSplitterAbi, address: splitter, functionName: 'shareBps'},
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
  const chainId = useWeirChainId()
  const factory = useFactoryAddress()

  const {data: minProcessed} = useReadContract({
    chainId,
    abi: weirFactoryAbi,
    address: factory,
    functionName: 'minProcessed',
    query: {enabled: Boolean(factory), staleTime: Infinity},
  })

  const {data, refetch} = useReadContract({
    chainId,
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
  const chainId = useWeirChainId()
  const factory = useFactoryAddress()

  const {data: addresses, refetch} = useReadContract({
    chainId,
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
  const chainId = useWeirChainId()
  const factory = useFactoryAddress()

  const {data: addresses, refetch} = useReadContract({
    chainId,
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
  const chainId = useWeirChainId()

  const {data} = useReadContracts({
    contracts: addresses.map((address) => ({
      chainId,
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
  const chainId = useWeirChainId()

  const result = useReadContracts({
    contracts: [
      {chainId, abi: weirOfferAbi, address, functionName: 'snapshot'},
      {
        chainId,
        abi: weirOfferAbi,
        address,
        functionName: 'pending',
        args: account ? [account] : undefined,
      },
      {
        chainId,
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
