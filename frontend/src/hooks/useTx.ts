import {useCallback, useEffect, useState} from 'react'
import type {BaseError} from 'viem'
import {useWaitForTransactionReceipt, useWriteContract} from 'wagmi'

import {useWeirChainId} from './useWeir'

/**
 * One transaction at a time, with the receipt awaited before anything refetches.
 * Contracts revert with custom errors (`NotEligible`, `Oversubscribed`, …); viem decodes
 * those into `shortMessage`, which is far more useful to show than a raw revert blob.
 *
 * Every write pins `chainId` to the chain the UI is reading from. Without it, viem sends
 * to whatever chain the wallet happens to be on — so a wallet sitting on Base would get a
 * transaction addressed to Weir's factory address on *Base*, where nothing of ours is
 * deployed, and be asked to pay Base gas for it. Pinning turns that into a chain-mismatch
 * error (or a switch prompt) before anything is signed. It is set here rather than at each
 * call site so a new write cannot be added without it.
 */
export function useTx(onConfirmed?: () => void) {
  const chainId = useWeirChainId()
  const {writeContract, data: hash, isPending, error, reset} = useWriteContract()
  const [label, setLabel] = useState<string>()

  const receipt = useWaitForTransactionReceipt({hash})

  useEffect(() => {
    if (receipt.isSuccess) {
      onConfirmed?.()
      setLabel(undefined)
    }
    // `onConfirmed` is recreated per render by callers; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess])

  const send = useCallback(
    (args: Parameters<typeof writeContract>[0], actionLabel?: string) => {
      setLabel(actionLabel)
      writeContract({...args, chainId})
    },
    [writeContract, chainId],
  )

  const failure = (error ?? receipt.error) as BaseError | null | undefined

  return {
    send,
    reset,
    hash,
    label,
    isPending: isPending || receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: failure ? (failure.shortMessage ?? failure.message) : undefined,
  }
}
