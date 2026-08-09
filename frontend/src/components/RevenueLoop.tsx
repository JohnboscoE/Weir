import {useEffect, useState} from 'react'

import {Card} from './ui'

/**
 * The whole business loop, drawn and animated: customers pay one address, the contract
 * sweeps and splits it, funders accrue toward a cap, the offer closes, and 100% returns
 * to the merchant. It runs continuously because the point being made is that this is a
 * cycle, not a one-off transaction.
 *
 * Particle motion is SMIL (`animateMotion`), so it costs no JavaScript per frame; React
 * only drives which phase is highlighted.
 */

type Phase = {
  caption: string
  detail: string
  /** How full the repayment bar sits during this phase, 0–100. */
  progress: number
}

const PHASES: Phase[] = [
  {
    caption: 'Customers pay the splitter',
    detail:
      "The merchant shares one address. Every sale lands there in USDT — no invoice, no repayment schedule.",
    progress: 0,
  },
  {
    caption: 'Anyone calls settle()',
    detail:
      'An incoming transfer cannot be hooked, so payments pool at the splitter until a settlement sweeps the balance. Anyone can trigger it.',
    progress: 0,
  },
  {
    caption: 'The contract splits it',
    detail:
      'The merchant takes their share and the funder pool takes theirs, in the same transaction. Nobody is trusted to forward anything.',
    progress: 38,
  },
  {
    caption: 'Funders accrue toward the cap',
    detail:
      'Revenue accrues per claim unit. Funders withdraw whenever they like — the contract never pushes payments to a list of addresses.',
    progress: 72,
  },
  {
    caption: 'Cap repaid, offer closes',
    detail:
      'Once the cap is reached the offer settles out and the splitter unwires it. 100% of revenue returns to the merchant.',
    progress: 100,
  },
]

const PHASE_MS = 3400

export function RevenueLoop() {
  const [phase, setPhase] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), PHASE_MS)
    return () => clearInterval(id)
  }, [reduced])

  const current = PHASES[phase]
  const paying = phase === 0 || phase === 1
  const splitting = phase === 2 || phase === 3
  const closed = phase === 4

  return (
    <Card className="glow-soft overflow-hidden p-6">
      <svg viewBox="0 0 460 286" className="w-full" role="img">
        <title>How revenue flows through Weir</title>

        <defs>
          <path id="wire-pay" d="M112 143 H172" />
          <path id="wire-merchant" d="M288 128 C 316 112 314 76 340 76" />
          <path id="wire-funder" d="M288 158 C 316 174 314 210 340 210" />

          <marker
            id="arrow"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 1 L6 4 L0 7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>

        {/* ---------------- wires ---------------- */}
        <g fill="none" strokeWidth="1.5" strokeLinecap="round">
          <Wire href="#wire-pay" active={paying} />
          <Wire href="#wire-merchant" active={splitting || closed} emphasis={closed} />
          <Wire href="#wire-funder" active={splitting} dimmed={closed} />
        </g>

        {/* ---------------- travelling value ---------------- */}
        {!reduced && (
          <>
            <Coins path="#wire-pay" visible={paying} count={3} duration={1.9} />
            <Coins path="#wire-merchant" visible={splitting || closed} count={closed ? 4 : 2} duration={1.7} />
            <Coins path="#wire-funder" visible={splitting} count={2} duration={1.7} />
          </>
        )}

        {/* ---------------- nodes ---------------- */}
        <Node x={8} y={115} w={104} h={56} title="Customers" sub="pay in USDT" active={paying} />

        <g>
          <rect
            x={176}
            y={108}
            width={112}
            height={76}
            rx={12}
            className={cxNode(phase === 1 || splitting)}
          />
          <g transform="translate(210, 124) scale(0.85)">
            <path
              d="M4 7 L11 25 L16 13 L21 25 L28 7"
              stroke="var(--color-accent)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
          <text x={232} y={172} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">
            Splitter contract
          </text>
        </g>

        <Node
          x={340}
          y={48}
          w={112}
          h={56}
          title="Merchant"
          sub={closed ? '100% of revenue' : '70% of revenue'}
          active={splitting || closed}
        />

        <Node
          x={340}
          y={182}
          w={112}
          h={56}
          title="Funder pool"
          sub={closed ? 'repaid in full' : '30% of revenue'}
          active={splitting}
          dimmed={closed}
        />

        {/* ---------------- repayment progress ---------------- */}
        <g transform="translate(340, 250)">
          <text x={0} y={-6} className="fill-[var(--color-muted)] text-[9px]">
            Repaid to cap
          </text>
          <text x={112} y={-6} textAnchor="end" className="fill-[var(--color-accent)] text-[9px] tabular">
            {current.progress}%
          </text>
          <rect x={0} y={0} width={112} height={5} rx={2.5} fill="var(--color-hairline)" />
          <rect
            x={0}
            y={0}
            width={(112 * current.progress) / 100}
            height={5}
            rx={2.5}
            fill="var(--color-accent)"
            // Snapping back to zero at the top of the loop should not animate backwards.
            style={{transition: phase === 0 ? 'none' : 'width 900ms ease-out'}}
          />
        </g>
      </svg>

      {/* ---------------- caption ---------------- */}
      <div className="mt-5 border-t border-hairline pt-5">
        <div className="flex items-center gap-2">
          {PHASES.map((p, i) => (
            <button
              key={p.caption}
              aria-label={p.caption}
              onClick={() => setPhase(i)}
              className="h-1 flex-1 overflow-hidden rounded-full bg-hairline"
            >
              <span
                className="block h-full rounded-full bg-accent transition-opacity"
                style={{opacity: i === phase ? 1 : i < phase ? 0.35 : 0}}
              />
            </button>
          ))}
        </div>

        <div key={phase} className="mt-4 min-h-20 animate-[fade_400ms_ease-out]">
          <div className="text-sm font-medium text-ink">
            <span className="mr-2 text-accent tabular">
              {String(phase + 1).padStart(2, '0')}
            </span>
            {current.caption}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{current.detail}</p>
        </div>
      </div>
    </Card>
  )
}

// --------------------------------------------------------------------------

function Wire({
  href,
  active,
  emphasis = false,
  dimmed = false,
}: {
  href: string
  active: boolean
  emphasis?: boolean
  dimmed?: boolean
}) {
  return (
    <use
      href={href}
      stroke={active ? 'var(--color-accent)' : 'var(--color-hairline)'}
      strokeWidth={emphasis ? 2.5 : 1.5}
      opacity={dimmed ? 0.25 : 1}
      markerEnd="url(#arrow)"
      color={active ? 'var(--color-accent)' : 'var(--color-hairline)'}
      style={{transition: 'stroke 500ms ease, opacity 500ms ease, stroke-width 500ms ease'}}
    />
  )
}

/** USDT moving along a wire. SMIL keeps this off the JS main thread entirely. */
function Coins({
  path,
  visible,
  count,
  duration,
}: {
  path: string
  visible: boolean
  count: number
  duration: number
}) {
  return (
    <g opacity={visible ? 1 : 0} style={{transition: 'opacity 400ms ease'}}>
      {Array.from({length: count}, (_, i) => (
        <circle key={i} r={3.5} fill="var(--color-accent)">
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`${(i * duration) / count}s`}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href={path} />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.15;0.85;1"
            dur={`${duration}s`}
            repeatCount="indefinite"
            begin={`${(i * duration) / count}s`}
          />
        </circle>
      ))}
    </g>
  )
}

function Node({
  x,
  y,
  w,
  h,
  title,
  sub,
  active,
  dimmed = false,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  sub: string
  active: boolean
  dimmed?: boolean
}) {
  return (
    <g opacity={dimmed ? 0.4 : 1} style={{transition: 'opacity 500ms ease'}}>
      <rect x={x} y={y} width={w} height={h} rx={12} className={cxNode(active)} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" className="fill-[var(--color-ink)] text-[12px] font-medium">
        {title}
      </text>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">
        {sub}
      </text>
    </g>
  )
}

function cxNode(active: boolean) {
  return [
    'transition-all duration-500',
    active
      ? 'fill-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] stroke-[var(--color-accent)]'
      : 'fill-[var(--color-raised)] stroke-[var(--color-hairline)]',
  ].join(' ')
}
