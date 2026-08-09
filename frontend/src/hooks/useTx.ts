import {useCallback, useEffect, useState} from 'react'
import type {BaseError} from 'viem'
import {useWaitForTransactionReceipt, useWriteContract} from 'wagmi'

/**
 * One transaction at a time, with the receipt awaited before anything refetches.
 * Contracts revert with custom errors (`NotEligible`, `Oversubscribed`, …); viem decodes
 * those into `shortMessage`, which is far more useful to show than a raw revert blob.
 */
export function useTx(onConfirmed?: () => void) {
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
      writeContract(args)
    },
    [writeContract],
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
