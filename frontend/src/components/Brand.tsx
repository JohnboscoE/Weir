import {Link} from 'react-router-dom'

export function Logo({size = 28}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <title>Weir</title>
      {/* Two strokes converging then splitting — the splitter, in a mark. */}
      <path
        d="M4 7 L11 25 L16 13 L21 25 L28 7"
        stroke="var(--color-accent)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Wordmark({to = '/'}: {to?: string}) {
  return (
    <Link to={to} className="inline-flex items-center gap-2">
      <Logo />
      <span className="text-lg font-semibold tracking-tight text-ink">Weir</span>
    </Link>
  )
}
