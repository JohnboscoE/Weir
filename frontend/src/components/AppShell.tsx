import type {ReactNode} from 'react'
import {NavLink, useLocation} from 'react-router-dom'
import {useAccount} from 'wagmi'

import {useFactoryAddress} from '../hooks/useWeir'
import {shortAddress} from '../lib/format'
import {Wordmark} from './Brand'
import {NetworkChip, WalletButton} from './WalletButton'
import {Panel, cx} from './ui'

const NAV = [
  {to: '/merchant', label: 'Merchant'},
  {to: '/funder', label: 'Browse offers'},
]

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
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
        ) : !address ? (
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

/** Deploy first, then set the address — never silently read address zero. */
function NotConfigured() {
  return (
    <Panel className="border-warn/25 bg-warn/[0.04]">
      <h2 className="text-sm font-semibold text-warn">Factory address not configured</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        No <code className="text-ink">WeirFactory</code> address is set for the connected
        network. Deploy the contracts, then add the address to{' '}
        <code className="text-ink">frontend/.env.local</code>:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-[10px] border border-hairline bg-canvas p-3 text-xs text-muted">
        {`VITE_FACTORY_ADDRESS_677=0x…   # BOT Chain mainnet
VITE_FACTORY_ADDRESS_968=0x…   # BOT Chain testnet`}
      </pre>
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
