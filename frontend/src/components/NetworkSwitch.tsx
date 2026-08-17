import {useState} from 'react'
import {toHex} from 'viem'
import {useAccount, useSwitchChain} from 'wagmi'

import {type WeirChain, botChain} from '../config/chains'
import {cx} from './ui'

/**
 * The exact object `wallet_addEthereumChain` wants, derived from the viem chain
 * definition rather than written out again — the two drifting apart is how a user ends up
 * adding a network that points at the wrong RPC and then cannot work out why nothing
 * loads. This is also what the manual-entry table renders, so what a user types by hand
 * and what the button sends are guaranteed to agree.
 */
export function networkParams(chain: WeirChain) {
  return {
    chainId: toHex(chain.id),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls.default.http],
    blockExplorerUrls: [chain.blockExplorers.default.url],
  }
}

type Provider = {request: (args: {method: string; params?: unknown[]}) => Promise<unknown>}

/**
 * Switch the wallet to a Weir chain, adding it first if the wallet has never heard of it.
 *
 * wagmi's injected connector already retries with `wallet_addEthereumChain` on some
 * wallets, but not all of them, and BOT Chain is in no wallet's built-in list — so for
 * most visitors the add is the step that actually matters. Doing it explicitly means the
 * behaviour does not depend on which wallet is installed.
 *
 * A rejected request is not a failure worth shouting about: the user said no. It is
 * reported the same as any other error, but `needsManual` only trips for the case that a
 * manual walkthrough would actually help.
 */
export function useNetworkSwitch(target: WeirChain = botChain) {
  const {connector, isConnected} = useAccount()
  const {switchChainAsync} = useSwitchChain()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [needsManual, setNeedsManual] = useState(false)

  async function switchToWeir() {
    setPending(true)
    setError(undefined)
    setNeedsManual(false)

    try {
      await switchChainAsync({chainId: target.id})
      return true
    } catch (switchError) {
      // Fall through to adding the chain — the usual cause is that the wallet has no
      // entry for this id at all, which no amount of retrying `switchChain` will fix.
      try {
        const provider = (await connector?.getProvider()) as Provider | undefined
        if (!provider) throw switchError

        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [networkParams(target)],
        })
        await switchChainAsync({chainId: target.id})
        return true
      } catch (addError) {
        setError(message(addError))
        setNeedsManual(true)
        return false
      }
    } finally {
      setPending(false)
    }
  }

  return {switchToWeir, pending, error, needsManual, isConnected, target}
}

function message(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as {message: unknown}).message).split('\n')[0]
  }
  return 'Could not switch network.'
}

/**
 * The manual fallback. Every automated path can be refused by the wallet, and a judge who
 * cannot reach the app because their wallet would not take the network is a judge who
 * scores nothing — so the values are always available to type in by hand.
 */
export function NetworkDetails({
  chain = botChain,
  className,
}: {
  chain?: WeirChain
  className?: string
}) {
  const rows = [
    ['Network name', chain.name],
    ['RPC URL', chain.rpcUrls.default.http[0]],
    ['Chain ID', String(chain.id)],
    ['Currency symbol', chain.nativeCurrency.symbol],
    ['Block explorer', chain.blockExplorers.default.url],
  ] as const

  return (
    <div className={cx('rounded-[10px] border border-hairline bg-canvas p-3', className)}>
      <p className="text-xs text-muted">
        Or add it by hand in your wallet's network settings:
      </p>
      <dl className="mt-2.5 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 text-xs">
            <dt className="w-28 shrink-0 text-muted">{label}</dt>
            <dd className="tabular min-w-0 flex-1 truncate text-ink" title={value}>
              {value}
            </dd>
            <CopyButton value={value} />
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Adds the USDT token to the wallet's asset list.
 *
 * Adding a network registers only its *native* currency, so a wallet freshly pointed at
 * BOT Chain shows a BOT balance and no USDT — which reads as "my money is gone" to anyone
 * who does not know that ERC-20s are tracked separately. Every surface here is denominated
 * in USDT, so the balance being invisible is not cosmetic.
 *
 * Renders nothing until the token address and decimals have been read from chain. Decimals
 * are never assumed: passing the wrong value here makes the wallet display a balance off
 * by orders of magnitude, which is worse than showing none at all.
 */
export function AddTokenButton({
  address,
  symbol,
  decimals,
  className,
}: {
  address?: string
  symbol?: string
  decimals?: number
  className?: string
}) {
  const {connector, isConnected} = useAccount()
  const [added, setAdded] = useState(false)
  const [error, setError] = useState<string>()

  if (!isConnected || !address || decimals === undefined) return null

  async function add() {
    setError(undefined)
    try {
      const provider = (await connector?.getProvider()) as Provider | undefined
      if (!provider) throw new Error('No wallet provider.')

      await provider.request({
        method: 'wallet_watchAsset',
        params: [{type: 'ERC20', options: {address, symbol, decimals}}] as unknown[],
      })
      setAdded(true)
    } catch (watchError) {
      setError(message(watchError))
    }
  }

  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={add}
        className="rounded-[8px] border border-hairline px-2 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-ink"
      >
        {added ? `${symbol} added` : `Add ${symbol} to wallet`}
      </button>
      {error && <span className="text-[10px] text-warn">{error}</span>}
    </span>
  )
}

function CopyButton({value}: {value: string}) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="shrink-0 rounded-[6px] border border-hairline px-1.5 py-0.5 text-[10px] text-muted transition hover:border-accent/50 hover:text-ink"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}
