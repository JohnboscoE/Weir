import {useState} from 'react'
import type {Address} from 'viem'
import {useAccount} from 'wagmi'

import {mockUSDTAbi} from '../abi'
import {SUPPORTED_CHAINS} from '../config/chains'
import {useTx} from '../hooks/useTx'
import {useUsdt, useUsdtBalance, useWeirChainId} from '../hooks/useWeir'
import {formatUsdt, parseUsdt} from '../lib/format'
import {Button, Field, Panel} from './ui'

/**
 * Testnet-only mint. `MockUSDT.mint` is deliberately permissionless so the demo loop needs
 * no faucet server and no owner key.
 *
 * This renders only when the active chain is flagged `testnet`, which is a property of the
 * chain definition rather than a hardcoded id — real bridged USDT on 677 has no `mint` and
 * the call would simply revert, but a mint button on a mainnet screen is a credibility
 * problem well before it is a functional one.
 */
export function TestnetFaucet({
  target,
  title,
  description,
  defaultAmount = '25',
  onDone,
}: {
  /** Where the tokens land. The splitter, to simulate a customer paying the merchant. */
  target?: Address
  title: string
  description: string
  defaultAmount?: string
  onDone?: () => void
}) {
  const chainId = useWeirChainId()
  const {address: account} = useAccount()
  const {address: token, decimals, symbol} = useUsdt()
  const [amount, setAmount] = useState(defaultAmount)

  const recipient = target ?? account
  const balance = useUsdtBalance(recipient)

  const tx = useTx(() => {
    balance.refetch()
    onDone?.()
  })

  const isTestnet = SUPPORTED_CHAINS.find((c) => c.id === chainId)?.testnet === true
  if (!isTestnet || !account) return null

  const wei = parseUsdt(amount, decimals)

  return (
    <Panel className="border-dashed">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted">
          testnet only
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>

      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <Field
            label="Amount"
            suffix={symbol}
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={`recipient holds ${formatUsdt(balance.data, decimals)} ${symbol}`}
          />
        </div>
        <Button
          loading={tx.isPending}
          disabled={!wei || wei === 0n || !token || !recipient}
          onClick={() =>
            tx.send({
              abi: mockUSDTAbi,
              address: token!,
              functionName: 'mint',
              args: [recipient!, wei!],
            })
          }
        >
          Mint
        </Button>
      </div>

      {tx.error && <p className="mt-3 text-xs text-warn">{tx.error}</p>}
    </Panel>
  )
}
