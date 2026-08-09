import {Link} from 'react-router-dom'

import {Wordmark} from '../components/Brand'
import {HeroArtwork} from '../components/HeroArtwork'
import {RevenueLoop} from '../components/RevenueLoop'
import {NetworkChip} from '../components/WalletButton'
import {Card, Panel} from '../components/ui'
import {botChain} from '../config/chains'

export function Landing() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <Hero />
      <TrustBar />
      <LoopSection />
      <ForMerchants />
      <HowItWorks />
      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  const links = [
    {href: '#how', label: 'How it works'},
    {href: '#merchants', label: 'For Merchants'},
    {href: '/funder', label: 'For Funders'},
  ]

  return (
    <header className="border-b border-hairline/60">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-5">
        <Wordmark />
        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted transition hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <NetworkChip />
          <Link
            to="/merchant"
            className="glow inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition hover:bg-accent-soft"
          >
            Launch App <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-20 pb-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink">
          <span className="text-accent">◆</span> Built on BOT Chain ({botChain.id})
        </span>

        <h1 className="mt-6 text-5xl leading-[1.05] font-semibold tracking-tight text-ink sm:text-6xl">
          Real revenue in.
          <br />
          <span className="text-accent">Automatic</span> repayment out.
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Weir lets merchants unlock growth with programmable revenue-share funding. Funders
          buy a slice of future receipts — repaid automatically as real revenue flows in.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/merchant"
            className="glow inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-3 text-sm font-medium text-canvas transition hover:bg-accent-soft"
          >
            I'm a Merchant
          </Link>
          <Link
            to="/funder"
            className="inline-flex items-center gap-2 rounded-[10px] border border-hairline bg-surface px-5 py-3 text-sm font-medium text-ink transition hover:border-accent/50"
          >
            I'm a Funder
          </Link>
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
          <span className="text-accent">◈</span>
          No oracles. Fully on-chain. Transparent by design.
        </p>
      </div>

      <div className="mt-16">
        <HeroArtwork />
      </div>
    </section>
  )
}

function LoopSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1fr] lg:items-center">
        <div>
          <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            The business loop
          </span>
          <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-ink">
            Funder in. Merchant out.
            <br />
            Revenue back <span className="text-accent">in.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
            The merchant never repays anyone. Their customers pay the contract, and the
            contract pays the merchant — repayment happens before the merchant ever touches
            the money.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            There is no oracle anywhere in this loop. The real-world cashflow arrives as an
            on-chain payment, so the contract observes it directly. Nothing is attested, so
            there is nothing to attest falsely.
          </p>
        </div>

        <RevenueLoop />
      </div>
    </section>
  )
}

function TrustBar() {
  const items = [
    {
      title: 'No oracles',
      body: 'The contract observes real payments directly. Nothing is attested off-chain.',
    },
    {title: 'Transparent', body: 'Every settlement and every claim is auditable on-chain.'},
    {title: 'USDT only', body: 'Built for stability. No price feeds, no FX exposure.'},
    {title: 'Programmable', body: 'Set your share and cap. Repayment runs itself.'},
  ]

  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <Card className="grid gap-6 p-8 lg:grid-cols-[auto_1fr] lg:items-center">
        <h2 className="max-w-52 text-lg font-medium text-ink">
          Trusted infrastructure on BOT Chain
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-xs text-accent">
                ✓
              </span>
              <div>
                <div className="text-sm font-medium text-ink">{item.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}

function ForMerchants() {
  const benefits = [
    'Program your revenue share and cap',
    'Accept payments to your Weir splitter',
    'Automatic distribution to you and your funders',
    'Build on-chain credibility over time',
  ]

  return (
    <section id="merchants" className="mx-auto max-w-7xl px-6 pb-20">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            For Merchants
          </span>
          <h2 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-ink">
            Raise smarter.
            <br />
            Repay <span className="text-accent">automatically.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
            Create an offer, get funded, and repay out of real revenue — without manual
            transfers, invoices, or a repayment schedule to miss.
          </p>

          <ul className="mt-7 space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-sm text-ink">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] text-accent">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>

          <Link
            to="/merchant"
            className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-3 text-sm font-medium text-canvas transition hover:bg-accent-soft"
          >
            Launch Merchant Dashboard <span aria-hidden>→</span>
          </Link>
        </div>

        <Card className="p-8">
          <h3 className="text-sm font-medium text-ink">Payment history is the credit check</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            There is no credit score and no KYC. To open a raise, a merchant must first have
            settled real volume through their own splitter. If they have been collecting
            through the contract already, that address is their live payment setup — and
            walking away from it means abandoning it.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Their raised, repaid, completed and stalled history is written on-chain, per
            merchant, permanently. Funders can read it before committing a single unit.
          </p>
        </Card>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Deploy a splitter',
      body: 'The merchant gets a payment address. Its location is deterministic, so it can be shared before it is even deployed.',
    },
    {
      n: '02',
      title: 'Collect revenue',
      body: 'Customers pay that address in USDT. Anyone can call settle() to sweep the balance; with no active offer, all of it goes to the merchant.',
    },
    {
      n: '03',
      title: 'Open an offer',
      body: 'Once enough volume has settled, the merchant sets a target, a repayment cap, and a revenue share. Funders subscribe and receive transferable claim units.',
    },
    {
      n: '04',
      title: 'Repay from revenue',
      body: 'Every settlement now splits. The funder pool accrues until the cap is reached, then the offer closes and 100% returns to the merchant.',
    },
  ]

  return (
    <section id="how" className="mx-auto max-w-7xl px-6 pb-20">
      <h2 className="text-3xl font-semibold tracking-tight text-ink">How it works</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        Four steps, then it closes itself.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Panel key={s.n}>
            <div className="text-xs font-medium text-accent tabular">{s.n}</div>
            <div className="mt-3 text-sm font-medium text-ink">{s.title}</div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{s.body}</p>
          </Panel>
        ))}
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-hairline/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center">
        <Wordmark />
        <p className="max-w-2xl text-xs leading-relaxed text-muted sm:ml-auto sm:text-right">
          Weir is modeled on revenue-based financing. It is not a legally enforceable
          agreement, a security, or a regulated financial product. Repayment depends entirely
          on revenue continuing to flow through a merchant's splitter.
        </p>
      </div>
    </footer>
  )
}
