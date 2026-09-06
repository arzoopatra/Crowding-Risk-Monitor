import type { HistoricalCase, HistoricalEvidence as Evidence } from '../types'
import { longDate, pct } from '../lib/format'
import { Card, Notice } from './primitives'

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`

function CaseCard({ c, kind }: { c: HistoricalCase; kind: 'support' | 'counter' }) {
  return (
    <article className={`case case--${kind}`}>
      <div className="case__top">
        <span className="case__date">{longDate(c.date)}</span>
        <span className="case__id">{c.id}</span>
        {c.event_flagged && <span className="pill" style={{ padding: '1px 7px' }}>Event flagged</span>}
      </div>
      <div className="case__stats">
        <span>Attention {c.attention_z.toFixed(1)}σ</span>
        <span>Agreement {pct(c.consensus_share)}</span>
        <span>5-session move {signed(c.forward_5d_pct)}</span>
        <span style={{ textTransform: 'capitalize' }}>{c.outcome}</span>
      </div>
      <p className="case__note">{c.note}</p>
    </article>
  )
}

/**
 * Historical association only. Supporting cases and counterexamples are shown
 * together and given equal weight — a screen that only shows its wins is not
 * evidence.
 */
export function HistoricalEvidence({ evidence, ticker }: { evidence: Evidence; ticker: string }) {
  const split = evidence.outcome_split
  const bars = [
    { key: 'continuation', label: 'Continued', value: split.continuation, colour: '#c4443a' },
    { key: 'weakening', label: 'Weakened', value: split.weakening, colour: '#c98a1e' },
    { key: 'reversal', label: 'Reversed', value: split.reversal, colour: '#2e8c68' },
  ]

  return (
    <div className="stack">
      <Notice tone="warn" icon="⚠">
        These are <strong>historical associations on a small sample</strong>, not predictions. Nothing here
        shows that the signal caused a move, and the sample is too small to establish reliability. Read the
        counterexamples before acting on the pattern.
      </Notice>

      <Card
        title="What happened after comparable signals"
        sub={`${ticker} · ${evidence.sample_size} comparable sessions · ${longDate(evidence.date_range.start)} – ${longDate(evidence.date_range.end)}`}
      >
        <p className="hint" style={{ marginBottom: 14 }}>
          Comparable session: {evidence.definition}
        </p>
        <table className="cohort">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Sessions</th>
              <th>Mean move, 1 session</th>
              <th>3 sessions</th>
              <th>5 sessions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>High-signal sessions</td>
              <td>{evidence.sample_size}</td>
              <td>{signed(evidence.high_signal_mean_pct.d1)}</td>
              <td>{signed(evidence.high_signal_mean_pct.d3)}</td>
              <td>{signed(evidence.high_signal_mean_pct.d5)}</td>
            </tr>
            <tr>
              <td>All other sessions</td>
              <td>—</td>
              <td>{signed(evidence.ordinary_mean_pct.d1)}</td>
              <td>{signed(evidence.ordinary_mean_pct.d3)}</td>
              <td>{signed(evidence.ordinary_mean_pct.d5)}</td>
            </tr>
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 12 }}>
          Differences of this size on {evidence.sample_size} observations are <strong>associated with</strong> the
          signal. They are not statistically established, and no significance test is claimed.
          {' '}{pct(evidence.event_flagged_share)} of the high-signal sessions also carried a
          news or disclosure event, so the two explanations cannot be separated here.
        </p>
      </Card>

      <Card title="Outcome split across the high-signal sample" sub={`${evidence.sample_size} sessions`}>
        <div className="splitbar">
          {bars.map((b) => (
            <span key={b.key} style={{ width: `${b.value}%`, background: b.colour }} title={`${b.label}: ${b.value}%`}>
              {b.value >= 12 ? `${b.label} ${b.value}%` : ''}
            </span>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          The largest single bucket is continuation. The signal is a prompt to investigate, not a reason to
          expect a reversal.
        </p>
      </Card>

      <Card title="Supporting cases" sub="Signal was followed by weakening or reversal">
        <div className="cases">
          {evidence.supporting_cases.map((c) => (
            <CaseCard key={c.id} c={c} kind="support" />
          ))}
        </div>
      </Card>

      <Card title="Counterexamples" sub="Signal fired and the move continued anyway">
        <div className="cases">
          {evidence.counterexamples.map((c) => (
            <CaseCard key={c.id} c={c} kind="counter" />
          ))}
        </div>
      </Card>
    </div>
  )
}
