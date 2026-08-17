import {useAccount, useConnect, useDisconnect} from 'wagmi'

import {SUPPORTED_CHAINS} from '../config/chains'
import {defaultReadChainId} from '../config/contracts'
import {useWalletChainId} from '../hooks/useWeir'
import {shortAddress} from '../lib/format'
import {NetworkDetails, useNetworkSwitch} from './NetworkSwitch'
import {Badge, Button, Dot} from './ui'

export function NetworkChip() {
  // The wallet's real chain, not wagmi's config state — the latter stays pinned to a
  // configured chain and would report "BOT Chain (677)" to someone sitting on Base.
  const walletChainId = useWalletChainId()
  const {isConnected} = useAccount()
  const {switchToWeir, pending, needsManual, target} = useNetworkSwitch()

  // With no wallet the app reads from a chain of its own choosing, and there is nothing to
  // warn about — browsing offers deliberately requires no wallet.
  const chainId = walletChainId ?? defaultReadChainId()
  const known = SUPPORTED_CHAINS.find((c) => c.id === chainId)

  // BOT Chain's docs disagree about which id is mainnet, so the id the wallet actually
  // reports is shown rather than a label we assumed.
  if (isConnected && !known) {
    return (
      <div className="relative">
        <button
          onClick={switchToWeir}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn disabled:opacity-60"
        >
          <Dot tone="warn" />
          {pending ? `Switching to ${target.name}…` : `Wrong network (${chainId}) — switch`}
        </button>

        {/* Anchored to the chip so the header does not reflow when the add is refused. */}
        {needsManual && (
          <NetworkDetails className="absolute top-full right-0 z-20 mt-2 w-80 shadow-xl" />
        )}
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink">
      <Dot tone={isConnected ? 'accent' : 'muted'} />
      {known?.name ?? `Chain`} ({chainId})
    </span>
  )
}

export function WalletButton() {
  const {address, isConnected} = useAccount()
  const {connect, connectors, isPending} = useConnect()
  const {disconnect} = useDisconnect()

  if (isConnected) {
    return (
      <button onClick={() => disconnect()} title="Disconnect">
        <Badge tone="accent">
          <Dot />
          {shortAddress(address)}
        </Badge>
      </button>
    )
  }

  const injected = connectors[0]

  return (
    <Button
      variant="primary"
      loading={isPending}
      disabled={!injected}
      onClick={() => injected && connect({connector: injected})}
    >
      {injected ? 'Connect Wallet' : 'No wallet found'}
    </Button>
  )
}
