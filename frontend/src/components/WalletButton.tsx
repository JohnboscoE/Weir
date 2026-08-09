import {useAccount, useChainId, useConnect, useDisconnect, useSwitchChain} from 'wagmi'

import {SUPPORTED_CHAINS, botChain} from '../config/chains'
import {shortAddress} from '../lib/format'
import {Badge, Button, Dot} from './ui'

export function NetworkChip() {
  const chainId = useChainId()
  const {isConnected} = useAccount()
  const {switchChain} = useSwitchChain()

  const known = SUPPORTED_CHAINS.find((c) => c.id === chainId)

  // BOT Chain's docs disagree about which id is mainnet, so the id the wallet actually
  // reports is shown rather than a label we assumed.
  if (!known) {
    return (
      <button
        onClick={() => switchChain({chainId: botChain.id})}
        className="inline-flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn"
      >
        <Dot tone="warn" />
        Wrong network ({chainId}) — switch
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink">
      <Dot tone={isConnected ? 'accent' : 'muted'} />
      {known.name} ({known.id})
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
