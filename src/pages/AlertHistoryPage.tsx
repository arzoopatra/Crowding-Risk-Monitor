/**
 * Alert history — Figma frame 68:36.
 *
 * The change log is not stored anywhere: it is derived by replaying the same
 * scoring function across the tail of every series, so a row here always
 * matches what the monitor would have shown on that day.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { deriveSignal } from '../lib/scoring'
import {
  ALERT_LABEL,
  ALERT_LABEL_SHORT,
  ALERT_STATES,
  buildChangeLog,
  formatMultiple,
  summariseChangeLog,
  toAlertState,
} from '../lib/attnshift'
import type { AlertState, ChangeLogRow } from '../lib/attnshift'
import { longDate, num } from '../lib/format'
import { PageHeader } from '../components/Shell'
import { BarRow, Panel, PanelSection } from '../components/ui'
import { Summary, SummaryCell } from '../components/ui'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'

const LOOKBACKS = [14, 30, 60] as const

/** Stamped onto every signal opened from this screen, so the detail can name its way back. */
const OPENED_HERE = { state: { from: '/alerts' } }

export function AlertHistoryPage() {
  const { status, snapshot, error, reload, windowDays } = useAppState()
  const navigate = useNavigate()

  const [lookback, setLookback] = useState<number>(30)
  const [query, setQuery] = useState('')
  const [states, setStates] = useState<AlertState[]>([...ALERT_STATES])

  const currentStates = useMemo(() => {
    const out: Record<string, AlertState> = {}
    snapshot?.instruments.forEach((i) => {
      out[i.ticker] = toAlertState(deriveSignal(i, windowDays).state)
    })
    return out
  }, [snapshot, windowDays])

  const log = useMemo(
    () => (snapshot ? buildChangeLog(snapshot.instruments, windowDays, lookback) : []),
    [snapshot, windowDays, lookback],
  )

  const summary = useMemo(() => summariseChangeLog(log, currentStates), [log, currentStates])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return log.filter((r) => {
      if (!states.includes(r.to)) return false
      if (!q) return true
      return (
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.event.toLowerCase().includes(q)
      )
    })
  }, [log, states, query])

  if (status === 'loading') return <LoadingState />
  if (status === 'error' || !snapshot) return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />

  const tickerCount = new Set(log.map((r) => r.ticker)).size
  const toggleState = (s: AlertState) =>
    setStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  return (
    <div className="page">
      <PageHeader
        eyebrow="Alert history"
        title="Cross-ticker alert history"
        sub={`State changes, resolved alerts and event context · ${snapshot.is_synthetic ? 'illustrative interface data' : 'backend export'}`}
        actions={
          <>
            <div className="segmented">
              {LOOKBACKS.map((d) => (
                <button key={d} type="button" className={lookback === d ? 'is-on' : ''} onClick={() => setLookback(d)}>
                  Last {d} days
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--primary" onClick={() => exportCsv(filtered)}>
              Export CSV
            </button>
          </>
        }
      />

      <Summary>
        <SummaryCell label="State changes" value={summary.total} note={`Across ${tickerCount} tickers`} />
        <SummaryCell
          label="Elevated entries"
          value={summary.elevatedEntries}
          note={`${summary.remainElevated} remain elevated`}
          tone="elevated"
        />
        <SummaryCell
          label="Returned to stable"
          value={summary.returnedToStable}
          note={
            summary.medianDaysToStable === null
              ? 'No completed round trips'
              : `Median ${summary.medianDaysToStable} day${summary.medianDaysToStable === 1 ? '' : 's'}`
          }
          tone="stable"
        />
        <SummaryCell
          label="Event overlap"
          value={`${summary.withEvent} / ${summary.total}`}
          note="Coincidence only"
          tone="accent"
        />
      </Summary>

      <div className="grid grid--main-side" style={{ marginTop: 16 }}>
        <Panel
          label="Change log"
          sub={`Most recent first · ${windowDays}-day look-back applied to every replay`}
          actions={
            <input
              className="input"
              style={{ width: 209 }}
              placeholder="Search ticker or event"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search ticker or event"
            />
          }
          flush
        >
          {filtered.length === 0 ? (
            <EmptyState
              title="No state changes in this range"
              body="Widen the range or clear the filters. A quiet log means every ticker held its state across the window."
              onReset={() => {
                setQuery('')
                setStates([...ALERT_STATES])
              }}
            />
          ) : (
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ticker</th>
                    <th>State change</th>
                    <th>Attn</th>
                    <th>Consensus</th>
                    <th>Related event</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr
                      key={`${r.ticker}-${r.date}-${i}`}
                      className={`is-clickable${i === 0 ? ' is-selected' : ''}`}
                      tabIndex={0}
                      onClick={() => navigate(`/signal/${r.ticker}`, OPENED_HERE)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/signal/${r.ticker}`, OPENED_HERE)}
                    >
                      <td className="cell-time">{longDate(r.date)}</td>
                      <td className="cell-ticker">{r.ticker}</td>
                      <td className={`cell-strong alerttext--${r.to}`}>
                        {ALERT_LABEL_SHORT[r.from]} → {ALERT_LABEL_SHORT[r.to]}
                      </td>
                      <td className={`cell-strong ${r.to === 'elevated' ? 'v-elevated' : ''}`}>
                        {formatMultiple(r.multiple)}
                      </td>
                      <td>{r.to === 'insufficient' ? '—' : r.consensus}</td>
                      <td className="cell-muted">{r.event}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel flush>
          <PanelSection label="Filters">
            <div className="panel__text panel__text--sm" style={{ fontWeight: 500, marginTop: 6 }}>
              Alert state
            </div>
            <div className="legend">
              {ALERT_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`legend__${s}${states.includes(s) ? ' is-on' : ''}`}
                  onClick={() => toggleState(s)}
                >
                  <span className="legend__swatch" />
                  <span style={{ color: 'var(--text)' }}>
                    {s === 'stable' ? 'Returned to stable' : ALERT_LABEL[s]}
                  </span>
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection label="Change summary">
            <div style={{ marginTop: 8 }}>
              <BarRow
                wide
                label="Elevated"
                value={summary.byTarget.elevated}
                max={Math.max(1, summary.total)}
                display={summary.byTarget.elevated}
                color="var(--elevated)"
              />
              <BarRow
                wide
                label="Watch"
                value={summary.byTarget.watch}
                max={Math.max(1, summary.total)}
                display={summary.byTarget.watch}
                color="var(--watch)"
              />
              <BarRow
                wide
                label="Stable"
                value={summary.byTarget.stable}
                max={Math.max(1, summary.total)}
                display={summary.byTarget.stable}
                color="var(--stable)"
              />
            </div>
          </PanelSection>

          <PanelSection label="Event context">
            <div className="panel__text">
              {summary.withEvent} of {summary.total} changes coincided with a public company or market event.
            </div>
            <div className="panel__note">
              Coincidence is shown as context and is not treated as evidence of causation.
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block"
              style={{ marginTop: 14 }}
              onClick={() => navigate('/method')}
            >
              Method &amp; limitations
            </button>
          </PanelSection>
        </Panel>
      </div>

      <div className="panel__note" style={{ padding: '12px 2px' }}>
        {num(log.length)} state changes derived from {num(snapshot.instruments.length)} series over the last{' '}
        {lookback} days.
      </div>
    </div>
  )
}

/** Downloads the visible rows. Everything here is already on the client. */
function exportCsv(rows: ChangeLogRow[]) {
  const header = ['date', 'ticker', 'name', 'from', 'to', 'attention_multiple', 'consensus', 'related_event']
  const body = rows.map((r) => [
    r.date,
    r.ticker,
    r.name,
    r.from,
    r.to,
    r.multiple === null ? '' : r.multiple.toFixed(2),
    r.consensus,
    r.event,
  ])
  const csv = [header, ...body].map((line) => line.map(escapeCsv).join(',')).join('\n')

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'attnshift-alert-history.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const escapeCsv = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
