import {useState} from 'react'
import {useParams} from 'react-router-dom'
import type {Address} from 'viem'
import {erc20Abi, isAddress} from 'viem'
import {useAccount, useChainId} from 'wagmi'

import {weirFactoryAbi, weirOfferAbi} from '../abi'
import {AppShell} from '../components/AppShell'
import {RiskDisclosure} from '../components/RiskDisclosure'
import {WalletButton} from '../components/WalletButton'
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Panel,
  ProgressBar,
  Row,
  Stat,
  TxError,
} from '../components/ui'
import {explorerUrl} from '../config/chains'
import {
  useFactoryAddress,
  useOffer,
  useSplitterStats,
  useUsdt,
  useUsdtAllowance,
  useUsdtBalance,
} from '../hooks/useWeir'
import {useTx} from '../hooks/useTx'
import {
  formatBps,
  formatDeadline,
  formatUsdt,
  parseUsdt,
  repaymentProgress,
  shortAddress,
  timeRemaining,
} from '../lib/format'
import {
  STATE_LABEL,
  STATE_TONE,
  canActivate,
  isOpenForFunding,
  isRefundable,
} from '../lib/offer'

export function OfferDetail() {
  const {address} = useParams<{address: string}>()
  const valid = address && isAddress(address)

  return (
    <AppShell
      title="Offer"
      subtitle={valid ? shortAddress(address, 6) : undefined}
      requiresWallet={false}
    >
      {valid ? <Detail offerAddress={address as Address} /> : <Empty title="Invalid offer address" />}
    </AppShell>
  )
}

function Detail({offerAddress}: {offerAddress: Address}) {
  const chainId = useChainId()
  const {address: account} = useAccount()
  const {decimals, symbol} = useUsdt()
  const {offer, pending, units, refetch, isLoading} = useOffer(offerAddress)
  const splitterStats = useSplitterStats(offer?.splitter)

  if (isLoading || !offer) return <Empty title="Loading offer…" />

  const repaidPct = repaymentProgress(offer.totalReceived, offer.terms.cap)
  const isMerchant = account?.toLowerCase() === offer.merchant.toLowerCase()
  const multiple = Number(offer.terms.cap) / Number(offer.terms.target)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted">Merchant</div>
              <a
                href={explorerUrl(chainId, 'address', offer.merchant)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block font-mono text-sm text-ink hover:text-accent"
              >
                {offer.merchant}
              </a>
            </div>
            <Badge tone={STATE_TONE[offer.state]}>{STATE_LABEL[offer.state]}</Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Settled by this merchant"
              value={formatUsdt(splitterStats.lifetimeProcessed, decimals)}
              unit={`${symbol} lifetime`}
            />
            <Stat
              label="Raising"
              value={formatUsdt(offer.terms.target, decimals)}
              unit={symbol}
            />
            <Stat
              label="Repayment cap"
              value={formatUsdt(offer.terms.cap, decimals)}
              unit={`${symbol} · ${multiple.toFixed(2)}×`}
            />
          </div>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>Repaid to funders</span>
              <span className="tabular">
                {formatUsdt(offer.totalReceived, decimals)} /{' '}
                {formatUsdt(offer.terms.cap, decimals)} {symbol} · {repaidPct.toFixed(1)}%
              </span>
            </div>
            <ProgressBar value={repaidPct} />
          </div>

          <div className="mt-6 grid gap-x-8 sm:grid-cols-2">
            <Row label="Revenue share" value={formatBps(offer.terms.shareBps)} />
            <Row label="Subscribed" value={`${formatUsdt(offer.raised, decimals)} ${symbol}`} />
            <Row
              label="Funding closes"
              value={`${formatDeadline(offer.terms.fundingEnds)} · ${timeRemaining(offer.terms.fundingEnds)}`}
            />
            <Row
              label="Offer expires"
              value={`${formatDeadline(offer.terms.expiresAt)} · ${timeRemaining(offer.terms.expiresAt)}`}
            />
            <Row
              label="Claimed so far"
              value={`${formatUsdt(offer.totalClaimed, decimals)} ${symbol}`}
            />
            <Row
              label="Splitter"
              value={
                <a
                  href={explorerUrl(chainId, 'address', offer.splitter)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {shortAddress(offer.splitter, 5)}
                </a>
              }
            />
          </div>
        </Card>

        <RiskDisclosure />
      </div>

      <div className="space-y-4">
        <YourPosition
          offerAddress={offerAddress}
          units={units}
          pending={pending}
          onDone={refetch}
        />

        {isOpenForFunding(offer) && (
          <Subscribe
            offerAddress={offerAddress}
            remaining={offer.terms.target - offer.raised}
            onDone={refetch}
          />
        )}

        {isRefundable(offer) && units !== undefined && units > 0n && (
          <RefundPanel offerAddress={offerAddress} units={units} onDone={refetch} />
        )}

        {isMerchant && canActivate(offer) && (
          <ActivatePanel
            offerAddress={offerAddress}
            target={offer.terms.target}
            onDone={refetch}
          />
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------

function YourPosition({
  offerAddress,
  units,
  pending,
  onDone,
}: {
  offerAddress: Address
  units?: bigint
  pending?: bigint
  onDone: () => void
}) {
  const {decimals, symbol} = useUsdt()
  const tx = useTx(onDone)

  if (units === undefined || units === 0n) {
    return (
      <Panel>
        <h3 className="text-sm font-medium text-ink">Your position</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          You hold no claim units in this offer.
        </p>
      </Panel>
    )
  }

  return (
    <Panel>
      <h3 className="text-sm font-medium text-ink">Your position</h3>
      <div className="mt-4">
        <Row label="Claim units" value={formatUsdt(units, decimals)} />
        <Row
          label="Claimable now"
          value={
            <span className="text-accent">
              {formatUsdt(pending, decimals)} {symbol}
            </span>
          }
        />
      </div>
      <Button
        className="mt-4 w-full"
        loading={tx.isPending}
        disabled={!pending || pending === 0n}
        onClick={() =>
          tx.send({abi: weirOfferAbi, address: offerAddress, functionName: 'claim'})
        }
      >
        {pending && pending > 0n
          ? `Claim ${formatUsdt(pending, decimals)} ${symbol}`
          : 'Nothing to claim'}
      </Button>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Claim units are transferable. Selling them moves future revenue to the buyer; anything
        you have already earned stays yours.
      </p>
      <TxError error={tx.error} />
    </Panel>
  )
}

function Subscribe({
  offerAddress,
  remaining,
  onDone,
}: {
  offerAddress: Address
  remaining: bigint
  onDone: () => void
}) {
  const {address: account} = useAccount()
  const {address: token, decimals, symbol} = useUsdt()
  const balance = useUsdtBalance(account)
  const allowance = useUsdtAllowance(account, offerAddress)
  const [amount, setAmount] = useState('')

  const tx = useTx(() => {
    onDone()
    allowance.refetch()
    balance.refetch()
  })

  const wei = parseUsdt(amount, decimals)
  const needsApproval = wei !== undefined && (allowance.data ?? 0n) < wei

  // The page itself is readable without a wallet; only the action needs a signer. Without
  // this the amount field would accept input and the button would enable, then fail at send
  // with a connector error — the offer is worth reading either way.
  if (!account) {
    return (
      <Panel>
        <h3 className="text-sm font-medium text-ink">Subscribe</h3>
        <p className="mt-2 text-sm text-muted">
          Connect a wallet to fund this offer. Reading the terms and the merchant's
          processed volume does not require one.
        </p>
        <div className="mt-4">
          <WalletButton />
        </div>
      </Panel>
    )
  }

  const problems: string[] = []
  if (wei !== undefined && wei > remaining)
    problems.push(
      `Only ${formatUsdt(remaining, decimals)} ${symbol} left — oversubscription is rejected, not pro-rated.`,
    )
  if (wei !== undefined && balance.data !== undefined && wei > balance.data)
    problems.push('Amount exceeds your balance.')

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">Subscribe</h3>
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => setAmount(formatUsdt(remaining, decimals).replace(/,/g, ''))}
        >
          Fill remaining
        </button>
      </div>

      <div className="mt-4">
        <Field
          label="Amount"
          suffix={symbol}
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`${formatUsdt(remaining, decimals)} ${symbol} remaining · you hold ${formatUsdt(balance.data, decimals)}`}
        />
      </div>

      {problems.map((p) => (
        <p key={p} className="mt-3 text-xs text-warn">
          {p}
        </p>
      ))}

      <Button
        className="mt-4 w-full"
        loading={tx.isPending}
        disabled={!wei || wei === 0n || problems.length > 0}
        onClick={() => {
          if (needsApproval) {
            tx.send({
              abi: erc20Abi,
              address: token!,
              functionName: 'approve',
              args: [offerAddress, wei!],
            })
          } else {
            tx.send({
              abi: weirOfferAbi,
              address: offerAddress,
              functionName: 'subscribe',
              args: [wei!],
            })
          }
        }}
      >
        {needsApproval ? `Approve ${symbol}` : 'Subscribe'}
      </Button>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Your {symbol} is held in escrow by the offer until the merchant activates. If the
        target is not met by the deadline, you can withdraw it in full.
      </p>
      <TxError error={tx.error} />
    </Panel>
  )
}

function RefundPanel({
  offerAddress,
  units,
  onDone,
}: {
  offerAddress: Address
  units: bigint
  onDone: () => void
}) {
  const {decimals, symbol} = useUsdt()
  const tx = useTx(onDone)

  return (
    <Panel className="border-warn/25">
      <h3 className="text-sm font-medium text-ink">Funding closed short of target</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        The merchant received nothing. Withdraw your escrow in full.
      </p>
      <Button
        className="mt-4 w-full"
        loading={tx.isPending}
        onClick={() =>
          tx.send({abi: weirOfferAbi, address: offerAddress, functionName: 'refund'})
        }
      >
        Refund {formatUsdt(units, decimals)} {symbol}
      </Button>
      <TxError error={tx.error} />
    </Panel>
  )
}

function ActivatePanel({
  offerAddress,
  target,
  onDone,
}: {
  offerAddress: Address
  target: bigint
  onDone: () => void
}) {
  const factory = useFactoryAddress()
  const {decimals, symbol} = useUsdt()
  const tx = useTx(onDone)

  return (
    <Panel className="border-accent/30">
      <h3 className="text-sm font-medium text-ink">Fully subscribed</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        Activating releases the escrow to you and points your splitter at this offer. From
        then on, every settlement is split until the cap is repaid.
      </p>
      <Button
        className="mt-4 w-full"
        loading={tx.isPending}
        disabled={!factory}
        onClick={() =>
          tx.send({
            abi: weirFactoryAbi,
            address: factory!,
            functionName: 'activateOffer',
            args: [offerAddress],
          })
        }
      >
        Activate & receive {formatUsdt(target, decimals)} {symbol}
      </Button>
      <TxError error={tx.error} />
    </Panel>
  )
}
