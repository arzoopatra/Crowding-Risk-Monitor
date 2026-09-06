import type { DerivedSignal } from '../lib/scoring'
import { THRESHOLDS } from '../lib/scoring'
import { RiskBadge } from './primitives'

/**
 * Every term of the score, on screen. The product requirement is that no
 * warning may appear without the arithmetic that produced it.
 */
export function ScoreBreakdown({ signal }: { signal: DerivedSignal }) {
  const adjustments = signal.adjustments.filter((a) => a.points !== 0)

  return (
    <div className="breakdown">
      {signal.components.map((c) => (
        <div className="brow" key={c.key}>
          <div>
            <div className="brow__label">{c.label}</div>
            <div className="brow__cap">up to {c.max} pts</div>
          </div>
          <div>
            <div className="brow__detail">{c.detail}</div>
            <div className="brow__formula">{c.formula}</div>
            <div className="bbar">
              <div className="bbar__fill" style={{ width: `${(c.points / c.max) * 100}%` }} />
            </div>
          </div>
          <div className="brow__pts num">{c.points.toFixed(1)}</div>
        </div>
      ))}

      {adjustments.length > 0 &&
        adjustments.map((a) => (
          <div className="brow" key={a.key}>
            <div>
              <div className="brow__label">{a.label}</div>
              <div className="brow__cap">deduction</div>
            </div>
            <div>
              <div className="brow__detail">{a.detail}</div>
            </div>
            <div className="brow__pts brow__pts--neg num">{a.points.toFixed(1)}</div>
          </div>
        ))}

      <div className="btotal">
        <div className="btotal__label">Public crowding-risk proxy</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RiskBadge state={signal.state} />
          <span className="hint">{signal.stateReason}</span>
        </div>
        <div className="btotal__pts">{signal.score.toFixed(0)}</div>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Thresholds: Elevated ≥ {THRESHOLDS.elevated}, Watch ≥ {THRESHOLDS.watch}, below that Normal.
        Under {THRESHOLDS.minCoverage * 100}% source coverage no level is stated at all.
        The score ranks how unusual public discussion is. It is not a probability, a price target or a
        measure of how many funds hold the position.
      </p>
    </div>
  )
}
