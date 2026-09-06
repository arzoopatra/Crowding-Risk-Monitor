/**
 * Watchlist — Figma frame 68:70.
 *
 * The monitoring universe comes from the snapshot, so the design's "add a
 * ticker" affordance is wired to the capability this prototype actually has:
 * flagging a ticker into the local workspace, which the monitor can filter on.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { deriveSignal } from '../lib/scoring'
import {
  ALERT_LABEL,
  ALERT_RANK,
  age,
  coverageTier,
  sourcesFraction,
  toAlertState,
  workspaceLabel,
} from '../lib/attnshift'
import type { AlertState } from '../lib/attnshift'
import { num } from '../lib/format'
import { PageHeader } from '../components/Shell'
import { AlertText, CoverageBadge, MonoLabel, Panel, PanelSection, Summary, SummaryCell } from '../components/ui'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'

/** Stamped onto every signal opened from this screen, so the detail can name its way back. */
const OPENED_HERE = { state: { from: '/watchlist' } }

export function WatchlistPage() {
  const { status, snapshot, error, reload, windowDays, investigations, saveInvestigation, removeInvestigation } =
    useAppState()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [entry, setEntry] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!snapshot) return []
    return snapshot.instruments
      .map((instrument) => {
        const signal = deriveSignal(instrument, windowDays)
        return { instrument, signal, state: toAlertState(signal.state), tier: coverageTier(instrument) }
      })
      .sort((a, b) => ALERT_RANK[b.state] - ALERT_RANK[a.state] || a.instrument.ticker.localeCompare(b.instrument.ticker))
  }, [snapshot, windowDays])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.instrument.ticker.toLowerCase().includes(q) || r.instrument.name.toLowerCase().includes(q),
    )
  }, [rows, query])

  if (status === 'loading') return <LoadingState />
  if (status === 'error' || !snapshot) return <ErrorState message={error ?? 'Unknown error'} onRetry={reload} />

  const counts: Record<AlertState, number> = { elevated: 0, watch: 0, stable: 0, insufficient: 0 }
  rows.forEach((r) => (counts[r.state] += 1))
  const ready = rows.filter((r) => r.tier !== 'low').length
  const notReady = rows.filter((r) => r.tier === 'low')
  const flaggedCount = rows.filter((r) => investigations[r.instrument.ticker]).length

  const track = () => {
    const code = entry.trim().toUpperCase()
    if (!code) return
    const match = rows.find((r) => r.instrument.ticker === code)
    if (!match) {
      setMessage(`${code} is not in this snapshot. The universe is defined by the backend export.`)
      return
    }
    saveInvestigation({
      ticker: match.instrument.ticker,
      note: 'Added to the workspace watchlist.',
      savedAt: new Date().toISOString(),
      stateAtSave: ALERT_LABEL[match.state],
      scoreAtSave: match.signal.score,
    })
    setMessage(`${code} is now tracked in this workspace.`)
    setEntry('')
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Watchlist"
        title="Manage watchlist"
        sub={`Define the monitoring universe and check data readiness · ${snapshot.is_synthetic ? 'illustrative interface data' : 'backend export'}`}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => document.getElementById('ticker-code')?.focus()}>
            Add ticker
          </button>
        }
      />

      <Summary>
        <SummaryCell label="Tickers" value={rows.length} note={workspaceLabel(snapshot)} />
        <SummaryCell
          label="Active alerts"
          value={counts.elevated + counts.watch}
          note={`${counts.elevated} elevated · ${counts.watch} watch`}
          tone="elevated"
        />
        <SummaryCell
          label="Coverage ready"
          value={`${ready} / ${rows.length}`}
          note="High or medium"
          tone="stable"
        />
        <SummaryCell
          label="Baseline window"
          value={`${snapshot.baseline_window_days} days`}
          note="Scoring baseline"
          tone="accent"
        />
      </Summary>

      <div className="grid grid--main-side" style={{ marginTop: 16 }}>
        <Panel
          label="Monitoring universe"
          sub={`${rows.length} tickers · sorted by attention alert`}
          actions={
            <input
              className="input"
              style={{ width: 209 }}
              placeholder="Search ticker or company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search ticker or company"
            />
          }
          flush
        >
          {filtered.length === 0 ? (
            <EmptyState
              title="No tickers match that search"
              body="Clear the search to see the full monitoring universe."
              onReset={() => setQuery('')}
            />
          ) : (
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Alert</th>
                    <th>Coverage</th>
                    <th>Sources</th>
                    <th>Updated</th>
                    <th>Tracked</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const tracked = !!investigations[r.instrument.ticker]
                    return (
                      <tr
                        key={r.instrument.ticker}
                        className={`is-clickable${i === 0 ? ' is-selected' : ''}`}
                        tabIndex={0}
                        onClick={() => navigate(`/signal/${r.instrument.ticker}`, OPENED_HERE)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/signal/${r.instrument.ticker}`, OPENED_HERE)}
                      >
                        <td className="cell-ticker">{r.instrument.ticker}</td>
                        <td>{r.instrument.name}</td>
                        <td>
                          <AlertText state={r.state} />
                        </td>
                        <td>
                          <CoverageBadge tier={r.tier} />
                        </td>
                        <td className="cell-mono">{sourcesFraction(r.instrument)}</td>
                        <td className="cell-time">{age(r.instrument.last_updated, snapshot.generated_at)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-plain"
                            style={{ height: 22, padding: '0 8px', fontSize: 'var(--fs-10)' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (tracked) removeInvestigation(r.instrument.ticker)
                              else
                                saveInvestigation({
                                  ticker: r.instrument.ticker,
                                  note: 'Added to the workspace watchlist.',
                                  savedAt: new Date().toISOString(),
                                  stateAtSave: ALERT_LABEL[r.state],
                                  scoreAtSave: r.signal.score,
                                })
                            }}
                          >
                            {tracked ? 'Tracked' : 'Track'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel flush>
          <PanelSection label="Track a ticker">
            <label className="field-label" htmlFor="ticker-code" style={{ marginTop: 10 }}>
              Ticker code
            </label>
            <input
              id="ticker-code"
              className="input input--tall"
              placeholder={`e.g. ${rows[0]?.instrument.ticker ?? 'BHP'}`}
              value={entry}
              onChange={(e) => {
                setEntry(e.target.value)
                setMessage(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && track()}
            />
            <div className="panel__note">
              The universe comes from the backend export. Tracking marks a ticker in this browser so the monitor can
              filter to it.
            </div>
            <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 12 }} onClick={track}>
              Add to watchlist
            </button>
            {message && <div className="panel__note">{message}</div>}
          </PanelSection>

          <PanelSection label="Board settings">
            <div style={{ marginTop: 8 }}>
              <div className="kv">
                <span className="kv__k">Workspace</span>
                <span className="kv__v">{workspaceLabel(snapshot)}</span>
              </div>
              <div className="kv">
                <span className="kv__k">Look-back</span>
                <span className="kv__v">{windowDays} days</span>
              </div>
              <div className="kv">
                <span className="kv__k">Source groups</span>
                <span className="kv__v">{snapshot.sources.length} active</span>
              </div>
              <div className="kv">
                <span className="kv__k">Tracked</span>
                <span className="kv__v">
                  {flaggedCount} ticker{flaggedCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="kv">
                <span className="kv__k">Alert logic</span>
                <span className="kv__v">Prototype rule set</span>
              </div>
            </div>
          </PanelSection>

          <PanelSection label="Coverage readiness">
            <div className="panel__text panel__text--sm">
              {ready} ticker{ready === 1 ? '' : 's'} have sufficient source coverage.
              {notReady.length > 0 &&
                ` ${notReady.map((r) => r.instrument.ticker).join(', ')} need${notReady.length === 1 ? 's' : ''} at least one additional source group.`}
            </div>
            <div className="panel__note">
              A workspace watchlist provides personalisation without requiring user accounts in this prototype.
            </div>
          </PanelSection>
        </Panel>
      </div>

      <div className="panel__note" style={{ padding: '12px 2px' }}>
        <MonoLabel muted>Snapshot</MonoLabel>
        {num(snapshot.instruments.length)} instruments · schema v{snapshot.schema_version} · window{' '}
        {snapshot.data_window.start} → {snapshot.data_window.end}
      </div>
    </div>
  )
}
