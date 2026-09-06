/**
 * The AttnShift component vocabulary: mono micro-labels, hairline panels,
 * the four-cell summary band, alert badges and plain bars.
 *
 * Every measurement here comes from the Figma frames; the CSS classes live in
 * src/index.css so the whole design system stays readable in one place.
 */
import type { ReactNode } from 'react'
import type { AlertState, CoverageTier } from '../lib/attnshift'
import { ALERT_LABEL, COVERAGE_LABEL } from '../lib/attnshift'

export function MonoLabel({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <div className={muted ? 'mono-label mono-label--muted' : 'mono-label'}>{children}</div>
}

export function Rule() {
  return <div className="rule" />
}

/* ---------------------------------------------------------------- panel -- */

export function Panel({
  label,
  sub,
  actions,
  children,
  flush,
  className,
}: {
  label?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      {(label || actions) && (
        <div className="panel__head">
          <div className="panel__titles">
            {label && <MonoLabel>{label}</MonoLabel>}
            {sub && <div className="panel__sub">{sub}</div>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'panel__body panel__body--flush' : 'panel__body'}>{children}</div>
    </section>
  )
}

/** A titled block inside a panel, separated by a hairline. */
export function PanelSection({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="panel__section">
      <MonoLabel>{label}</MonoLabel>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- summary -- */

export type Tone = 'default' | 'elevated' | 'watch' | 'stable' | 'accent' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  default: '',
  elevated: 'v-elevated',
  watch: 'v-watch',
  stable: 'v-stable',
  accent: 'v-accent',
  muted: 'v-muted',
}

export function Summary({ children, tall }: { children: ReactNode; tall?: boolean }) {
  return <div className={tall ? 'summary summary--tall' : 'summary'}>{children}</div>
}

export function SummaryCell({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="summary__cell">
      <MonoLabel>{label}</MonoLabel>
      <div className={`summary__value ${TONE_CLASS[tone]}`}>{value}</div>
      {note && <div className="summary__note">{note}</div>}
    </div>
  )
}

/* --------------------------------------------------------------- badges -- */

export function AlertBadge({
  state,
  variant = 'tint',
}: {
  state: AlertState
  /** tint = pale background (tables); solid = red chip; onblue = inside the blue panel head */
  variant?: 'tint' | 'solid' | 'onblue'
}) {
  const cls =
    variant === 'solid' ? 'badge badge--solid' : variant === 'onblue' ? 'badge badge--onblue' : `badge badge--${state}`
  return (
    <span className={cls}>
      <i className="badge__dot" aria-hidden />
      {ALERT_LABEL[state]}
    </span>
  )
}

/** The alert state rendered as coloured text, as the history and watchlist tables do. */
export function AlertText({ state }: { state: AlertState }) {
  return <span className={`alerttext alerttext--${state}`}>{ALERT_LABEL[state]}</span>
}

export function CoverageBadge({ tier }: { tier: CoverageTier }) {
  return <span className={`coverage coverage--${tier}`}>{COVERAGE_LABEL[tier]}</span>
}

/* ----------------------------------------------------------------- bars -- */

export function Bar({
  value,
  max = 1,
  color,
  size = 'md',
}: {
  value: number
  max?: number
  color?: string
  size?: 'md' | 'lg' | 'xl'
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0
  const cls = size === 'lg' ? 'bar bar--lg' : size === 'xl' ? 'bar bar--xl' : 'bar'
  return (
    <div className={cls}>
      <span className="bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/** label · track · value, used by the source mix and the change summary. */
export function BarRow({
  label,
  value,
  max,
  display,
  color,
  wide,
}: {
  label: ReactNode
  value: number
  max: number
  display: ReactNode
  color?: string
  wide?: boolean
}) {
  return (
    <div className={wide ? 'barrow barrow--wide' : 'barrow'}>
      <span>{label}</span>
      <Bar value={value} max={max} color={color} size={wide ? 'lg' : 'md'} />
      <span className="barrow__value">{display}</span>
    </div>
  )
}
