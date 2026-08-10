import {Link} from 'react-router-dom'

import {AppShell} from '../components/AppShell'
import {RiskDisclosure} from '../components/RiskDisclosure'
import {Badge, Card, Empty, ProgressBar, Row} from '../components/ui'
import {useAllOffers, useSplitterStats, useUsdt} from '../hooks/useWeir'
import {
  formatBps,
  formatUsdt,
  repaymentProgress,
  shortAddress,
  timeRemaining,
} from '../lib/format'
import {
  OfferState,
  STATE_LABEL,
  STATE_TONE,
  isOpenForFunding,
  type OfferSnapshot,
} from '../lib/offer'

export function Funder() {
  return (
    <AppShell
      title="Browse offers"
      subtitle="Buy a slice of a merchant's future receipts, repaid automatically from revenue."
      requiresWallet={false}
    >
      <FunderBody />
    </AppShell>
  )
}

function FunderBody() {
  const {offers, isLoading} = useAllOffers()

  const open = offers.filter((o) => isOpenForFunding(o))
  const active = offers.filter((o) => o.state === OfferState.Active)
  const closed = offers.filter(
    (o) => o.state === OfferState.Repaid || o.state === OfferState.Expired,
  )

  if (isLoading) return <Empty title="Loading offers…" />

  return (
    <div className="space-y-8">
      <RiskDisclosure />

      <Section title="Open for funding" empty="No offers are open for funding right now.">
        {open.map((o) => (
          <OfferCard key={o.address} offer={o} />
        ))}
      </Section>

      <Section title="Repaying" empty="No offers are currently repaying.">
        {active.map((o) => (
          <OfferCard key={o.address} offer={o} />
        ))}
      </Section>

      {closed.length > 0 && (
        <Section title="Closed" empty="">
          {closed.map((o) => (
            <OfferCard key={o.address} offer={o} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-ink">{title}</h2>
      {children.length === 0 ? (
        empty ? (
          <Empty title={empty} />
        ) : null
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  )
}

function OfferCard({offer}: {offer: OfferSnapshot}) {
  const {decimals, symbol} = useUsdt()
  const stats = useSplitterStats(offer.splitter)

  const fundingPct =
    offer.terms.target === 0n ? 0 : repaymentProgress(offer.raised, offer.terms.target)
  const repaidPct = repaymentProgress(offer.totalReceived, offer.terms.cap)
  const isFunding = offer.state === OfferState.Funding
  const multiple = Number(offer.terms.cap) / Number(offer.terms.target)

  return (
    <Link to={`/offer/${offer.address}`} className="block">
      <Card className="h-full p-5 transition hover:border-accent/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted">Merchant</div>
            <div className="mt-1 font-mono text-sm text-ink">
              {shortAddress(offer.merchant, 5)}
            </div>
          </div>
          <Badge tone={STATE_TONE[offer.state]}>{STATE_LABEL[offer.state]}</Badge>
        </div>

        {/* Processed volume is the underwriting signal — surface it before the terms. */}
        <div className="mt-4 rounded-[10px] border border-hairline bg-raised px-3 py-2.5">
          <div className="text-xs text-muted">Settled through this splitter</div>
          <div className="mt-0.5 text-lg font-semibold text-accent tabular">
            {formatUsdt(stats.lifetimeProcessed, decimals)} {symbol}
          </div>
        </div>

        <div className="mt-4">
          <Row
            label="Raising"
            value={`${formatUsdt(offer.terms.target, decimals)} ${symbol}`}
          />
          <Row
            label="Repayment cap"
            value={`${formatUsdt(offer.terms.cap, decimals)} ${symbol} · ${multiple.toFixed(2)}×`}
          />
          <Row label="Revenue share" value={formatBps(offer.terms.shareBps)} />
          <Row
            label={isFunding ? 'Funding closes' : 'Offer expires'}
            value={timeRemaining(isFunding ? offer.terms.fundingEnds : offer.terms.expiresAt)}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{isFunding ? 'Subscribed' : 'Repaid'}</span>
            <span className="tabular">
              {isFunding
                ? `${formatUsdt(offer.raised, decimals)} / ${formatUsdt(offer.terms.target, decimals)}`
                : `${repaidPct.toFixed(1)}%`}
            </span>
          </div>
          <ProgressBar value={isFunding ? fundingPct : repaidPct} />
        </div>
      </Card>
    </Link>
  )
}
