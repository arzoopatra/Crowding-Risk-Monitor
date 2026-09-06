import type { ReactNode } from 'react'
import type { Direction, RiskState } from '../types'
import { STATE_LABEL } from '../lib/scoring'
import { signedPct, z as fmtZ } from '../lib/format'

export function RiskBadge({ state, size }: { state: RiskState; size?: 'lg' }) {
  return (
    <span className={`badge badge--${state}${size === 'lg' ? ' badge--lg' : ''}`}>
      <span className="badge__dot" />
      {STATE_LABEL[state]}
    </span>
  )
}

/** Persistent reminder that this is a public proxy, never institutional positioning. */
export function ProxyPill() {
  return (
    <span className="pill pill--proxy" title="This product measures public discussion only. It cannot observe fund positioning or holdings.">
      Public proxy
    </span>
  )
}

export function ScoreMeter({ score, state }: { score: number; state: RiskState }) {
  return (
    <div className="scorecell">
      <span className="scorecell__v num">{score.toFixed(0)}</span>
      <span className={`meter meter--${state}`}>
        <span className="meter__fill" style={{ width: `${Math.max(2, score)}%` }} />
      </span>
    </div>
  )
}

export function AttentionDelta({ pct, zScore }: { pct: number; zScore: number }) {
  const tone = zScore >= 2 ? 'up' : zScore <= -1 ? 'down' : 'flat'
  return (
    <span className={`delta delta--${tone}`}>
      <span className="delta__v">{signedPct(pct)}</span>
      <span className="delta__z">z {fmtZ(zScore)}</span>
    </span>
  )
}

const DIRECTION_SHORT: Record<Direction, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  mixed: 'Mixed',
}

export function ConsensusCell({ share, direction }: { share: number; direction: Direction }) {
  return (
    <div className="consensuscell">
      <div className="consensuscell__top">
        <span className="consensuscell__v num">{(share * 100).toFixed(0)}%</span>
        <span className="consensuscell__dir">{DIRECTION_SHORT[direction]}</span>
      </div>
      <div className="sharebar" title="Share of directional mentions pointing the same way. 50% is an even split.">
        <span
          className={`sharebar__fill sharebar__fill--${direction}`}
          style={{ width: `${Math.max(2, (share - 0.4) / 0.55 * 100)}%` }}
        />
        <span className="sharebar__mark" style={{ left: `${(0.5 - 0.4) / 0.55 * 100}%` }} />
      </div>
    </div>
  )
}

export function CoverageDots({ available, expected }: { available: number; expected: number }) {
  return (
    <span className="covcell" title={`${available} of ${expected} sources returned data`}>
      <span className="dots">
        {Array.from({ length: expected }, (_, i) => (
          <i key={i} className={i < available ? 'on' : ''} />
        ))}
      </span>
      <span className="num" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
        {available}/{expected}
      </span>
    </span>
  )
}

export function Notice({
  tone = 'info',
  icon = 'ⓘ',
  children,
}: {
  tone?: 'info' | 'warn' | 'neutral'
  icon?: string
  children: ReactNode
}) {
  const cls = tone === 'warn' ? ' notice--warn' : tone === 'neutral' ? ' notice--neutral' : ''
  return (
    <div className={`notice${cls}`}>
      <span className="notice__icon" aria-hidden>{icon}</span>
      <div>{children}</div>
    </div>
  )
}

export function Card({
  title,
  sub,
  actions,
  foot,
  flush,
  children,
}: {
  title?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  foot?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {sub && <span className="card__sub">{sub}</span>}
          {actions && <div className="spacer">{actions}</div>}
        </header>
      )}
      <div className={`card__body${flush ? ' card__body--flush' : ''}`}>{children}</div>
      {foot && <footer className="card__foot">{foot}</footer>}
    </section>
  )
}
