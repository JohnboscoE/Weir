import {useState} from 'react'
import {Link} from 'react-router-dom'
import type {Address} from 'viem'
import {useAccount, useChainId} from 'wagmi'

import {merchantSplitterAbi, weirFactoryAbi} from '../abi'
import {AppShell} from '../components/AppShell'
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
import {BPS_DENOMINATOR} from '../config/contracts'
import {
  useEligibility,
  useFactoryAddress,
  useMerchantOffers,
  useMerchantSplitter,
  useSplitterStats,
  useUsdt,
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
import {OfferState, STATE_LABEL, STATE_TONE, canActivate} from '../lib/offer'

export function Merchant() {
  return (
    <AppShell
      title="Merchant"
      subtitle="Collect revenue through your splitter, then raise against it."
    >
      <MerchantBody />
    </AppShell>
  )
}

function MerchantBody() {
  const {address} = useAccount()
  const splitter = useMerchantSplitter()

  if (!splitter.isDeployed) return <DeploySplitter predicted={splitter.predicted} onDone={splitter.refetch} />

  return (
    <div className="space-y-6">
      <SplitterOverview splitter={splitter.address!} />
      <OfferSection merchant={address!} splitter={splitter.address!} />
    </div>
  )
}

// --------------------------------------------------------------------------
// Step 1 — deploy the splitter
// --------------------------------------------------------------------------

function DeploySplitter({predicted, onDone}: {predicted?: Address; onDone: () => void}) {
  const factory = useFactoryAddress()
  const tx = useTx(onDone)

  return (
    <Card className="p-8">
      <h2 className="text-lg font-medium text-ink">Deploy your payment splitter</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Your splitter is the address your customers pay. It sweeps to you in full until you
        open an offer, and after that it divides every settlement between you and your
        funders automatically.
      </p>

      {predicted && (
        <div className="mt-6 max-w-2xl rounded-[10px] border border-hairline bg-canvas p-4">
          <div className="text-xs text-muted">
            Your splitter's address is deterministic — it is already reserved for you, and it
            will not change when you deploy.
          </div>
          <div className="mt-2 font-mono text-sm break-all text-accent">{predicted}</div>
        </div>
      )}

      <Button
        className="mt-6"
        loading={tx.isPending}
        disabled={!factory}
        onClick={() =>
          tx.send({abi: weirFactoryAbi, address: factory!, functionName: 'createSplitter'})
        }
      >
        Deploy splitter
      </Button>
      <TxError error={tx.error} />
    </Card>
  )
}

// --------------------------------------------------------------------------
// Step 2 — collect, settle, become eligible
// --------------------------------------------------------------------------

function SplitterOverview({splitter}: {splitter: Address}) {
  const {address} = useAccount()
  const chainId = useChainId()
  const {decimals, symbol} = useUsdt()
  const stats = useSplitterStats(splitter)
  const eligibility = useEligibility(address)
  const [copied, setCopied] = useState(false)

  const tx = useTx(() => {
    stats.refetch()
    eligibility.refetch()
  })

  const progress =
    eligibility.processed !== undefined && eligibility.minProcessed
      ? repaymentProgress(eligibility.processed, eligibility.minProcessed)
      : 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Lifetime settled"
            value={formatUsdt(stats.lifetimeProcessed, decimals)}
            unit={symbol}
          />
          <Stat
            label="Awaiting settlement"
            value={formatUsdt(stats.pendingBalance, decimals)}
            unit={symbol}
          />
          <Stat
            label="Revenue share while active"
            value={stats.shareBps ? formatBps(stats.shareBps) : '—'}
            unit={stats.activeOffer ? 'to funder pool' : 'no active offer'}
          />
        </div>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-ink">Settle collected revenue</h3>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted">
                Payments accumulate at your splitter — an incoming transfer cannot be hooked,
                so a settlement sweeps the whole balance at once. Anyone can trigger it; the
                money always goes to you and your funders, never to the caller.
              </p>
            </div>
            <Button
              loading={tx.isPending}
              disabled={!stats.pendingBalance || stats.pendingBalance === 0n}
              onClick={() =>
                tx.send({
                  abi: merchantSplitterAbi,
                  address: splitter,
                  functionName: 'settle',
                })
              }
            >
              {stats.pendingBalance && stats.pendingBalance > 0n
                ? `Settle ${formatUsdt(stats.pendingBalance, decimals)} ${symbol}`
                : 'Nothing to settle'}
            </Button>
          </div>
          <TxError error={tx.error} />
        </Panel>

        {!eligibility.isEligible && (
          <Panel>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-ink">Eligibility to raise</h3>
              <Badge tone="muted">
                {formatUsdt(eligibility.processed, decimals)} /{' '}
                {formatUsdt(eligibility.minProcessed, decimals)} {symbol}
              </Badge>
            </div>
            <ProgressBar className="mt-4" value={progress} />
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Settle at least {formatUsdt(eligibility.minProcessed, decimals)} {symbol} through
              this splitter before opening a raise. There is no credit score and no identity
              check — your payment history is the assessment.
            </p>
          </Panel>
        )}
      </div>

      <Panel className="h-fit">
        <h3 className="text-sm font-medium text-ink">Your payment address</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Share this with your customers to accept {symbol}.
        </p>

        <div className="mt-4 rounded-[10px] border border-hairline bg-canvas p-3">
          <div className="font-mono text-xs break-all text-accent">{splitter}</div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              navigator.clipboard.writeText(splitter)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </Button>
          <a
            href={explorerUrl(chainId, 'address', splitter)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-[10px] border border-hairline bg-surface px-3 py-2.5 text-sm text-muted transition hover:text-ink"
          >
            Explorer
          </a>
        </div>

        {eligibility.isEligible && (
          <div className="mt-4">
            <Badge tone="accent">Eligible to raise</Badge>
          </div>
        )}
      </Panel>
    </div>
  )
}

// --------------------------------------------------------------------------
// Step 3 — offers
// --------------------------------------------------------------------------

function OfferSection({merchant, splitter}: {merchant: Address; splitter: Address}) {
  const {offers, refetch} = useMerchantOffers(merchant)
  const eligibility = useEligibility(merchant)
  const stats = useSplitterStats(splitter)
  const {decimals, symbol} = useUsdt()
  const factory = useFactoryAddress()
  const tx = useTx(() => {
    refetch()
    stats.refetch()
  })

  const live = offers.find(
    (o) =>
      o.state === OfferState.Active ||
      (o.state === OfferState.Funding && Number(o.terms.fundingEnds) * 1000 > Date.now()),
  )

  return (
    <div className="space-y-6">
      {live ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-ink">Current offer</h3>
              <Badge tone={STATE_TONE[live.state]}>{STATE_LABEL[live.state]}</Badge>
            </div>
            <div className="flex gap-2">
              {canActivate(live) && (
                <Button
                  loading={tx.isPending}
                  onClick={() =>
                    tx.send({
                      abi: weirFactoryAbi,
                      address: factory!,
                      functionName: 'activateOffer',
                      args: [live.address],
                    })
                  }
                >
                  Activate & receive {formatUsdt(live.terms.target, decimals)} {symbol}
                </Button>
              )}
              <Link
                to={`/offer/${live.address}`}
                className="inline-flex items-center rounded-[10px] border border-hairline bg-surface px-4 py-2.5 text-sm text-ink transition hover:border-accent/50"
              >
                View details
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-x-8 sm:grid-cols-2">
            <Row label="Raised" value={`${formatUsdt(live.raised, decimals)} / ${formatUsdt(live.terms.target, decimals)}`} />
            <Row label="Repaid" value={`${formatUsdt(live.totalReceived, decimals)} / ${formatUsdt(live.terms.cap, decimals)}`} />
            <Row label="Revenue share" value={formatBps(live.terms.shareBps)} />
            <Row label="Expires" value={formatDeadline(live.terms.expiresAt)} />
          </div>

          {live.state === OfferState.Active && (
            <ProgressBar
              className="mt-4"
              value={repaymentProgress(live.totalReceived, live.terms.cap)}
            />
          )}
          <TxError error={tx.error} />
        </Panel>
      ) : eligibility.isEligible ? (
        <CreateOffer onCreated={refetch} />
      ) : (
        <Empty title="No offer yet">
          Settle enough revenue through your splitter to unlock raising.
        </Empty>
      )}

      {offers.length > 0 && <OfferHistory offers={offers} />}
    </div>
  )
}

function CreateOffer({onCreated}: {onCreated: () => void}) {
  const factory = useFactoryAddress()
  const {decimals, symbol} = useUsdt()
  const tx = useTx(onCreated)

  const [target, setTarget] = useState('100')
  const [cap, setCap] = useState('120')
  const [sharePct, setSharePct] = useState('15')
  const [fundingDays, setFundingDays] = useState('3')
  const [termDays, setTermDays] = useState('90')

  const targetWei = parseUsdt(target, decimals)
  const capWei = parseUsdt(cap, decimals)
  const shareBps = Math.round(Number(sharePct) * 100)

  const problems: string[] = []
  if (!targetWei || targetWei === 0n) problems.push('Target must be greater than zero.')
  if (!capWei || (targetWei && capWei <= targetWei))
    problems.push('Cap must be greater than the target — that difference is the funder return.')
  if (!(shareBps > 0 && shareBps <= BPS_DENOMINATOR))
    problems.push('Revenue share must be between 0% and 100%.')
  if (Number(termDays) <= Number(fundingDays))
    problems.push('The repayment window must end after funding closes.')

  const submit = () => {
    const now = Math.floor(Date.now() / 1000)
    tx.send({
      abi: weirFactoryAbi,
      address: factory!,
      functionName: 'createOffer',
      args: [
        {
          target: targetWei!,
          cap: capWei!,
          shareBps,
          fundingEnds: BigInt(now + Number(fundingDays) * 86_400),
          expiresAt: BigInt(now + Number(termDays) * 86_400),
        },
      ],
    })
  }

  const multiple = targetWei && capWei && targetWei > 0n ? Number(capWei) / Number(targetWei) : 0

  return (
    <Card className="p-6">
      <h3 className="text-sm font-medium text-ink">Open a raise</h3>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
        You receive the full target on activation. From then on, the chosen share of every
        settlement goes to your funders until the cap is repaid — then the offer closes and
        100% returns to you.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Target raise"
          suffix={symbol}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Field
          label="Repayment cap"
          suffix={symbol}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          hint={multiple > 0 ? `${multiple.toFixed(2)}× the raise` : undefined}
        />
        <Field
          label="Revenue share"
          suffix="%"
          value={sharePct}
          onChange={(e) => setSharePct(e.target.value)}
          hint="Of every settlement, while active"
        />
        <Field
          label="Funding window"
          suffix="days"
          value={fundingDays}
          onChange={(e) => setFundingDays(e.target.value)}
        />
        <Field
          label="Repayment window"
          suffix="days"
          value={termDays}
          onChange={(e) => setTermDays(e.target.value)}
          hint="After this, unrepaid offers expire"
        />
      </div>

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1">
          {problems.map((p) => (
            <li key={p} className="text-xs text-warn">
              {p}
            </li>
          ))}
        </ul>
      )}

      <Button
        className="mt-6"
        loading={tx.isPending}
        disabled={problems.length > 0 || !factory}
        onClick={submit}
      >
        Create offer
      </Button>
      <TxError error={tx.error} />
    </Card>
  )
}

function OfferHistory({offers}: {offers: ReturnType<typeof useMerchantOffers>['offers']}) {
  const {decimals, symbol} = useUsdt()

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline px-5 py-4">
        <h3 className="text-sm font-medium text-ink">Repayment record</h3>
        <p className="mt-1 text-xs text-muted">
          Public and permanent. Funders read this before committing.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Offer</th>
              <th className="px-5 py-3 font-medium">Raised</th>
              <th className="px-5 py-3 font-medium">Repaid</th>
              <th className="px-5 py-3 font-medium">Share</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.address} className="border-b border-hairline/50 last:border-0">
                <td className="px-5 py-3">
                  <Link to={`/offer/${o.address}`} className="text-accent hover:underline">
                    {shortAddress(o.address, 5)}
                  </Link>
                </td>
                <td className="px-5 py-3 text-ink tabular">
                  {formatUsdt(o.raised, decimals)} {symbol}
                </td>
                <td className="px-5 py-3 text-ink tabular">
                  {formatUsdt(o.totalReceived, decimals)} / {formatUsdt(o.terms.cap, decimals)}
                </td>
                <td className="px-5 py-3 text-muted tabular">{formatBps(o.terms.shareBps)}</td>
                <td className="px-5 py-3">
                  <Badge tone={STATE_TONE[o.state]}>
                    {STATE_LABEL[o.state]}
                    {o.state === OfferState.Funding && ` · ${timeRemaining(o.terms.fundingEnds)}`}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
