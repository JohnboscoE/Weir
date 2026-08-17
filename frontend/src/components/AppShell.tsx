import type {ReactNode} from 'react'
import {NavLink, useLocation} from 'react-router-dom'
import {useAccount} from 'wagmi'

import {SUPPORTED_CHAINS, botChain} from '../config/chains'
import {factoryAddress} from '../config/contracts'
import {useFactoryAddress, useWalletChainId} from '../hooks/useWeir'
import {shortAddress} from '../lib/format'
import {Wordmark} from './Brand'
import {NetworkDetails, useNetworkSwitch} from './NetworkSwitch'
import {NetworkChip, WalletButton} from './WalletButton'
import {Panel, cx} from './ui'

const NAV = [
  {to: '/merchant', label: 'Merchant'},
  {to: '/funder', label: 'Browse offers'},
]

export function AppShell({
  title,
  subtitle,
  /**
   * Whether the surface needs a signer. Browsing offers is a read — a funder evaluating
   * the risk disclosure, the terms and the merchant's processed volume should not have to
   * connect a wallet to do it, and a judge landing on the page certainly should not.
   * Surfaces that actually transact (the merchant dashboard) leave this on.
   */
  requiresWallet = true,
  children,
}: {
  title: string
  subtitle?: string
  requiresWallet?: boolean
  children: ReactNode
}) {
  const {address} = useAccount()
  const factory = useFactoryAddress()
  const {pathname} = useLocation()

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <Wordmark />
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({isActive}) =>
                  cx(
                    'rounded-[10px] px-3 py-1.5 text-sm transition',
                    isActive || pathname.startsWith(item.to)
                      ? 'bg-raised text-ink'
                      : 'text-muted hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <NetworkChip />
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>

        {!factory ? (
          <NotConfigured />
        ) : requiresWallet && !address ? (
          <Panel className="text-center">
            <p className="text-sm text-muted">Connect a wallet to continue.</p>
            <div className="mt-4 flex justify-center">
              <WalletButton />
            </div>
          </Panel>
        ) : (
          children
        )}
      </main>
    </div>
  )
}

/**
 * Deploy first, then set the address — never silently read address zero.
 *
 * Names the offending chain rather than saying "the connected network". The overwhelmingly
 * common cause is a wallet pointed at a chain that has no deployment yet, which is a
 * one-click fix, not a configuration error — so offer the click when another supported
 * chain does have a factory.
 */
function NotConfigured() {
  // The wallet's real chain, so someone on Base is told they are on Base rather than
  // being shown a supported chain's name they are not actually connected to.
  const chainId = useWalletChainId()

  const current = SUPPORTED_CHAINS.find((c) => c.id === chainId)
  const deployed = SUPPORTED_CHAINS.find((c) => factoryAddress(c.id))

  // Adds the chain when the wallet has never seen it, which is the common case here: the
  // visitor is on Ethereum or BSC and no wallet ships BOT Chain by default. A plain
  // `switchChain` fails for exactly the people this panel exists to rescue.
  const {switchToWeir, pending, error, needsManual} = useNetworkSwitch(deployed ?? botChain)

  return (
    <Panel className="border-warn/25 bg-warn/[0.04]">
      <h2 className="text-sm font-semibold text-warn">
        No deployment on {current?.name ?? `chain ${chainId}`}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        No <code className="text-ink">WeirFactory</code> address is configured for{' '}
        <span className="text-ink">{current?.name ?? `chain ${chainId}`}</span> (id{' '}
        <span className="tabular text-ink">{chainId}</span>).
        {deployed
          ? ` Weir is deployed on ${deployed.name} — switch networks to continue.`
          : ' Deploy the contracts, then add the address to frontend/.env.local:'}
      </p>

      {deployed ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={switchToWeir}
              className="rounded-[10px] bg-accent px-3.5 py-2 text-sm font-medium text-canvas transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? 'Switching…' : `Switch to ${deployed.name}`}
            </button>
            {error && <span className="text-xs text-warn">{error}</span>}
          </div>

          {needsManual && <NetworkDetails chain={deployed} className="mt-3" />}
        </>
      ) : (
        <pre className="mt-3 overflow-x-auto rounded-[10px] border border-hairline bg-canvas p-3 text-xs text-muted">
          {`VITE_FACTORY_ADDRESS_677=0x…   # BOT Chain mainnet
VITE_FACTORY_ADDRESS_968=0x…   # BOT Chain testnet`}
        </pre>
      )}
    </Panel>
  )
}

export function AddressPill({address, label}: {address?: string; label?: string}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised px-2.5 py-1 text-xs text-muted">
      {label && <span className="text-muted/70">{label}</span>}
      <span className="text-ink tabular">{shortAddress(address, 5)}</span>
    </span>
  )
}
