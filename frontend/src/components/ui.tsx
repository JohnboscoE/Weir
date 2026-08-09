import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'

export function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(' ')
}

// --------------------------------------------------------------------------
// Surfaces
// --------------------------------------------------------------------------

export function Card({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-[12px] border border-hairline bg-surface',
        className,
      )}
      {...props}
    />
  )
}

export function Panel({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-[12px] border border-hairline bg-raised p-5', className)}
      {...props}
    />
  )
}

// --------------------------------------------------------------------------
// Controls
// --------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45'

  const variants = {
    primary: 'bg-accent text-canvas hover:bg-accent-soft',
    outline: 'border border-hairline bg-surface text-ink hover:border-accent/50',
    ghost: 'text-muted hover:text-ink',
  }

  return (
    <button
      className={cx(base, variants[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

function Spinner() {
  return (
    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  )
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string
  hint?: ReactNode
  suffix?: string
}

export function Field({label, hint, suffix, ...props}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <span className="relative block">
        <input
          className="w-full rounded-[10px] border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink tabular outline-none placeholder:text-muted/60 focus:border-accent/60"
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

// --------------------------------------------------------------------------
// Indicators
// --------------------------------------------------------------------------

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'accent' | 'muted' | 'warn'
}) {
  const tones = {
    accent: 'border-accent/30 bg-accent/10 text-accent',
    muted: 'border-hairline bg-raised text-muted',
    warn: 'border-warn/30 bg-warn/10 text-warn',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Dot({tone = 'accent'}: {tone?: 'accent' | 'warn' | 'muted'}) {
  const tones = {accent: 'bg-accent', warn: 'bg-warn', muted: 'bg-muted'}
  return <span className={cx('size-1.5 rounded-full', tones[tone])} />
}

export function Stat({
  label,
  value,
  unit,
  children,
}: {
  label: string
  value: ReactNode
  unit?: string
  children?: ReactNode
}) {
  return (
    <Panel className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-2 truncate text-2xl font-semibold text-ink tabular">{value}</div>
      {unit && <div className="mt-1 text-xs text-muted">{unit}</div>}
      {children}
    </Panel>
  )
}

export function ProgressBar({value, className}: {value: number; className?: string}) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-hairline', className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{width: `${Math.min(100, Math.max(0, value))}%`}}
      />
    </div>
  )
}

export function Empty({title, children}: {title: string; children?: ReactNode}) {
  return (
    <Panel className="text-center">
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    </Panel>
  )
}

/** Custom-error reverts decoded by viem read far better than a raw revert blob. */
export function TxError({error}: {error?: string}) {
  if (!error) return null
  return <p className="mt-3 text-xs leading-relaxed break-words text-warn">{error}</p>
}

export function Row({label, value}: {label: string; value: ReactNode}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/60 py-2.5 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-ink tabular">{value}</span>
    </div>
  )
}
